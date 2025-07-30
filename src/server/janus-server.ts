/**
 * Unix Socket Server for Janus Protocol
 * Implements command handling and response management
 */

import * as net from 'net';
import * as fs from 'fs';
import { EventEmitter } from 'events';
import { SocketCommand, SocketResponse, CommandHandler, CommandHandlerRegistry } from '../types/protocol';
import { MessageFraming, MessageFramingError } from '../core/message-framing';
import { SecurityValidator } from '../core/security-validator';

export interface JanusServerEvents {
  'listening': () => void;
  'connection': (clientId: string) => void;
  'disconnection': (clientId: string) => void;
  'command': (command: SocketCommand, clientId: string) => void;
  'response': (response: SocketResponse, clientId: string) => void;
  'error': (error: Error) => void;
}

export class JanusServerError extends Error {
  constructor(message: string, public code: string, public details?: string) {
    super(message);
    this.name = 'JanusServerError';
  }
}

export interface ServerConfig {
  /** Unix socket path */
  socketPath: string;
  
  /** Maximum concurrent connections */
  maxConnections?: number;
  
  /** Default command timeout in seconds */
  defaultTimeout?: number;
  
  /** Maximum message size in bytes */
  maxMessageSize?: number;
  
  /** Whether to cleanup socket file on start */
  cleanupOnStart?: boolean;
  
  /** Whether to cleanup socket file on shutdown */
  cleanupOnShutdown?: boolean;
}

interface ClientConnection {
  id: string;
  socket: net.Socket;
  messageBuffer: Buffer;
  createdAt: Date;
  lastActivity: Date;
}

export class JanusServer extends EventEmitter {
  private server: net.Server | null = null;
  private config: Required<ServerConfig>;
  private validator: SecurityValidator;
  private commandHandlers: CommandHandlerRegistry = {};
  private clients = new Map<string, ClientConnection>();
  private listening = false;
  private clientIdCounter = 0;

  constructor(config: ServerConfig) {
    super();
    
    this.config = {
      socketPath: config.socketPath,
      maxConnections: config.maxConnections ?? 100,
      defaultTimeout: config.defaultTimeout ?? 30.0,
      maxMessageSize: config.maxMessageSize ?? 10 * 1024 * 1024,
      cleanupOnStart: config.cleanupOnStart ?? true,
      cleanupOnShutdown: config.cleanupOnShutdown ?? true
    };
    
    this.validator = new SecurityValidator({
      maxTotalSize: this.config.maxMessageSize
    });
    
    // Validate socket path
    const pathValidation = this.validator.validateSocketPath(this.config.socketPath);
    if (!pathValidation.valid) {
      throw new JanusServerError(
        pathValidation.error!,
        pathValidation.code!,
        pathValidation.details
      );
    }
  }

  /**
   * Register a command handler for a specific channel and command
   */
  registerCommandHandler(channelId: string, commandName: string, handler: CommandHandler): void {
    // Validate inputs
    const channelValidation = this.validator.validateName(channelId, 'channel');
    if (!channelValidation.valid) {
      throw new JanusServerError(
        channelValidation.error!,
        channelValidation.code!,
        channelValidation.details
      );
    }

    const commandValidation = this.validator.validateName(commandName, 'command');
    if (!commandValidation.valid) {
      throw new JanusServerError(
        commandValidation.error!,
        commandValidation.code!,
        commandValidation.details
      );
    }

    if (!this.commandHandlers[channelId]) {
      this.commandHandlers[channelId] = {};
    }
    
    this.commandHandlers[channelId][commandName] = handler;
  }

  /**
   * Unregister a command handler
   */
  unregisterCommandHandler(channelId: string, commandName: string): boolean {
    if (!this.commandHandlers[channelId] || !this.commandHandlers[channelId][commandName]) {
      return false;
    }
    
    delete this.commandHandlers[channelId][commandName];
    
    // Clean up empty channel
    if (Object.keys(this.commandHandlers[channelId]).length === 0) {
      delete this.commandHandlers[channelId];
    }
    
    return true;
  }

  /**
   * Get all registered command handlers
   */
  getCommandHandlers(): CommandHandlerRegistry {
    return JSON.parse(JSON.stringify(this.commandHandlers)); // Deep copy
  }

