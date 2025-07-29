/**
 * Unix Datagram Client for Unix Socket API Protocol
 * Implements connectionless SOCK_DGRAM communication
 */

import * as dgram from 'dgram';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { EventEmitter } from 'events';
import { SocketCommand, SocketResponse, ConnectionConfig } from '../types/protocol';
import { SecurityValidator } from './security-validator';

export interface UnixDatagramClientEvents {
  'error': (error: Error) => void;
  'message': (message: SocketCommand | SocketResponse) => void;
  'response': (response: SocketResponse) => void;
}

export class UnixDatagramClientError extends Error {
  constructor(message: string, public code: string, public details?: string) {
    super(message);
    this.name = 'UnixDatagramClientError';
  }
}

export class UnixDatagramClient extends EventEmitter {
  private config: Required<ConnectionConfig>;
  private validator: SecurityValidator;

  constructor(config: ConnectionConfig) {
    super();
    
    this.config = {
      socketPath: config.socketPath,
      defaultTimeout: config.defaultTimeout ?? 30.0,
      maxMessageSize: config.maxMessageSize ?? 64 * 1024, // 64KB for datagram limit
      connectionTimeout: config.connectionTimeout ?? 10000,
      maxPendingCommands: config.maxPendingCommands ?? 1000
    };
    
    this.validator = new SecurityValidator({
      maxTotalSize: this.config.maxMessageSize
    });

    // Validate socket path
    const pathValidation = this.validator.validateSocketPath(this.config.socketPath);
    if (!pathValidation.valid) {
      throw new UnixDatagramClientError(
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
   * Send command datagram and wait for response
   */
  async sendCommand(command: Omit<SocketCommand, 'reply_to'>): Promise<SocketResponse> {
    return new Promise(async (resolve, reject) => {
      const responseSocketPath = this.generateResponseSocketPath();
      let responseSocket: dgram.Socket | null = null;
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
        // Create response socket
        responseSocket = dgram.createSocket('udp4') // TODO: Implement proper unix domain socket support;
        
        // Bind response socket
        responseSocket.bind(8082); // TODO: Use proper unix domain socket path

        // Set up response listener
        responseSocket.on('message', (data: Buffer) => {
          try {
            const response: SocketResponse = JSON.parse(data.toString());
            cleanup();
            resolve(response);
          } catch (err) {
            cleanup();
            reject(new UnixDatagramClientError(
              'Failed to parse response',
              'PARSE_ERROR',
              err instanceof Error ? err.message : String(err)
            ));
          }
        });

        responseSocket.on('error', (err) => {
          cleanup();
          reject(new UnixDatagramClientError(
            'Response socket error',
            'RESPONSE_SOCKET_ERROR',
            err.message
          ));
        });

        // Set timeout
        const timeout = command.timeout || this.config.defaultTimeout;
        timeoutHandle = setTimeout(() => {
          cleanup();
          reject(new UnixDatagramClientError(
            'Command timeout',
            'TIMEOUT',
            `Command ${command.id} timed out after ${timeout}s`
          ));
        }, timeout * 1000);

        // Prepare command with reply_to field
        const commandWithReplyTo: SocketCommand = {
          ...command,
          reply_to: responseSocketPath
        };

        // Validate command
        const commandData = Buffer.from(JSON.stringify(commandWithReplyTo));
        if (commandData.length > this.config.maxMessageSize) {
          cleanup();
          reject(new UnixDatagramClientError(
            'Message too large',
            'MESSAGE_TOO_LARGE',
            `Message size ${commandData.length} exceeds limit ${this.config.maxMessageSize}`
          ));
          return;
        }

        // Send command datagram
        const clientSocket = dgram.createSocket('udp4') // TODO: Implement proper unix domain socket support;
        clientSocket.send(commandData, 8080, 'localhost', (err) => { // TODO: Use proper unix domain socket
          clientSocket.close();
          if (err) {
            cleanup();
            reject(new UnixDatagramClientError(
              'Failed to send command',
              'SEND_ERROR',
              err.message
            ));
          }
        });

      } catch (err) {
        cleanup();
        reject(new UnixDatagramClientError(
          'Failed to set up datagram communication',
          'SETUP_ERROR',
          err instanceof Error ? err.message : String(err)
        ));
      }
    });
  }

  /**
   * Send command without expecting response (fire-and-forget)
   */
  async sendCommandNoResponse(command: Omit<SocketCommand, 'reply_to'>): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Validate command
        const commandData = Buffer.from(JSON.stringify(command));
        if (commandData.length > this.config.maxMessageSize) {
          reject(new UnixDatagramClientError(
            'Message too large',
            'MESSAGE_TOO_LARGE',
            `Message size ${commandData.length} exceeds limit ${this.config.maxMessageSize}`
          ));
          return;
        }

        // Send command datagram
        const clientSocket = dgram.createSocket('udp4') // TODO: Implement proper unix domain socket support;
        clientSocket.send(commandData, 8080, 'localhost', (err) => { // TODO: Use proper unix domain socket
          clientSocket.close();
          if (err) {
            reject(new UnixDatagramClientError(
              'Failed to send command',
              'SEND_ERROR',
              err.message
            ));
          } else {
            resolve();
          }
        });

      } catch (err) {
        reject(new UnixDatagramClientError(
          'Failed to send command',
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
      const testSocket = dgram.createSocket('udp4') // TODO: Implement proper unix domain socket support;
      
      return new Promise((resolve) => {
        const testData = Buffer.from('test');
        testSocket.send(testData, 8080, 'localhost', (err) => { // TODO: Use proper unix domain socket
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