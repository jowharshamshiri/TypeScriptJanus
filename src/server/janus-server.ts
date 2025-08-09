/**
 * Unix Datagram Server for Janus Protocol
 * Implements SOCK_DGRAM connectionless server with request handling
 */

import * as unixDgram from 'unix-dgram';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import debug from 'debug';
import { JanusRequest, JanusResponse } from '../types/protocol';
import { SecurityValidator } from '../core/security-validator';
import { JSONRPCErrorBuilder, JSONRPCErrorCode } from '../types/jsonrpc-error';

// Debug loggers - can be enabled with DEBUG=janus:server:* 
const debugInfo = debug('janus:server:info');
const debugVerbose = debug('janus:server:debug'); 
const debugError = debug('janus:server:error');

export interface JanusServerEvents {
  'listening': () => void;
  'request': (request: JanusRequest, clientAddress?: string) => void;
  'response': (response: JanusResponse, clientAddress?: string) => void;
  'error': (error: Error) => void;
  'clientActivity': (clientAddress: string, timestamp: Date) => void;
}

export interface DatagramServerConfig {
  /** Unix socket path */
  socketPath: string;
  
  /** Default request timeout in seconds */
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
  requestCount: number;
}

export type RequestHandler = (args: any) => Promise<any> | any;

export class JanusServerError extends Error {
  constructor(message: string, public code: string, public details?: string) {
    super(message);
    this.name = 'JanusServerError';
  }
}

export class JanusServer extends EventEmitter {
  private socket: any = null;
  private config: Required<DatagramServerConfig>;
  private validator: SecurityValidator;
  private requestHandlers = new Map<string, RequestHandler>();
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
   * Register a request handler for a specific request
   * Request Handler Registry feature
   */
  registerRequestHandler(requestName: string, handler: RequestHandler): void {
    const requestValidation = this.validator.validateName(requestName, 'request');
    if (!requestValidation.valid) {
      throw new Error(`Invalid request name: ${requestValidation.details}`);
    }

    this.requestHandlers.set(requestName, handler);
  }

  /**
   * Unregister a request handler
   */
  unregisterRequestHandler(requestName: string): boolean {
    return this.requestHandlers.delete(requestName);
  }

  /**
   * Get all registered handlers
   */
  getAllHandlers(): Map<string, RequestHandler> {
    return this.requestHandlers;
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

    // For Unix domain sockets, use reply_to path as client identifier if available
    // since rinfo.address may not be meaningful for datagram sockets
    let clientAddress = rinfo?.address || 'unknown';
    
    try {
      const tempRequest = JSON.parse(data.toString());
      if (tempRequest.replyTo) {
        clientAddress = tempRequest.replyTo;
      }
    } catch {
      // If we can't parse, use rinfo address
    }
    
    try {
      // Track client activity
      this.trackClientActivity(clientAddress);

      // Parse incoming request
      const request: JanusRequest = JSON.parse(data.toString());
      
      // Validate request structure
      if (!this.isValidJanusRequest(request)) {
        await this.sendErrorResponse(
          (request as any).reply_to || '',
          (request as any).id || crypto.randomUUID(),
          JSONRPCErrorBuilder.create(JSONRPCErrorCode.INVALID_REQUEST, 'Invalid request structure')
        );
        return;
      }

      this.emit('request', request, clientAddress);

      // Execute request with timeout management
      await this.executeRequestWithTimeout(request, clientAddress);

    } catch (error) {
      // Error Response Generation feature  
      let requestId = 'unknown';
      try {
        const parsedData = JSON.parse(data.toString());
        requestId = parsedData.id || 'unknown';
      } catch {
        // If we can't parse, use 'unknown'
      }
      
      const errorResponse = this.generateErrorResponse(
        error,
        requestId
      );
      
      await this.sendResponse(errorResponse);
      
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
      existing.requestCount++;
    } else {
      this.clientActivity.set(clientAddress, {
        address: clientAddress,
        lastActivity: now,
        requestCount: 1
      });
    }

    this.emit('clientActivity', clientAddress, now);
  }

