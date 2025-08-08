/**
 * Tests for SecurityValidator
 */

import { SecurityValidator } from '../core/security-validator';

describe('SecurityValidator', () => {
  let validator: SecurityValidator;

  beforeEach(() => {
    validator = new SecurityValidator();
  });

  describe('validateSocketPath', () => {
    it('should accept valid socket paths', () => {
      const validPaths = [
        '/tmp/test.sock',
        '/var/run/myapp.sock',
        '/var/tmp/service-123.sock'
      ];

      for (const path of validPaths) {
        const result = validator.validateSocketPath(path);
        expect(result.valid).toBe(true);
      }
    });

    it('should reject paths that are too long', () => {
      const longPath = '/tmp/' + 'a'.repeat(200) + '.sock';
      const result = validator.validateSocketPath(longPath);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('PATH_TOO_LONG');
    });

    it('should reject empty paths', () => {
      const result = validator.validateSocketPath('');
      expect(result.valid).toBe(false);
      expect(result.code).toBe('EMPTY_PATH');
    });

    it('should reject paths with null bytes', () => {
      const result = validator.validateSocketPath('/tmp/test\x00.sock');
      expect(result.valid).toBe(false);
      expect(result.code).toBe('NULL_BYTE_INJECTION');
    });

    it('should reject path traversal attempts', () => {
      const result = validator.validateSocketPath('/tmp/../etc/passwd');
      expect(result.valid).toBe(false);
      expect(result.code).toBe('PATH_TRAVERSAL_ATTEMPT');
    });

    it('should reject paths with invalid characters', () => {
      const result = validator.validateSocketPath('/tmp/test<script>.sock');
      expect(result.valid).toBe(false);
      expect(result.code).toBe('INVALID_PATH_CHARACTERS');
    });

    it('should reject paths not in allowed directories', () => {
      const result = validator.validateSocketPath('/home/user/test.sock');
      expect(result.valid).toBe(false);
      expect(result.code).toBe('FORBIDDEN_DIRECTORY');
    });
  });

  describe('validateName', () => {
    it('should accept valid request names', () => {
      const validNames = ['user-service', 'auth_service', 'api123', 'test-channel', 'create-user', 'get_data', 'ping', 'test123'];
      
      for (const name of validNames) {
        const result = validator.validateName(name, 'request');
        expect(result.valid).toBe(true);
      }
    });

    it('should reject empty names', () => {
      const result = validator.validateName('', 'request');
      expect(result.valid).toBe(false);
      expect(result.code).toBe('EMPTY_NAME');
    });

    it('should reject names that are too long', () => {
      const longName = 'a'.repeat(300);
      const result = validator.validateName(longName, 'request');
      expect(result.valid).toBe(false);
      expect(result.code).toBe('NAME_TOO_LONG');
    });

    it('should reject names with invalid characters', () => {
      const invalidNames = ['test space', 'test@domain', 'test/path', 'test.dot'];
      
      for (const name of invalidNames) {
        const result = validator.validateName(name, 'request');
        expect(result.valid).toBe(false);
        expect(result.code).toBe('INVALID_NAME_CHARACTERS');
      }
    });

    it('should reject names with null bytes', () => {
      const result = validator.validateName('test\x00name', 'request');
      expect(result.valid).toBe(false);
      expect(result.code).toBe('NULL_BYTE_INJECTION');
    });
  });

  describe('validateTimeout', () => {
    it('should accept valid timeout values', () => {
      const validTimeouts = [0.1, 1.0, 30.0, 300.0];
      
      for (const timeout of validTimeouts) {
        const result = validator.validateTimeout(timeout);
        expect(result.valid).toBe(true);
      }
    });

    it('should reject timeout values that are too small', () => {
      const result = validator.validateTimeout(0.05);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('TIMEOUT_TOO_SMALL');
    });

    it('should reject timeout values that are too large', () => {
      const result = validator.validateTimeout(400.0);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('TIMEOUT_TOO_LARGE');
    });

    it('should reject infinite timeout values', () => {
      const result = validator.validateTimeout(Infinity);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('INVALID_TIMEOUT');
    });

    it('should reject NaN timeout values', () => {
      const result = validator.validateTimeout(NaN);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('INVALID_TIMEOUT');
    });
  });

  describe('validateUUID', () => {
    it('should accept valid UUIDs', () => {
      const validUUIDs = [
        '550e8400-e29b-41d4-a716-446655440000',
        '6ba7b810-9dad-41d1-80b4-00c04fd430c8', // Fixed version digit
        '12345678-1234-4234-a234-123456789012'
      ];
      
      for (const uuid of validUUIDs) {
        const result = validator.validateUUID(uuid);
        expect(result.valid).toBe(true);
      }
    });

    it('should reject invalid UUIDs', () => {
      const invalidUUIDs = [
        'not-a-uuid',
        '550e8400-e29b-41d4-a716',
        '550e8400-e29b-41d4-a716-446655440000-extra',
        '550e8400-e29b-51d4-a716-446655440000', // Invalid version
        ''
      ];
      
      for (const uuid of invalidUUIDs) {
        const result = validator.validateUUID(uuid);
        expect(result.valid).toBe(false);
        expect(result.code).toBe('INVALID_UUID');
      }
    });
  });

  describe('validateTimestamp', () => {
    it('should accept valid ISO 8601 timestamps', () => {
      const validTimestamps = [
        '2025-07-29T10:50:00.000Z',
        '2023-12-31T23:59:59.999Z',
        '2024-01-01T00:00:00.001Z'
      ];
      
      for (const timestamp of validTimestamps) {
        const result = validator.validateTimestamp(timestamp);
        expect(result.valid).toBe(true);
      }
    });

    it('should reject invalid timestamps', () => {
      const invalidTimestamps = [
        'not-a-date',
        '2025-07-29T10:50:00', // Missing milliseconds and Z
        '2025-13-01T10:50:00.000Z', // Invalid month
        '2025-07-32T10:50:00.000Z', // Invalid day
        ''
      ];
      
      for (const timestamp of invalidTimestamps) {
        const result = validator.validateTimestamp(timestamp);
        expect(result.valid).toBe(false);
        expect(result.code).toMatch(/INVALID_TIMESTAMP|TIMESTAMP_PARSE_ERROR/);
      }
    });
  });

  describe('validateRequest', () => {
    it('should accept valid requests', () => {
      const validRequest = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        channelId: 'user-service',
        request: 'create-user',
        args: { username: 'test', email: 'test@example.com' },
        timeout: 30.0,
        timestamp: '2025-07-29T10:50:00.000Z'
      };
      
      const result = validator.validateRequest(validRequest);
      expect(result.valid).toBe(true);
    });

    it('should reject requests missing required fields', () => {
      const invalidRequest = {
        channelId: 'user-service',
        request: 'create-user',
        timestamp: '2025-07-29T10:50:00.000Z'
        // Missing id
      };
      
      const result = validator.validateRequest(invalidRequest);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('MISSING_REQUIRED_FIELD');
    });

    it('should reject non-object requests', () => {
      const result = validator.validateRequest('not an object');
      expect(result.valid).toBe(false);
      expect(result.code).toBe('INVALID_REQUEST_TYPE');
    });

    it('should reject null requests', () => {
      const result = validator.validateRequest(null);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('INVALID_REQUEST_TYPE');
    });
  });

  describe('validateResponse', () => {
    it('should accept valid success responses', () => {
      const validResponse = {
        requestId: '550e8400-e29b-41d4-a716-446655440000',
        channelId: 'user-service',
        success: true,
        result: { userId: '123', status: 'created' },
        timestamp: '2025-07-29T10:50:01.000Z'
      };
      
      const result = validator.validateResponse(validResponse);
      expect(result.valid).toBe(true);
    });

    it('should accept valid error responses', () => {
      const validResponse = {
        requestId: '550e8400-e29b-41d4-a716-446655440000',
        channelId: 'user-service',
        success: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Invalid input'
        },
        timestamp: '2025-07-29T10:50:01.000Z'
      };
      
      const result = validator.validateResponse(validResponse);
      expect(result.valid).toBe(true);
    });

    it('should reject responses with both success=true and error field', () => {
      const invalidResponse = {
        requestId: '550e8400-e29b-41d4-a716-446655440000',
        channelId: 'user-service',
        success: true,
        result: { data: 'test' },
        error: { code: 'ERROR', message: 'Should not be here' },
        timestamp: '2025-07-29T10:50:01.000Z'
      };
      
      const result = validator.validateResponse(invalidResponse);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('CONFLICTING_SUCCESS_ERROR');
    });

    it('should reject failed responses without error field', () => {
      const invalidResponse = {
        requestId: '550e8400-e29b-41d4-a716-446655440000',
        channelId: 'user-service',
        success: false,
        timestamp: '2025-07-29T10:50:01.000Z'
        // Missing error field
      };
      
      const result = validator.validateResponse(invalidResponse);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('MISSING_ERROR_FIELD');
    });
  });
});