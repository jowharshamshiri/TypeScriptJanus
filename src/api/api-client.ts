/**
 * High-level API Client for Janus Protocol
 * Provides convenient interface for Manifest based communication
 */

import { JanusClient } from '../protocol/janus-client';
import { Manifest } from '../types/protocol';

export class APIClientError extends Error {
  constructor(message: string, public code: string, public details?: string) {
    super(message);
    this.name = 'APIClientError';
  }
}

export interface APIClientConfig {
  /** Unix socket path for communication */
  socketPath: string;
  
  /** Maximum message size in bytes */
  maxMessageSize?: number;
  
  /** Default timeout for requests in seconds */
  defaultTimeout?: number;
  
  /** Manifest for validation and documentation */
  manifest?: Manifest;
  
  /** Whether to validate requests against Manifest */
  validateAgainstManifest?: boolean;
}

export class APIClient {
  private client: JanusClient | undefined;
  private config: APIClientConfig;
  private manifest: Manifest | undefined;

  constructor(config: APIClientConfig) {
    this.config = config;
    this.manifest = config.manifest;
    
    // Create underlying protocol client
    const clientConfig: any = {
      socketPath: config.socketPath
    };
    
    if (config.maxMessageSize !== undefined) clientConfig.maxMessageSize = config.maxMessageSize;
    if (config.defaultTimeout !== undefined) clientConfig.defaultTimeout = config.defaultTimeout;
    if (config.validateAgainstManifest !== undefined) clientConfig.enableValidation = config.validateAgainstManifest;
    
    // Initialize client synchronously - will be created lazily
    this.initializeClient(clientConfig);
  }
  
  private async initializeClient(config: any): Promise<void> {
    this.client = await JanusClient.create(config);
  }
  
  private async ensureClient(): Promise<JanusClient> {
    if (!this.client) {
      const clientConfig: any = {
        socketPath: this.config.socketPath
      };
      
      if (this.config.maxMessageSize !== undefined) clientConfig.maxMessageSize = this.config.maxMessageSize;
      if (this.config.defaultTimeout !== undefined) clientConfig.defaultTimeout = this.config.defaultTimeout;
      if (this.config.validateAgainstManifest !== undefined) clientConfig.enableValidation = this.config.validateAgainstManifest;
      
      this.client = await JanusClient.create(clientConfig);
    }
    return this.client;
  }

