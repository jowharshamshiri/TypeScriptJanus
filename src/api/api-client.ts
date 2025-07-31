/**
 * High-level API Client for Janus Protocol
 * Provides convenient interface for API specification based communication
 */

import { JanusClient } from '../core/janus-client';
import { APISpecification, ConnectionConfig, SocketCommand } from '../types/protocol';

export class APIClientError extends Error {
  constructor(message: string, public code: string, public details?: string) {
    super(message);
    this.name = 'APIClientError';
  }
}

export interface APIClientConfig extends ConnectionConfig {
  /** API specification for validation and documentation */
  apiSpec?: APISpecification;
  
  /** Whether to validate commands against API specification */
  validateAgainstSpec?: boolean;
  
  /** Whether to auto-reconnect on connection loss */
  autoReconnect?: boolean;
}

export class APIClient {
  private client: JanusClient;
  private config: APIClientConfig;
  private apiSpec: APISpecification | undefined;

  constructor(config: APIClientConfig) {
    this.config = config;
    this.apiSpec = config.apiSpec;
    
    // Create underlying datagram client
    const clientConfig: ConnectionConfig = {
      socketPath: config.socketPath
    };
    
    if (config.defaultTimeout !== undefined) clientConfig.defaultTimeout = config.defaultTimeout;
    if (config.maxMessageSize !== undefined) clientConfig.maxMessageSize = config.maxMessageSize;
    if (config.connectionTimeout !== undefined) clientConfig.connectionTimeout = config.connectionTimeout;
    if (config.maxPendingCommands !== undefined) clientConfig.maxPendingCommands = config.maxPendingCommands;
    
    this.client = new JanusClient(clientConfig);

    // Setup event forwarding
    this.setupEventForwarding();
  }

  /**
   * Test connectivity to the API server
   */
  async testConnection(): Promise<boolean> {
    try {
      return await this.client.testConnection();
    } catch (error) {
      return false;
    }
  }

  /**
   * Execute a command on the specified channel
   */
  async executeCommand(
    channelId: string,
    commandName: string,
    args?: Record<string, any>,
    timeout?: number
  ): Promise<any> {
    // Validate against API specification if configured
    if (this.config.validateAgainstSpec && this.apiSpec) {
      this.validateCommandAgainstSpec(channelId, commandName, args);
    }

    try {
      const command: Omit<SocketCommand, 'reply_to'> = {
        id: this.generateCommandId(),
        channelId,
        command: commandName,
        ...(args && { args }),
        ...(timeout && { timeout }),
        timestamp: Date.now() / 1000
      };
      
      const response = await this.client.sendCommand(command);
      
      if (!response.success) {
        throw new APIClientError(
          response.error?.message ?? 'Command failed',
          response.error?.code ?? 'COMMAND_FAILED',
          response.error?.details
        );
      }
      
      return response.result;
    } catch (error) {
      if (error instanceof APIClientError) {
        throw error; // Re-throw API errors as-is
      }
      throw new APIClientError(
        error instanceof Error ? error.message : String(error),
        'COMMAND_EXECUTION_FAILED',
        error instanceof Error ? error.stack : undefined
      );
    }
  }

  /**
   * Execute multiple commands in parallel
   */
  async executeCommands(commands: Array<{
    channelId: string;
    commandName: string;
    args?: Record<string, any>;
    timeout?: number;
  }>): Promise<any[]> {
    const promises = commands.map(cmd => 
      this.executeCommand(cmd.channelId, cmd.commandName, cmd.args, cmd.timeout)
    );
    
    return Promise.all(promises);
  }

  /**
   * Set or update the API specification
   */
  setAPISpecification(apiSpec: APISpecification): void {
    this.apiSpec = apiSpec;
  }

  /**
   * Get the current API specification
   */
  getAPISpecification(): APISpecification | undefined {
    return this.apiSpec;
  }

  /**
   * Get available channels
   */
  getAvailableChannels(): string[] {
    if (!this.apiSpec) {
      return [];
    }
    
    return Object.keys(this.apiSpec.channels);
  }

  /**
   * Get available commands for a channel
   */
  getAvailableCommands(channelId: string): string[] {
    if (!this.apiSpec || !this.apiSpec.channels[channelId]) {
      return [];
    }
    
    return Object.keys(this.apiSpec.channels[channelId].commands);
  }

  /**
   * Get command information
   */
  getCommandInfo(channelId: string, commandName: string) {
    if (!this.apiSpec || !this.apiSpec.channels[channelId] || 
        !this.apiSpec.channels[channelId].commands[commandName]) {
      return null;
    }
    
    return this.apiSpec.channels[channelId].commands[commandName];
  }

