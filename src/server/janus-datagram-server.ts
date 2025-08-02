/**
 * Unix Datagram Server for Janus Protocol
 * Implements SOCK_DGRAM connectionless server with command handling
 */

import * as unixDgram from 'unix-dgram';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { EventEmitter } from 'events';
import { SocketCommand, SocketResponse } from '../types/protocol';
import { SecurityValidator } from '../core/security-validator';
import { JSONRPCErrorBuilder, JSONRPCErrorCode } from '../types/jsonrpc-error';

export interface JanusDatagramServerEvents {
  'listening': () => void;
  'command': (command: SocketCommand, clientAddress?: string) => void;
  'response': (response: SocketResponse, clientAddress?: string) => void;
  'error': (error: Error) => void;
  'clientActivity': (clientAddress: string, timestamp: Date) => void;
}

export interface DatagramServerConfig {
  /** Unix socket path */
  socketPath: string;
  
  /** Default command timeout in seconds */
  defaultTimeout?: number;
  
  /** Maximum message size in bytes */
  maxMessageSize?: number;
  
  /** Whether to cleanup socket file on start */
  cleanupOnStart?: boolean;
  
  /** Whether to cleanup socket file on shutdown */
  cleanupOnShutdown?: boolean;

  /** Maximum concurrent handlers */
  maxConcurrentHandlers?: number;
}

interface ClientActivity {
  address: string;
  lastActivity: Date;
  commandCount: number;
}

export type CommandHandler = (args: any) => Promise<any> | any;

export class JanusDatagramServer extends EventEmitter {
  private socket: any = null;
  private config: Required<DatagramServerConfig>;
  private validator: SecurityValidator;
  private commandHandlers = new Map<string, Map<string, CommandHandler>>();
  private clientActivity = new Map<string, ClientActivity>();
  private listening = false;
  private activeHandlers = 0;
  private shutdownInProgress = false;

  constructor(config: DatagramServerConfig) {
    super();
    
    this.config = {
      socketPath: config.socketPath,
      defaultTimeout: config.defaultTimeout ?? 30.0,
      maxMessageSize: config.maxMessageSize ?? 64 * 1024, // 64KB datagram limit
      cleanupOnStart: config.cleanupOnStart ?? true,
      cleanupOnShutdown: config.cleanupOnShutdown ?? true,
      maxConcurrentHandlers: config.maxConcurrentHandlers ?? 100
    };
    
    this.validator = new SecurityValidator({
      maxTotalSize: this.config.maxMessageSize
    });
    
    // Validate socket path
    const pathValidation = this.validator.validateSocketPath(this.config.socketPath);
    if (!pathValidation.valid) {
      throw new Error(`Invalid socket path: ${pathValidation.details}`);
    }
  }

  /**
   * Register a command handler for a specific channel and command
   * Command Handler Registry feature
   */
  registerCommandHandler(channelId: string, commandName: string, handler: CommandHandler): void {
    // Validate inputs
    const channelValidation = this.validator.validateName(channelId, 'channel');
    if (!channelValidation.valid) {
      throw new Error(`Invalid channel ID: ${channelValidation.details}`);
    }

    const commandValidation = this.validator.validateName(commandName, 'command');
    if (!commandValidation.valid) {
      throw new Error(`Invalid command name: ${commandValidation.details}`);
    }

    if (!this.commandHandlers.has(channelId)) {
      this.commandHandlers.set(channelId, new Map());
    }

    this.commandHandlers.get(channelId)!.set(commandName, handler);
  }

  /**
   * Unregister a command handler
   */
  unregisterCommandHandler(channelId: string, commandName: string): boolean {
    const channelHandlers = this.commandHandlers.get(channelId);
    if (channelHandlers) {
      return channelHandlers.delete(commandName);
    }
    return false;
  }

  /**
   * Get all registered handlers for a channel
   */
  getChannelHandlers(channelId: string): Map<string, CommandHandler> | undefined {
    return this.commandHandlers.get(channelId);
  }

