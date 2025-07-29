/**
 * Security Validator for Unix Socket API Protocol
 * Implements comprehensive security validation (25+ mechanisms)
 */

import { SecurityConfig } from '../types/protocol';

export interface ValidationResult {
  valid: boolean;
  error?: string;
  code?: string;
  details?: string;
}

export class SecurityValidator {
  private config: Required<SecurityConfig>;

  constructor(config: Partial<SecurityConfig> = {}) {
    this.config = {
      maxNameLength: config.maxNameLength ?? 256,
      maxArgsSize: config.maxArgsSize ?? 5 * 1024 * 1024, // 5MB
      maxTotalSize: config.maxTotalSize ?? 10 * 1024 * 1024, // 10MB
      minTimeout: config.minTimeout ?? 0.1,
      maxTimeout: config.maxTimeout ?? 300.0,
      allowedDirectories: config.allowedDirectories ?? ['/tmp/', '/var/run/', '/var/tmp/']
    };
  }

  /**
   * Validate Unix socket path according to security rules
   */
  validateSocketPath(socketPath: string): ValidationResult {
    // Maximum length check (Unix socket limit)
    if (socketPath.length > 108) {
      return {
        valid: false,
        error: 'Socket path exceeds maximum length',
        code: 'PATH_TOO_LONG',
        details: 'Unix socket paths must be 108 characters or less'
      };
    }

    // Empty path check
    if (socketPath.length === 0) {
      return {
        valid: false,
        error: 'Socket path cannot be empty',
        code: 'EMPTY_PATH',
        details: 'Socket path must be provided'
      };
    }

    // Null byte injection prevention
    if (socketPath.includes('\x00')) {
      return {
        valid: false,
        error: 'Socket path contains null bytes',
        code: 'NULL_BYTE_INJECTION',
        details: 'Null bytes are not allowed in socket paths'
      };
    }

    // Path traversal prevention
    if (socketPath.includes('../')) {
      return {
        valid: false,
        error: 'Path traversal attempt detected',
        code: 'PATH_TRAVERSAL_ATTEMPT',
        details: 'Directory traversal sequences are not allowed'
      };
    }

    // Character whitelist validation
    const validPathPattern = /^[a-zA-Z0-9\/_.-]+$/;
    if (!validPathPattern.test(socketPath)) {
      return {
        valid: false,
        error: 'Socket path contains invalid characters',
        code: 'INVALID_PATH_CHARACTERS',
        details: 'Only alphanumeric characters, slash, underscore, dash, and dot are allowed'
      };
    }

    // Directory whitelist validation
    const isAllowedDirectory = this.config.allowedDirectories.some(dir => 
      socketPath.startsWith(dir)
    );
    if (!isAllowedDirectory) {
      return {
        valid: false,
        error: 'Socket path not in allowed directories',
        code: 'FORBIDDEN_DIRECTORY',
        details: `Socket must be in one of: ${this.config.allowedDirectories.join(', ')}`
      };
    }

    return { valid: true };
  }

  /**
   * Validate channel or command name
   */
  validateName(name: string, type: 'channel' | 'command'): ValidationResult {
    // Empty name check
    if (name.length === 0) {
      return {
        valid: false,
        error: `${type} name cannot be empty`,
        code: 'EMPTY_NAME',
        details: `${type} name must be provided`
      };
    }

    // Maximum length check
    if (name.length > this.config.maxNameLength) {
      return {
        valid: false,
        error: `${type} name exceeds maximum length`,
        code: 'NAME_TOO_LONG',
        details: `${type} names must be ${this.config.maxNameLength} characters or less`
      };
    }

    // Null byte detection (check first as it's more specific)
    if (name.includes('\x00')) {
      return {
        valid: false,
        error: `${type} name contains null bytes`,
        code: 'NULL_BYTE_INJECTION',
        details: 'Null bytes are not allowed in names'
      };
    }

    // Pattern validation (alphanumeric + underscore + hyphen)
    const validNamePattern = /^[a-zA-Z0-9_-]+$/;
    if (!validNamePattern.test(name)) {
      return {
        valid: false,
        error: `${type} name contains invalid characters`,
        code: 'INVALID_NAME_CHARACTERS',
        details: 'Only alphanumeric characters, underscore, and hyphen are allowed'
      };
    }

    // UTF-8 validation
    try {
      const encoded = Buffer.from(name, 'utf8');
      const decoded = encoded.toString('utf8');
      if (decoded !== name) {
        return {
          valid: false,
          error: `${type} name contains invalid UTF-8`,
          code: 'INVALID_UTF8',
          details: 'Name must be valid UTF-8 encoded text'
        };
      }
    } catch (error) {
      return {
        valid: false,
        error: `${type} name encoding validation failed`,
        code: 'ENCODING_ERROR',
        details: 'Failed to validate UTF-8 encoding'
      };
    }

    return { valid: true };
  }

