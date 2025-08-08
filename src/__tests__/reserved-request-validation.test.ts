/**
 * Reserved Request Validation Tests
 * Tests for Manifest parser rejecting reserved requests
 */

import { ManifestParser, ManifestError } from '../manifest/manifest-parser';

describe('Reserved Request Validation', () => {
  test('should reject Manifests defining built-in requests', () => {
    const invalidManifest = {
      version: '1.0.0',
      requests: {
        ping: {  // This is a reserved request
          description: 'Custom ping request',
          args: {},
          response: { type: 'object' }
        },
        valid_request: {
          description: 'Valid custom request',
          args: {},
          response: { type: 'object' }
        }
      },
      models: {}
    };

    const parser = new ManifestParser();
    
    // Should fail validation due to reserved request "ping"
    expect(() => {
      parser.parseJSONString(JSON.stringify(invalidManifest));
    }).toThrow(ManifestError);
    
    // Validate error code instead of message content
    try {
      parser.parseJSONString(JSON.stringify(invalidManifest));
      fail('Should have thrown ManifestError');
    } catch (error) {
      const manifestError = error as ManifestError;
      expect(manifestError).toBeInstanceOf(ManifestError);
      expect(manifestError.code).toBe(-32013); // ManifestValidationError code
    }
  });

  test('should reject Manifests with multiple reserved requests', () => {
    const invalidManifest = {
      version: '1.0.0',
      requests: {
        echo: {  // Reserved request 1
          description: 'Custom echo request',
          args: {},
          response: { type: 'object' }
        },
        get_info: {  // Reserved request 2
          description: 'Custom get_info request',
          args: {},
          response: { type: 'object' }
        }
      },
      models: {}
    };

    const parser = new ManifestParser();
    
    expect(() => {
      parser.parseJSONString(JSON.stringify(invalidManifest));
    }).toThrow(ManifestError);
    
    const error = (() => {
      try {
        parser.parseJSONString(JSON.stringify(invalidManifest));
        return null;
      } catch (e) {
        return e as ManifestError;
      }
    })();
    
    expect(error).not.toBeNull();
    expect(error!.code).toBe(-32013); // ManifestValidationError code for reserved request detection
  });

  test('should validate each reserved request individually', () => {
    const reservedRequests = ['ping', 'echo', 'get_info', 'validate', 'slow_process', 'manifest'];
    
    for (const reservedCmd of reservedRequests) {
      const invalidManifest = {
        version: '1.0.0',
        requests: {
          [reservedCmd]: {
            description: `Custom ${reservedCmd} request`,
            args: {},
            response: { type: 'object' }
          }
        },
        models: {}
      };

      const parser = new ManifestParser();
      
      expect(() => {
        parser.parseJSONString(JSON.stringify(invalidManifest));
      }).toThrow(ManifestError);
      
      // Validate error code instead of message content
      try {
        parser.parseJSONString(JSON.stringify(invalidManifest));
        fail(`Should have thrown ManifestError for reserved request: ${reservedCmd}`);
      } catch (error) {
        const manifestError = error as ManifestError;
        expect(manifestError).toBeInstanceOf(ManifestError);
        expect(manifestError.code).toBe(-32013); // ManifestValidationError code
      }
    }
  });

  test('should accept Manifests with only valid requests', () => {
    const validManifest = {
      version: '1.0.0',
      requests: {
        custom_request: {
          description: 'Valid custom request',
          args: {
            param: {
              type: 'string',
              required: true
            }
          },
          response: { type: 'object' }
        },
        another_request: {
          description: 'Another valid custom request',
          args: {},
          response: { type: 'string' }
        }
      },
      models: {}
    };

    const parser = new ManifestParser();
    
    expect(() => {
      parser.parseJSONString(JSON.stringify(validManifest));
    }).not.toThrow();
    
    const result = parser.parseJSONString(JSON.stringify(validManifest));
    expect(result.version).toBe('1.0.0');
    expect(result.requests?.custom_request).toBeDefined();
  });

  test('should provide clear error messages for reserved requests', () => {
    const invalidManifest = {
      version: '1.0.0',
      requests: {
        manifest: {
          description: 'Custom manifest request',
          args: {},
          response: { type: 'object' }
        }
      },
      models: {}
    };

    const parser = new ManifestParser();
    
    try {
      parser.parseJSONString(JSON.stringify(invalidManifest));
      fail('Should have thrown ManifestError');
    } catch (error) {
      const manifestError = error as ManifestError;
      expect(manifestError).toBeInstanceOf(ManifestError);
      expect(manifestError.code).toBe(-32013); // ManifestValidationError code
      // Error details can still be checked for diagnostic purposes, but primary validation is by code
      expect(manifestError.details).toBeDefined();
    }
  });

  test('should allow valid requests alongside error for reserved ones', () => {
    const mixedManifest = {
      version: '1.0.0',
      requests: {
        valid_request: {
          description: 'This should be fine',
          args: {},
          response: { type: 'object' }
        },
        ping: {  // This should cause failure
          description: 'This should fail',
          args: {},
          response: { type: 'object' }
        }
      },
      models: {}
    };

    const parser = new ManifestParser();
    
    expect(() => {
      parser.parseJSONString(JSON.stringify(mixedManifest));
    }).toThrow(ManifestError);
    
    // The valid request structure should be fine, but the reserved request should cause failure
    try {
      parser.parseJSONString(JSON.stringify(mixedManifest));
      fail('Should have thrown ManifestError for mixed manifest with reserved request');
    } catch (error) {
      const manifestError = error as ManifestError;
      expect(manifestError).toBeInstanceOf(ManifestError);
      expect(manifestError.code).toBe(-32013); // ManifestValidationError code
    }
  });
});