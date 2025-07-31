/**
 * High-level API client for SOCK_DGRAM Unix socket communication
 * TypeScript implementation achieving 100% parity with Swift/Go/Rust implementations
 */

import { v4 as uuidv4 } from 'uuid';
import { JanusClient } from '../core/unix-datagram-client';
import { 
  APISpecification, 
  SocketCommand, 
  SocketResponse
} from '../types/protocol';

/**
 * Configuration for JanusClient
 */
export interface JanusClientConfig {
  /** Unix socket path for communication */
  socketPath: string;
  
  /** Channel ID for routing messages */
  channelId: string;
  
  /** API specification for validation (optional) */
  apiSpec?: APISpecification;
  
  /** Maximum message size in bytes */
  maxMessageSize?: number;
  
  /** Default timeout for commands in seconds */
  defaultTimeout?: number;
  
  /** Datagram timeout for socket operations in seconds */
  datagramTimeout?: number;
  
  /** Enable command validation against API specification */
  enableValidation?: boolean;
}

/**
 * Errors specific to JanusClient operations
 */
export class JanusClientError extends Error {
  constructor(message: string, public readonly code: string, public readonly details?: string) {
    super(message);
    this.name = 'JanusClientError';
  }
}

/**
 * High-level SOCK_DGRAM client with API specification integration
 * Provides command validation, response correlation, and security hardening
 */
export class JanusClient {
  private readonly socketPath: string;
  private readonly channelId: string;
  private readonly apiSpec: APISpecification | undefined;
  private readonly janusClient: JanusClient;
  private readonly defaultTimeout: number;
  private readonly enableValidation: boolean;

  constructor(config: JanusClientConfig) {
    // Validate constructor inputs (matching Swift implementation pattern)
    JanusClient.validateConstructorInputs(
      config.socketPath,
      config.channelId,
      config.apiSpec
    );

    this.socketPath = config.socketPath;
    this.channelId = config.channelId;
    this.apiSpec = config.apiSpec;
    this.defaultTimeout = config.defaultTimeout ?? 30.0;
    this.enableValidation = config.enableValidation ?? true;

    // Create underlying datagram client
    this.janusClient = new JanusClient({
      socketPath: config.socketPath,
      maxMessageSize: config.maxMessageSize ?? 65536,
      defaultTimeout: config.datagramTimeout ?? 5.0
    });
  }

  /**
   * Send command via SOCK_DGRAM and wait for response
   * Matches Swift sendCommand method signature exactly
   */
  public async sendCommand(
    command: string,
    args?: Record<string, any>,
    timeout?: number
  ): Promise<SocketResponse> {
    // Generate command ID
    const commandId = uuidv4();

    // Create socket command (reply_to will be handled by underlying client)
    const socketCommand: SocketCommand = {
      id: commandId,
      channelId: this.channelId,
      command,
      timeout: timeout ?? this.defaultTimeout,
      timestamp: Date.now(),
      ...(args && { args })
    };

    // Validate command against API specification
    if (this.enableValidation && this.apiSpec) {
      this.validateCommandAgainstSpec(this.apiSpec, socketCommand);
    }

    // Send datagram and wait for response
    const response = await this.janusClient.sendCommand(socketCommand);

    // Validate response correlation
    if (response.commandId !== commandId) {
      throw new JanusClientError(
        `Response correlation mismatch: expected ${commandId}, got ${response.commandId}`,
        'CORRELATION_MISMATCH'
      );
    }

    if (response.channelId !== this.channelId) {
      throw new JanusClientError(
        `Channel mismatch: expected ${this.channelId}, got ${response.channelId}`,
        'CHANNEL_MISMATCH'
      );
    }

    return response;
  }

  /**
   * Send command without expecting response (fire-and-forget)
   * Matches Swift sendCommandNoResponse method signature exactly
   */
  public async sendCommandNoResponse(
    command: string,
    args?: Record<string, any>
  ): Promise<void> {
    // Generate command ID
    const commandId = uuidv4();

    // Create socket command (no reply_to field)
    const socketCommand: SocketCommand = {
      id: commandId,
      channelId: this.channelId,
      command,
      timestamp: Date.now(),
      ...(args && { args })
      // No reply_to field for fire-and-forget
    };

    // Validate command against API specification
    if (this.enableValidation && this.apiSpec) {
      this.validateCommandAgainstSpec(this.apiSpec, socketCommand);
    }

    // Send datagram without waiting for response
    await this.janusClient.sendCommandNoResponse(socketCommand);
  }