  /**
   * Validate message content for security issues
   */
  validateMessageContent(content: any): ValidationResult {
    const contentStr = JSON.stringify(content);
    const contentBuffer = Buffer.from(contentStr, 'utf8');

    // Size limit validation
    if (contentBuffer.length > this.config.maxTotalSize) {
      return {
        valid: false,
        error: 'Message exceeds maximum size',
        code: 'MESSAGE_TOO_LARGE',
        details: `Message must be ${this.config.maxTotalSize} bytes or less`
      };
    }

    // Null byte detection in entire payload
    if (contentStr.includes('\x00')) {
      return {
        valid: false,
        error: 'Message contains null bytes',
        code: 'NULL_BYTE_INJECTION',
        details: 'Null bytes are not allowed in message content'
      };
    }

    // UTF-8 validation for entire message
    try {
      const decoded = contentBuffer.toString('utf8');
      if (JSON.stringify(JSON.parse(decoded)) !== contentStr) {
        return {
          valid: false,
          error: 'Message contains invalid UTF-8',
          code: 'INVALID_UTF8',
          details: 'Message must be valid UTF-8 encoded JSON'
        };
      }
    } catch (error) {
      return {
        valid: false,
        error: 'Message encoding validation failed',
        code: 'ENCODING_ERROR',
        details: 'Failed to validate UTF-8 encoding'
      };
    }

    // JSON structure validation
    try {
      JSON.parse(contentStr);
    } catch (error) {
      return {
        valid: false,
        error: 'Invalid JSON structure',
        code: 'INVALID_JSON',
        details: 'Message must be valid JSON'
      };
    }

    return { valid: true };
  }

  /**
   * Validate command arguments size
   */
  validateArgsSize(args: Record<string, any>): ValidationResult {
    const argsStr = JSON.stringify(args);
    const argsSize = Buffer.from(argsStr, 'utf8').length;

    if (argsSize > this.config.maxArgsSize) {
      return {
        valid: false,
        error: 'Command arguments exceed maximum size',
        code: 'ARGS_TOO_LARGE',
        details: `Arguments must be ${this.config.maxArgsSize} bytes or less`
      };
    }

    return { valid: true };
  }

  /**
   * Validate timeout value
   */
  validateTimeout(timeout: number): ValidationResult {
    if (!Number.isFinite(timeout)) {
      return {
        valid: false,
        error: 'Invalid timeout value',
        code: 'INVALID_TIMEOUT',
        details: 'Timeout must be a finite number'
      };
    }

    if (timeout < this.config.minTimeout) {
      return {
        valid: false,
        error: 'Timeout value too small',
        code: 'TIMEOUT_TOO_SMALL',
        details: `Timeout must be at least ${this.config.minTimeout} seconds`
      };
    }

    if (timeout > this.config.maxTimeout) {
      return {
        valid: false,
        error: 'Timeout value too large',
        code: 'TIMEOUT_TOO_LARGE',
        details: `Timeout must be at most ${this.config.maxTimeout} seconds`
      };
    }

    return { valid: true };
  }

  /**
   * Validate UUID format
   */
  validateUUID(uuid: string): ValidationResult {
    // More permissive UUID pattern that accepts all valid v4 UUIDs
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    
    if (!uuidPattern.test(uuid)) {
      return {
        valid: false,
        error: 'Invalid UUID format',
        code: 'INVALID_UUID',
        details: 'UUID must be a valid v4 format'
      };
    }

    return { valid: true };
  }

