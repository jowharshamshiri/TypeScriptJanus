/**
 * High-level API client for SOCK_DGRAM Unix socket communication
 * TypeScript implementation achieving 100% parity with Swift/Go/Rust implementations
 */

import { v4 as uuidv4 } from 'uuid';
import { JanusClient as CoreJanusClient } from '../core/janus-client';
import { 
  Manifest, 
  JanusCommand, 
  JanusResponse,
  RequestHandle,
  RequestStatus
} from '../types/protocol';

/**
 * Configuration for JanusClient
 */
export interface JanusClientConfig {
  /** Unix socket path for communication */
  socketPath: string;
  
  /** Channel ID for routing messages */
  channelId: string;
  
  /** Maximum message size in bytes */
  maxMessageSize?: number;
  
  /** Default timeout for commands in seconds */
  defaultTimeout?: number;
  
  /** Datagram timeout for socket operations in seconds */
  datagramTimeout?: number;
  
  /** Enable command validation against Manifest */
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
 * High-level SOCK_DGRAM client with Manifest integration
 * Provides command validation, response correlation, and security hardening
 */
export class JanusClient {
  private readonly socketPath: string;
  private readonly channelId: string;
  private manifest: Manifest | undefined;
  private readonly janusClient: CoreJanusClient;
  private readonly defaultTimeout: number;
  private readonly enableValidation: boolean;
  
  // Request lifecycle management (automatic ID system)
  private readonly requestRegistry = new Map<string, RequestHandle>();

  private constructor(config: JanusClientConfig, manifest?: Manifest) {
    this.socketPath = config.socketPath;
    this.channelId = config.channelId;
    this.manifest = manifest;
    this.defaultTimeout = config.defaultTimeout ?? 30.0;
    this.enableValidation = config.enableValidation ?? true;

    // Create underlying datagram client
    this.janusClient = new CoreJanusClient({
      socketPath: config.socketPath,
      maxMessageSize: config.maxMessageSize ?? 65536,
      defaultTimeout: config.datagramTimeout ?? 5.0
    });
  }

  /**
   * Create JanusClient with dynamic specification fetching (matching Go/Rust/Swift)
   */
  public static async create(config: JanusClientConfig): Promise<JanusClient> {
    // Validate constructor inputs (matching Swift implementation pattern)
    JanusClient.validateConstructorInputs(
      config.socketPath,
      config.channelId
    );

    // Create client instance - Manifest will be fetched during operations when needed
    const client = new JanusClient(config);

    return client;
  }

  /**
   * Send command via SOCK_DGRAM and wait for response
   * Matches Swift sendCommand method signature exactly
   */
  public async sendCommand(
    command: string,
    args?: Record<string, any>,
    timeout?: number
  ): Promise<JanusResponse> {
    // Generate command ID
    const commandId = uuidv4();

    // Create socket command (reply_to will be handled by underlying client)
    const janusCommand: JanusCommand = {
      id: commandId,
      channelId: this.channelId,
      command,
      timeout: timeout ?? this.defaultTimeout,
      timestamp: Date.now(),
      ...(args && { args })
    };

    // Ensure Manifest is loaded for validation
    if (this.enableValidation) {
      await this.ensureManifestLoaded();
    }

    // Validate command against Manifest
    if (this.enableValidation && this.manifest) {
      this.validateCommandAgainstSpec(this.manifest, janusCommand);
    }

    // Send datagram and wait for response
    const response = await this.janusClient.sendCommand(janusCommand);

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
    const janusCommand: JanusCommand = {
      id: commandId,
      channelId: this.channelId,
      command,
      timestamp: Date.now(),
      ...(args && { args })
      // No reply_to field for fire-and-forget
    };

    // Validate command against Manifest
    if (this.enableValidation && this.manifest) {
      this.validateCommandAgainstSpec(this.manifest, janusCommand);
    }

    // Send datagram without waiting for response
    await this.janusClient.sendCommandNoResponse(janusCommand);
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
    channelId: string
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
  }

