/**
 * Manifest Parser for TypeScript Janus Implementation
 * Provides JSON and YAML parsing with comprehensive validation
 * Achieves 100% parity with Go/Rust/Swift implementations
 */

import * as fs from 'fs';
import * as path from 'path';
import { parse as parseYAML } from 'yaml';
import { Manifest, Channel, Command, Argument, Model } from '../types/protocol';

/**
 * Error thrown during Manifest parsing or validation
 */
export class ManifestError extends Error {
  constructor(message: string, public readonly details?: string) {
    super(message);
    this.name = 'ManifestError';
  }
}

/**
 * Parser for Manifest documents in JSON and YAML formats
 * Matches Swift ManifestParser functionality exactly
 */
export class ManifestParser {
  
  constructor() {}

  /**
   * Parse Manifest from JSON data buffer
   */
  public parseJSON(data: Buffer): Manifest {
    try {
      const jsonString = data.toString('utf8');
      return this.parseJSONString(jsonString);
    } catch (error) {
      throw new ManifestError(
        'Failed to parse JSON data',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Parse Manifest from JSON string
   */
  public parseJSONString(jsonString: string): Manifest {
    try {
      const parsed = JSON.parse(jsonString);
      return this.validateAndTransform(parsed);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new ManifestError(
          'Invalid JSON format',
          error.message
        );
      }
      throw error;
    }
  }

  /**
   * Parse Manifest from YAML data buffer
   */
  public parseYAML(data: Buffer): Manifest {
    try {
      const yamlString = data.toString('utf8');
      return this.parseYAMLString(yamlString);
    } catch (error) {
      throw new ManifestError(
        'Failed to parse YAML data',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Parse Manifest from YAML string
   */
  public parseYAMLString(yamlString: string): Manifest {
    try {
      const parsed = parseYAML(yamlString);
      return this.validateAndTransform(parsed);
    } catch (error) {
      throw new ManifestError(
        'YAML parsing failed',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Parse Manifest from file path
   * Automatically detects JSON/YAML format based on file extension
   */
  public parseFromFile(filePath: string): Manifest {
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
          throw new ManifestError(
            `Unsupported file format: ${fileExtension}`,
            'Supported formats: .json, .yaml, .yml'
          );
      }
    } catch (error) {
      if (error instanceof ManifestError) {
        throw error;
      }
      throw new ManifestError(
        `Failed to read file: ${filePath}`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Validate Manifest structure and content
   * Static method matching Swift implementation pattern
   */
  public static validate(spec: Manifest): void {
    // Validate version format
    if (!spec.version || spec.version.trim() === '') {
      throw new ManifestError(
        'API version cannot be empty',
        'Version field is required and must be non-empty string'
      );
    }

    // Validate channels exist
    if (!spec.channels || Object.keys(spec.channels).length === 0) {
      throw new ManifestError(
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
   * Transform and validate parsed data into Manifest type
   */
  private validateAndTransform(parsed: any): Manifest {
    // Basic structure validation
    if (!parsed || typeof parsed !== 'object') {
      throw new ManifestError(
        'Invalid specification format',
        'Root object is required'
      );
    }

    // Transform to typed structure
    const spec: Manifest = {
      version: parsed.version,
      name: parsed.name,
      description: parsed.description,
      channels: parsed.channels || {},
      models: parsed.models
    };

    // Validate the transformed specification
    ManifestParser.validate(spec);

    return spec;
  }

  /**
   * Validate individual channel structure
   */
  private static validateChannel(channelId: string, channel: Channel, models?: Record<string, Model>): void {
    if (!channelId || channelId.trim() === '') {
      throw new ManifestError(
        'Channel ID cannot be empty',
        'Channel identifiers must be non-empty strings'
      );
    }

    if (!channel.commands || Object.keys(channel.commands).length === 0) {
      throw new ManifestError(
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
      throw new ManifestError(
        `Command name cannot be empty in channel '${channelId}'`,
        'Command names must be non-empty strings'
      );
    }

    // Check for reserved command names (matching Go/Rust/Swift)
    const reservedCommands = ['ping', 'echo', 'get_info', 'validate', 'slow_process', 'spec'];
    if (reservedCommands.includes(commandName)) {
      throw new ManifestError(
        `Command '${commandName}' is reserved and cannot be defined in Manifest`,
        `Reserved commands: ${reservedCommands.join(', ')}`
      );
    }

    if (!command.description || command.description.trim() === '') {
      throw new ManifestError(
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
      throw new ManifestError(
        `Argument name cannot be empty in command '${commandName}' of channel '${channelId}'`,
        'Argument names must be non-empty strings'
      );
    }

    // Validate type field
    const validTypes = ['string', 'number', 'integer', 'boolean', 'array', 'object'];
    if (!validTypes.includes(arg.type)) {
      throw new ManifestError(
        `Invalid argument type '${arg.type}' for argument '${argName}' in command '${commandName}' of channel '${channelId}'`,
        `Valid types: ${validTypes.join(', ')}`
      );
    }

    // Validate pattern for string types
    if (arg.type === 'string' && arg.pattern) {
      try {
        new RegExp(arg.pattern);
      } catch (error) {
        throw new ManifestError(
          `Invalid regex pattern '${arg.pattern}' for argument '${argName}' in command '${commandName}' of channel '${channelId}'`,
          error instanceof Error ? error.message : 'Regex compilation failed'
        );
      }
    }

    // Validate numeric constraints
    if ((arg.type === 'number' || arg.type === 'integer') && arg.minimum !== undefined && arg.maximum !== undefined) {
      if (arg.minimum > arg.maximum) {
        throw new ManifestError(
          `Invalid numeric constraints for argument '${argName}' in command '${commandName}' of channel '${channelId}'`,
          `Minimum value (${arg.minimum}) cannot be greater than maximum value (${arg.maximum})`
        );
      }
    }

    // Validate model references
    if (arg.modelRef && models && !models[arg.modelRef]) {
      throw new ManifestError(
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
      throw new ManifestError(
        `Invalid response type '${response.type}' for command '${commandName}' in channel '${channelId}'`,
        `Valid types: ${validTypes.join(', ')}`
      );
    }

    // Validate model references
    if (response.modelRef && models && !models[response.modelRef]) {
      throw new ManifestError(
        `Model reference '${response.modelRef}' not found for response in command '${commandName}' of channel '${channelId}'`,
        'Referenced models must be defined in the models section'
      );
    }
  }

  /**
   * Parse multiple specification files and merge them
   * Useful for modular Manifests (matches Go implementation)
   */
  public parseMultipleFiles(filePaths: string[]): Manifest {
    if (!filePaths || filePaths.length === 0) {
      throw new ManifestError(
        'No files provided',
        'At least one file path is required for multi-file parsing'
      );
    }

    // Parse first file as base
    const firstFile = filePaths[0];
    if (!firstFile) {
      throw new ManifestError('First file path is undefined');
    }
    const baseSpec = this.parseFromFile(firstFile);

    // Merge additional files
    for (let i = 1; i < filePaths.length; i++) {
      const filePath = filePaths[i];
      if (!filePath) {
        throw new ManifestError(`File path at index ${i} is undefined`);
      }
      
      const additionalSpec = this.parseFromFile(filePath);
      this.mergeSpecifications(baseSpec, additionalSpec);
    }

    // Validate merged specification
    ManifestParser.validate(baseSpec);

    return baseSpec;
  }

  /**
   * Merge two Manifests
   * The additional spec's channels and models are added to the base spec
   */
  private mergeSpecifications(base: Manifest, additional: Manifest): void {
    // Merge channels
    for (const [channelId, channel] of Object.entries(additional.channels)) {
      if (base.channels[channelId]) {
        throw new ManifestError(
          `Channel '${channelId}' already exists in base specification`,
          'Channel names must be unique across all merged specifications'
        );
      }
      base.channels[channelId] = channel;
    }

    // Merge models
    if (additional.models) {
      if (!base.models) {
        base.models = {};
      }

      for (const [modelName, model] of Object.entries(additional.models)) {
        if (base.models[modelName]) {
          throw new ManifestError(
            `Model '${modelName}' already exists in base specification`,
            'Model names must be unique across all merged specifications'
          );
        }
        base.models[modelName] = model;
      }
    }
  }

  /**
   * Serialize Manifest to JSON string
   * Useful for converting specifications back to JSON format
   */
  public serializeToJSON(spec: Manifest, pretty: boolean = false): string {
    // Validate before serialization
    ManifestParser.validate(spec);
    
    if (pretty) {
      return JSON.stringify(spec, null, 2);
    } else {
      return JSON.stringify(spec);
    }
  }

  /**
   * Serialize Manifest to YAML string
   * Useful for converting specifications back to YAML format
   */
  public serializeToYAML(spec: Manifest): string {
    // Validate before serialization
    ManifestParser.validate(spec);
    
    // Using stringify from yaml package to serialize
    const yaml = require('yaml');
    return yaml.stringify(spec);
  }

  // Static Interface Methods (matching Go implementation)

  /**
   * Static method for parsing JSON data
   */
  public static parseJSON(data: Buffer): Manifest {
    const parser = new ManifestParser();
    return parser.parseJSON(data);
  }

  /**
   * Static method for parsing JSON strings
   */
  public static parseJSONString(jsonString: string): Manifest {
    const parser = new ManifestParser();
    return parser.parseJSONString(jsonString);
  }

  /**
   * Static method for parsing YAML data
   */
  public static parseYAML(data: Buffer): Manifest {
    const parser = new ManifestParser();
    return parser.parseYAML(data);
  }

  /**
   * Static method for parsing YAML strings
   */
  public static parseYAMLString(yamlString: string): Manifest {
    const parser = new ManifestParser();
    return parser.parseYAMLString(yamlString);
  }

  /**
   * Static method for parsing from file
   */
  public static parseFromFile(filePath: string): Manifest {
    const parser = new ManifestParser();
    return parser.parseFromFile(filePath);
  }

  /**
   * Static method for parsing multiple files
   */
  public static parseMultipleFiles(filePaths: string[]): Manifest {
    const parser = new ManifestParser();
    return parser.parseMultipleFiles(filePaths);
  }

  /**
   * Static method for JSON serialization
   */
  public static serializeToJSON(spec: Manifest, pretty: boolean = false): string {
    const parser = new ManifestParser();
    return parser.serializeToJSON(spec, pretty);
  }

  /**
   * Static method for YAML serialization
   */
  public static serializeToYAML(spec: Manifest): string {
    const parser = new ManifestParser();
    return parser.serializeToYAML(spec);
  }

  /**
   * Static method for specification merging
   */
  public static mergeSpecifications(base: Manifest, additional: Manifest): Manifest {
    const parser = new ManifestParser();
    const mergedSpec = { ...base };
    parser.mergeSpecifications(mergedSpec, additional);
    return mergedSpec;
  }
}