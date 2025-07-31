/**
 * Response Validator for TypeScript Janus Implementation
 * Validates command handler responses against API specification ResponseDefinition models
 * Achieves 100% parity with Go/Rust/Swift implementations
 */

import { APISpecification, ResponseDefinition, Argument, Model } from '../types/protocol';

/**
 * Represents a validation error with detailed context
 */
export interface ValidationError {
  /** Field path that failed validation */
  field: string;
  
  /** Human-readable error message */
  message: string;
  
  /** Expected type or value */
  expected: string;
  
  /** Actual value that failed validation */
  actual: any;
  
  /** Additional validation context */
  context?: string;
}

/**
 * Result of response validation
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  
  /** List of validation errors (empty if valid) */
  errors: ValidationError[];
  
  /** Time taken for validation in milliseconds */
  validationTime: number;
  
  /** Number of fields validated */
  fieldsValidated: number;
}

/**
 * Response validator that validates command handler responses
 * against API specification ResponseDefinition models
 */
export class ResponseValidator {
  private specification: APISpecification;

  constructor(specification: APISpecification) {
    this.specification = specification;
  }

  /**
   * Validate a response against a ResponseDefinition
   */
  public validateResponse(response: any, responseDefinition: ResponseDefinition): ValidationResult {
    const startTime = performance.now();
    const errors: ValidationError[] = [];
    let fieldsValidated = 0;

    try {
      this.validateValue(response, responseDefinition, '', errors);
      fieldsValidated = this.countValidatedFields(responseDefinition);
    } catch (error) {
      errors.push({
        field: 'response',
        message: error instanceof Error ? error.message : 'Unknown validation error',
        expected: 'valid response structure',
        actual: response
      });
    }

    const validationTime = performance.now() - startTime;

    return {
      valid: errors.length === 0,
      errors,
      validationTime,
      fieldsValidated
    };
  }

  /**
   * Validate a command response by looking up the command specification
   */
  public validateCommandResponse(response: any, channelId: string, commandName: string): ValidationResult {
    const startTime = performance.now();
    
    // Look up command specification
    const channel = this.specification.channels[channelId];
    if (!channel) {
      return {
        valid: false,
        errors: [{
          field: 'channelId',
          message: `Channel '${channelId}' not found in API specification`,
          expected: 'valid channel ID',
          actual: channelId
        }],
        validationTime: performance.now() - startTime,
        fieldsValidated: 0
      };
    }

    const command = channel.commands[commandName];
    if (!command) {
      return {
        valid: false,
        errors: [{
          field: 'command',
          message: `Command '${commandName}' not found in channel '${channelId}'`,
          expected: 'valid command name',
          actual: commandName
        }],
        validationTime: performance.now() - startTime,
        fieldsValidated: 0
      };
    }

    if (!command.response) {
      return {
        valid: false,
        errors: [{
          field: 'response',
          message: `No response specification defined for command '${commandName}'`,
          expected: 'response specification',
          actual: 'undefined'
        }],
        validationTime: performance.now() - startTime,
        fieldsValidated: 0
      };
    }

    return this.validateResponse(response, command.response);
  }

  /**
   * Validate a value against an argument specification
   */
  private validateValue(value: any, spec: Argument | ResponseDefinition, fieldPath: string, errors: ValidationError[]): void {
    // Handle model references
    if (spec.modelRef) {
      const model = this.resolveModelReference(spec.modelRef);
      if (!model) {
        errors.push({
          field: fieldPath,
          message: `Model reference '${spec.modelRef}' not found`,
          expected: 'valid model reference',
          actual: spec.modelRef
        });
        return;
      }
      this.validateValue(value, model, fieldPath, errors);
      return;
    }

    // Validate type
    const initialErrorCount = errors.length;
    this.validateType(value, spec.type, fieldPath, errors);

    if (errors.length > initialErrorCount) {
      return; // Don't continue validation if type is wrong
    }

    // Type-specific validation
    switch (spec.type) {
      case 'string':
        this.validateString(value, spec, fieldPath, errors);
        break;
      case 'number':
      case 'integer':
        this.validateNumber(value, spec, fieldPath, errors);
        break;
      case 'array':
        this.validateArray(value, spec, fieldPath, errors);
        break;
      case 'object':
        this.validateObject(value, spec, fieldPath, errors);
        break;
      case 'boolean':
        // Boolean validation is covered by type validation
        break;
    }

    // Validate enum values (only available on Argument, not ResponseDefinition)
    if ('enum' in spec && spec.enum && spec.enum.length > 0) {
      if (!spec.enum.includes(value)) {
        errors.push({
          field: fieldPath,
          message: 'Value is not in allowed enum list',
          expected: spec.enum.join(', '),
          actual: value
        });
      }
    }
  }

  /**
   * Validate type of a value
   */
  private validateType(value: any, expectedType: string, fieldPath: string, errors: ValidationError[]): void {
    const actualType = this.getActualType(value);

    if (expectedType === 'integer') {
      if (actualType !== 'number' || !Number.isInteger(value)) {
        errors.push({
          field: fieldPath,
          message: 'Value is not an integer',
          expected: 'integer',
          actual: actualType
        });
      }
    } else if (actualType !== expectedType) {
      errors.push({
        field: fieldPath,
        message: `Type mismatch`,
        expected: expectedType,
        actual: actualType
      });
    }
  }