  /**
   * Validate command arguments against API specification
   */
  validateCommandArgs(channelId: string, commandName: string, args: Record<string, any> = {}): {
    valid: boolean;
    errors: string[];
  } {
    if (!this.apiSpec) {
      return { valid: true, errors: [] };
    }

    const command = this.apiSpec.channels[channelId]?.commands[commandName];
    if (!command) {
      return { valid: false, errors: [`Command ${channelId}.${commandName} not found in API specification`] };
    }

    const errors: string[] = [];
    
    // Check required arguments
    if (command.args) {
      for (const [argName, argSpec] of Object.entries(command.args)) {
        if (argSpec.required && !(argName in args)) {
          errors.push(`Required argument '${argName}' is missing`);
        }
        
        if (argName in args) {
          const validation = this.validateArgument(args[argName], argSpec, argName);
          if (!validation.valid) {
            errors.push(...validation.errors);
          }
        }
      }
    }
    
    // Check for unexpected arguments
    const expectedArgs = new Set(Object.keys(command.args ?? {}));
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
    return this.testConnection();
  }

  /**
   * Create a channel-specific client proxy
   */
  channel(channelId: string): ChannelProxy {
    return new ChannelProxy(this, channelId);
  }

  /**
   * Generate unique command ID
   */
  private generateCommandId(): string {
    return require('crypto').randomUUID();
  }

  /**
   * Validate command against API specification
   */
  private validateCommandAgainstSpec(channelId: string, commandName: string, args?: Record<string, any>): void {
    if (!this.apiSpec) {
      throw new APIClientError(
        'No API specification available for validation',
        'NO_API_SPEC',
        'Set an API specification to enable validation'
      );
    }

    const validation = this.validateCommandArgs(channelId, commandName, args ?? {});
    if (!validation.valid) {
      throw new APIClientError(
        'Command validation failed',
        'VALIDATION_FAILED',
        validation.errors.join('; ')
      );
    }
  }

  /**
   * Validate a single argument
   */
  private validateArgument(value: any, spec: any, argName: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Type validation
    if (spec.type) {
      const valid = this.validateArgumentType(value, spec.type);
      if (!valid) {
        errors.push(`Argument '${argName}' must be of type ${spec.type}`);
      }
    }
    
    // String validations
    if (spec.type === 'string' && typeof value === 'string') {
      if (spec.minLength !== undefined && value.length < spec.minLength) {
        errors.push(`Argument '${argName}' must be at least ${spec.minLength} characters`);
      }
      if (spec.maxLength !== undefined && value.length > spec.maxLength) {
        errors.push(`Argument '${argName}' must be at most ${spec.maxLength} characters`);
      }
      if (spec.pattern && !new RegExp(spec.pattern).test(value)) {
        errors.push(`Argument '${argName}' does not match required pattern`);
      }
    }
    
    // Numeric validations
    if ((spec.type === 'number' || spec.type === 'integer') && typeof value === 'number') {
      if (spec.minimum !== undefined && value < spec.minimum) {
        errors.push(`Argument '${argName}' must be at least ${spec.minimum}`);
      }
      if (spec.maximum !== undefined && value > spec.maximum) {
        errors.push(`Argument '${argName}' must be at most ${spec.maximum}`);
      }
    }
    
    // Enum validation
    if (spec.enum && !spec.enum.includes(value)) {
      errors.push(`Argument '${argName}' must be one of: ${spec.enum.join(', ')}`);
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

  /**
   * Setup event forwarding from underlying client
   */
  private setupEventForwarding(): void {
    this.client.on('connected', () => {
      // Could emit API-specific connected event
    });

    this.client.on('disconnected', () => {
      // Could emit API-specific disconnected event
    });

    this.client.on('error', () => {
      // Could emit API-specific error event
    });
  }
}

/**
 * Channel-specific proxy for easier command execution
 */
class ChannelProxy {
  constructor(private client: APIClient, private channelId: string) {}

  /**
   * Execute a command on this channel
   */
  async execute(commandName: string, args?: Record<string, any>, timeout?: number): Promise<any> {
    return this.client.executeCommand(this.channelId, commandName, args, timeout);
  }

  /**
   * Get available commands for this channel
   */
  getAvailableCommands(): string[] {
    return this.client.getAvailableCommands(this.channelId);
  }

  /**
   * Get command information
   */
  getCommandInfo(commandName: string) {
    return this.client.getCommandInfo(this.channelId, commandName);
  }

  /**
   * Validate command arguments
   */
  validateArgs(commandName: string, args: Record<string, any> = {}) {
    return this.client.validateCommandArgs(this.channelId, commandName, args);
  }
}