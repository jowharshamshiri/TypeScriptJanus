/**
 * Comprehensive tests for Manifest Parser
 * Tests match Swift implementation patterns for 100% parity
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ManifestParser, ManifestError } from '../specification/manifest-parser';
import { Manifest } from '../types/protocol';

describe('ManifestParser', () => {
  let parser: ManifestParser;
  let tempDir: string;

  beforeEach(() => {
    parser = new ManifestParser();
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
        description: 'Test Manifest',
        channels: {
          'test-channel': {
            name: 'Test Channel',
            description: 'Test channel description',
            commands: {
              'test_command': {
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
      expect(result.channels['test-channel']?.commands['test_command']).toBeDefined();
    });

    test('should parse JSON from buffer', () => {
      const spec = {
        version: '1.0.0',
        channels: {
          'test': {
            commands: {
              'test_command': {
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
      
      expect(() => parser.parseJSONString(invalidJson)).toThrow(ManifestError);
      expect(() => parser.parseJSONString(invalidJson)).toThrow('Invalid JSON format');
    });

    test('should throw on non-UTF8 buffer', () => {
      const invalidBuffer = Buffer.from([0xFF, 0xFE, 0x00, 0x7B]); // Invalid UTF-8
      
      expect(() => parser.parseJSON(invalidBuffer)).toThrow(ManifestError);
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
      test_command:
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
      const yamlContent = 'version: "1.0.0"\nchannels:\n  test:\n    commands:\n      test_command:\n        description: "Test"';
      const buffer = Buffer.from(yamlContent, 'utf8');
      
      const result = parser.parseYAML(buffer);
      expect(result.version).toBe('1.0.0');
    });

    test('should throw on invalid YAML syntax', () => {
      const invalidYaml = 'version: "1.0.0"\nchannels:\n  [invalid: yaml';
      
      expect(() => parser.parseYAMLString(invalidYaml)).toThrow(ManifestError);
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
              'test_command': {
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
      const yamlContent = 'version: "1.0.0"\nchannels:\n  test:\n    commands:\n      test_command:\n        description: "Test"';
      const filePath = path.join(tempDir, 'test.yaml');
      fs.writeFileSync(filePath, yamlContent);
      
      const result = parser.parseFromFile(filePath);
      expect(result.version).toBe('1.0.0');
    });

    test('should parse YML file', () => {
      const yamlContent = 'version: "1.0.0"\nchannels:\n  test:\n    commands:\n      test_command:\n        description: "Test"';
      const filePath = path.join(tempDir, 'test.yml');
      fs.writeFileSync(filePath, yamlContent);
      
      const result = parser.parseFromFile(filePath);
      expect(result.version).toBe('1.0.0');
    });

    test('should throw on unsupported file format', () => {
      const filePath = path.join(tempDir, 'test.txt');
      fs.writeFileSync(filePath, 'some content');
      
      expect(() => parser.parseFromFile(filePath)).toThrow(ManifestError);
      expect(() => parser.parseFromFile(filePath)).toThrow('Unsupported file format');
    });

    test('should throw on non-existent file', () => {
      const nonExistentPath = path.join(tempDir, 'non-existent.json');
      
      expect(() => parser.parseFromFile(nonExistentPath)).toThrow(ManifestError);
      expect(() => parser.parseFromFile(nonExistentPath)).toThrow('Failed to read file');
    });
  });

  describe('Specification Validation', () => {
    test('should validate valid specification', () => {
      const validSpec: Manifest = {
        version: '1.0.0',
        name: 'Test API',
        channels: {
          'test-channel': {
            name: 'Test Channel',
            commands: {
              'test_command': {
                name: 'Ping',
                description: 'Test ping command'
              }
            }
          }
        }
      };

      expect(() => ManifestParser.validate(validSpec)).not.toThrow();
    });

    test('should throw on empty version', () => {
      const spec: Manifest = {
        version: '',
        channels: {
          'test': {
            commands: {
              'test_command': {
                description: 'Test'
              }
            }
          }
        }
      };

      expect(() => ManifestParser.validate(spec)).toThrow('API version cannot be empty');
    });

    test('should throw on missing version', () => {
      const spec = {
        channels: {
          'test': {
            commands: {
              'test_command': {
                description: 'Test'
              }
            }
          }
        }
      } as any as Manifest;

      expect(() => ManifestParser.validate(spec)).toThrow('API version cannot be empty');
    });

    test('should throw on empty channels', () => {
      const spec: Manifest = {
        version: '1.0.0',
        channels: {}
      };

      expect(() => ManifestParser.validate(spec)).toThrow('API must define at least one channel');
    });

    test('should throw on missing channels', () => {
      const spec = {
        version: '1.0.0'
      } as Manifest;

      expect(() => ManifestParser.validate(spec)).toThrow('API must define at least one channel');
    });

    test('should throw on empty channel ID', () => {
      const spec: Manifest = {
        version: '1.0.0',
        channels: {
          '': {
            commands: {
              'test_command': {
                description: 'Test'
              }
            }
          }
        }
      };

      expect(() => ManifestParser.validate(spec)).toThrow('Channel ID cannot be empty');
    });

    test('should throw on empty commands in channel', () => {
      const spec: Manifest = {
        version: '1.0.0',
        channels: {
          'test-channel': {
            commands: {}
          }
        }
      };

      expect(() => ManifestParser.validate(spec)).toThrow('must define at least one command');
    });

    test('should throw on empty command name', () => {
      const spec: Manifest = {
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

      expect(() => ManifestParser.validate(spec)).toThrow('Command name cannot be empty');
    });

    test('should throw on missing command description', () => {
      const spec: Manifest = {
        version: '1.0.0',
        channels: {
          'test-channel': {
            commands: {
              'test_command': {
                name: 'Ping'
              } as any
            }
          }
        }
      };

      expect(() => ManifestParser.validate(spec)).toThrow('must have a description');
    });

    test('should throw on empty command description', () => {
      const spec: Manifest = {
        version: '1.0.0',
        channels: {
          'test-channel': {
            commands: {
              'test_command': {
                description: ''
              }
            }
          }
        }
      };

      expect(() => ManifestParser.validate(spec)).toThrow('must have a description');
    });
  });

  describe('Argument Validation', () => {
    test('should validate string arguments with pattern', () => {
      const spec: Manifest = {
        version: '1.0.0',
        channels: {
          'test': {
            commands: {
              'validate_data': {
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

      expect(() => ManifestParser.validate(spec)).not.toThrow();
    });

    test('should throw on invalid regex pattern', () => {
      const spec: Manifest = {
        version: '1.0.0',
        channels: {
          'test': {
            commands: {
              'validate_data': {
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

      expect(() => ManifestParser.validate(spec)).toThrow('Invalid regex pattern');
    });

    test('should throw on invalid argument type', () => {
      const spec: Manifest = {
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

      expect(() => ManifestParser.validate(spec)).toThrow('Invalid argument type');
    });

    test('should throw on invalid numeric constraints', () => {
      const spec: Manifest = {
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

      expect(() => ManifestParser.validate(spec)).toThrow('Invalid numeric constraints');
    });

    test('should throw on invalid model reference', () => {
      const spec: Manifest = {
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

      expect(() => ManifestParser.validate(spec)).toThrow('Model reference \'NonExistentModel\' not found');
    });

    test('should validate nested array items', () => {
      const spec: Manifest = {
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

      expect(() => ManifestParser.validate(spec)).not.toThrow();
    });

    test('should validate nested object properties', () => {
      const spec: Manifest = {
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

      expect(() => ManifestParser.validate(spec)).not.toThrow();
    });

    test('should throw on empty argument name', () => {
      const spec: Manifest = {
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

      expect(() => ManifestParser.validate(spec)).toThrow('Argument name cannot be empty');
    });
  });

  describe('Response Validation', () => {
    test('should validate response definition', () => {
      const spec: Manifest = {
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

      expect(() => ManifestParser.validate(spec)).not.toThrow();
    });

    test('should throw on invalid response type', () => {
      const spec: Manifest = {
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

      expect(() => ManifestParser.validate(spec)).toThrow('Invalid response type');
    });

    test('should throw on invalid response model reference', () => {
      const spec: Manifest = {
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

      expect(() => ManifestParser.validate(spec)).toThrow('Model reference \'NonExistentModel\' not found');
    });
  });

  describe('Multi-File Parsing', () => {
    test('should parse and merge multiple files', () => {
      // Create first spec file
      const spec1 = {
        version: '1.0.0',
        name: 'Base API',
        channels: {
          'base': {
            description: 'Base channel',
            commands: {
              'base_cmd': {
                description: 'Base command'
              }
            }
          }
        }
      };

      const spec2 = {
        version: '1.0.0',
        name: 'Extension API',
        channels: {
          'extension': {
            description: 'Extension channel',
            commands: {
              'ext_cmd': {
                description: 'Extension command'
              }
            }
          }
        },
        models: {
          'ExtModel': {
            name: 'Extension Model',
            type: 'object',
            description: 'Extension model'
          }
        }
      };

      const file1 = path.join(tempDir, 'base.json');
      const file2 = path.join(tempDir, 'extension.json');

      fs.writeFileSync(file1, JSON.stringify(spec1, null, 2));
      fs.writeFileSync(file2, JSON.stringify(spec2, null, 2));

      const merged = parser.parseMultipleFiles([file1, file2]);

      expect(merged.channels).toHaveProperty('base');
      expect(merged.channels).toHaveProperty('extension');
      expect(merged.models).toHaveProperty('ExtModel');
      expect(merged.channels['base']?.commands).toHaveProperty('base_cmd');
      expect(merged.channels['extension']?.commands).toHaveProperty('ext_cmd');
    });

    test('should throw on duplicate channel names', () => {
      const spec1 = {
        version: '1.0.0',
        channels: {
          'shared': {
            description: 'First shared channel',
            commands: {
              'cmd1': { description: 'Command 1' }
            }
          }
        }
      };

      const spec2 = {
        version: '1.0.0',
        channels: {
          'shared': {
            description: 'Second shared channel',
            commands: {
              'cmd2': { description: 'Command 2' }
            }
          }
        }
      };

      const file1 = path.join(tempDir, 'spec1.json');
      const file2 = path.join(tempDir, 'spec2.json');

      fs.writeFileSync(file1, JSON.stringify(spec1, null, 2));
      fs.writeFileSync(file2, JSON.stringify(spec2, null, 2));

      expect(() => parser.parseMultipleFiles([file1, file2]))
        .toThrow("Channel 'shared' already exists in base specification");
    });

    test('should throw on duplicate model names', () => {
      const spec1 = {
        version: '1.0.0',
        channels: {
          'ch1': {
            description: 'Channel 1',
            commands: {
              'cmd1': { description: 'Command 1' }
            }
          }
        },
        models: {
          'SharedModel': {
            name: 'First Shared Model',
            type: 'object',
            description: 'First model'
          }
        }
      };

      const spec2 = {
        version: '1.0.0',
        channels: {
          'ch2': {
            description: 'Channel 2',
            commands: {
              'cmd2': { description: 'Command 2' }
            }
          }
        },
        models: {
          'SharedModel': {
            name: 'Second Shared Model',
            type: 'object',
            description: 'Second model'
          }
        }
      };

      const file1 = path.join(tempDir, 'spec1.json');
      const file2 = path.join(tempDir, 'spec2.json');

      fs.writeFileSync(file1, JSON.stringify(spec1, null, 2));
      fs.writeFileSync(file2, JSON.stringify(spec2, null, 2));

      expect(() => parser.parseMultipleFiles([file1, file2]))
        .toThrow("Model 'SharedModel' already exists in base specification");
    });

    test('should throw on empty file list', () => {
      expect(() => parser.parseMultipleFiles([]))
        .toThrow('No files provided');
    });
  });

  describe('Serialization', () => {
    const testSpec: Manifest = {
      version: '1.0.0',
      name: 'Test API',
      description: 'Test serialization',
      channels: {
        'test': {
          description: 'Test channel',
          commands: {
            'test_cmd': {
              description: 'Test command',
              args: {
                'message': {
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

    test('should serialize to compact JSON', () => {
      const json = parser.serializeToJSON(testSpec, false);
      
      expect(typeof json).toBe('string');
      expect(JSON.parse(json)).toEqual(testSpec);
      expect(json.includes('\n')).toBe(false); // Compact format
    });

    test('should serialize to pretty JSON', () => {
      const json = parser.serializeToJSON(testSpec, true);
      
      expect(typeof json).toBe('string');
      expect(JSON.parse(json)).toEqual(testSpec);
      expect(json.includes('\n')).toBe(true); // Pretty format
    });

    test('should serialize to YAML', () => {
      const yaml = parser.serializeToYAML(testSpec);
      
      expect(typeof yaml).toBe('string');
      expect(yaml.includes('version: 1.0.0')).toBe(true);
      expect(yaml.includes('channels:')).toBe(true);
    });

    test('should validate before serialization', () => {
      const invalidSpec = {
        version: '',
        channels: {}
      } as Manifest;

      expect(() => parser.serializeToJSON(invalidSpec))
        .toThrow('API version cannot be empty');
      
      expect(() => parser.serializeToYAML(invalidSpec))
        .toThrow('API version cannot be empty');
    });
  });

  describe('Static Interface Methods', () => {
    test('should provide static parseJSON method', () => {
      const spec = {
        version: '1.0.0',
        channels: {
          'test': {
            description: 'Test channel',
            commands: {
              'test': { description: 'Test command' }
            }
          }
        }
      };

      const jsonBuffer = Buffer.from(JSON.stringify(spec));
      const parsed = ManifestParser.parseJSON(jsonBuffer);

      expect(parsed.version).toBe('1.0.0');
      expect(parsed.channels).toHaveProperty('test');
    });

    test('should provide static parseYAML method', () => {
      const yamlContent = `
version: "1.0.0"
channels:
  test:
    description: "Test channel"
    commands:
      test:
        description: "Test command"
`;

      const yamlBuffer = Buffer.from(yamlContent);
      const parsed = ManifestParser.parseYAML(yamlBuffer);

      expect(parsed.version).toBe('1.0.0');
      expect(parsed.channels).toHaveProperty('test');
    });

    test('should provide static parseFromFile method', () => {
      const spec = {
        version: '1.0.0',
        channels: {
          'test': {
            description: 'Test channel',
            commands: {
              'test': { description: 'Test command' }
            }
          }
        }
      };

      const testFile = path.join(tempDir, 'static-test.json');
      fs.writeFileSync(testFile, JSON.stringify(spec, null, 2));

      const parsed = ManifestParser.parseFromFile(testFile);

      expect(parsed.version).toBe('1.0.0');
      expect(parsed.channels).toHaveProperty('test');
    });

    test('should provide static parseMultipleFiles method', () => {
      const spec1 = {
        version: '1.0.0',
        channels: {
          'ch1': {
            description: 'Channel 1',
            commands: { 'cmd1': { description: 'Command 1' } }
          }
        }
      };

      const spec2 = {
        version: '1.0.0',
        channels: {
          'ch2': {
            description: 'Channel 2', 
            commands: { 'cmd2': { description: 'Command 2' } }
          }
        }
      };

      const file1 = path.join(tempDir, 'static1.json');
      const file2 = path.join(tempDir, 'static2.json');

      fs.writeFileSync(file1, JSON.stringify(spec1, null, 2));
      fs.writeFileSync(file2, JSON.stringify(spec2, null, 2));

      const merged = ManifestParser.parseMultipleFiles([file1, file2]);

      expect(merged.channels).toHaveProperty('ch1');
      expect(merged.channels).toHaveProperty('ch2');
    });
  });

  describe('Error Handling', () => {
    test('should create ManifestError with details', () => {
      const error = new ManifestError('Test error', 'Test details');
      
      expect(error.name).toBe('ManifestError');
      expect(error.message).toBe('Test error');
      expect(error.details).toBe('Test details');
      expect(error instanceof Error).toBe(true);
    });

    test('should create ManifestError without details', () => {
      const error = new ManifestError('Test error');
      
      expect(error.details).toBeUndefined();
    });
  });
});