  /**
   * Start listening for connections
   */
  async startListening(): Promise<void> {
    if (this.listening) {
      return;
    }

    // Cleanup existing socket file if configured
    if (this.config.cleanupOnStart) {
      await this.cleanupSocketFile();
    }

    return new Promise((resolve, reject) => {
      this.server = net.createServer();
      
      this.server.on('connection', (socket) => {
        this.handleNewConnection(socket);
      });
      
      this.server.on('error', (error) => {
        this.emit('error', new JanusServerError(
          'Server error',
          'SERVER_ERROR',
          error.message
        ));
        reject(error);
      });
      
      this.server.on('listening', () => {
        this.listening = true;
        this.emit('listening');
        resolve();
      });
      
      // Configure server limits
      this.server.maxConnections = this.config.maxConnections;
      
      this.server.listen(this.config.socketPath);
    });
  }

  /**
   * Stop listening and close all connections
   */
  async stopListening(): Promise<void> {
    if (!this.listening || !this.server) {
      return;
    }

    return new Promise((resolve) => {
      // Close all client connections
      for (const client of this.clients.values()) {
        client.socket.end();
      }
      this.clients.clear();

      this.server!.close(async () => {
        this.listening = false;
        this.server = null;
        
        // Cleanup socket file if configured
        if (this.config.cleanupOnShutdown) {
          await this.cleanupSocketFile();
        }
        
        resolve();
      });
    });
  }