  /**
   * Get the actual type of a value
   */
  private getActualType(value: any): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  }

  /**
   * Validate string value
   */
  private validateString(value: string, spec: Argument | ResponseDefinition, fieldPath: string, errors: ValidationError[]): void {
    // Length validation (only available on Argument)
    if ('minLength' in spec && spec.minLength !== undefined && value.length < spec.minLength) {
      errors.push({
        field: fieldPath,
        message: `String is too short (${value.length} < ${spec.minLength})`,
        expected: `minimum length ${spec.minLength}`,
        actual: `length ${value.length}`
      });
    }

    if ('maxLength' in spec && spec.maxLength !== undefined && value.length > spec.maxLength) {
      errors.push({
        field: fieldPath,
        message: `String is too long (${value.length} > ${spec.maxLength})`,
        expected: `maximum length ${spec.maxLength}`,
        actual: `length ${value.length}`
      });
    }

    // Pattern validation (only available on Argument)
    if ('pattern' in spec && spec.pattern) {
      try {
        const regex = new RegExp(spec.pattern);
        if (!regex.test(value)) {
          errors.push({
            field: fieldPath,
            message: 'String does not match required pattern',
            expected: `pattern ${spec.pattern}`,
            actual: value
          });
        }
      } catch (error) {
        errors.push({
          field: fieldPath,
          message: 'Invalid regex pattern in specification',
          expected: 'valid regex pattern',
          actual: spec.pattern
        });
      }
    }
  }

  /**
   * Validate numeric value
   */
  private validateNumber(value: number, spec: Argument | ResponseDefinition, fieldPath: string, errors: ValidationError[]): void {
    // Range validation (only available on Argument)
    if ('minimum' in spec && spec.minimum !== undefined && value < spec.minimum) {
      errors.push({
        field: fieldPath,
        message: `Number is too small (${value} < ${spec.minimum})`,
        expected: `minimum ${spec.minimum}`,
        actual: value
      });
    }

    if ('maximum' in spec && spec.maximum !== undefined && value > spec.maximum) {
      errors.push({
        field: fieldPath,
        message: `Number is too large (${value} > ${spec.maximum})`,
        expected: `maximum ${spec.maximum}`,
        actual: value
      });
    }
  }

  /**
   * Validate array value
   */
  private validateArray(value: any[], spec: Argument | ResponseDefinition, fieldPath: string, errors: ValidationError[]): void {
    if (!spec.items) {
      return; // No item specification, skip item validation
    }

    // Validate each array item
    value.forEach((item, index) => {
      const itemFieldPath = `${fieldPath}[${index}]`;
      this.validateValue(item, spec.items!, itemFieldPath, errors);
    });
  }

  /**
   * Validate object value
   */
  private validateObject(value: Record<string, any>, spec: Argument | ResponseDefinition, fieldPath: string, errors: ValidationError[]): void {
    if (!spec.properties) {
      return; // No property specification, skip property validation
    }

    // Validate each property
    for (const [propName, propSpec] of Object.entries(spec.properties)) {
      const propFieldPath = fieldPath ? `${fieldPath}.${propName}` : propName;
      const propValue = value[propName];

      // Check required fields
      if (propSpec.required && (propValue === undefined || propValue === null)) {
        errors.push({
          field: propFieldPath,
          message: 'Required field is missing or null',
          expected: `non-null ${propSpec.type}`,
          actual: propValue
        });
        continue;
      }

      // Skip validation for optional missing fields
      if (propValue === undefined && !propSpec.required) {
        continue;
      }

      // Validate property value
      this.validateValue(propValue, propSpec, propFieldPath, errors);
    }
  }

  /**
   * Resolve a model reference to its definition
   */
  private resolveModelReference(modelRef: string): Model | null {
    if (!this.specification.models) {
      return null;
    }

    return this.specification.models[modelRef] || null;
  }

  /**
   * Count the number of fields that would be validated
   */
  private countValidatedFields(spec: Argument | ResponseDefinition): number {
    if (spec.type === 'object' && spec.properties) {
      return Object.keys(spec.properties).length;
    }
    return 1;
  }

  /**
   * Create a validation error for missing response specification
   */
  public static createMissingSpecificationError(channelId: string, commandName: string): ValidationResult {
    return {
      valid: false,
      errors: [{
        field: 'specification',
        message: `No response specification found for command '${commandName}' in channel '${channelId}'`,
        expected: 'response specification',
        actual: 'undefined'
      }],
      validationTime: 0,
      fieldsValidated: 0
    };
  }

  /**
   * Create a validation result for successful validation
   */
  public static createSuccessResult(fieldsValidated: number, validationTime: number): ValidationResult {
    return {
      valid: true,
      errors: [],
      validationTime,
      fieldsValidated
    };
  }
}