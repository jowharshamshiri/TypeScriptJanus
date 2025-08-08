/**
 * High-level API client for SOCK_DGRAM Unix socket communication
 * TypeScript implementation achieving 100% parity with Swift/Go/Rust implementations
 */

import { v4 as uuidv4 } from 'uuid';
import { JanusClient as CoreJanusClient } from '../core/janus-client';
import { 
  Manifest, 
  JanusRequest, 
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
  
  /** Maximum message size in bytes */
  maxMessageSize?: number;
  
  /** Default timeout for requests in seconds */
  defaultTimeout?: number;
  
  /** Datagram timeout for socket operations in seconds */
  datagramTimeout?: number;
  
  /** Enable request validation against Manifest */
  enableValidation?: boolean;
}

/**
 * Errors manifestific to JanusClient operations
 */
export class JanusClientError extends Error {
  constructor(message: string, public readonly code: string, public readonly details?: string) {
    super(message);
    this.name = 'JanusClientError';
  }
}

/**
 * High-level SOCK_DGRAM client with Manifest integration
 * Provides request validation, response correlation, and security hardening
 */
export class JanusClient {
  private readonly socketPath: string;
  private manifest: Manifest | undefined;
  private readonly janusClient: CoreJanusClient;
  private readonly defaultTimeout: number;
  private readonly enableValidation: boolean;
  
  // Request lifecycle management (automatic ID system)
  private readonly requestRegistry = new Map<string, RequestHandle>();