  /**
   * Test connectivity to the API server
   */
  async testConnection(): Promise<boolean> {
    try {
      const client = await this.ensureClient();
      await client.testConnection();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Execute a request
   */
  async executeRequest(
    requestName: string,
    args?: Record<string, any>,
    timeout?: number
  ): Promise<any> {
    // Validate against Manifest if configured
    if (this.config.validateAgainstManifest && this.manifest) {
      this.validateRequestAgainstManifest(requestName, args);
    }

    try {
      const client = await this.ensureClient();
      const response = await client.sendRequest(requestName, args, timeout);
      
      if (!response.success) {
        throw new APIClientError(
          response.error?.message ?? 'Request failed',
          response.error?.code?.toString() ?? 'REQUEST_FAILED',
          response.error?.data?.details
        );
      }
      
      return response.result;
    } catch (error) {
      if (error instanceof APIClientError) {
        throw error; // Re-throw API errors as-is
      }
      throw new APIClientError(
        error instanceof Error ? error.message : String(error),
        'REQUEST_EXECUTION_FAILED',
        error instanceof Error ? error.stack : undefined
      );
    }
  }

  /**
   * Execute multiple requests in parallel
   */
  async executeRequests(requests: Array<{
    requestName: string;
    args?: Record<string, any>;
    timeout?: number;
  }>): Promise<any[]> {
    const promises = requests.map(cmd => 
      this.executeRequest(cmd.requestName, cmd.args, cmd.timeout)
    );
    
    return Promise.all(promises);
  }

  /**
   * Set or update the Manifest
   */
  setManifest(manifest: Manifest): void {
    this.manifest = manifest;
  }

  /**
   * Get the current Manifest
   */
  getManifest(): Manifest | undefined {
    return this.manifest;
  }

  /**
   * Get available requests
   */
  getAvailableRequests(): string[] {
    if (!this.manifest) {
      return [];
    }
    
    return Object.keys(this.manifest.requests || {});
  }


  /**
   * Get request information
   */
  getRequestInfo(requestName: string) {
    if (!this.manifest || !this.manifest.requests || !this.manifest.requests[requestName]) {
      return null;
    }
    
    return this.manifest.requests[requestName];
  }

  /**
   * Validate request arguments against Manifest
   */
  validateRequestArgs(requestName: string, args: Record<string, any> = {}): {
    valid: boolean;
    errors: string[];
  } {
    if (!this.manifest) {
      return { valid: true, errors: [] };
    }

    const request = this.manifest.requests?.[requestName];
    if (!request) {
      return { valid: false, errors: [`Request ${requestName} not found in Manifest`] };
    }

    const errors: string[] = [];
    
    // Check required arguments
    if (request.args) {
      for (const [argName, argManifest] of Object.entries(request.args)) {
        if (argManifest.required && !(argName in args)) {
          errors.push(`Required argument '${argName}' is missing`);
        }
        
        if (argName in args) {
          const validation = this.validateArgument(args[argName], argManifest, argName);
          if (!validation.valid) {
            errors.push(...validation.errors);
          }
        }
      }
    }
    
    // Check for unexpected arguments
    const expectedArgs = new Set(Object.keys(request.args ?? {}));
    for (const argName of Object.keys(args)) {
      if (!expectedArgs.has(argName)) {
        errors.push(`Unexpected argument '${argName}'`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Test if server is reachable (SOCK_DGRAM has no persistent connection)
   */
  async isReachable(): Promise<boolean> {
    return await this.testConnection();
  }



  /**
   * Validate request against Manifest
   */
  private validateRequestAgainstManifest(requestName: string, args?: Record<string, any>): void {
    if (!this.manifest) {
      throw new APIClientError(
        'No Manifest available for validation',
        'NO_MANIFEST',
        'Set an Manifest to enable validation'
      );
    }

    const validation = this.validateRequestArgs(requestName, args ?? {});
    if (!validation.valid) {
      throw new APIClientError(
        'Request validation failed',
        'VALIDATION_FAILED',
        validation.errors.join('; ')
      );
    }
  }

  /**
   * Validate a single argument
   */
  private validateArgument(value: any, manifest: any, argName: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Type validation
    if (manifest.type) {
      const valid = this.validateArgumentType(value, manifest.type);
      if (!valid) {
        errors.push(`Argument '${argName}' must be of type ${manifest.type}`);
      }
    }
    
    // String validations
    if (manifest.type === 'string' && typeof value === 'string') {
      if (manifest.minLength !== undefined && value.length < manifest.minLength) {
        errors.push(`Argument '${argName}' must be at least ${manifest.minLength} characters`);
      }
      if (manifest.maxLength !== undefined && value.length > manifest.maxLength) {
        errors.push(`Argument '${argName}' must be at most ${manifest.maxLength} characters`);
      }
      if (manifest.pattern && !new RegExp(manifest.pattern).test(value)) {
        errors.push(`Argument '${argName}' does not match required pattern`);
      }
    }
    
    // Numeric validations
    if ((manifest.type === 'number' || manifest.type === 'integer') && typeof value === 'number') {
      if (manifest.minimum !== undefined && value < manifest.minimum) {
        errors.push(`Argument '${argName}' must be at least ${manifest.minimum}`);
      }
      if (manifest.maximum !== undefined && value > manifest.maximum) {
        errors.push(`Argument '${argName}' must be at most ${manifest.maximum}`);
      }
    }
    
    // Enum validation
    if (manifest.enum && !manifest.enum.includes(value)) {
      errors.push(`Argument '${argName}' must be one of: ${manifest.enum.join(', ')}`);
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate argument type
   */
  private validateArgumentType(value: any, expectedType: string): boolean {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number';
      case 'integer':
        return typeof value === 'number' && Number.isInteger(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      default:
        return true; // Unknown type, assume valid
    }
  }

}