  /**
   * Send a response to a specific client
   */
  async sendResponse(clientId: string, response: SocketResponse): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) {
      throw new JanusServerError(
        'Client not found',
        'CLIENT_NOT_FOUND',
        `No client with ID ${clientId}`
      );
    }

    // Validate response
    const responseValidation = this.validator.validateResponse(response);
    if (!responseValidation.valid) {
      throw new JanusServerError(
        responseValidation.error!,
        responseValidation.code!,
        responseValidation.details
      );
    }

    try {
      const encoded = MessageFraming.encodeMessage(response);
      
      return new Promise((resolve, reject) => {
        client.socket.write(encoded, (error) => {
          if (error) {
            reject(new JanusServerError(
              'Failed to send response',
              'SEND_ERROR',
              error.message
            ));
          } else {
            client.lastActivity = new Date();
            this.emit('response', response, clientId);
            resolve();
          }
        });
      });
    } catch (error) {
      if (error instanceof MessageFramingError) {
        throw new JanusServerError(
          'Response encoding failed',
          error.code,
          error.message
        );
      }
      throw error;
    }
  }

  /**
   * Get server status
   */
  isListening(): boolean {
    return this.listening;
  }

  /**
   * Get connected clients count
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get client information
   */
  getClientInfo(clientId: string): { id: string; createdAt: Date; lastActivity: Date } | null {
    const client = this.clients.get(clientId);
    if (!client) {
      return null;
    }
    
    return {
      id: client.id,
      createdAt: client.createdAt,
      lastActivity: client.lastActivity
    };
  }

  /**
   * Handle new client connection
   */
  private handleNewConnection(socket: net.Socket): void {
    const clientId = `client-${++this.clientIdCounter}`;
    
    const client: ClientConnection = {
      id: clientId,
      socket,
      messageBuffer: Buffer.alloc(0),
      createdAt: new Date(),
      lastActivity: new Date()
    };
    
    this.clients.set(clientId, client);
    this.emit('connection', clientId);
    
    // Setup socket handlers
    socket.on('data', (data) => {
      this.handleClientData(clientId, data);
    });
    
    socket.on('error', (error) => {
      this.emit('error', new JanusServerError(
        'Client socket error',
        'CLIENT_SOCKET_ERROR',
        `Client ${clientId}: ${error.message}`
      ));
    });
    
    socket.on('close', () => {
      this.handleClientDisconnection(clientId);
    });
    
    socket.on('end', () => {
      this.handleClientDisconnection(clientId);
    });
  }

  /**
   * Handle data from a client
   */
  private handleClientData(clientId: string, data: Buffer): void {
    const client = this.clients.get(clientId);
    if (!client) {
      return;
    }

    try {
      // Update activity timestamp
      client.lastActivity = new Date();
      
      // Append to message buffer
      client.messageBuffer = Buffer.concat([client.messageBuffer, data]);
      
      // Extract complete messages
      const result = MessageFraming.extractMessages(client.messageBuffer);
      client.messageBuffer = result.remainingBuffer;
      
      // Process each message
      for (const message of result.messages) {
        this.handleClientMessage(clientId, message);
      }
    } catch (error) {
      this.emit('error', new JanusServerError(
        'Message processing failed',
        'MESSAGE_PROCESSING_ERROR',
        `Client ${clientId}: ${error instanceof Error ? error.message : String(error)}`
      ));
    }
  }

  /**
   * Handle a message from a client
   */
  private async handleClientMessage(clientId: string, message: SocketCommand | SocketResponse): Promise<void> {
    // Only handle commands (responses would be for clients acting as servers)
    if ('id' in message) {
      await this.handleCommand(clientId, message);
    }
  }

  /**
   * Handle a command from a client
   */
  private async handleCommand(clientId: string, command: SocketCommand): Promise<void> {
    this.emit('command', command, clientId);
    
    // Validate command
    const commandValidation = this.validator.validateCommand(command);
    if (!commandValidation.valid) {
      await this.sendErrorResponse(clientId, command, 'VALIDATION_FAILED', commandValidation.error!, commandValidation.details);
      return;
    }

    // Find handler
    const handler = this.commandHandlers[command.channelId]?.[command.command];
    if (!handler) {
      await this.sendErrorResponse(clientId, command, 'HANDLER_NOT_FOUND', `No handler for ${command.channelId}.${command.command}`);
      return;
    }

    // Execute handler with timeout
    const timeout = command.timeout ?? this.config.defaultTimeout;
    
    try {
      const result = await this.executeWithTimeout(handler, command.args ?? {}, timeout);
      
      const response: SocketResponse = {
        commandId: command.id,
        channelId: command.channelId,
        success: true,
        result: result as Record<string, any>,
        timestamp: new Date().toISOString()
      };
      
      await this.sendResponse(clientId, response);
    } catch (error) {
      let errorCode = 'HANDLER_ERROR';
      let errorMessage = 'Command execution failed';
      let errorDetails: string | undefined;
      
      if (error instanceof Error) {
        errorMessage = error.message;
        if (error.name === 'TimeoutError') {
          errorCode = 'HANDLER_TIMEOUT';
        }
        errorDetails = error.stack;
      }
      
      await this.sendErrorResponse(clientId, command, errorCode, errorMessage, errorDetails);
    }
  }

  /**
   * Send an error response
   */
  private async sendErrorResponse(
    clientId: string,
    command: SocketCommand,
    errorCode: string,
    errorMessage: string,
    errorDetails?: string
  ): Promise<void> {
    const errorResponse: SocketResponse = {
      commandId: command.id,
      channelId: command.channelId,
      success: false,
      error: {
        code: errorCode,
        message: errorMessage,
        ...(errorDetails && { details: errorDetails })
      },
      timestamp: new Date().toISOString()
    };
    
    try {
      await this.sendResponse(clientId, errorResponse);
    } catch (sendError) {
      this.emit('error', new JanusServerError(
        'Failed to send error response',
        'ERROR_RESPONSE_FAILED',
        `Client ${clientId}: ${sendError instanceof Error ? sendError.message : String(sendError)}`
      ));
    }
  }

  /**
   * Execute handler with timeout
   */
  private async executeWithTimeout<T>(
    handler: CommandHandler,
    args: Record<string, any>,
    timeoutSeconds: number
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const error = new Error(`Handler execution timed out after ${timeoutSeconds} seconds`);
        error.name = 'TimeoutError';
        reject(error);
      }, timeoutSeconds * 1000);

      Promise.resolve(handler(args))
        .then((result) => {
          clearTimeout(timer);
          resolve(result as T);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Handle client disconnection
   */
  private handleClientDisconnection(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      this.clients.delete(clientId);
      this.emit('disconnection', clientId);
    }
  }

  /**
   * Cleanup socket file
   */
  private async cleanupSocketFile(): Promise<void> {
    try {
      await fs.promises.unlink(this.config.socketPath);
    } catch (error) {
      // Ignore errors (file might not exist)
    }
  }

  // Event emitter type safety
  override on<K extends keyof JanusServerEvents>(
    event: K,
    listener: JanusServerEvents[K]
  ): this {
    return super.on(event, listener);
  }

  override emit<K extends keyof JanusServerEvents>(
    event: K,
    ...args: Parameters<JanusServerEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}