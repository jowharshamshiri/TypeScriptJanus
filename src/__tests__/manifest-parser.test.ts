/**
 * Comprehensive tests for Manifest Parser
 * Tests match Swift implementation patterns for 100% parity
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ManifestParser, ManifestError } from '../manifest/manifest-parser';
import { Manifest } from '../types/protocol';

describe('ManifestParser', () => {
  let parser: ManifestParser;
  let tempDir: string;

  beforeEach(() => {
    parser = new ManifestParser();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'janus-manifest-test-'));
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('JSON Parsing', () => {
    test('should parse valid JSON manifest', () => {
      const validManifest = {
        version: '1.0.0',
        name: 'Test API',
        description: 'Test Manifest',
        channels: {
          'test-channel': {
            name: 'Test Channel',
            description: 'Test channel description',
            requests: {
              'test_request': {
                name: 'Ping',
                description: 'Test ping request',
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

      const result = parser.parseJSONString(JSON.stringify(validManifest));
      
      expect(result.version).toBe('1.0.0');
      expect(result.name).toBe('Test API');
      expect(result.channels['test-channel']).toBeDefined();
      expect(result.channels['test-channel']?.requests['test_request']).toBeDefined();
    });

    test('should parse JSON from buffer', () => {
      const manifest = {
        version: '1.0.0',
        channels: {
          'test': {
            requests: {
              'test_request': {
                description: 'Test request'
              }
            }
          }
        }
      };

      const buffer = Buffer.from(JSON.stringify(manifest), 'utf8');
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
    test('should parse valid YAML manifest', () => {
      const yamlManifest = `
version: "1.0.0"
name: "Test API"
channels:
  test-channel:
    name: "Test Channel"
    requests:
      test_request:
        description: "Test ping request"
        args:
          message:
            type: string
            description: "Test message"
            required: true
`;

      const result = parser.parseYAMLString(yamlManifest);
      
      expect(result.version).toBe('1.0.0');
      expect(result.name).toBe('Test API');
      expect(result.channels['test-channel']).toBeDefined();
    });

    test('should parse YAML from buffer', () => {
      const yamlContent = 'version: "1.0.0"\nchannels:\n  test:\n    requests:\n      test_request:\n        description: "Test"';
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
      const manifest = {
        version: '1.0.0',
        channels: {
          'test': {
            requests: {
              'test_request': {
                description: 'Test request'
              }
            }
          }
        }
      };

      const filePath = path.join(tempDir, 'test.json');
      fs.writeFileSync(filePath, JSON.stringify(manifest));
      
      const result = parser.parseFromFile(filePath);
      expect(result.version).toBe('1.0.0');
    });

    test('should parse YAML file', () => {
      const yamlContent = 'version: "1.0.0"\nchannels:\n  test:\n    requests:\n      test_request:\n        description: "Test"';
      const filePath = path.join(tempDir, 'test.yaml');
      fs.writeFileSync(filePath, yamlContent);
      
      const result = parser.parseFromFile(filePath);
      expect(result.version).toBe('1.0.0');
    });

    test('should parse YML file', () => {
      const yamlContent = 'version: "1.0.0"\nchannels:\n  test:\n    requests:\n      test_request:\n        description: "Test"';
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

  describe('Manifest Validation', () => {
    test('should validate valid manifest', () => {
      const validManifest: Manifest = {
        version: '1.0.0',
        name: 'Test API',
        channels: {
          'test-channel': {
            name: 'Test Channel',
            requests: {
              'test_request': {
                name: 'Ping',
                description: 'Test ping request'
              }
            }
          }
        }
      };

      expect(() => ManifestParser.validate(validManifest)).not.toThrow();
    });

    test('should throw on empty version', () => {
      const manifest: Manifest = {
        version: '',
        channels: {
          'test': {
            requests: {
              'test_request': {
                description: 'Test'
              }
            }
          }
        }
      };

      expect(() => ManifestParser.validate(manifest)).toThrow('API version cannot be empty');
    });

    test('should throw on missing version', () => {
      const manifest = {
        channels: {
          'test': {
            requests: {
              'test_request': {
                description: 'Test'
              }
            }
          }
        }
      } as any as Manifest;

      expect(() => ManifestParser.validate(manifest)).toThrow('API version cannot be empty');
    });

    test('should throw on empty channels', () => {
      const manifest: Manifest = {
        version: '1.0.0',
        channels: {}
      };

      expect(() => ManifestParser.validate(manifest)).toThrow('API must define at least one channel');
    });

    test('should throw on missing channels', () => {
      const manifest = {
        version: '1.0.0'
      } as Manifest;

      expect(() => ManifestParser.validate(manifest)).toThrow('API must define at least one channel');
    });

    test('should throw on empty channel ID', () => {
      const manifest: Manifest = {
        version: '1.0.0',
        channels: {
          '': {
            requests: {
              'test_request': {
                description: 'Test'
              }
            }
          }
        }
      };

      expect(() => ManifestParser.validate(manifest)).toThrow('Channel ID cannot be empty');
    });

    test('should throw on empty requests in channel', () => {
      const manifest: Manifest = {
        version: '1.0.0',
        channels: {
          'test-channel': {
            requests: {}
          }
        }
      };

      expect(() => ManifestParser.validate(manifest)).toThrow('must define at least one request');
    });

    test('should throw on empty request name', () => {
      const manifest: Manifest = {
        version: '1.0.0',
        channels: {
          'test-channel': {
            requests: {
              '': {
                description: 'Test'
              }
            }
          }
        }
      };

      expect(() => ManifestParser.validate(manifest)).toThrow('Request name cannot be empty');
    });

    test('should throw on missing request description', () => {
      const manifest: Manifest = {
        version: '1.0.0',
        channels: {
          'test-channel': {
            requests: {
              'test_request': {
                name: 'Ping'
              } as any
            }
          }
        }
      };

      expect(() => ManifestParser.validate(manifest)).toThrow('must have a description');
    });

    test('should throw on empty request description', () => {
      const manifest: Manifest = {
        version: '1.0.0',
        channels: {
          'test-channel': {
            requests: {
              'test_request': {
                description: ''
              }
            }
          }
        }
      };

      expect(() => ManifestParser.validate(manifest)).toThrow('must have a description');
    });
  });

  describe('Argument Validation', () => {
    test('should validate string arguments with pattern', () => {
      const manifest: Manifest = {
        version: '1.0.0',
        channels: {
          'test': {
            requests: {
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

      expect(() => ManifestParser.validate(manifest)).not.toThrow();
    });

    test('should throw on invalid regex pattern', () => {
      const manifest: Manifest = {
        version: '1.0.0',
        channels: {
          'test': {
            requests: {
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

      expect(() => ManifestParser.validate(manifest)).toThrow('Invalid regex pattern');
    });

    test('should throw on invalid argument type', () => {
      const manifest: Manifest = {
        version: '1.0.0',
        channels: {
          'test': {
            requests: {
              'test': {
                description: 'Test request',
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

      expect(() => ManifestParser.validate(manifest)).toThrow('Invalid argument type');
    });

    test('should throw on invalid numeric constraints', () => {
      const manifest: Manifest = {
        version: '1.0.0',
        channels: {
          'test': {
            requests: {
              'test': {
                description: 'Test request',
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

      expect(() => ManifestParser.validate(manifest)).toThrow('Invalid numeric constraints');
    });

    test('should throw on invalid model reference', () => {
      const manifest: Manifest = {
        version: '1.0.0',
        channels: {
          'test': {
            requests: {
              'test': {
                description: 'Test request',
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

      expect(() => ManifestParser.validate(manifest)).toThrow('Model reference \'NonExistentModel\' not found');
    });

    test('should validate nested array items', () => {
      const manifest: Manifest = {
        version: '1.0.0',
        channels: {
          'test': {
            requests: {
              'test': {
                description: 'Test request',
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

      expect(() => ManifestParser.validate(manifest)).not.toThrow();
    });

    test('should validate nested object properties', () => {
      const manifest: Manifest = {
        version: '1.0.0',
        channels: {
          'test': {
            requests: {
              'test': {
                description: 'Test request',
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

      expect(() => ManifestParser.validate(manifest)).not.toThrow();
    });

    test('should throw on empty argument name', () => {
      const manifest: Manifest = {
        version: '1.0.0',
        channels: {
          'test': {
            requests: {
              'test': {
                description: 'Test request',
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

      expect(() => ManifestParser.validate(manifest)).toThrow('Argument name cannot be empty');
    });
  });

  describe('Response Validation', () => {
    test('should validate response definition', () => {
      const manifest: Manifest = {
        version: '1.0.0',
        channels: {
          'test': {
            requests: {
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

      expect(() => ManifestParser.validate(manifest)).not.toThrow();
    });

    test('should throw on invalid response type', () => {
      const manifest: Manifest = {
        version: '1.0.0',
        channels: {
          'test': {
            requests: {
              'test': {
                description: 'Test request',
                response: {
                  type: 'invalid-type' as any,
                  description: 'Invalid response'
                }
              }
            }
          }
        }
      };

      expect(() => ManifestParser.validate(manifest)).toThrow('Invalid response type');
    });

    test('should throw on invalid response model reference', () => {
      const manifest: Manifest = {
        version: '1.0.0',
        channels: {
          'test': {
            requests: {
              'test': {
                description: 'Test request',
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

      expect(() => ManifestParser.validate(manifest)).toThrow('Model reference \'NonExistentModel\' not found');
    });
  });

  describe('Multi-File Parsing', () => {
    test('should parse and merge multiple files', () => {
      // Create first manifest file
      const manifest1 = {
        version: '1.0.0',
        name: 'Base API',
        channels: {
          'base': {
            description: 'Base channel',
            requests: {
              'base_cmd': {
                description: 'Base request'
              }
            }
          }
        }
      };

      const manifest2 = {
        version: '1.0.0',
        name: 'Extension API',
        channels: {
          'extension': {
            description: 'Extension channel',
            requests: {
              'ext_cmd': {
                description: 'Extension request'
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

      fs.writeFileSync(file1, JSON.stringify(manifest1, null, 2));
      fs.writeFileSync(file2, JSON.stringify(manifest2, null, 2));

      const merged = parser.parseMultipleFiles([file1, file2]);

      expect(merged.channels).toHaveProperty('base');
      expect(merged.channels).toHaveProperty('extension');
      expect(merged.models).toHaveProperty('ExtModel');
      expect(merged.channels['base']?.requests).toHaveProperty('base_cmd');
      expect(merged.channels['extension']?.requests).toHaveProperty('ext_cmd');
    });

    test('should throw on duplicate channel names', () => {
      const manifest1 = {
        version: '1.0.0',
        channels: {
          'shared': {
            description: 'First shared channel',
            requests: {
              'cmd1': { description: 'Request 1' }
            }
          }
        }
      };

      const manifest2 = {
        version: '1.0.0',
        channels: {
          'shared': {
            description: 'Second shared channel',
            requests: {
              'cmd2': { description: 'Request 2' }
            }
          }
        }
      };

      const file1 = path.join(tempDir, 'manifest1.json');
      const file2 = path.join(tempDir, 'manifest2.json');

      fs.writeFileSync(file1, JSON.stringify(manifest1, null, 2));
      fs.writeFileSync(file2, JSON.stringify(manifest2, null, 2));

      expect(() => parser.parseMultipleFiles([file1, file2]))
        .toThrow("Channel 'shared' already exists in base manifest");
    });

    test('should throw on duplicate model names', () => {
      const manifest1 = {
        version: '1.0.0',
        channels: {
          'ch1': {
            description: 'Channel 1',
            requests: {
              'cmd1': { description: 'Request 1' }
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

      const manifest2 = {
        version: '1.0.0',
        channels: {
          'ch2': {
            description: 'Channel 2',
            requests: {
              'cmd2': { description: 'Request 2' }
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

      const file1 = path.join(tempDir, 'manifest1.json');
      const file2 = path.join(tempDir, 'manifest2.json');

      fs.writeFileSync(file1, JSON.stringify(manifest1, null, 2));
      fs.writeFileSync(file2, JSON.stringify(manifest2, null, 2));

      expect(() => parser.parseMultipleFiles([file1, file2]))
        .toThrow("Model 'SharedModel' already exists in base manifest");
    });

    test('should throw on empty file list', () => {
      expect(() => parser.parseMultipleFiles([]))
        .toThrow('No files provided');
    });
  });

  describe('Serialization', () => {
    const testManifest: Manifest = {
      version: '1.0.0',
      name: 'Test API',
      description: 'Test serialization',
      channels: {
        'test': {
          description: 'Test channel',
          requests: {
            'test_cmd': {
              description: 'Test request',
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
      const json = parser.serializeToJSON(testManifest, false);
      
      expect(typeof json).toBe('string');
      expect(JSON.parse(json)).toEqual(testManifest);
      expect(json.includes('\n')).toBe(false); // Compact format
    });

    test('should serialize to pretty JSON', () => {
      const json = parser.serializeToJSON(testManifest, true);
      
      expect(typeof json).toBe('string');
      expect(JSON.parse(json)).toEqual(testManifest);
      expect(json.includes('\n')).toBe(true); // Pretty format
    });

    test('should serialize to YAML', () => {
      const yaml = parser.serializeToYAML(testManifest);
      
      expect(typeof yaml).toBe('string');
      expect(yaml.includes('version: 1.0.0')).toBe(true);
      expect(yaml.includes('channels:')).toBe(true);
    });

    test('should validate before serialization', () => {
      const invalidManifest = {
        version: '',
        channels: {}
      } as Manifest;

      expect(() => parser.serializeToJSON(invalidManifest))
        .toThrow('API version cannot be empty');
      
      expect(() => parser.serializeToYAML(invalidManifest))
        .toThrow('API version cannot be empty');
    });
  });

  describe('Static Interface Methods', () => {
    test('should provide static parseJSON method', () => {
      const manifest = {
        version: '1.0.0',
        channels: {
          'test': {
            description: 'Test channel',
            requests: {
              'test': { description: 'Test request' }
            }
          }
        }
      };

      const jsonBuffer = Buffer.from(JSON.stringify(manifest));
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
    requests:
      test:
        description: "Test request"
`;

      const yamlBuffer = Buffer.from(yamlContent);
      const parsed = ManifestParser.parseYAML(yamlBuffer);

      expect(parsed.version).toBe('1.0.0');
      expect(parsed.channels).toHaveProperty('test');
    });

    test('should provide static parseFromFile method', () => {
      const manifest = {
        version: '1.0.0',
        channels: {
          'test': {
            description: 'Test channel',
            requests: {
              'test': { description: 'Test request' }
            }
          }
        }
      };

      const testFile = path.join(tempDir, 'static-test.json');
      fs.writeFileSync(testFile, JSON.stringify(manifest, null, 2));

      const parsed = ManifestParser.parseFromFile(testFile);

      expect(parsed.version).toBe('1.0.0');
      expect(parsed.channels).toHaveProperty('test');
    });

    test('should provide static parseMultipleFiles method', () => {
      const manifest1 = {
        version: '1.0.0',
        channels: {
          'ch1': {
            description: 'Channel 1',
            requests: { 'cmd1': { description: 'Request 1' } }
          }
        }
      };

      const manifest2 = {
        version: '1.0.0',
        channels: {
          'ch2': {
            description: 'Channel 2', 
            requests: { 'cmd2': { description: 'Request 2' } }
          }
        }
      };

      const file1 = path.join(tempDir, 'static1.json');
      const file2 = path.join(tempDir, 'static2.json');

      fs.writeFileSync(file1, JSON.stringify(manifest1, null, 2));
      fs.writeFileSync(file2, JSON.stringify(manifest2, null, 2));

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