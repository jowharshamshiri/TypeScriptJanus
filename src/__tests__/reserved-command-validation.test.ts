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
    
    expect(() => {
      parser.parseJSONString(JSON.stringify(invalidSpec));
    }).toThrow(/reserved.*ping/i);
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
        return e as Error;
      }
    })();
    
    expect(error).not.toBeNull();
    expect(error!.message.toLowerCase()).toMatch(/reserved.*(echo|get_info)/);
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
      
      expect(() => {
        parser.parseJSONString(JSON.stringify(invalidSpec));
      }).toThrow(new RegExp(`reserved.*${reservedCmd}`, 'i'));
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
    } catch (error: any) {
      expect(error).toBeInstanceOf(ManifestError);
      expect(error.message).toMatch(/spec.*reserved/i);
      expect(error.details).toMatch(/reserved commands/i);
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
    expect(() => {
      parser.parseJSONString(JSON.stringify(mixedSpec));
    }).toThrow(/ping.*reserved/i);
  });
});