/**
 * Comprehensive tests for API Specification Parser
 * Tests match Swift implementation patterns for 100% parity
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { APISpecificationParser, APISpecificationError } from '../specification/api-specification-parser';
import { APISpecification } from '../types/protocol';

describe('APISpecificationParser', () => {
  let parser: APISpecificationParser;
  let tempDir: string;

  beforeEach(() => {
    parser = new APISpecificationParser();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'janus-spec-test-'));
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('JSON Parsing', () => {
    test('should parse valid JSON specification', () => {
      const validSpec = {
        version: '1.0.0',
        name: 'Test API',
        description: 'Test API specification',
        channels: {
          'test-channel': {
            name: 'Test Channel',
            description: 'Test channel description',
            commands: {
              'ping': {
                name: 'Ping',
                description: 'Test ping command',
                args: {
                  'message': {
                    name: 'Message',
                    type: 'string',
                    description: 'Test message',
                    required: true
                  }
                }
              }
            }
          }
        }
      };

      const result = parser.parseJSONString(JSON.stringify(validSpec));
      
      expect(result.version).toBe('1.0.0');
      expect(result.name).toBe('Test API');
      expect(result.channels['test-channel']).toBeDefined();
      expect(result.channels['test-channel']?.commands['ping']).toBeDefined();
    });

    test('should parse JSON from buffer', () => {
      const spec = {
        version: '1.0.0',
        channels: {
          'test': {
            commands: {
              'ping': {
                description: 'Test command'
              }
            }
          }
        }
      };

      const buffer = Buffer.from(JSON.stringify(spec), 'utf8');
      const result = parser.parseJSON(buffer);
      
      expect(result.version).toBe('1.0.0');
    });

    test('should throw on invalid JSON syntax', () => {
      const invalidJson = '{"version": "1.0.0", "channels": {';
      
      expect(() => parser.parseJSONString(invalidJson)).toThrow(APISpecificationError);
      expect(() => parser.parseJSONString(invalidJson)).toThrow('Invalid JSON format');
    });

    test('should throw on non-UTF8 buffer', () => {
      const invalidBuffer = Buffer.from([0xFF, 0xFE, 0x00, 0x7B]); // Invalid UTF-8
      
      expect(() => parser.parseJSON(invalidBuffer)).toThrow(APISpecificationError);
    });
  });

  describe('YAML Parsing', () => {
    test('should parse valid YAML specification', () => {
      const yamlSpec = `
version: "1.0.0"
name: "Test API"
channels:
  test-channel:
    name: "Test Channel"
    commands:
      ping:
        description: "Test ping command"
        args:
          message:
            type: string
            description: "Test message"
            required: true
`;

      const result = parser.parseYAMLString(yamlSpec);
      
      expect(result.version).toBe('1.0.0');
      expect(result.name).toBe('Test API');
      expect(result.channels['test-channel']).toBeDefined();
    });

    test('should parse YAML from buffer', () => {
      const yamlContent = 'version: "1.0.0"\nchannels:\n  test:\n    commands:\n      ping:\n        description: "Test"';
      const buffer = Buffer.from(yamlContent, 'utf8');
      
      const result = parser.parseYAML(buffer);
      expect(result.version).toBe('1.0.0');
    });

    test('should throw on invalid YAML syntax', () => {
      const invalidYaml = 'version: "1.0.0"\nchannels:\n  [invalid: yaml';
      
      expect(() => parser.parseYAMLString(invalidYaml)).toThrow(APISpecificationError);
      expect(() => parser.parseYAMLString(invalidYaml)).toThrow('YAML parsing failed');
    });
  });

  describe('File Parsing', () => {
    test('should parse JSON file', () => {
      const spec = {
        version: '1.0.0',
        channels: {
          'test': {
            commands: {
              'ping': {
                description: 'Test command'
              }
            }
          }
        }
      };

      const filePath = path.join(tempDir, 'test.json');
      fs.writeFileSync(filePath, JSON.stringify(spec));
      
      const result = parser.parseFromFile(filePath);
      expect(result.version).toBe('1.0.0');
    });

    test('should parse YAML file', () => {
      const yamlContent = 'version: "1.0.0"\nchannels:\n  test:\n    commands:\n      ping:\n        description: "Test"';
      const filePath = path.join(tempDir, 'test.yaml');
      fs.writeFileSync(filePath, yamlContent);
      
      const result = parser.parseFromFile(filePath);
      expect(result.version).toBe('1.0.0');
    });

    test('should parse YML file', () => {
      const yamlContent = 'version: "1.0.0"\nchannels:\n  test:\n    commands:\n      ping:\n        description: "Test"';
      const filePath = path.join(tempDir, 'test.yml');
      fs.writeFileSync(filePath, yamlContent);
      
      const result = parser.parseFromFile(filePath);
      expect(result.version).toBe('1.0.0');
    });

    test('should throw on unsupported file format', () => {
      const filePath = path.join(tempDir, 'test.txt');
      fs.writeFileSync(filePath, 'some content');
      
      expect(() => parser.parseFromFile(filePath)).toThrow(APISpecificationError);
      expect(() => parser.parseFromFile(filePath)).toThrow('Unsupported file format');
    });

    test('should throw on non-existent file', () => {
      const nonExistentPath = path.join(tempDir, 'non-existent.json');
      
      expect(() => parser.parseFromFile(nonExistentPath)).toThrow(APISpecificationError);
      expect(() => parser.parseFromFile(nonExistentPath)).toThrow('Failed to read file');
    });
  });

  describe('Specification Validation', () => {
    test('should validate valid specification', () => {
      const validSpec: APISpecification = {
        version: '1.0.0',
        name: 'Test API',
        channels: {
          'test-channel': {
            name: 'Test Channel',
            commands: {
              'ping': {
                name: 'Ping',
                description: 'Test ping command'
              }
            }
          }
        }
      };

      expect(() => APISpecificationParser.validate(validSpec)).not.toThrow();
    });

    test('should throw on empty version', () => {
      const spec: APISpecification = {
        version: '',
        channels: {
          'test': {
            commands: {
              'ping': {
                description: 'Test'
              }
            }
          }
        }
      };

      expect(() => APISpecificationParser.validate(spec)).toThrow('API version cannot be empty');
    });

    test('should throw on missing version', () => {
      const spec = {
        channels: {
          'test': {
            commands: {
              'ping': {
                description: 'Test'
              }
            }
          }
        }
      } as any as APISpecification;

      expect(() => APISpecificationParser.validate(spec)).toThrow('API version cannot be empty');
    });

    test('should throw on empty channels', () => {
      const spec: APISpecification = {
        version: '1.0.0',
        channels: {}
      };

      expect(() => APISpecificationParser.validate(spec)).toThrow('API must define at least one channel');
    });

    test('should throw on missing channels', () => {
      const spec = {
        version: '1.0.0'
      } as APISpecification;

      expect(() => APISpecificationParser.validate(spec)).toThrow('API must define at least one channel');
    });

    test('should throw on empty channel ID', () => {
      const spec: APISpecification = {
        version: '1.0.0',
        channels: {
          '': {
            commands: {
              'ping': {
                description: 'Test'
              }
            }
          }
        }
      };

      expect(() => APISpecificationParser.validate(spec)).toThrow('Channel ID cannot be empty');
    });

    test('should throw on empty commands in channel', () => {
      const spec: APISpecification = {
        version: '1.0.0',
        channels: {
          'test-channel': {
            commands: {}
          }
        }
      };

      expect(() => APISpecificationParser.validate(spec)).toThrow('must define at least one command');
    });

    test('should throw on empty command name', () => {
      const spec: APISpecification = {
        version: '1.0.0',
        channels: {
          'test-channel': {
            commands: {
              '': {
                description: 'Test'
              }
            }
          }
        }
      };

      expect(() => APISpecificationParser.validate(spec)).toThrow('Command name cannot be empty');
    });

    test('should throw on missing command description', () => {
      const spec: APISpecification = {
        version: '1.0.0',
        channels: {
          'test-channel': {
            commands: {
              'ping': {
                name: 'Ping'
              } as any
            }
          }
        }
      };

      expect(() => APISpecificationParser.validate(spec)).toThrow('must have a description');
    });

    test('should throw on empty command description', () => {
      const spec: APISpecification = {
        version: '1.0.0',
        channels: {
          'test-channel': {
            commands: {
              'ping': {
                description: ''
              }
            }
          }
        }
      };

      expect(() => APISpecificationParser.validate(spec)).toThrow('must have a description');
    });
  });

  describe('Argument Validation', () => {
    test('should validate string arguments with pattern', () => {
      const spec: APISpecification = {
        version: '1.0.0',
        channels: {
          'test': {
            commands: {
              'validate': {
                description: 'Test validation',
                args: {
                  'email': {
                    type: 'string',
                    description: 'Email address',
                    pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$'
                  }
                }
              }
            }
          }
        }
      };

      expect(() => APISpecificationParser.validate(spec)).not.toThrow();
    });

    test('should throw on invalid regex pattern', () => {
      const spec: APISpecification = {
        version: '1.0.0',
        channels: {
          'test': {
            commands: {
              'validate': {
                description: 'Test validation',
                args: {
                  'field': {
                    type: 'string',
                    description: 'Test field',
                    pattern: '[invalid regex'
                  }
                }
              }
            }
          }
        }
      };

      expect(() => APISpecificationParser.validate(spec)).toThrow('Invalid regex pattern');
    });

    test('should throw on invalid argument type', () => {
      const spec: APISpecification = {
        version: '1.0.0',
        channels: {
          'test': {
            commands: {
              'test': {
                description: 'Test command',
                args: {
                  'field': {
                    type: 'invalid-type' as any,
                    description: 'Test field'
                  }
                }
              }
            }
          }
        }
      };

      expect(() => APISpecificationParser.validate(spec)).toThrow('Invalid argument type');
    });

    test('should throw on invalid numeric constraints', () => {
      const spec: APISpecification = {
        version: '1.0.0',
        channels: {
          'test': {
            commands: {
              'test': {
                description: 'Test command',
                args: {
                  'number': {
                    type: 'number',
                    description: 'Test number',
                    minimum: 10,
                    maximum: 5
                  }
                }
              }
            }
          }
        }
      };

      expect(() => APISpecificationParser.validate(spec)).toThrow('Invalid numeric constraints');
    });

    test('should throw on invalid model reference', () => {
      const spec: APISpecification = {
        version: '1.0.0',
        channels: {
          'test': {
            commands: {
              'test': {
                description: 'Test command',
                args: {
                  'data': {
                    type: 'object',
                    description: 'Test data',
                    modelRef: 'NonExistentModel'
                  }
                }
              }
            }
          }
        },
        models: {
          'ExistingModel': {
            name: 'Existing Model',
            type: 'object',
            description: 'An existing model'
          }
        }
      };

      expect(() => APISpecificationParser.validate(spec)).toThrow('Model reference \'NonExistentModel\' not found');
    });

    test('should validate nested array items', () => {
      const spec: APISpecification = {
        version: '1.0.0',
        channels: {
          'test': {
            commands: {
              'test': {
                description: 'Test command',
                args: {
                  'list': {
                    type: 'array',
                    description: 'Test list',
                    items: {
                      type: 'string',
                      description: 'String item'
                    }
                  }
                }
              }
            }
          }
        }
      };

      expect(() => APISpecificationParser.validate(spec)).not.toThrow();
    });

    test('should validate nested object properties', () => {
      const spec: APISpecification = {
        version: '1.0.0',
        channels: {
          'test': {
            commands: {
              'test': {
                description: 'Test command',
                args: {
                  'config': {
                    type: 'object',
                    description: 'Configuration object',
                    properties: {
                      'enabled': {
                        type: 'boolean',
                        description: 'Enable flag'
                      },
                      'count': {
                        type: 'integer',
                        description: 'Count value'
                      }
                    }
                  }
                }
              }
            }
          }
        }
      };

      expect(() => APISpecificationParser.validate(spec)).not.toThrow();
    });

    test('should throw on empty argument name', () => {
      const spec: APISpecification = {
        version: '1.0.0',
        channels: {
          'test': {
            commands: {
              'test': {
                description: 'Test command',
                args: {
                  '': {
                    type: 'string',
                    description: 'Empty name argument'
                  }
                }
              }
            }
          }
        }
      };

      expect(() => APISpecificationParser.validate(spec)).toThrow('Argument name cannot be empty');
    });
  });

  describe('Response Validation', () => {
    test('should validate response definition', () => {
      const spec: APISpecification = {
        version: '1.0.0',
        channels: {
          'test': {
            commands: {
              'get-data': {
                description: 'Get data',
                response: {
                  type: 'object',
                  description: 'Data response',
                  properties: {
                    'id': {
                      type: 'string',
                      description: 'Data ID'
                    }
                  }
                }
              }
            }
          }
        }
      };

      expect(() => APISpecificationParser.validate(spec)).not.toThrow();
    });

    test('should throw on invalid response type', () => {
      const spec: APISpecification = {
        version: '1.0.0',
        channels: {
          'test': {
            commands: {
              'test': {
                description: 'Test command',
                response: {
                  type: 'invalid-type' as any,
                  description: 'Invalid response'
                }
              }
            }
          }
        }
      };

      expect(() => APISpecificationParser.validate(spec)).toThrow('Invalid response type');
    });

    test('should throw on invalid response model reference', () => {
      const spec: APISpecification = {
        version: '1.0.0',
        channels: {
          'test': {
            commands: {
              'test': {
                description: 'Test command',
                response: {
                  type: 'object',
                  description: 'Test response',
                  modelRef: 'NonExistentModel'
                }
              }
            }
          }
        },
        models: {}
      };

      expect(() => APISpecificationParser.validate(spec)).toThrow('Model reference \'NonExistentModel\' not found');
    });
  });

  describe('Error Handling', () => {
    test('should create APISpecificationError with details', () => {
      const error = new APISpecificationError('Test error', 'Test details');
      
      expect(error.name).toBe('APISpecificationError');
      expect(error.message).toBe('Test error');
      expect(error.details).toBe('Test details');
      expect(error instanceof Error).toBe(true);
    });

    test('should create APISpecificationError without details', () => {
      const error = new APISpecificationError('Test error');
      
      expect(error.details).toBeUndefined();
    });
  });
});