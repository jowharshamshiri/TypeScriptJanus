/**
 * Response Validator for TypeScript Janus Implementation
 * Validates request handler responses against Manifest ResponseDefinition models
 * Achieves 100% parity with Go/Rust/Swift implementations
 */

import { Manifest, ResponseDefinition, Argument, Model } from '../types/protocol';

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
 * Response validator that validates request handler responses
 * against Manifest ResponseDefinition models
 */
export class ResponseValidator {
  private manifest: Manifest;

  constructor(manifest: Manifest) {
    this.manifest = manifest;
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
   * Validate a request response by looking up the request manifest
   */
  public validateRequestResponse(response: any, requestName: string): ValidationResult {
    const startTime = performance.now();
    
    // Look up request manifest directly (no channels)
    const request = this.manifest.requests?.[requestName];
    if (!request) {
      return {
        valid: false,
        errors: [{
          field: 'request',
          message: `Request '${requestName}' not found in Manifest`,
          expected: 'valid request name',
          actual: requestName
        }],
        validationTime: performance.now() - startTime,
        fieldsValidated: 0
      };
    }

    if (!request.response) {
      return {
        valid: false,
        errors: [{
          field: 'response',
          message: `No response manifest defined for request '${requestName}'`,
          expected: 'response manifest',
          actual: 'undefined'
        }],
        validationTime: performance.now() - startTime,
        fieldsValidated: 0
      };
    }

    return this.validateResponse(response, request.response);
  }

  /**
   * Validate a value against an argument manifest
   */
  private validateValue(value: any, manifest: Argument | ResponseDefinition, fieldPath: string, errors: ValidationError[]): void {
    // Handle model references
    if (manifest.modelRef) {
      const model = this.resolveModelReference(manifest.modelRef);
      if (!model) {
        errors.push({
          field: fieldPath,
          message: `Model reference '${manifest.modelRef}' not found`,
          expected: 'valid model reference',
          actual: manifest.modelRef
        });
        return;
      }
      this.validateValue(value, model, fieldPath, errors);
      return;
    }

    // Validate type
    const initialErrorCount = errors.length;
    this.validateType(value, manifest.type, fieldPath, errors);

    if (errors.length > initialErrorCount) {
      return; // Don't continue validation if type is wrong
    }

    // Type-manifestific validation
    switch (manifest.type) {
      case 'string':
        this.validateString(value, manifest, fieldPath, errors);
        break;
      case 'number':
      case 'integer':
        this.validateNumber(value, manifest, fieldPath, errors);
        break;
      case 'array':
        this.validateArray(value, manifest, fieldPath, errors);
        break;
      case 'object':
        this.validateObject(value, manifest, fieldPath, errors);
        break;
      case 'boolean':
        // Boolean validation is covered by type validation
        break;
    }

    // Validate enum values (only available on Argument, not ResponseDefinition)
    if ('enum' in manifest && manifest.enum && manifest.enum.length > 0) {
      if (!manifest.enum.includes(value)) {
        errors.push({
          field: fieldPath,
          message: 'Value is not in allowed enum list',
          expected: manifest.enum.join(', '),
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
  private validateString(value: string, manifest: Argument | ResponseDefinition, fieldPath: string, errors: ValidationError[]): void {
    // Length validation (only available on Argument)
    if ('minLength' in manifest && manifest.minLength !== undefined && value.length < manifest.minLength) {
      errors.push({
        field: fieldPath,
        message: `String is too short (${value.length} < ${manifest.minLength})`,
        expected: `minimum length ${manifest.minLength}`,
        actual: `length ${value.length}`
      });
    }

    if ('maxLength' in manifest && manifest.maxLength !== undefined && value.length > manifest.maxLength) {
      errors.push({
        field: fieldPath,
        message: `String is too long (${value.length} > ${manifest.maxLength})`,
        expected: `maximum length ${manifest.maxLength}`,
        actual: `length ${value.length}`
      });
    }

    // Pattern validation (only available on Argument)
    if ('pattern' in manifest && manifest.pattern) {
      try {
        const regex = new RegExp(manifest.pattern);
        if (!regex.test(value)) {
          errors.push({
            field: fieldPath,
            message: 'String does not match required pattern',
            expected: `pattern ${manifest.pattern}`,
            actual: value
          });
        }
      } catch (error) {
        errors.push({
          field: fieldPath,
          message: 'Invalid regex pattern in manifest',
          expected: 'valid regex pattern',
          actual: manifest.pattern
        });
      }
    }
  }

  /**
   * Validate numeric value
   */
  private validateNumber(value: number, manifest: Argument | ResponseDefinition, fieldPath: string, errors: ValidationError[]): void {
    // Range validation (only available on Argument)
    if ('minimum' in manifest && manifest.minimum !== undefined && value < manifest.minimum) {
      errors.push({
        field: fieldPath,
        message: `Number is too small (${value} < ${manifest.minimum})`,
        expected: `minimum ${manifest.minimum}`,
        actual: value
      });
    }

    if ('maximum' in manifest && manifest.maximum !== undefined && value > manifest.maximum) {
      errors.push({
        field: fieldPath,
        message: `Number is too large (${value} > ${manifest.maximum})`,
        expected: `maximum ${manifest.maximum}`,
        actual: value
      });
    }
  }

  /**
   * Validate array value
   */
  private validateArray(value: any[], manifest: Argument | ResponseDefinition, fieldPath: string, errors: ValidationError[]): void {
    if (!manifest.items) {
      return; // No item manifest, skip item validation
    }

    // Validate each array item
    value.forEach((item, index) => {
      const itemFieldPath = `${fieldPath}[${index}]`;
      this.validateValue(item, manifest.items!, itemFieldPath, errors);
    });
  }

  /**
   * Validate object value
   */
  private validateObject(value: Record<string, any>, manifest: Argument | ResponseDefinition, fieldPath: string, errors: ValidationError[]): void {
    if (!manifest.properties) {
      return; // No property manifest, skip property validation
    }

    // Validate each property
    for (const [propName, propManifest] of Object.entries(manifest.properties)) {
      const propFieldPath = fieldPath ? `${fieldPath}.${propName}` : propName;
      const propValue = value[propName];

      // Check required fields
      if (propManifest.required && (propValue === undefined || propValue === null)) {
        errors.push({
          field: propFieldPath,
          message: 'Required field is missing or null',
          expected: `non-null ${propManifest.type}`,
          actual: propValue
        });
        continue;
      }

      // Skip validation for optional missing fields
      if (propValue === undefined && !propManifest.required) {
        continue;
      }

      // Validate property value
      this.validateValue(propValue, propManifest, propFieldPath, errors);
    }
  }

  /**
   * Resolve a model reference to its definition
   */
  private resolveModelReference(modelRef: string): Model | null {
    if (!this.manifest.models) {
      return null;
    }

    return this.manifest.models[modelRef] || null;
  }

  /**
   * Count the number of fields that would be validated
   */
  private countValidatedFields(manifest: Argument | ResponseDefinition): number {
    if (manifest.type === 'object' && manifest.properties) {
      return Object.keys(manifest.properties).length;
    }
    return 1;
  }

  /**
   * Create a validation error for missing response manifest
   */
  public static createMissingManifestError(channelId: string, requestName: string): ValidationResult {
    return {
      valid: false,
      errors: [{
        field: 'manifest',
        message: `No response manifest found for request '${requestName}' in channel '${channelId}'`,
        expected: 'response manifest',
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