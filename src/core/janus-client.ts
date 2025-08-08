/**
 * Unix Datagram Client for Janus Protocol
 * Implements connectionless SOCK_DGRAM communication
 */

import * as unixDgram from 'unix-dgram';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { EventEmitter } from 'events';
import { JanusRequest, JanusResponse, ConnectionConfig } from '../types/protocol';
import { SecurityValidator } from './security-validator';

export interface JanusClientEvents {
  'error': (error: Error) => void;
  'message': (message: JanusRequest | JanusResponse) => void;
  'response': (response: JanusResponse) => void;
}

export class JanusClientError extends Error {
  constructor(message: string, public code: string, public details?: string) {
    super(message);
    this.name = 'JanusClientError';
  }
}

export class JanusClient extends EventEmitter {
  private config: Required<ConnectionConfig>;
  private validator: SecurityValidator;

  constructor(config: ConnectionConfig) {
    super();
    
    this.config = {
      socketPath: config.socketPath,
      defaultTimeout: config.defaultTimeout ?? 30.0,
      maxMessageSize: config.maxMessageSize ?? 64 * 1024, // 64KB for datagram limit
      connectionTimeout: config.connectionTimeout ?? 10000,
      maxPendingRequests: config.maxPendingRequests ?? 1000
    };
    
    this.validator = new SecurityValidator({
      maxTotalSize: this.config.maxMessageSize
    });

    // Validate socket path
    const pathValidation = this.validator.validateSocketPath(this.config.socketPath);
    if (!pathValidation.valid) {
      throw new JanusClientError(
        'Invalid socket path',
        'INVALID_PATH',
        pathValidation.details
      );
    }
  }

  /**
   * Generate temporary response socket path
   */
  private generateResponseSocketPath(): string {
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex');
    return `/tmp/unix_client_${process.pid}_${timestamp}_${random}.sock`;
  }

