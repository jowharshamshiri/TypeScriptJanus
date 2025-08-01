/**
 * API Specification Parser for TypeScript Janus Implementation
 * Provides JSON and YAML parsing with comprehensive validation
 * Achieves 100% parity with Go/Rust/Swift implementations
 */

import * as fs from 'fs';
import * as path from 'path';
import { parse as parseYAML } from 'yaml';
import { APISpecification, Channel, Command, Argument, Model } from '../types/protocol';

/**
 * Error thrown during API specification parsing or validation
 */
export class APISpecificationError extends Error {
  constructor(message: string, public readonly details?: string) {
    super(message);
    this.name = 'APISpecificationError';
  }
}

/**
 * Parser for API specification documents in JSON and YAML formats
 * Matches Swift APISpecificationParser functionality exactly
 */
export class APISpecificationParser {
  
  constructor() {}

  /**
   * Parse API specification from JSON data buffer
   */
  public parseJSON(data: Buffer): APISpecification {
    try {
      const jsonString = data.toString('utf8');
      return this.parseJSONString(jsonString);
    } catch (error) {
      throw new APISpecificationError(
        'Failed to parse JSON data',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Parse API specification from JSON string
   */
  public parseJSONString(jsonString: string): APISpecification {
    try {
      const parsed = JSON.parse(jsonString);
      return this.validateAndTransform(parsed);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new APISpecificationError(
          'Invalid JSON format',
          error.message
        );
      }
      throw error;
    }
  }

  /**
   * Parse API specification from YAML data buffer
   */
  public parseYAML(data: Buffer): APISpecification {
    try {
      const yamlString = data.toString('utf8');
      return this.parseYAMLString(yamlString);
    } catch (error) {
      throw new APISpecificationError(
        'Failed to parse YAML data',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Parse API specification from YAML string
   */
  public parseYAMLString(yamlString: string): APISpecification {
    try {
      const parsed = parseYAML(yamlString);
      return this.validateAndTransform(parsed);
    } catch (error) {
      throw new APISpecificationError(
        'YAML parsing failed',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Parse API specification from file path
   * Automatically detects JSON/YAML format based on file extension
   */
  public parseFromFile(filePath: string): APISpecification {
    try {
      const data = fs.readFileSync(filePath);
      const fileExtension = path.extname(filePath).toLowerCase();
      
      switch (fileExtension) {
        case '.json':
          return this.parseJSON(data);
        case '.yaml':
        case '.yml':
          return this.parseYAML(data);
        default:
          throw new APISpecificationError(
            `Unsupported file format: ${fileExtension}`,
            'Supported formats: .json, .yaml, .yml'
          );
      }
    } catch (error) {
      if (error instanceof APISpecificationError) {
        throw error;
      }
      throw new APISpecificationError(
        `Failed to read file: ${filePath}`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Validate API specification structure and content
   * Static method matching Swift implementation pattern
   */
  public static validate(spec: APISpecification): void {
    // Validate version format
    if (!spec.version || spec.version.trim() === '') {
      throw new APISpecificationError(
        'API version cannot be empty',
        'Version field is required and must be non-empty string'
      );
    }

    // Validate channels exist
    if (!spec.channels || Object.keys(spec.channels).length === 0) {
      throw new APISpecificationError(
        'API must define at least one channel',
        'Channels object is required and must contain at least one channel definition'
      );
    }

    // Validate each channel
    for (const [channelId, channel] of Object.entries(spec.channels)) {
      this.validateChannel(channelId, channel, spec.models);
    }
  }

  /**
   * Transform and validate parsed data into APISpecification type
   */
  private validateAndTransform(parsed: any): APISpecification {
    // Basic structure validation
    if (!parsed || typeof parsed !== 'object') {
      throw new APISpecificationError(
        'Invalid specification format',
        'Root object is required'
      );
    }

    // Transform to typed structure
    const spec: APISpecification = {
      version: parsed.version,
      name: parsed.name,
      description: parsed.description,
      channels: parsed.channels || {},
      models: parsed.models
    };

    // Validate the transformed specification
    APISpecificationParser.validate(spec);

    return spec;
  }

  /**
   * Validate individual channel structure
   */
  private static validateChannel(channelId: string, channel: Channel, models?: Record<string, Model>): void {
    if (!channelId || channelId.trim() === '') {
      throw new APISpecificationError(
        'Channel ID cannot be empty',
        'Channel identifiers must be non-empty strings'
      );
    }

    if (!channel.commands || Object.keys(channel.commands).length === 0) {
      throw new APISpecificationError(
        `Channel '${channelId}' must define at least one command`,
        'Each channel must contain at least one command definition'
      );
    }

    // Validate each command in the channel
    for (const [commandName, command] of Object.entries(channel.commands)) {
      this.validateCommand(channelId, commandName, command, models);
    }
  }

  /**
   * Validate individual command structure
   */
  private static validateCommand(
    channelId: string, 
    commandName: string, 
    command: Command, 
    models?: Record<string, Model>
  ): void {
    if (!commandName || commandName.trim() === '') {
      throw new APISpecificationError(
        `Command name cannot be empty in channel '${channelId}'`,
        'Command names must be non-empty strings'
      );
    }

    // Check for reserved command names (matching Go/Rust/Swift)
    const reservedCommands = ['ping', 'echo', 'get_info', 'validate', 'slow_process', 'spec'];
    if (reservedCommands.includes(commandName)) {
      throw new APISpecificationError(
        `Command '${commandName}' is reserved and cannot be defined in API specification`,
        `Reserved commands: ${reservedCommands.join(', ')}`
      );
    }

    if (!command.description || command.description.trim() === '') {
      throw new APISpecificationError(
        `Command '${commandName}' in channel '${channelId}' must have a description`,
        'Command descriptions are required for API documentation'
      );
    }

    // Validate command arguments if present
    if (command.args) {
      for (const [argName, arg] of Object.entries(command.args)) {
        this.validateArgument(channelId, commandName, argName, arg, models);
      }
    }

    // Validate response definition if present
    if (command.response) {
      this.validateResponseDefinition(channelId, commandName, command.response, models);
    }
  }

  /**
   * Validate argument definition with type checking and constraints
   */
  private static validateArgument(
    channelId: string,
    commandName: string,
    argName: string,
    arg: Argument,
    models?: Record<string, Model>
  ): void {
    if (!argName || argName.trim() === '') {
      throw new APISpecificationError(
        `Argument name cannot be empty in command '${commandName}' of channel '${channelId}'`,
        'Argument names must be non-empty strings'
      );
    }

    // Validate type field
    const validTypes = ['string', 'number', 'integer', 'boolean', 'array', 'object'];
    if (!validTypes.includes(arg.type)) {
      throw new APISpecificationError(
        `Invalid argument type '${arg.type}' for argument '${argName}' in command '${commandName}' of channel '${channelId}'`,
        `Valid types: ${validTypes.join(', ')}`
      );
    }

    // Validate pattern for string types
    if (arg.type === 'string' && arg.pattern) {
      try {
        new RegExp(arg.pattern);
      } catch (error) {
        throw new APISpecificationError(
          `Invalid regex pattern '${arg.pattern}' for argument '${argName}' in command '${commandName}' of channel '${channelId}'`,
          error instanceof Error ? error.message : 'Regex compilation failed'
        );
      }
    }

    // Validate numeric constraints
    if ((arg.type === 'number' || arg.type === 'integer') && arg.minimum !== undefined && arg.maximum !== undefined) {
      if (arg.minimum > arg.maximum) {
        throw new APISpecificationError(
          `Invalid numeric constraints for argument '${argName}' in command '${commandName}' of channel '${channelId}'`,
          `Minimum value (${arg.minimum}) cannot be greater than maximum value (${arg.maximum})`
        );
      }
    }

    // Validate model references
    if (arg.modelRef && models && !models[arg.modelRef]) {
      throw new APISpecificationError(
        `Model reference '${arg.modelRef}' not found for argument '${argName}' in command '${commandName}' of channel '${channelId}'`,
        'Referenced models must be defined in the models section'
      );
    }

    // Validate array item definitions
    if (arg.type === 'array' && arg.items) {
      this.validateArgument(channelId, commandName, `${argName}[items]`, arg.items, models);
    }

    // Validate object properties
    if (arg.type === 'object' && arg.properties) {
      for (const [propName, prop] of Object.entries(arg.properties)) {
        this.validateArgument(channelId, commandName, `${argName}.${propName}`, prop, models);
      }
    }
  }

  /**
   * Validate response definition structure
   */
  private static validateResponseDefinition(
    channelId: string,
    commandName: string,
    response: any,
    models?: Record<string, Model>
  ): void {
    const validTypes = ['string', 'number', 'integer', 'boolean', 'array', 'object'];
    if (!validTypes.includes(response.type)) {
      throw new APISpecificationError(
        `Invalid response type '${response.type}' for command '${commandName}' in channel '${channelId}'`,
        `Valid types: ${validTypes.join(', ')}`
      );
    }

    // Validate model references
    if (response.modelRef && models && !models[response.modelRef]) {
      throw new APISpecificationError(
        `Model reference '${response.modelRef}' not found for response in command '${commandName}' of channel '${channelId}'`,
        'Referenced models must be defined in the models section'
      );
    }
  }
}