  /**
   * Validate command against Manifest
   * Matches Swift validateCommandAgainstSpec method exactly
   */
  private validateCommandAgainstSpec(spec: Manifest, command: JanusCommand): void {
    // Check if command is reserved (built-in commands should never be in Manifests)
    if (this.isBuiltinCommand(command.command)) {
      throw new JanusClientError(
        `Command '${command.command}' is reserved and cannot be used from Manifest`,
        'RESERVED_COMMAND_ERROR'
      );
    }

    // Check if channel exists
    const channel = spec.channels[command.channelId];
    if (!channel) {
      throw new JanusClientError(
        `Channel ${command.channelId} not found in Manifest`,
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
   * Get the loaded Manifest
   */
  public getManifest(): Manifest | undefined {
    return this.manifest;
  }

  // MARK: - Built-in Command Support

  /**
   * Check if command is a built-in command that should bypass API validation
   */
  private isBuiltinCommand(command: string): boolean {
    const builtinCommands = ['ping', 'echo', 'get_info', 'validate', 'slow_process', 'spec'];
    return builtinCommands.includes(command);
  }

  /**
   * Ensure Manifest is loaded, fetching from server if needed
   */
  private async ensureManifestLoaded(): Promise<void> {
    if (this.manifest !== undefined) {
      return; // Already loaded
    }

    if (!this.enableValidation) {
      return; // Validation disabled, no need to fetch
    }

    try {
      // Fetch Manifest from server using spec command
      const specResponse = await this.sendBuiltinCommand('spec', undefined, 10.0);
      
      if (specResponse.success && specResponse.result) {
        // Parse the specification from the response
        const { ManifestParser } = await import('../specification/manifest-parser');
        const parser = new ManifestParser();
        const jsonString = JSON.stringify(specResponse.result);
        const fetchedSpec = parser.parseJSONString(jsonString);
        this.manifest = fetchedSpec;
        
        // Validate channel exists in fetched specification
        if (!fetchedSpec.channels || !fetchedSpec.channels[this.channelId]) {
          throw new Error(`Channel '${this.channelId}' not found in server specification`);
        }
      } else {
        // If spec command fails, continue without validation
        this.manifest = undefined;
      }
    } catch (error) {
      // If spec fetching fails, continue without validation
      console.warn(`Failed to fetch Manifest: ${error instanceof Error ? error.message : error}`);
      this.manifest = undefined;
    }
  }

  /**
   * Send built-in command (used for spec fetching during operations)
   */
  private async sendBuiltinCommand(
    command: string,
    args?: Record<string, any>,
    timeout?: number
  ): Promise<JanusResponse> {
    // Generate command ID
    const commandId = uuidv4();

    // Create socket command for built-in command
    const janusCommand: JanusCommand = {
      id: commandId,
      channelId: this.channelId,
      command,
      timeout: timeout ?? 10.0,
      timestamp: Date.now(),
      ...(args && { args })
    };

    // Send datagram and wait for response (no validation for built-in commands)
    const response = await this.janusClient.sendCommand(janusCommand);

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

  // MARK: - Legacy Method Support (for SOCK_DGRAM backward compatibility)

  /**
   * Returns the socket path for backward compatibility
   */
  socketPathString(): string {
    return this.socketPath;
  }

  /**
   * No-op for backward compatibility (SOCK_DGRAM doesn't have persistent connections)
   */
  async disconnect(): Promise<void> {
    // SOCK_DGRAM doesn't have persistent connections - this is for backward compatibility only
    return Promise.resolve();
  }

  /**
   * Always returns true for backward compatibility (SOCK_DGRAM doesn't track connections)
   */
  isConnected(): boolean {
    // SOCK_DGRAM doesn't track connections - return true for backward compatibility
    return true;
  }

  // MARK: - Connection State Simulation (for SOCK_DGRAM compatibility)

  /**
   * Simulate connection state for SOCK_DGRAM compatibility
   * Returns basic connectivity status without actual persistent connection
   */
  async getConnectionState(): Promise<{
    connected: boolean;
    socketPath: string;
    channelId: string;
    lastActivity?: number;
  }> {
    try {
      // Test connectivity by sending a ping command
      await this.ping();
      return {
        connected: true,
        socketPath: this.socketPath,
        channelId: this.channelId,
        lastActivity: Date.now()
      };
    } catch (error) {
      return {
        connected: false,
        socketPath: this.socketPath,
        channelId: this.channelId
      };
    }
  }

  /**
   * Register command handler validation (SOCK_DGRAM compatibility)
   * Validates command exists in specification without actual handler registration
   */
  async registerCommandHandler(command: string, _handler: Function): Promise<void> {
    // Ensure Manifest is loaded
    await this.ensureManifestLoaded();

    // Validate command exists in the Manifest for the client's channel
    if (this.manifest) {
      const channel = this.manifest.channels?.[this.channelId];
      if (channel && !channel.commands?.[command]) {
        throw new JanusClientError(
          `Command '${command}' not found in channel '${this.channelId}'`,
          'COMMAND_NOT_FOUND'
        );
      }
    }

    // SOCK_DGRAM doesn't actually register handlers, but validation passed
    // Handler parameter is accepted for backward compatibility but not used
  }

  // Automatic ID Management Methods (F0193-F0216)

  /**
   * Send command with handle - returns RequestHandle for tracking
   * Hides UUID complexity from users while providing request lifecycle management
   */
  public async sendCommandWithHandle(
    command: string,
    args?: Record<string, any>,
    timeout?: number
  ): Promise<{ handle: RequestHandle; responsePromise: Promise<JanusResponse> }> {
    // Generate internal UUID (hidden from user)
    const commandId = uuidv4();
    
    // Create request handle for user
    const handle = new RequestHandle(commandId, command, this.channelId);
    
    // Register the request handle
    this.requestRegistry.set(commandId, handle);
    
    // Create promise for response
    const responsePromise = (async () => {
      try {
        const response = await this.sendCommand(command, args, timeout);
        return response;
      } finally {
        // Clean up request handle when done
        this.requestRegistry.delete(commandId);
      }
    })();
    
    return { handle, responsePromise };
  }

  /**
   * Get request status by handle
   */
  public getRequestStatus(handle: RequestHandle): RequestStatus {
    if (handle.isCancelled()) {
      return RequestStatus.Cancelled;
    }
    
    if (this.requestRegistry.has(handle.getInternalID())) {
      return RequestStatus.Pending;
    }
    
    return RequestStatus.Completed;
  }

  /**
   * Cancel request using handle
   */
  public cancelRequest(handle: RequestHandle): void {
    if (handle.isCancelled()) {
      throw new JanusClientError('Request already cancelled', 'ALREADY_CANCELLED');
    }
    
    if (!this.requestRegistry.has(handle.getInternalID())) {
      throw new JanusClientError('Request not found or already completed', 'REQUEST_NOT_FOUND');
    }
    
    handle.markCancelled();
    this.requestRegistry.delete(handle.getInternalID());
  }

  /**
   * Get all pending request handles
   */
  public getPendingRequests(): RequestHandle[] {
    return Array.from(this.requestRegistry.values());
  }

  /**
   * Cancel all pending requests
   */
  public cancelAllRequests(): number {
    const count = this.requestRegistry.size;
    
    for (const handle of this.requestRegistry.values()) {
      handle.markCancelled();
    }
    
    this.requestRegistry.clear();
    return count;
  }
}