  private constructor(config: JanusClientConfig, manifest?: Manifest) {
    this.socketPath = config.socketPath;
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
   * Create JanusClient with dynamic manifest fetching (matching Go/Rust/Swift)
   */
  public static async create(config: JanusClientConfig): Promise<JanusClient> {
    // Validate constructor inputs (matching Swift implementation pattern)
    JanusClient.validateConstructorInputs(
      config.socketPath
    );

    // Create client instance - Manifest will be fetched during operations when needed
    const client = new JanusClient(config);

    return client;
  }

  /**
   * Send request via SOCK_DGRAM and wait for response
   * Matches Swift sendRequest method signature exactly
   */
  public async sendRequest(
    request: string,
    args?: Record<string, any>,
    timeout?: number
  ): Promise<JanusResponse> {
    // Generate request ID
    const requestId = uuidv4();

    // Create socket request (reply_to will be handled by underlying client)
    const janusRequest: JanusRequest = {
      id: requestId,
      method: request,
      request,
      timeout: timeout ?? this.defaultTimeout,
      timestamp: new Date().toISOString(),
      ...(args && { args })
    };

    // Ensure Manifest is loaded for validation
    if (this.enableValidation) {
      await this.ensureManifestLoaded();
    }

    // Validate request against Manifest
    if (this.enableValidation && this.manifest) {
      this.validateRequestAgainstManifest(this.manifest, janusRequest);
    }

    // Send datagram and wait for response
    const response = await this.janusClient.sendRequest(janusRequest);

    // Validate response correlation
    if (response.request_id !== requestId) {
      throw new JanusClientError(
        `Response correlation mismatch: expected ${requestId}, got ${response.request_id}`,
        'CORRELATION_MISMATCH'
      );
    }


    return response;
  }

  /**
   * Send request without expecting response (fire-and-forget)
   * Matches Swift sendRequestNoResponse method signature exactly
   */
  public async sendRequestNoResponse(
    request: string,
    args?: Record<string, any>
  ): Promise<void> {
    // Generate request ID
    const requestId = uuidv4();

    // Create socket request (no reply_to field)
    const janusRequest: JanusRequest = {
      id: requestId,
      method: request,
      request,
      timestamp: new Date().toISOString(),
      ...(args && { args })
      // No reply_to field for fire-and-forget
    };

    // Validate request against Manifest
    if (this.enableValidation && this.manifest) {
      this.validateRequestAgainstManifest(this.manifest, janusRequest);
    }

    // Send datagram without waiting for response
    await this.janusClient.sendRequestNoResponse(janusRequest);
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
   * Send a ping request and return success/failure
   * Convenience method for testing connectivity with a simple ping
   */
  public async ping(): Promise<boolean> {
    try {
      const response = await this.sendRequest('ping', undefined, 10.0);
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
    socketPath: string
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

  }

  /**
   * Validate request against Manifest
   * Matches Swift validateRequestAgainstManifest method exactly
   */
  private validateRequestAgainstManifest(manifest: Manifest, request: JanusRequest): void {
    // Built-in requests are always allowed and don't need validation
    if (this.isBuiltinRequest(request.request)) {
      return; // Built-in requests bypass manifest validation
    }

    // Check if request exists in manifest (only for non-builtin requests)
    if (manifest.requests && !manifest.requests[request.request]) {
      throw new JanusClientError(
        `Unknown request: ${request.request}`,
        'UNKNOWN_REQUEST'
      );
    }

    // Validate request arguments
    const requestManifest = manifest.requests?.[request.request];
    if (requestManifest && requestManifest.args) {
      const args = request.args || {}; // Use empty object if no args provided

      // Check for required arguments
      for (const [argName, argManifest] of Object.entries(requestManifest.args)) {
        if (argManifest.required && args[argName] === undefined) {
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

  // MARK: - Built-in Request Support

  /**
   * Check if request is a built-in request that should bypass API validation
   */
  private isBuiltinRequest(request: string): boolean {
    const builtinRequests = ['ping', 'echo', 'get_info', 'validate', 'slow_process', 'manifest'];
    return builtinRequests.includes(request);
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
      // Fetch Manifest from server using manifest request
      const manifestResponse = await this.sendBuiltinRequest('manifest', undefined, 10.0);
      
      if (manifestResponse.success && manifestResponse.result) {
        // Parse the manifest from the response
        const { ManifestParser } = await import('../manifest/manifest-parser');
        const parser = new ManifestParser();
        const jsonString = JSON.stringify(manifestResponse.result);
        const fetchedManifest = parser.parseJSONString(jsonString);
        this.manifest = fetchedManifest;
        
        // Manifest fetched successfully - no channel validation needed
      } else {
        // If manifest request fails, continue without validation
        this.manifest = undefined;
      }
    } catch (error) {
      // If manifest fetching fails, continue without validation
      console.warn(`Failed to fetch Manifest: ${error instanceof Error ? error.message : error}`);
      this.manifest = undefined;
    }
  }

  /**
   * Send built-in request (used for manifest fetching during operations)
   */
  private async sendBuiltinRequest(
    request: string,
    args?: Record<string, any>,
    timeout?: number
  ): Promise<JanusResponse> {
    // Generate request ID
    const requestId = uuidv4();

    // Create socket request for built-in request
    const janusRequest: JanusRequest = {
      id: requestId,
      method: request,
      request,
      timeout: timeout ?? 10.0,
      timestamp: new Date().toISOString(),
      ...(args && { args })
    };

    // Send datagram and wait for response (no validation for built-in requests)
    const response = await this.janusClient.sendRequest(janusRequest);

    // Validate response correlation
    if (response.request_id !== requestId) {
      throw new JanusClientError(
        `Response correlation mismatch: expected ${requestId}, got ${response.request_id}`,
        'CORRELATION_MISMATCH'
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
    lastActivity?: number;
  }> {
    try {
      // Test connectivity by sending a ping request
      await this.ping();
      return {
        connected: true,
        socketPath: this.socketPath,
        lastActivity: Date.now()
      };
    } catch (error) {
      return {
        connected: false,
        socketPath: this.socketPath
      };
    }
  }

  /**
   * Register request handler validation (SOCK_DGRAM compatibility)
   * Validates request exists in manifest without actual handler registration
   */
  async registerRequestHandler(request: string, _handler: Function): Promise<void> {
    // Ensure Manifest is loaded
    await this.ensureManifestLoaded();

    // Validate request exists in the Manifest
    if (this.manifest) {
      if (this.manifest.requests && !this.manifest.requests[request]) {
        throw new JanusClientError(
          `Request '${request}' not found in manifest`,
          'REQUEST_NOT_FOUND'
        );
      }
    }

    // SOCK_DGRAM doesn't actually register handlers, but validation passed
    // Handler parameter is accepted for backward compatibility but not used
  }

  // Automatic ID Management Methods (F0193-F0216)

  /**
   * Send request with handle - returns RequestHandle for tracking
   * Hides UUID complexity from users while providing request lifecycle management
   */
  public async sendRequestWithHandle(
    request: string,
    args?: Record<string, any>,
    timeout?: number
  ): Promise<{ handle: RequestHandle; responsePromise: Promise<JanusResponse> }> {
    // Generate internal UUID (hidden from user)
    const requestId = uuidv4();
    
    // Create request handle for user
    const handle = new RequestHandle(requestId, request);
    
    // Register the request handle
    this.requestRegistry.set(requestId, handle);
    
    // Create promise for response
    const responsePromise = (async () => {
      try {
        const response = await this.sendRequest(request, args, timeout);
        return response;
      } finally {
        // Clean up request handle when done
        this.requestRegistry.delete(requestId);
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