  /**
   * Test connectivity to the server
   * Matches Swift testConnection method signature exactly
   */
  public async testConnection(): Promise<void> {
    const connected = await this.janusClient.testConnection();
    if (!connected) {
      throw new JanusClientError(
        'Connection test failed',
        'CONNECTION_TEST_FAILED'
      );
    }
  }

  /**
   * Send a ping command and return success/failure
   * Convenience method for testing connectivity with a simple ping
   */
  public async ping(): Promise<boolean> {
    try {
      const response = await this.sendCommand('ping', undefined, 10.0);
      return response.success;
    } catch (error) {
      return false;
    }
  }


  // MARK: - Validation Methods

  /**
   * Validate constructor inputs (matching Swift implementation exactly)
   */
  private static validateConstructorInputs(
    socketPath: string,
    channelId: string,
    apiSpec?: APISpecification
  ): void {
    // Validate socket path
    if (!socketPath || socketPath.trim() === '') {
      throw new JanusClientError(
        'Socket path cannot be empty',
        'INVALID_SOCKET_PATH'
      );
    }

    // Security validation for socket path (matching Swift implementation)
    if (socketPath.includes('\0')) {
      throw new JanusClientError(
        'Socket path contains invalid null byte',
        'INVALID_SOCKET_PATH'
      );
    }

    if (socketPath.includes('..')) {
      throw new JanusClientError(
        'Socket path contains path traversal sequence',
        'INVALID_SOCKET_PATH'
      );
    }

    // Validate channel ID
    if (!channelId || channelId.trim() === '') {
      throw new JanusClientError(
        'Channel ID cannot be empty',
        'INVALID_CHANNEL'
      );
    }

    // Security validation for channel ID (matching Swift implementation)
    const forbiddenChars = /[\0;`$|&\n\r\t]/;
    if (forbiddenChars.test(channelId)) {
      throw new JanusClientError(
        'Channel ID contains forbidden characters',
        'INVALID_CHANNEL'
      );
    }

    if (channelId.includes('..') || channelId.startsWith('/')) {
      throw new JanusClientError(
        'Channel ID contains invalid path characters',
        'INVALID_CHANNEL'
      );
    }

    // Validate API spec and channel exists if provided
    if (apiSpec) {
      if (!apiSpec.channels || Object.keys(apiSpec.channels).length === 0) {
        throw new JanusClientError(
          'API specification must contain at least one channel',
          'VALIDATION_ERROR'
        );
      }

      if (!apiSpec.channels[channelId]) {
        throw new JanusClientError(
          `Channel '${channelId}' not found in API specification`,
          'INVALID_CHANNEL'
        );
      }
    }
  }

  /**
   * Validate command against API specification
   * Matches Swift validateCommandAgainstSpec method exactly
   */
  private validateCommandAgainstSpec(spec: APISpecification, command: SocketCommand): void {
    // Check if channel exists
    const channel = spec.channels[command.channelId];
    if (!channel) {
      throw new JanusClientError(
        `Channel ${command.channelId} not found in API specification`,
        'VALIDATION_ERROR'
      );
    }

    // Check if command exists in channel
    if (!channel.commands[command.command]) {
      throw new JanusClientError(
        `Unknown command: ${command.command}`,
        'UNKNOWN_COMMAND'
      );
    }

    // Validate command arguments
    const commandSpec = channel.commands[command.command];
    if (commandSpec && commandSpec.args) {
      const args = command.args || {}; // Use empty object if no args provided

      // Check for required arguments
      for (const [argName, argSpec] of Object.entries(commandSpec.args)) {
        if (argSpec.required && args[argName] === undefined) {
          throw new JanusClientError(
            `Missing required argument: ${argName}`,
            'MISSING_REQUIRED_ARGUMENT'
          );
        }
      }
    }
  }

  // MARK: - Public Properties

  /**
   * Get the channel ID value
   */
  public get channelIdValue(): string {
    return this.channelId;
  }

  /**
   * Get the socket path value
   */
  public get socketPathValue(): string {
    return this.socketPath;
  }

  /**
   * Get the API specification
   */
  public get apiSpecification(): APISpecification | undefined {
    return this.apiSpec;
  }
}