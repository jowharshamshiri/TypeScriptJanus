/**
 * Comprehensive tests for ResponseValidator
 * Validates all response validation scenarios against Manifests
 */

import { ResponseValidator } from '../specification/response-validator';
import { Manifest, ResponseDefinition } from '../types/protocol';

describe('ResponseValidator', () => {
  let validator: ResponseValidator;
  let testManifest: Manifest;

  beforeEach(() => {
    // Create test Manifest
    testManifest = {
      version: '1.0.0',
      name: 'Test API',
      description: 'Test Manifest for response validation',
      channels: {
        'test': {
          name: 'test',
          description: 'Test channel',
          commands: {
            'ping': {
              name: 'ping',
              description: 'Basic ping command',
              response: {
                type: 'object',
                description: 'Ping response',
                properties: {
                  status: { type: 'string', required: true, description: 'Status message' },
                  echo: { type: 'string', required: true, description: 'Echo message' },
                  timestamp: { type: 'number', required: true, description: 'Response timestamp' },
                  server_id: { type: 'string', required: true, description: 'Server identifier' },
                  request_count: { type: 'number', required: false, description: 'Request count' },
                  metadata: { type: 'object', required: false, description: 'Optional metadata' }
                }
              }
            },
            'validate': {
              name: 'validate',
              description: 'JSON validation command',
              response: {
                type: 'object',
                description: 'Validation result',
                properties: {
                  valid: { type: 'boolean', required: true, description: 'Validation result' },
                  data: { type: 'object', required: false, description: 'Parsed data' },
                  error: { type: 'string', required: false, description: 'Error message' },
                  reason: { type: 'string', required: false, description: 'Error reason' }
                }
              }
            },
            'get_info': {
              name: 'get_info',
              description: 'Get server information',
              response: {
                type: 'object',
                description: 'Server information',
                properties: {
                  implementation: { type: 'string', required: true, description: 'Implementation language' },
                  version: { type: 'string', required: true, pattern: '^\\d+\\.\\d+\\.\\d+$', description: 'Version string' },
                  protocol: { type: 'string', required: true, enum: ['SOCK_DGRAM'], description: 'Protocol type' }
                }
              }
            },
            'range_test': {
              name: 'range_test',
              description: 'Numeric range validation test',
              response: {
                type: 'object',
                description: 'Range test response',
                properties: {
                  score: { type: 'number', required: true, minimum: 0, maximum: 100, description: 'Test score' },
                  grade: { type: 'string', required: true, enum: ['A', 'B', 'C', 'D', 'F'], description: 'Letter grade' },
                  count: { type: 'integer', required: true, minimum: 1, description: 'Item count' }
                }
              }
            },
            'array_test': {
              name: 'array_test',
              description: 'Array validation test',
              response: {
                type: 'object',
                description: 'Array test response',
                properties: {
                  items: {
                    type: 'array',
                    required: true,
                    description: 'Array of strings',
                    items: { type: 'string', minLength: 1, maxLength: 50, description: 'String item' }
                  },
                  numbers: {
                    type: 'array',
                    required: false,
                    description: 'Array of numbers',
                    items: { type: 'number', minimum: 0, description: 'Number item' }
                  }
                }
              }
            }
          }
        }
      },
      models: {
        'UserInfo': {
          name: 'UserInfo',
          type: 'object',
          description: 'User information model',
          properties: {
            id: { type: 'string', required: true, description: 'User ID' },
            name: { type: 'string', required: true, minLength: 1, maxLength: 100, description: 'User name' },
            age: { type: 'integer', required: false, minimum: 0, maximum: 150, description: 'User age' }
          }
        }
      }
    };

    validator = new ResponseValidator(testManifest);
  });

  describe('Basic Response Validation', () => {
    test('should validate correct ping response', () => {
      const response = {
        status: 'ok',
        echo: 'test message',
        timestamp: 1234567890,
        server_id: 'server-001'
      };

      const result = validator.validateCommandResponse(response, 'test', 'ping');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.fieldsValidated).toBe(6); // 6 properties in ping response spec
      expect(result.validationTime).toBeGreaterThan(0);
    });

    test('should validate response with optional fields', () => {
      const response = {
        status: 'ok',
        echo: 'test message',
        timestamp: 1234567890,
        server_id: 'server-001',
        request_count: 42,
        metadata: { custom: 'data' }
      };

      const result = validator.validateCommandResponse(response, 'test', 'ping');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should fail validation for missing required fields', () => {
      const response = {
        status: 'ok',
        echo: 'test message'
        // Missing timestamp and server_id
      };

      const result = validator.validateCommandResponse(response, 'test', 'ping');

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors.map(e => e.field)).toContain('timestamp');
      expect(result.errors.map(e => e.field)).toContain('server_id');
      expect(result.errors.every(e => e.message.includes('Required field is missing'))).toBe(true);
    });

    test('should fail validation for incorrect types', () => {
      const response = {
        status: 123, // Should be string
        echo: true,  // Should be string
        timestamp: '1234567890', // Should be number
        server_id: null // Should be string, null not allowed for required field
      };

      const result = validator.validateCommandResponse(response, 'test', 'ping');

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(4);
      expect(result.errors.map(e => e.field)).toContain('status');
      expect(result.errors.map(e => e.field)).toContain('echo');
      expect(result.errors.map(e => e.field)).toContain('timestamp');
      expect(result.errors.map(e => e.field)).toContain('server_id');
    });
  });

  describe('Type-Specific Validation', () => {
    test('should validate string patterns', () => {
      const validResponse = {
        implementation: 'TypeScript',
        version: '1.2.3',
        protocol: 'SOCK_DGRAM'
      };

      const result = validator.validateCommandResponse(validResponse, 'test', 'get_info');
      expect(result.valid).toBe(true);

      const invalidResponse = {
        implementation: 'TypeScript',
        version: '1.2', // Invalid pattern - should be x.y.z
        protocol: 'SOCK_DGRAM'
      };

      const invalidResult = validator.validateCommandResponse(invalidResponse, 'test', 'get_info');
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors.some(e => e.field === 'version' && e.message.includes('pattern'))).toBe(true);
    });

    test('should validate enum values', () => {
      const validResponse = {
        implementation: 'TypeScript',
        version: '1.0.0',
        protocol: 'SOCK_DGRAM'
      };

      const result = validator.validateCommandResponse(validResponse, 'test', 'get_info');
      expect(result.valid).toBe(true);

      const invalidResponse = {
        implementation: 'TypeScript',
        version: '1.0.0',
        protocol: 'SOCK_STREAM' // Invalid enum value
      };

      const invalidResult = validator.validateCommandResponse(invalidResponse, 'test', 'get_info');
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors.some(e => e.field === 'protocol' && e.message.includes('enum'))).toBe(true);
    });

    test('should validate numeric ranges', () => {
      const validResponse = {
        score: 85.5,
        grade: 'B',
        count: 10
      };

      const result = validator.validateCommandResponse(validResponse, 'test', 'range_test');
      expect(result.valid).toBe(true);

      const invalidResponse = {
        score: 150, // > maximum of 100
        grade: 'X', // Invalid enum
        count: 0    // < minimum of 1
      };

      const invalidResult = validator.validateCommandResponse(invalidResponse, 'test', 'range_test');
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors).toHaveLength(3);
      expect(invalidResult.errors.some(e => e.field === 'score' && e.message.includes('too large'))).toBe(true);
      expect(invalidResult.errors.some(e => e.field === 'grade' && e.message.includes('enum'))).toBe(true);
      expect(invalidResult.errors.some(e => e.field === 'count' && e.message.includes('too small'))).toBe(true);
    });

    test('should validate integers vs numbers', () => {
      const validResponse = {
        score: 85.5,  // number is fine
        grade: 'B',
        count: 10     // integer is fine
      };

      const result = validator.validateCommandResponse(validResponse, 'test', 'range_test');
      expect(result.valid).toBe(true);

      const invalidResponse = {
        score: 85,
        grade: 'B',
        count: 10.5   // Should be integer, not float
      };

      const invalidResult = validator.validateCommandResponse(invalidResponse, 'test', 'range_test');
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors.some(e => e.field === 'count' && e.message.includes('integer'))).toBe(true);
    });

    test('should validate arrays', () => {
      const validResponse = {
        items: ['hello', 'world'],
        numbers: [1, 2, 3.5]
      };

      const result = validator.validateCommandResponse(validResponse, 'test', 'array_test');
      expect(result.valid).toBe(true);

      const invalidResponse = {
        items: ['', 'x'.repeat(100)], // Empty string and too long string
        numbers: [1, -5, 'not a number'] // Negative number and wrong type
      };

      const invalidResult = validator.validateCommandResponse(invalidResponse, 'test', 'array_test');
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors.length).toBeGreaterThan(0);
      expect(invalidResult.errors.some(e => e.field.includes('[0]') && e.message.includes('too short'))).toBe(true);
      expect(invalidResult.errors.some(e => e.field.includes('[1]') && e.message.includes('too long'))).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should handle missing channel', () => {
      const response = { status: 'ok' };

      const result = validator.validateCommandResponse(response, 'nonexistent', 'ping');

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.field).toBe('channelId');
      expect(result.errors[0]?.message).toContain('Channel \'nonexistent\' not found');
    });

    test('should handle missing command', () => {
      const response = { status: 'ok' };

      const result = validator.validateCommandResponse(response, 'test', 'nonexistent');

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.field).toBe('command');
      expect(result.errors[0]?.message).toContain('Command \'nonexistent\' not found');
    });

    test('should handle missing response specification', () => {
      // Add command without response specification
      testManifest.channels.test!.commands.no_response = {
        name: 'no_response',
        description: 'Command without response spec'
        // No response field
      };

      validator = new ResponseValidator(testManifest);
      const response = { status: 'ok' };

      const result = validator.validateCommandResponse(response, 'test', 'no_response');

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.field).toBe('response');
      expect(result.errors[0]?.message).toContain('No response specification defined');
    });

    test('should handle invalid regex patterns', () => {
      const invalidSpec: ResponseDefinition = {
        type: 'object',
        description: 'Test with invalid regex',
        properties: {
          test: { type: 'string', required: true, pattern: '[invalid regex', description: 'Test field' }
        }
      };

      const response = { test: 'hello' };
      const result = validator.validateResponse(response, invalidSpec);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('Invalid regex pattern'))).toBe(true);
    });
  });

  describe('Performance', () => {
    test('should complete validation within performance requirements', () => {
      const response = {
        status: 'ok',
        echo: 'test message',
        timestamp: 1234567890,
        server_id: 'server-001',
        request_count: 42,
        metadata: { custom: 'data', nested: { deep: 'value' } }
      };

      const result = validator.validateCommandResponse(response, 'test', 'ping');

      expect(result.valid).toBe(true);
      expect(result.validationTime).toBeLessThan(2); // Less than 2ms requirement
    });

    test('should handle large responses efficiently', () => {
      const largeResponse = {
        items: Array.from({ length: 1000 }, (_, i) => `item-${i}`),
        numbers: Array.from({ length: 1000 }, (_, i) => i)
      };

      const result = validator.validateCommandResponse(largeResponse, 'test', 'array_test');

      expect(result.valid).toBe(true);
      expect(result.validationTime).toBeLessThan(100); // Should handle large responses efficiently (relaxed for CI/test environments)
    });
  });

  describe('Static Methods', () => {
    test('should create missing specification error', () => {
      const result = ResponseValidator.createMissingSpecificationError('test', 'unknown');

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.field).toBe('specification');
      expect(result.errors[0]?.message).toContain('No response specification found');
      expect(result.fieldsValidated).toBe(0);
      expect(result.validationTime).toBe(0);
    });

    test('should create success result', () => {
      const result = ResponseValidator.createSuccessResult(5, 1.5);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.fieldsValidated).toBe(5);
      expect(result.validationTime).toBe(1.5);
    });
  });

  describe('Model References', () => {
    test('should handle model references', () => {
      // Add command that uses model reference
      testManifest.channels.test!.commands.user_info = {
        name: 'user_info',
        description: 'Get user information',
        response: {
          type: 'object',
          description: 'User info response',
          modelRef: 'UserInfo'
        }
      };

      validator = new ResponseValidator(testManifest);

      const validResponse = {
        id: 'user123',
        name: 'John Doe',
        age: 30
      };

      const result = validator.validateCommandResponse(validResponse, 'test', 'user_info');
      expect(result.valid).toBe(true);

      const invalidResponse = {
        id: 'user123',
        name: '', // Too short
        age: 200  // Too old
      };

      const invalidResult = validator.validateCommandResponse(invalidResponse, 'test', 'user_info');
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors.some(e => e.field === 'name')).toBe(true);
      expect(invalidResult.errors.some(e => e.field === 'age')).toBe(true);
    });

    test('should handle missing model reference', () => {
      testManifest.channels.test!.commands.bad_ref = {
        name: 'bad_ref',
        description: 'Command with bad model reference',
        response: {
          type: 'object',
          description: 'Response with bad model ref',
          modelRef: 'NonexistentModel'
        }
      };

      validator = new ResponseValidator(testManifest);

      const response = { data: 'test' };
      const result = validator.validateCommandResponse(response, 'test', 'bad_ref');

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('Model reference \'NonexistentModel\' not found'))).toBe(true);
    });
  });
});