  /**
   * Validate ISO 8601 timestamp
   */
  validateTimestamp(timestamp: string): ValidationResult {
    try {
      const date = new Date(timestamp);
      if (!Number.isFinite(date.getTime())) {
        return {
          valid: false,
          error: 'Invalid timestamp',
          code: 'INVALID_TIMESTAMP',
          details: 'Timestamp must be a valid ISO 8601 date'
        };
      }

      // Verify it matches ISO 8601 format with milliseconds
      const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
      if (!isoPattern.test(timestamp)) {
        return {
          valid: false,
          error: 'Timestamp format invalid',
          code: 'INVALID_TIMESTAMP_FORMAT',
          details: 'Timestamp must be ISO 8601 format with milliseconds (YYYY-MM-DDTHH:mm:ss.sssZ)'
        };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: 'Timestamp parsing failed',
        code: 'TIMESTAMP_PARSE_ERROR',
        details: 'Failed to parse timestamp'
      };
    }
  }

  /**
   * Comprehensive validation of a socket command
   */
  validateCommand(command: any): ValidationResult {
    // Type validation
    if (typeof command !== 'object' || command === null) {
      return {
        valid: false,
        error: 'Command must be an object',
        code: 'INVALID_COMMAND_TYPE',
        details: 'Command must be a non-null object'
      };
    }

    // Required fields validation
    const requiredFields = ['id', 'channelId', 'command', 'timestamp'];
    for (const field of requiredFields) {
      if (!(field in command) || typeof command[field] !== 'string') {
        return {
          valid: false,
          error: `Missing or invalid required field: ${field}`,
          code: 'MISSING_REQUIRED_FIELD',
          details: `Field '${field}' must be a string`
        };
      }
    }

    // Validate individual fields
    const validations = [
      () => this.validateUUID(command.id),
      () => this.validateName(command.channelId, 'channel'),
      () => this.validateName(command.command, 'command'),
      () => this.validateTimestamp(command.timestamp)
    ];

    if (command.timeout !== undefined) {
      validations.push(() => this.validateTimeout(command.timeout));
    }

    if (command.args !== undefined) {
      validations.push(() => this.validateArgsSize(command.args));
    }

    for (const validate of validations) {
      const result = validate();
      if (!result.valid) {
        return result;
      }
    }

    // Overall message content validation
    return this.validateMessageContent(command);
  }

  /**
   * Comprehensive validation of a socket response
   */
  validateResponse(response: any): ValidationResult {
    // Type validation
    if (typeof response !== 'object' || response === null) {
      return {
        valid: false,
        error: 'Response must be an object',
        code: 'INVALID_RESPONSE_TYPE',
        details: 'Response must be a non-null object'
      };
    }

    // Required fields validation
    const requiredFields = ['commandId', 'channelId', 'success', 'timestamp'];
    for (const field of requiredFields) {
      if (!(field in response)) {
        return {
          valid: false,
          error: `Missing required field: ${field}`,
          code: 'MISSING_REQUIRED_FIELD',
          details: `Field '${field}' is required`
        };
      }
    }

    // Type-specific field validation
    if (typeof response.commandId !== 'string' || typeof response.channelId !== 'string' || 
        typeof response.success !== 'boolean' || typeof response.timestamp !== 'string') {
      return {
        valid: false,
        error: 'Invalid field types in response',
        code: 'INVALID_FIELD_TYPES',
        details: 'commandId, channelId must be strings, success must be boolean, timestamp must be string'
      };
    }

    // Validate individual fields
    const validations = [
      () => this.validateUUID(response.commandId),
      () => this.validateName(response.channelId, 'channel'),
      () => this.validateTimestamp(response.timestamp)
    ];

    for (const validate of validations) {
      const result = validate();
      if (!result.valid) {
        return result;
      }
    }

    // Success/error field validation
    if (response.success && response.error) {
      return {
        valid: false,
        error: 'Response cannot have both success=true and error field',
        code: 'CONFLICTING_SUCCESS_ERROR',
        details: 'Successful responses should not include error field'
      };
    }

    if (!response.success && !response.error) {
      return {
        valid: false,
        error: 'Failed response must include error field',
        code: 'MISSING_ERROR_FIELD',
        details: 'Failed responses must include error information'
      };
    }

    // Overall message content validation
    return this.validateMessageContent(response);
  }
}