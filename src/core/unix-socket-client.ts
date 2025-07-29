/**
 * Unix Socket Client for Unix Socket API Protocol
 * Implements async connection management and message handling
 */

import * as net from 'net';
import { EventEmitter } from 'events';
import { SocketCommand, SocketResponse, PendingCommand, ConnectionConfig } from '../types/protocol';
import { MessageFraming, MessageFramingError } from './message-framing';
import { SecurityValidator } from './security-validator';

export interface UnixSocketClientEvents {
  'connected': () => void;
  'disconnected': () => void;
  'error': (error: Error) => void;
  'message': (message: SocketCommand | SocketResponse) => void;
  'response': (response: SocketResponse) => void;
}

export class UnixSocketClientError extends Error {
  constructor(message: string, public code: string, public details?: string) {
    super(message);
    this.name = 'UnixSocketClientError';
  }
}

export class UnixSocketClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private connected = false;
  private connecting = false;
  private config: Required<ConnectionConfig>;
  private validator: SecurityValidator;
  private pendingCommands = new Map<string, PendingCommand>();
  private messageBuffer = Buffer.alloc(0);
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private reconnectDelay = 1000;

  constructor(config: ConnectionConfig) {
    super();
    
    this.config = {
      socketPath: config.socketPath,
      defaultTimeout: config.defaultTimeout ?? 30.0,
      maxMessageSize: config.maxMessageSize ?? 10 * 1024 * 1024,
      connectionTimeout: config.connectionTimeout ?? 10000,
      maxPendingCommands: config.maxPendingCommands ?? 1000
    };
    
    this.validator = new SecurityValidator({
      maxTotalSize: this.config.maxMessageSize
    });
    
    // Validate socket path
    const pathValidation = this.validator.validateSocketPath(this.config.socketPath);
    if (!pathValidation.valid) {
      throw new UnixSocketClientError(
        pathValidation.error!,
        pathValidation.code!,
        pathValidation.details
      );
    }
  }

  /**
   * Connect to the Unix socket
   */
  async connect(): Promise<void> {
    if (this.connected || this.connecting) {
      return;
    }

    this.connecting = true;

    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      let connectionTimer: NodeJS.Timeout;

      const cleanup = () => {
        if (connectionTimer) {
          clearTimeout(connectionTimer);
        }
        this.connecting = false;
      };

      // Connection timeout
      connectionTimer = setTimeout(() => {
        cleanup();
        socket.destroy();
        reject(new UnixSocketClientError(
          'Connection timeout',
          'CONNECTION_TIMEOUT',
          `Failed to connect to ${this.config.socketPath} within ${this.config.connectionTimeout}ms`
        ));
      }, this.config.connectionTimeout);

      socket.connect(this.config.socketPath, () => {
        cleanup();
        this.socket = socket;
        this.connected = true;
        this.reconnectAttempts = 0;
        this.setupSocketHandlers();
        this.emit('connected');
        resolve();
      });

      socket.on('error', (error) => {
        cleanup();
        this.emit('error', new UnixSocketClientError(
          'Connection failed',
          'CONNECTION_ERROR',
          error.message
        ));
        reject(error);
      });
    });
  }

  /**
   * Disconnect from the Unix socket
   */
  async disconnect(): Promise<void> {
    if (!this.connected || !this.socket) {
      return;
    }

    return new Promise((resolve) => {
      this.socket!.end(() => {
        this.connected = false;
        this.socket = null;
        this.messageBuffer = Buffer.alloc(0);
        
        // Reject all pending commands
        for (const [, pending] of this.pendingCommands) {
          pending.reject(new UnixSocketClientError(
            'Connection closed',
            'CONNECTION_CLOSED',
            'Socket was disconnected while command was pending'
          ));
        }
        this.pendingCommands.clear();
        
        this.emit('disconnected');
        resolve();
      });
    });
  }

  /**
   * Send a command and wait for response
   */
  async sendCommand(
    channelId: string,
    command: string,
    args?: Record<string, any>,
    timeout?: number
  ): Promise<SocketResponse> {
    if (!this.connected || !this.socket) {
      throw new UnixSocketClientError(
        'Not connected',
        'NOT_CONNECTED',
        'Must connect to socket before sending commands'
      );
    }

    // Validate inputs
    const channelValidation = this.validator.validateName(channelId, 'channel');
    if (!channelValidation.valid) {
      throw new UnixSocketClientError(
        channelValidation.error!,
        channelValidation.code!,
        channelValidation.details
      );
    }

    const commandValidation = this.validator.validateName(command, 'command');
    if (!commandValidation.valid) {
      throw new UnixSocketClientError(
        commandValidation.error!,
        commandValidation.code!,
        commandValidation.details
      );
    }

    const finalTimeout = timeout ?? this.config.defaultTimeout;
    const timeoutValidation = this.validator.validateTimeout(finalTimeout);
    if (!timeoutValidation.valid) {
      throw new UnixSocketClientError(
        timeoutValidation.error!,
        timeoutValidation.code!,
        timeoutValidation.details
      );
    }

    if (args) {
      const argsValidation = this.validator.validateArgsSize(args);
      if (!argsValidation.valid) {
        throw new UnixSocketClientError(
          argsValidation.error!,
          argsValidation.code!,
          argsValidation.details
        );
      }
    }

    // Check pending commands limit
    if (this.pendingCommands.size >= this.config.maxPendingCommands) {
      throw new UnixSocketClientError(
        'Too many pending commands',
        'PENDING_COMMANDS_LIMIT',
        `Maximum ${this.config.maxPendingCommands} pending commands allowed`
      );
    }

    // Create command
    const socketCommand: SocketCommand = {
      id: this.generateUUID(),
      channelId,
      command,
      timeout: finalTimeout,
      timestamp: new Date().toISOString()
    };
    
    if (args !== undefined) {
      socketCommand.args = args;
    }

    // Validate complete command
    const commandValidationResult = this.validator.validateCommand(socketCommand);
    if (!commandValidationResult.valid) {
      throw new UnixSocketClientError(
        commandValidationResult.error!,
        commandValidationResult.code!,
        commandValidationResult.details
      );
    }

    // Create promise for response
    const responsePromise = new Promise<SocketResponse>((resolve, reject) => {
      const pending: PendingCommand = {
        resolve,
        reject,
        timestamp: Date.now(),
        timeout: finalTimeout
      };

      this.pendingCommands.set(socketCommand.id, pending);

      // Set timeout
      setTimeout(() => {
        const stillPending = this.pendingCommands.get(socketCommand.id);
        if (stillPending) {
          this.pendingCommands.delete(socketCommand.id);
          reject(new UnixSocketClientError(
            'Command timeout',
            'COMMAND_TIMEOUT',
            `Command timed out after ${finalTimeout} seconds`
          ));
        }
      }, finalTimeout * 1000);
    });

    // Send command
    try {
      await this.sendMessage(socketCommand);
    } catch (error) {
      this.pendingCommands.delete(socketCommand.id);
      throw error;
    }

    return responsePromise;
  }

  /**
   * Send a message without waiting for response
   */
  async sendMessage(message: SocketCommand | SocketResponse): Promise<void> {
    if (!this.connected || !this.socket) {
      throw new UnixSocketClientError(
        'Not connected',
        'NOT_CONNECTED',
        'Must connect to socket before sending messages'
      );
    }

    try {
      const encoded = MessageFraming.encodeMessage(message);
      
      return new Promise((resolve, reject) => {
        this.socket!.write(encoded, (error) => {
          if (error) {
            reject(new UnixSocketClientError(
              'Failed to send message',
              'SEND_ERROR',
              error.message
            ));
          } else {
            resolve();
          }
        });
      });
    } catch (error) {
      if (error instanceof MessageFramingError) {
        throw new UnixSocketClientError(
          'Message encoding failed',
          error.code,
          error.message
        );
      }
      throw error;
    }
  }

  /**
   * Get connection status
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get pending commands count
   */
  getPendingCommandsCount(): number {
    return this.pendingCommands.size;
  }

  /**
   * Setup socket event handlers
   */
  private setupSocketHandlers(): void {
    if (!this.socket) return;

    this.socket.on('data', (data) => {
      this.handleIncomingData(data);
    });

    this.socket.on('error', (error) => {
      this.emit('error', new UnixSocketClientError(
        'Socket error',
        'SOCKET_ERROR',
        error.message
      ));
    });

    this.socket.on('close', () => {
      this.connected = false;
      this.socket = null;
      this.emit('disconnected');
      
      // Attempt reconnection if configured
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.attemptReconnection();
      }
    });

    this.socket.on('end', () => {
      this.connected = false;
      this.socket = null;
      this.emit('disconnected');
    });
  }

  /**
   * Handle incoming data and extract messages
   */
  private handleIncomingData(data: Buffer): void {
    try {
      // Append to message buffer
      this.messageBuffer = Buffer.concat([this.messageBuffer, data]);
      
      // Extract complete messages
      const result = MessageFraming.extractMessages(this.messageBuffer);
      this.messageBuffer = result.remainingBuffer;
      
      // Process each message
      for (const message of result.messages) {
        this.handleMessage(message);
      }
    } catch (error) {
      this.emit('error', new UnixSocketClientError(
        'Message processing failed',
        'MESSAGE_PROCESSING_ERROR',
        error instanceof Error ? error.message : String(error)
      ));
    }
  }

  /**
   * Handle a decoded message
   */
  private handleMessage(message: SocketCommand | SocketResponse): void {
    this.emit('message', message);
    
    // If it's a response, handle correlation
    if ('commandId' in message) {
      this.handleResponse(message);
    }
  }

  /**
   * Handle a response message
   */
  private handleResponse(response: SocketResponse): void {
    this.emit('response', response);
    
    const pending = this.pendingCommands.get(response.commandId);
    if (pending) {
      this.pendingCommands.delete(response.commandId);
      
      if (response.success) {
        pending.resolve(response);
      } else {
        const error = new UnixSocketClientError(
          response.error?.message ?? 'Command failed',
          response.error?.code ?? 'COMMAND_FAILED',
          response.error?.details
        );
        pending.reject(error);
      }
    }
  }

  /**
   * Attempt to reconnect to the socket
   */
  private async attemptReconnection(): Promise<void> {
    this.reconnectAttempts++;
    
    setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.attemptReconnection();
        } else {
          this.emit('error', new UnixSocketClientError(
            'Max reconnection attempts reached',
            'RECONNECTION_FAILED',
            `Failed to reconnect after ${this.maxReconnectAttempts} attempts`
          ));
        }
      }
    }, this.reconnectDelay * this.reconnectAttempts);
  }

  /**
   * Generate a UUID v4
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // Event emitter type safety
  override on<K extends keyof UnixSocketClientEvents>(
    event: K,
    listener: UnixSocketClientEvents[K]
  ): this {
    return super.on(event, listener);
  }

  override emit<K extends keyof UnixSocketClientEvents>(
    event: K,
    ...args: Parameters<UnixSocketClientEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}