  /**
   * Send request datagram and wait for response
   */
  async sendRequest(request: Omit<JanusRequest, 'reply_to'>): Promise<JanusResponse> {
    return new Promise(async (resolve, reject) => {
      const responseSocketPath = this.generateResponseSocketPath();
      let responseSocket: any = null;
      let timeoutHandle: NodeJS.Timeout;

      const cleanup = () => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        if (responseSocket) {
          responseSocket.close();
        }
        // Clean up socket file
        try {
          if (fs.existsSync(responseSocketPath)) {
            fs.unlinkSync(responseSocketPath);
          }
        } catch (err) {
          // Best effort cleanup
        }
      };

      try {
        // Create response socket for Unix domain datagram
        responseSocket = unixDgram.createSocket('unix_dgram');
        
        // Bind response socket to Unix domain socket path
        responseSocket.bind(responseSocketPath);

        // Set up response listener
        responseSocket.on('message', (data: Buffer) => {
          try {
            const response: JanusResponse = JSON.parse(data.toString());
            cleanup();
            
            // Check if response indicates an error
            if (!response.success && response.error) {
              const error = new JanusClientError(
                response.error.message || 'Request failed',
                'SERVER_ERROR',
                response.error.data?.details
              );
              // Add numeric code property for test compatibility
              (error as any).code = response.error.code;
              reject(error);
            } else {
              resolve(response);
            }
          } catch (err) {
            cleanup();
            reject(new JanusClientError(
              'Failed to parse response',
              'PARSE_ERROR',
              err instanceof Error ? err.message : String(err)
            ));
          }
        });

        responseSocket.on('error', (err: Error) => {
          cleanup();
          reject(new JanusClientError(
            'Response socket error',
            'RESPONSE_SOCKET_ERROR',
            err.message
          ));
        });

        // Set timeout
        const timeout = request.timeout || this.config.defaultTimeout;
        timeoutHandle = setTimeout(() => {
          cleanup();
          reject(new JanusClientError(
            'Request timeout',
            'TIMEOUT',
            `Request ${request.id} timed out after ${timeout}s`
          ));
        }, timeout * 1000);

        // Prepare request with reply_to field
        const requestWithReplyTo: JanusRequest = {
          ...request,
          reply_to: responseSocketPath
        };

        // Validate request
        const requestData = Buffer.from(JSON.stringify(requestWithReplyTo));
        if (requestData.length > this.config.maxMessageSize) {
          cleanup();
          reject(new JanusClientError(
            'Message too large',
            'MESSAGE_TOO_LARGE',
            `Message size ${requestData.length} exceeds limit ${this.config.maxMessageSize}`
          ));
          return;
        }

        // Send request datagram to Unix domain socket
        const clientSocket = unixDgram.createSocket('unix_dgram');
        clientSocket.send(requestData, 0, requestData.length, this.config.socketPath, (err: Error | null) => {
          clientSocket.close();
          if (err) {
            cleanup();
            // Dynamic error detection for message too large (matching Go/Rust/Swift pattern)
            if (err.message && err.message.toLowerCase().includes('message too long')) {
              reject(new JanusClientError(
                'Message size exceeds socket buffer limits. Try reducing message size or splitting into smaller parts.',
                'MESSAGE_TOO_LARGE',
                `Underlying error: ${err.message}`
              ));
            } else {
              reject(new JanusClientError(
                'Failed to send request',
                'SEND_ERROR',
                err.message
              ));
            }
          }
        });

      } catch (err) {
        cleanup();
        reject(new JanusClientError(
          'Failed to set up datagram communication',
          'SETUP_ERROR',
          err instanceof Error ? err.message : String(err)
        ));
      }
    });
  }

  /**
   * Send request without expecting response (fire-and-forget)
   */
  async sendRequestNoResponse(request: Omit<JanusRequest, 'reply_to'>): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Validate request
        const requestData = Buffer.from(JSON.stringify(request));
        if (requestData.length > this.config.maxMessageSize) {
          reject(new JanusClientError(
            'Message too large',
            'MESSAGE_TOO_LARGE',
            `Message size ${requestData.length} exceeds limit ${this.config.maxMessageSize}`
          ));
          return;
        }

        // Send request datagram to Unix domain socket
        const clientSocket = unixDgram.createSocket('unix_dgram');
        clientSocket.send(requestData, 0, requestData.length, this.config.socketPath, (err: Error | null) => {
          clientSocket.close();
          if (err) {
            // Dynamic error detection for message too large (matching Go/Rust/Swift pattern)
            if (err.message && err.message.toLowerCase().includes('message too long')) {
              reject(new JanusClientError(
                'Message size exceeds socket buffer limits. Try reducing message size or splitting into smaller parts.',
                'MESSAGE_TOO_LARGE',
                `Underlying error: ${err.message}`
              ));
            } else {
              reject(new JanusClientError(
                'Failed to send request',
                'SEND_ERROR',
                err.message
              ));
            }
          } else {
            resolve();
          }
        });

      } catch (err) {
        reject(new JanusClientError(
          'Failed to send request',
          'SEND_ERROR',
          err instanceof Error ? err.message : String(err)
        ));
      }
    });
  }

  /**
   * Test connectivity to server socket
   */
  async testConnection(): Promise<boolean> {
    try {
      // Try to create a client socket and connect to server
      const testSocket = unixDgram.createSocket('unix_dgram');
      
      return new Promise((resolve) => {
        const testData = Buffer.from('test');
        testSocket.send(testData, 0, testData.length, this.config.socketPath, (err: Error | null) => {
          testSocket.close();
          resolve(!err);
        });
      });
    } catch (err) {
      return false;
    }
  }

  /**
   * Clean up any remaining socket files (utility method)
   */
  static cleanupSocketFiles(_pattern: string = '/tmp/unix_client_*.sock'): void {
    try {
      const tmpDir = '/tmp';
      const files = fs.readdirSync(tmpDir);
      const socketFiles = files.filter(file => 
        file.startsWith('unix_client_') && file.endsWith('.sock')
      );
      
      socketFiles.forEach(file => {
        try {
          fs.unlinkSync(path.join(tmpDir, file));
        } catch (err) {
          // Best effort cleanup
        }
      });
    } catch (err) {
      // Best effort cleanup
    }
  }
}