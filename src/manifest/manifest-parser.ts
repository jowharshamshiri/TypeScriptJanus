/**
 * Manifest Parser for TypeScript Janus Implementation
 * Provides JSON and YAML parsing with comprehensive validation
 * Achieves 100% parity with Go/Rust/Swift implementations
 */

import * as fs from 'fs';
import * as path from 'path';
import { parse as parseYAML } from 'yaml';
import { Manifest, Request, Argument, Model } from '../types/protocol';

/**
 * Error thrown during Manifest parsing or validation
 * Follows JSONRPCError standard with manifest validation error code
 */
export class ManifestError extends Error {
  public readonly code: number = -32013; // ManifestValidationError code
  
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
  public static validate(manifest: Manifest): void {
    // Validate version format
    if (!manifest.version || manifest.version.trim() === '') {
      throw new ManifestError(
        'API version cannot be empty',
        'Version field is required and must be non-empty string'
      );
    }

    // Validate requests exist (channels removed)
    if (manifest.requests && Object.keys(manifest.requests).length > 0) {
      // Validate each request
      for (const [requestName, request] of Object.entries(manifest.requests)) {
        this.validateRequest(requestName, request, manifest.models);
      }
    }
  }

  /**
   * Transform and validate parsed data into Manifest type
   */
  private validateAndTransform(parsed: any): Manifest {
    // Basic structure validation
    if (!parsed || typeof parsed !== 'object') {
      throw new ManifestError(
        'Invalid manifest format',
        'Root object is required'
      );
    }

    // Transform to typed structure
    const manifest: Manifest = {
      version: parsed.version,
      name: parsed.name,
      description: parsed.description,
      requests: parsed.requests || {},
      models: parsed.models
    };

    // Validate the transformed manifest
    ManifestParser.validate(manifest);

    return manifest;
  }

  /**
   * Validate individual request structure
   */
  private static validateRequest(requestName: string, request: Request, models?: Record<string, Model>): void {
    if (!requestName || requestName.trim() === '') {
      throw new ManifestError(
        'Request name cannot be empty',
        'Request names must be non-empty strings'
      );
    }

    // Check for reserved request names (matching Go/Rust/Swift)
    const reservedRequests = ['ping', 'echo', 'get_info', 'validate', 'slow_process', 'manifest'];
    if (reservedRequests.includes(requestName)) {
      throw new ManifestError(
        `Request '${requestName}' is reserved and cannot be defined in Manifest`,
        `Reserved requests: ${reservedRequests.join(', ')}`
      );
    }

    if (!request.description || request.description.trim() === '') {
      throw new ManifestError(
        `Request '${requestName}' must have a description`,
        'Request descriptions are required for API documentation'
      );
    }

    // Validate request arguments if present
    if (request.args) {
      for (const [argName, arg] of Object.entries(request.args)) {
        this.validateArgument(requestName, argName, arg, models);
      }
    }

    // Validate response definition if present
    if (request.response) {
      this.validateResponseDefinition(requestName, request.response, models);
    }
  }

  /**
   * Validate argument definition with type checking and constraints
   */
  private static validateArgument(
    requestName: string,
    argName: string,
    arg: Argument,
    models?: Record<string, Model>
  ): void {
    if (!argName || argName.trim() === '') {
      throw new ManifestError(
        `Argument name cannot be empty in request '${requestName}'`,
        'Argument names must be non-empty strings'
      );
    }

    // Validate type field
    const validTypes = ['string', 'number', 'integer', 'boolean', 'array', 'object'];
    if (!validTypes.includes(arg.type)) {
      throw new ManifestError(
        `Invalid argument type '${arg.type}' for argument '${argName}' in request '${requestName}'`,
        `Valid types: ${validTypes.join(', ')}`
      );
    }

    // Validate pattern for string types
    if (arg.type === 'string' && arg.pattern) {
      try {
        new RegExp(arg.pattern);
      } catch (error) {
        throw new ManifestError(
          `Invalid regex pattern '${arg.pattern}' for argument '${argName}' in request '${requestName}'`,
          error instanceof Error ? error.message : 'Regex compilation failed'
        );
      }
    }

    // Validate numeric constraints
    if ((arg.type === 'number' || arg.type === 'integer') && arg.minimum !== undefined && arg.maximum !== undefined) {
      if (arg.minimum > arg.maximum) {
        throw new ManifestError(
          `Invalid numeric constraints for argument '${argName}' in request '${requestName}'`,
          `Minimum value (${arg.minimum}) cannot be greater than maximum value (${arg.maximum})`
        );
      }
    }

    // Validate model references
    if (arg.modelRef && models && !models[arg.modelRef]) {
      throw new ManifestError(
        `Model reference '${arg.modelRef}' not found for argument '${argName}' in request '${requestName}'`,
        'Referenced models must be defined in the models section'
      );
    }

    // Validate array item definitions
    if (arg.type === 'array' && arg.items) {
      this.validateArgument(requestName, `${argName}[items]`, arg.items, models);
    }

    // Validate object properties
    if (arg.type === 'object' && arg.properties) {
      for (const [propName, prop] of Object.entries(arg.properties)) {
        this.validateArgument(requestName, `${argName}.${propName}`, prop, models);
      }
    }
  }

