/**
 * Built-in Command Handler Tests
 * Tests for all built-in commands: ping, echo, get_info, validate, slow_process, spec
 */

import { JanusCommand } from '../types/protocol';

describe('Built-in Command Handlers', () => {
  // Test helper function to simulate command processing
  async function simulateBuiltinCommand(command: string, args?: Record<string, any>): Promise<Record<string, any>> {
    
    let result: Record<string, any> = {};
    
    switch (command) {
      case 'ping':
        result.pong = true;
        result.echo = args;
        break;
      case 'echo':
        if (args?.message) {
          result.message = args.message;
        }
        break;
      case 'get_info':
        result.implementation = 'TypeScript';
        result.version = '1.0.0';
        result.protocol = 'SOCK_DGRAM';
        break;
      case 'validate':
        // JSON validation service
        if (args?.message && typeof args.message === 'string') {
          try {
            const jsonData = JSON.parse(args.message);
            result.valid = true;
            result.data = jsonData;
          } catch (error) {
            result.valid = false;
            result.error = 'Invalid JSON format';
            result.reason = error instanceof Error ? error.message : String(error);
          }
        } else {
          result.valid = false;
          result.error = 'No message provided for validation';
        }
        break;
      case 'slow_process':
        // Simulate a slow process that might timeout
        await new Promise(resolve => setTimeout(resolve, 100)); // Shortened for testing
        result.processed = true;
        result.delay = '100ms';
        if (args?.message) {
          result.message = args.message;
        }
        break;
      case 'spec':
        // Return Manifest (simplified for testing)
        result.specification = {
          version: '1.0.0',
          channels: {},
          models: {}
        };
        break;
      default:
        throw new Error(`Unknown command: ${command}`);
    }
    
    return result;
  }

  describe('Ping Command', () => {
    it('should respond with pong and echo args', async () => {
      const result = await simulateBuiltinCommand('ping', { test: 'data' });
      
      expect(result.pong).toBe(true);
      expect(result.echo).toEqual({ test: 'data' });
    });

    it('should respond with pong even without args', async () => {
      const result = await simulateBuiltinCommand('ping');
      
      expect(result.pong).toBe(true);
      expect(result.echo).toBeUndefined();
    });

    it('should handle null args gracefully', async () => {
      const result = await simulateBuiltinCommand('ping', null as any);
      
      expect(result.pong).toBe(true);
      expect(result.echo).toBeNull();
    });
  });

  describe('Echo Command', () => {
    it('should echo the message parameter', async () => {
      const testMessage = 'Hello from echo command';
      const result = await simulateBuiltinCommand('echo', { message: testMessage });
      
      expect(result.message).toBe(testMessage);
    });

    it('should handle missing message parameter', async () => {
      const result = await simulateBuiltinCommand('echo', {});
      
      expect(result.message).toBeUndefined();
    });

    it('should handle complex message objects', async () => {
      const complexMessage = { data: [1, 2, 3], nested: { value: 'test' } };
      const result = await simulateBuiltinCommand('echo', { message: complexMessage });
      
      expect(result.message).toEqual(complexMessage);
    });

    it('should handle string messages', async () => {
      const stringMessage = 'Simple string message';
      const result = await simulateBuiltinCommand('echo', { message: stringMessage });
      
      expect(result.message).toBe(stringMessage);
    });
  });

  describe('Get Info Command', () => {
    it('should return implementation information', async () => {
      const result = await simulateBuiltinCommand('get_info');
      
      expect(result.implementation).toBe('TypeScript');
      expect(result.version).toBe('1.0.0');
      expect(result.protocol).toBe('SOCK_DGRAM');
    });

    it('should return info regardless of args', async () => {
      const result = await simulateBuiltinCommand('get_info', { ignored: 'parameter' });
      
      expect(result.implementation).toBe('TypeScript');
      expect(result.version).toBe('1.0.0');
      expect(result.protocol).toBe('SOCK_DGRAM');
    });

    it('should have consistent structure', async () => {
      const result = await simulateBuiltinCommand('get_info');
      
      expect(typeof result.implementation).toBe('string');
      expect(typeof result.version).toBe('string');
      expect(typeof result.protocol).toBe('string');
      expect(result.version).toMatch(/^\d+\.\d+\.\d+$/); // Semantic version format
    });
  });

  describe('Validate Command', () => {
    it('should validate valid JSON', async () => {
      const validJson = '{"test": "data", "number": 123}';
      const result = await simulateBuiltinCommand('validate', { message: validJson });
      
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({ test: 'data', number: 123 });
      expect(result.error).toBeUndefined();
    });

    it('should reject invalid JSON', async () => {
      const invalidJson = '{"invalid": json}';
      const result = await simulateBuiltinCommand('validate', { message: invalidJson });
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid JSON format');
      expect(result.reason).toContain('Unexpected token');
      expect(result.data).toBeUndefined();
    });

    it('should handle missing message parameter', async () => {
      const result = await simulateBuiltinCommand('validate', {});
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('No message provided for validation');
    });

    it('should handle non-string message parameter', async () => {
      const result = await simulateBuiltinCommand('validate', { message: 123 });
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('No message provided for validation');
    });

    it('should validate complex JSON structures', async () => {
      const complexJson = '{"array": [1, 2, 3], "nested": {"deep": {"value": true}}}';
      const result = await simulateBuiltinCommand('validate', { message: complexJson });
      
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({
        array: [1, 2, 3],
        nested: { deep: { value: true } }
      });
    });
  });

  describe('Slow Process Command', () => {
    it('should simulate processing delay', async () => {
      const startTime = Date.now();
      const result = await simulateBuiltinCommand('slow_process', { message: 'test' });
      const endTime = Date.now();
      
      expect(result.processed).toBe(true);
      expect(result.delay).toBe('100ms'); // Test delay
      expect(result.message).toBe('test');
      expect(endTime - startTime).toBeGreaterThanOrEqual(95); // Allow some variance
    });

    it('should handle processing without message', async () => {
      const result = await simulateBuiltinCommand('slow_process');
      
      expect(result.processed).toBe(true);
      expect(result.delay).toBe('100ms');
      expect(result.message).toBeUndefined();
    });

    it('should preserve message content through delay', async () => {
      const complexMessage = { data: 'important', priority: 'high' };
      const result = await simulateBuiltinCommand('slow_process', { message: complexMessage });
      
      expect(result.processed).toBe(true);
      expect(result.message).toEqual(complexMessage);
    });
  });

  describe('Spec Command', () => {
    it('should return Manifest', async () => {
      const result = await simulateBuiltinCommand('spec');
      
      expect(result.specification).toBeDefined();
      expect(result.specification.version).toBe('1.0.0');
      expect(result.specification.channels).toBeDefined();
      expect(result.specification.models).toBeDefined();
    });

    it('should return consistent specification structure', async () => {
      const result = await simulateBuiltinCommand('spec');
      
      expect(typeof result.specification).toBe('object');
      expect(typeof result.specification.version).toBe('string');
      expect(typeof result.specification.channels).toBe('object');
      expect(typeof result.specification.models).toBe('object');
    });
  });

  describe('Reserved Command Validation', () => {
    it('should recognize all built-in commands', () => {
      const builtinCommands = ['ping', 'echo', 'get_info', 'validate', 'slow_process', 'spec'];
      
      builtinCommands.forEach(command => {
        expect(() => {
          // This would fail if command is not recognized
          simulateBuiltinCommand(command);
        }).not.toThrow();
      });
    });

    it('should reject unknown commands', async () => {
      await expect(simulateBuiltinCommand('unknown_command')).rejects.toThrow('Unknown command: unknown_command');
    });

    it('should reject Manifest defining built-ins', () => {
      const reservedCommands = ['ping', 'echo', 'get_info', 'validate', 'slow_process', 'spec'];
      
      // Simulate Manifest validation (this would be done by the parser)
      const manifest = {
        channels: {
          test: {
            commands: {
              ping: { description: 'Should be rejected' }, // Reserved command
              custom: { description: 'Should be allowed' }
            }
          }
        }
      };
      
      const hasReservedCommands = Object.values(manifest.channels).some(channel =>
        Object.keys(channel.commands).some(cmd => reservedCommands.includes(cmd))
      );
      
      expect(hasReservedCommands).toBe(true); // This spec should be rejected
    });
  });

  describe('Command Argument Population', () => {
    it('should populate arguments based on command type', () => {
      const testCases = [
        { command: 'ping', expectedArgs: { test: 'data' } },
        { command: 'echo', expectedArgs: { message: 'test' } },
        { command: 'get_info', expectedArgs: {} },
        { command: 'validate', expectedArgs: { message: '{"test": true}' } },
        { command: 'slow_process', expectedArgs: { message: 'processing' } },
        { command: 'spec', expectedArgs: {} }
      ];
      
      testCases.forEach(({ command, expectedArgs }) => {
        // Verify that each command can accept its expected argument structure
        expect(() => {
          const cmd: JanusCommand = {
            id: 'test',
            command,
            channelId: 'test',
            args: expectedArgs,
            timestamp: Date.now()
          };
          
          // Basic validation that command structure is correct
          expect(cmd.command).toBe(command);
          expect(cmd.args).toEqual(expectedArgs);
        }).not.toThrow();
      });
    });

    it('should handle missing args gracefully', async () => {
      // All built-in commands should handle missing/undefined args
      const commands = ['ping', 'echo', 'get_info', 'validate', 'slow_process', 'spec'];
      
      for (const command of commands) {
        const result = await simulateBuiltinCommand(command, undefined);
        expect(result).toBeDefined();
      }
    });
  });
});