  /**
   * Start the datagram server
   * Connection Processing Loop feature
   */
  async listen(): Promise<void> {
    if (this.listening) {
      throw new Error('Server is already listening');
    }

    return new Promise((resolve, reject) => {
      try {
        // Clean up existing socket file if requested
        if (this.config.cleanupOnStart && fs.existsSync(this.config.socketPath)) {
          fs.unlinkSync(this.config.socketPath);
        }

        // Create Unix domain datagram socket
        this.socket = unixDgram.createSocket('unix_dgram');

        // Set up message handler - this is the main event loop
        this.socket.on('message', (data: Buffer, rinfo: any) => {
          this.handleIncomingMessage(data, rinfo);
        });

        // Error handling
        this.socket.on('error', (error: Error) => {
          this.emit('error', error);
        });

        // Bind to Unix socket path
        this.socket.bind(this.config.socketPath);
        
        this.listening = true;
        this.emit('listening');
        resolve();

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle incoming datagram message
   * Main server event loop processing
   */
  private async handleIncomingMessage(data: Buffer, rinfo: any): Promise<void> {
    if (this.shutdownInProgress) {
      return;
    }

    const clientAddress = rinfo?.address || 'unknown';
    
    try {
      // Track client activity
      this.trackClientActivity(clientAddress);

      // Parse incoming command
      const command: SocketCommand = JSON.parse(data.toString());
      
      // Validate command structure
      if (!this.isValidSocketCommand(command)) {
        await this.sendErrorResponse(
          command.reply_to || '',
          command.id || crypto.randomUUID(),
          JSONRPCErrorBuilder.create(JSONRPCErrorCode.INVALID_REQUEST, 'Invalid command structure')
        );
        return;
      }

      this.emit('command', command, clientAddress);

      // Execute command with timeout management
      await this.executeCommandWithTimeout(command, clientAddress);

    } catch (error) {
      // Error Response Generation feature
      const errorResponse = this.generateErrorResponse(
        error,
        'unknown',
        crypto.randomUUID()
      );
      
      if (errorResponse.reply_to) {
        await this.sendResponse(errorResponse);
      }
      
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Track client activity for Multi-Client Connection Management
   */
  private trackClientActivity(clientAddress: string): void {
    const now = new Date();
    const existing = this.clientActivity.get(clientAddress);
    
    if (existing) {
      existing.lastActivity = now;
      existing.commandCount++;
    } else {
      this.clientActivity.set(clientAddress, {
        address: clientAddress,
        lastActivity: now,
        commandCount: 1
      });
    }

    this.emit('clientActivity', clientAddress, now);
  }

  /**
   * Execute command with timeout management
   * Command Execution with Timeout feature
   */
  private async executeCommandWithTimeout(command: SocketCommand, clientAddress: string): Promise<void> {
    if (this.activeHandlers >= this.config.maxConcurrentHandlers) {
      await this.sendErrorResponse(
        command.reply_to || '',
        command.id,
        JSONRPCErrorBuilder.create(JSONRPCErrorCode.RESOURCE_LIMIT_EXCEEDED, 'Too many concurrent handlers')
      );
      return;
    }

    this.activeHandlers++;

    try {
      const timeout = command.timeout || this.config.defaultTimeout;
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Command timeout after ${timeout}s`));
        }, timeout * 1000);
      });

      const executionPromise = this.executeCommand(command);
      
      const result = await Promise.race([executionPromise, timeoutPromise]);
      
      // Send successful response
      if (command.reply_to) {
        const response: SocketResponse = {
          id: command.id,
          success: true,
          result: result,
          timestamp: Date.now()
        };
        
        await this.sendResponse(response, command.reply_to);
        this.emit('response', response, clientAddress);
      }

    } catch (error) {
      // Send error response
      if (command.reply_to) {
        const errorCode = error instanceof Error && error.message.includes('timeout') 
          ? JSONRPCErrorCode.HANDLER_TIMEOUT 
          : JSONRPCErrorCode.INTERNAL_ERROR;
          
        await this.sendErrorResponse(
          command.reply_to,
          command.id,
          JSONRPCErrorBuilder.create(errorCode, error instanceof Error ? error.message : String(error))
        );
      }
    } finally {
      this.activeHandlers--;
    }
  }

  /**
   * Execute a command by finding and calling the appropriate handler
   */
  private async executeCommand(command: SocketCommand): Promise<any> {
    const channelHandlers = this.commandHandlers.get(command.channelId);
    if (!channelHandlers) {
      throw new Error(`Channel '${command.channelId}' not found`);
    }

    const handler = channelHandlers.get(command.command);
    if (!handler) {
      // Check for built-in commands
      const builtinResult = await this.handleBuiltinCommand(command);
      if (builtinResult !== null) {
        return builtinResult;
      }
      
      throw new Error(`Command '${command.command}' not found in channel '${command.channelId}'`);
    }

    // Execute handler
    return await handler(command.args || {});
  }

  /**
   * Handle built-in commands (ping, echo, get_info, spec, etc.)
   */
  private async handleBuiltinCommand(command: SocketCommand): Promise<any> {
    switch (command.command) {
      case 'ping':
        return { message: 'pong', timestamp: Date.now() };
        
      case 'echo':
        return { message: command.args?.message || 'echo', timestamp: Date.now() };
        
      case 'get_info':
        return {
          server: 'TypeScript Janus Datagram Server',
          version: '1.0.0',
          timestamp: Date.now(),
          activeHandlers: this.activeHandlers,
          activeClients: this.clientActivity.size
        };
        
      case 'spec':
        return {
          specification: this.generateServerSpecification()
        };
        
      default:
        return null; // Not a built-in command
    }
  }

  /**
   * Generate server specification for spec command
   */
  private generateServerSpecification(): any {
    const channels: any = {};
    
    for (const [channelId, handlers] of this.commandHandlers) {
      const commands: any = {};
      for (const [commandName] of handlers) {
        commands[commandName] = {
          description: `Handler for ${commandName} command`,
          arguments: {},
          response: {}
        };
      }
      
      channels[channelId] = {
        description: `Channel ${channelId}`,
        commands: commands
      };
    }
    
    return {
      version: '1.0.0',
      channels: channels,
      models: {}
    };
  }

  /**
   * Send response datagram
   */
  private async sendResponse(response: SocketResponse, replyTo?: string): Promise<void> {
    const targetPath = replyTo || response.reply_to;
    if (!targetPath) {
      return;
    }

    return new Promise((resolve, reject) => {
      const responseData = Buffer.from(JSON.stringify(response));
      
      if (responseData.length > this.config.maxMessageSize) {
        reject(new Error(`Response too large: ${responseData.length} bytes`));
        return;
      }

      const clientSocket = unixDgram.createSocket('unix_dgram');
      clientSocket.send(responseData, targetPath, (err: Error | null) => {
        clientSocket.close();
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Send error response
   * Error Response Generation feature
   */
  private async sendErrorResponse(replyTo: string, commandId: string, error: any): Promise<void> {
    if (!replyTo) return;

    const errorResponse: SocketResponse = {
      id: commandId,
      success: false,
      error: error,
      timestamp: Date.now(),
      reply_to: replyTo
    };

    try {
      await this.sendResponse(errorResponse, replyTo);
    } catch (sendError) {
      this.emit('error', sendError instanceof Error ? sendError : new Error(String(sendError)));
    }
  }

  /**
   * Generate standardized error response
   */
  private generateErrorResponse(error: any, commandId: string, replyTo: string): SocketResponse {
    let jsonrpcError;
    
    if (error instanceof Error) {
      if (error.message.includes('timeout')) {
        jsonrpcError = JSONRPCErrorBuilder.create(JSONRPCErrorCode.HANDLER_TIMEOUT, error.message);
      } else if (error.message.includes('not found')) {
        jsonrpcError = JSONRPCErrorBuilder.create(JSONRPCErrorCode.METHOD_NOT_FOUND, error.message);
      } else {
        jsonrpcError = JSONRPCErrorBuilder.create(JSONRPCErrorCode.INTERNAL_ERROR, error.message);
      }
    } else {
      jsonrpcError = JSONRPCErrorBuilder.create(JSONRPCErrorCode.INTERNAL_ERROR, String(error));
    }

    return {
      id: commandId,
      success: false,
      error: jsonrpcError,
      timestamp: Date.now(),
      reply_to: replyTo
    };
  }

  /**
   * Validate socket command structure
   */
  private isValidSocketCommand(command: any): command is SocketCommand {
    return (
      typeof command === 'object' &&
      command !== null &&
      typeof command.id === 'string' &&
      typeof command.channelId === 'string' &&
      typeof command.command === 'string' &&
      typeof command.timestamp === 'number'
    );
  }

  /**
   * Get client activity information
   * Client Activity Tracking feature
   */
  getClientActivity(): ClientActivity[] {
    return Array.from(this.clientActivity.values());
  }

  /**
   * Clean up inactive clients
   */
  cleanupInactiveClients(maxInactiveMs: number = 300000): void { // 5 minutes
    const now = new Date();
    for (const [address, activity] of this.clientActivity) {
      if (now.getTime() - activity.lastActivity.getTime() > maxInactiveMs) {
        this.clientActivity.delete(address);
      }
    }
  }

  /**
   * Get server statistics
   */
  getServerStats(): any {
    return {
      listening: this.listening,
      activeHandlers: this.activeHandlers,
      totalClients: this.clientActivity.size,
      totalChannels: this.commandHandlers.size,
      socketPath: this.config.socketPath
    };
  }

  /**
   * Stop the server gracefully
   * Graceful Shutdown feature
   */
  async close(): Promise<void> {
    if (!this.listening) {
      return;
    }

    this.shutdownInProgress = true;

    // Wait for active handlers to complete (with timeout)
    const maxWaitTime = 30000; // 30 seconds
    const startTime = Date.now();
    
    while (this.activeHandlers > 0 && (Date.now() - startTime) < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return new Promise((resolve) => {
      if (this.socket) {
        this.socket.close(() => {
          this.listening = false;
          
          // Socket File Cleanup feature
          if (this.config.cleanupOnShutdown && fs.existsSync(this.config.socketPath)) {
            try {
              fs.unlinkSync(this.config.socketPath);
            } catch (error) {
              // Ignore cleanup errors
            }
          }
          
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Check if server is listening
   */
  isListening(): boolean {
    return this.listening;
  }
}