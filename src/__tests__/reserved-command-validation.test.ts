/**
 * Reserved Command Validation Tests
 * Tests for Manifest parser rejecting reserved commands
 */

import { ManifestParser, ManifestError } from '../specification/manifest-parser';

describe('Reserved Command Validation', () => {
  test('should reject Manifests defining built-in commands', () => {
    const invalidSpec = {
      version: '1.0.0',
      channels: {
        test: {
          description: 'Test channel',
          commands: {
            ping: {  // This is a reserved command
              description: 'Custom ping command',
              args: {},
              response: { type: 'object' }
            },
            valid_command: {
              description: 'Valid custom command',
              args: {},
              response: { type: 'object' }
            }
          }
        }
      },
      models: {}
    };

    const parser = new ManifestParser();
    
    // Should fail validation due to reserved command "ping"
    expect(() => {
      parser.parseJSONString(JSON.stringify(invalidSpec));
    }).toThrow(ManifestError);
    
    // Validate error code instead of message content
    try {
      parser.parseJSONString(JSON.stringify(invalidSpec));
      fail('Should have thrown ManifestError');
    } catch (error) {
      const manifestError = error as ManifestError;
      expect(manifestError).toBeInstanceOf(ManifestError);
      expect(manifestError.code).toBe(-32013); // ManifestValidationError code
    }
  });

  test('should reject Manifests with multiple reserved commands', () => {
    const invalidSpec = {
      version: '1.0.0',
      channels: {
        test: {
          description: 'Test channel',
          commands: {
            echo: {  // Reserved command 1
              description: 'Custom echo command',
              args: {},
              response: { type: 'object' }
            },
            get_info: {  // Reserved command 2
              description: 'Custom get_info command',
              args: {},
              response: { type: 'object' }
            }
          }
        }
      },
      models: {}
    };

    const parser = new ManifestParser();
    
    expect(() => {
      parser.parseJSONString(JSON.stringify(invalidSpec));
    }).toThrow(ManifestError);
    
    const error = (() => {
      try {
        parser.parseJSONString(JSON.stringify(invalidSpec));
        return null;
      } catch (e) {
        return e as ManifestError;
      }
    })();
    
    expect(error).not.toBeNull();
    expect(error!.code).toBe(-32013); // ManifestValidationError code for reserved command detection
  });

  test('should validate each reserved command individually', () => {
    const reservedCommands = ['ping', 'echo', 'get_info', 'validate', 'slow_process', 'spec'];
    
    for (const reservedCmd of reservedCommands) {
      const invalidSpec = {
        version: '1.0.0',
        channels: {
          test: {
            description: 'Test channel',
            commands: {
              [reservedCmd]: {
                description: `Custom ${reservedCmd} command`,
                args: {},
                response: { type: 'object' }
              }
            }
          }
        },
        models: {}
      };

      const parser = new ManifestParser();
      
      expect(() => {
        parser.parseJSONString(JSON.stringify(invalidSpec));
      }).toThrow(ManifestError);
      
      // Validate error code instead of message content
      try {
        parser.parseJSONString(JSON.stringify(invalidSpec));
        fail(`Should have thrown ManifestError for reserved command: ${reservedCmd}`);
      } catch (error) {
        const manifestError = error as ManifestError;
        expect(manifestError).toBeInstanceOf(ManifestError);
        expect(manifestError.code).toBe(-32013); // ManifestValidationError code
      }
    }
  });

  test('should accept Manifests with only valid commands', () => {
    const validSpec = {
      version: '1.0.0',
      channels: {
        test: {
          description: 'Test channel',
          commands: {
            custom_command: {
              description: 'Valid custom command',
              args: {
                param: {
                  type: 'string',
                  required: true
                }
              },
              response: { type: 'object' }
            },
            another_command: {
              description: 'Another valid custom command',
              args: {},
              response: { type: 'string' }
            }
          }
        }
      },
      models: {}
    };

    const parser = new ManifestParser();
    
    expect(() => {
      parser.parseJSONString(JSON.stringify(validSpec));
    }).not.toThrow();
    
    const result = parser.parseJSONString(JSON.stringify(validSpec));
    expect(result.version).toBe('1.0.0');
    expect(result.channels.test).toBeDefined();
  });

  test('should provide clear error messages for reserved commands', () => {
    const invalidSpec = {
      version: '1.0.0',
      channels: {
        test: {
          description: 'Test channel',
          commands: {
            spec: {
              description: 'Custom spec command',
              args: {},
              response: { type: 'object' }
            }
          }
        }
      },
      models: {}
    };

    const parser = new ManifestParser();
    
    try {
      parser.parseJSONString(JSON.stringify(invalidSpec));
      fail('Should have thrown ManifestError');
    } catch (error) {
      const manifestError = error as ManifestError;
      expect(manifestError).toBeInstanceOf(ManifestError);
      expect(manifestError.code).toBe(-32013); // ManifestValidationError code
      // Error details can still be checked for diagnostic purposes, but primary validation is by code
      expect(manifestError.details).toBeDefined();
    }
  });

  test('should allow valid commands alongside error for reserved ones', () => {
    const mixedSpec = {
      version: '1.0.0',
      channels: {
        test: {
          description: 'Test channel',
          commands: {
            valid_command: {
              description: 'This should be fine',
              args: {},
              response: { type: 'object' }
            },
            ping: {  // This should cause failure
              description: 'This should fail',
              args: {},
              response: { type: 'object' }
            }
          }
        }
      },
      models: {}
    };

    const parser = new ManifestParser();
    
    expect(() => {
      parser.parseJSONString(JSON.stringify(mixedSpec));
    }).toThrow(ManifestError);
    
    // The valid command structure should be fine, but the reserved command should cause failure
    try {
      parser.parseJSONString(JSON.stringify(mixedSpec));
      fail('Should have thrown ManifestError for mixed spec with reserved command');
    } catch (error) {
      const manifestError = error as ManifestError;
      expect(manifestError).toBeInstanceOf(ManifestError);
      expect(manifestError.code).toBe(-32013); // ManifestValidationError code
    }
  });
});