  /**
   * Validate response definition structure
   */
  private static validateResponseDefinition(
    requestName: string,
    response: any,
    models?: Record<string, Model>
  ): void {
    const validTypes = ['string', 'number', 'integer', 'boolean', 'array', 'object'];
    if (!validTypes.includes(response.type)) {
      throw new ManifestError(
        `Invalid response type '${response.type}' for request '${requestName}'`,
        `Valid types: ${validTypes.join(', ')}`
      );
    }

    // Validate model references
    if (response.modelRef && models && !models[response.modelRef]) {
      throw new ManifestError(
        `Model reference '${response.modelRef}' not found for response in request '${requestName}'`,
        'Referenced models must be defined in the models section'
      );
    }
  }

  /**
   * Parse multiple manifest files and merge them
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
    const baseManifest = this.parseFromFile(firstFile);

    // Merge additional files
    for (let i = 1; i < filePaths.length; i++) {
      const filePath = filePaths[i];
      if (!filePath) {
        throw new ManifestError(`File path at index ${i} is undefined`);
      }
      
      const additionalManifest = this.parseFromFile(filePath);
      this.mergeManifests(baseManifest, additionalManifest);
    }

    // Validate merged manifest
    ManifestParser.validate(baseManifest);

    return baseManifest;
  }

  /**
   * Merge two Manifests
   * The additional manifest's requests and models are added to the base manifest
   */
  private mergeManifests(base: Manifest, additional: Manifest): void {
    // Merge requests
    if (additional.requests) {
      if (!base.requests) {
        base.requests = {};
      }
      for (const [requestName, request] of Object.entries(additional.requests)) {
        if (base.requests[requestName]) {
          throw new ManifestError(
            `Request '${requestName}' already exists in base manifest`,
            'Request names must be unique across all merged manifests'
          );
        }
        base.requests[requestName] = request;
      }
    }

    // Merge models
    if (additional.models) {
      if (!base.models) {
        base.models = {};
      }

      for (const [modelName, model] of Object.entries(additional.models)) {
        if (base.models[modelName]) {
          throw new ManifestError(
            `Model '${modelName}' already exists in base manifest`,
            'Model names must be unique across all merged manifests'
          );
        }
        base.models[modelName] = model;
      }
    }
  }

  /**
   * Serialize Manifest to JSON string
   * Useful for converting manifests back to JSON format
   */
  public serializeToJSON(manifest: Manifest, pretty: boolean = false): string {
    // Validate before serialization
    ManifestParser.validate(manifest);
    
    if (pretty) {
      return JSON.stringify(manifest, null, 2);
    } else {
      return JSON.stringify(manifest);
    }
  }

  /**
   * Serialize Manifest to YAML string
   * Useful for converting manifests back to YAML format
   */
  public serializeToYAML(manifest: Manifest): string {
    // Validate before serialization
    ManifestParser.validate(manifest);
    
    // Using stringify from yaml package to serialize
    const yaml = require('yaml');
    return yaml.stringify(manifest);
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
  public static serializeToJSON(manifest: Manifest, pretty: boolean = false): string {
    const parser = new ManifestParser();
    return parser.serializeToJSON(manifest, pretty);
  }

  /**
   * Static method for YAML serialization
   */
  public static serializeToYAML(manifest: Manifest): string {
    const parser = new ManifestParser();
    return parser.serializeToYAML(manifest);
  }

  /**
   * Static method for manifest merging
   */
  public static mergeManifests(base: Manifest, additional: Manifest): Manifest {
    const parser = new ManifestParser();
    const mergedManifest = { ...base };
    parser.mergeManifests(mergedManifest, additional);
    return mergedManifest;
  }
}