  /**
   * Execute request with timeout management
   * Request Execution with Timeout feature
   */
  private async executeRequestWithTimeout(request: JanusRequest, clientAddress: string): Promise<void> {
    if (this.activeHandlers >= this.config.maxConcurrentHandlers) {
      await this.sendErrorResponse(
        request.reply_to || '',
        request.id,
        JSONRPCErrorBuilder.create(JSONRPCErrorCode.RESOURCE_LIMIT_EXCEEDED, 'Too many concurrent handlers')
      );
      return;
    }

    this.activeHandlers++;
    console.log('🔍 Handler started. activeHandlers:', this.activeHandlers);

    try {
      const timeout = request.timeout || this.config.defaultTimeout;
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Request timeout after ${timeout}s`));
        }, timeout * 1000);
      });

      const executionPromise = this.executeRequest(request);
      
      const result = await Promise.race([executionPromise, timeoutPromise]);
      
      // Send successful response
      if (request.reply_to) {
        const response: JanusResponse = {
          request_id: request.id,
          id: uuidv4(),
          success: true,
          result: result,
          timestamp: new Date().toISOString()
        };
        
        await this.sendResponse(response, request.reply_to);
        this.emit('response', response, clientAddress);
      }

    } catch (error) {
      // Send error response
      if (request.reply_to) {
        let jsonrpcError: any;
        
        // Check if error is already a JSONRPCError object
        if (error && typeof error === 'object' && 'code' in error && 'message' in error && typeof error.code === 'number') {
          jsonrpcError = error;
        } else {
          // Convert other errors to JSONRPCError
          const errorCode = error instanceof Error && error.message.includes('timeout') 
            ? JSONRPCErrorCode.HANDLER_TIMEOUT 
            : JSONRPCErrorCode.INTERNAL_ERROR;
            
          jsonrpcError = JSONRPCErrorBuilder.create(errorCode, error instanceof Error ? error.message : String(error));
        }
          
        await this.sendErrorResponse(
          request.reply_to,
          request.id,
          jsonrpcError
        );
      }
    } finally {
      this.activeHandlers--;
      console.log('🔍 Handler finished. activeHandlers:', this.activeHandlers);
    }
  }

  /**
   * Execute a request by finding and calling the appropriate handler
   */
  private async executeRequest(request: JanusRequest): Promise<any> {
    const handler = this.requestHandlers.get(request.request);
    
    if (!handler) {
      // Check for built-in requests
      const builtinResult = await this.handleBuiltinRequest(request);
      if (builtinResult !== null) {
        return builtinResult;
      }
      
      throw JSONRPCErrorBuilder.create(JSONRPCErrorCode.METHOD_NOT_FOUND, `Request '${request.request}' not found`);
    }

    // Execute handler
    return await handler(request.args || {});
  }

  /**
   * Handle built-in requests (ping, echo, get_info, manifest, etc.)
   */
  private async handleBuiltinRequest(request: JanusRequest): Promise<any> {
    switch (request.request) {
      case 'ping':
        return { message: 'pong', timestamp: new Date().toISOString() };
        
      case 'echo':
        return { message: request.args?.message || 'echo', timestamp: new Date().toISOString() };
        
      case 'get_info':
        return {
          server: 'TypeScript Janus Datagram Server',
          version: '1.0.0',
          timestamp: new Date().toISOString(),
          activeHandlers: this.activeHandlers,
          activeClients: this.clientActivity.size
        };
        
      case 'manifest':
        // Return the manifest directly, not wrapped in a "manifest" field
        return this.generateServerManifest();
        
      case 'validate':
        // Validate request - returns the args back as confirmation
        return {
          valid: true,
          received: request.args || {},
          timestamp: new Date().toISOString()
        };
        
      case 'slow_process':
        // Simulate a slow process
        const duration = request.args?.duration || 1000;
        await new Promise(resolve => setTimeout(resolve, duration));
        return {
          message: 'Slow process completed',
          duration: duration,
          timestamp: new Date().toISOString()
        };
        
      default:
        return null; // Not a built-in request
    }
  }

  /**
   * Generate server manifest for manifest request
   * Note: After channel removal, manifest only contains version, name, description, and models
   */
  private generateServerManifest(): any {
    return {
      version: '1.0.0',
      name: 'Janus Server',
      description: 'TypeScript Janus Server',
      models: {}
    };
  }

  /**
   * Send response datagram
   */
  private async sendResponse(response: JanusResponse, replyTo?: string): Promise<void> {
    const targetPath = replyTo;
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
      clientSocket.send(responseData, 0, responseData.length, targetPath, (err: Error | null) => {
        clientSocket.close();
        if (err) {
          // Handle common socket errors gracefully in test environments
          if (err.message?.includes('No such file or directory') || 
              err.message?.includes('ENOENT') || 
              (err as any).code === -2) {
            // Client socket was cleaned up during operation - normal in tests
            resolve();
          } else {
            reject(err);
          }
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Generate unique response ID
   */
  private generateResponseId(): string {
    return uuidv4();
  }

  /**
   * Send error response
   * Error Response Generation feature
   */
  private async sendErrorResponse(replyTo: string, request_id: string, error: any): Promise<void> {
    if (!replyTo) return;

    const errorResponse: JanusResponse = {
      request_id: request_id,
      id: this.generateResponseId(),
      success: false,
      error: error,
      timestamp: new Date().toISOString()
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
  private generateErrorResponse(error: any, request_id: string): JanusResponse {
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
      request_id: request_id,
      id: this.generateResponseId(),
      success: false,
      error: jsonrpcError,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Validate socket request structure
   */
  private isValidJanusRequest(request: any): request is JanusRequest {
    return (
      typeof request === 'object' &&
      request !== null &&
      typeof request.id === 'string' &&
      typeof request.method === 'string' &&
      typeof request.request === 'string' &&
      typeof request.timestamp === 'string'
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
      totalHandlers: this.requestHandlers.size,
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
        let resolved = false;
        
        // Set a timeout in case socket.close() callback never fires
        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            this.listening = false;
            
            // Do cleanup even if socket close callback didn't fire
            this.performSocketCleanup();
            resolve();
          }
        }, 1000); // 1 second timeout
        
        this.socket.close(() => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            this.listening = false;
            
            this.performSocketCleanup();
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Perform socket file cleanup
   * Socket File Cleanup feature
   */
  private performSocketCleanup(): void {
    if (this.config.cleanupOnShutdown && fs.existsSync(this.config.socketPath)) {
      try {
        console.log('🔍 Server cleanup: Cleaning up socket file');
        fs.unlinkSync(this.config.socketPath);
        console.log('🔍 Server cleanup: Socket file cleaned up successfully');
      } catch (error) {
        console.log('🔍 Server cleanup: Socket cleanup error (ignored):', error);
      }
    }
  }

  /**
   * Check if server is listening
   */
  isListening(): boolean {
    return this.listening;
  }
}