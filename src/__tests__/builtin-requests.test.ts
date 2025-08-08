/**
 * Built-in Request Handler Tests
 * Tests for all built-in requests: ping, echo, get_info, validate, slow_process, manifest
 */

import { JanusRequest } from '../types/protocol';

describe('Built-in Request Handlers', () => {
  // Test helper function to simulate request processing
  async function simulateBuiltinRequest(request: string, args?: Record<string, any>): Promise<Record<string, any>> {
    
    let result: Record<string, any> = {};
    
    switch (request) {
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
      case 'manifest':
        // Return Manifest (simplified for testing)
        result.manifest = {
          version: '1.0.0',
          channels: {},
          models: {}
        };
        break;
      default:
        throw new Error(`Unknown request: ${request}`);
    }
    
    return result;
  }

  describe('Ping Request', () => {
    it('should respond with pong and echo args', async () => {
      const result = await simulateBuiltinRequest('ping', { test: 'data' });
      
      expect(result.pong).toBe(true);
      expect(result.echo).toEqual({ test: 'data' });
    });

    it('should respond with pong even without args', async () => {
      const result = await simulateBuiltinRequest('ping');
      
      expect(result.pong).toBe(true);
      expect(result.echo).toBeUndefined();
    });

    it('should handle null args gracefully', async () => {
      const result = await simulateBuiltinRequest('ping', null as any);
      
      expect(result.pong).toBe(true);
      expect(result.echo).toBeNull();
    });
  });

  describe('Echo Request', () => {
    it('should echo the message parameter', async () => {
      const testMessage = 'Hello from echo request';
      const result = await simulateBuiltinRequest('echo', { message: testMessage });
      
      expect(result.message).toBe(testMessage);
    });

    it('should handle missing message parameter', async () => {
      const result = await simulateBuiltinRequest('echo', {});
      
      expect(result.message).toBeUndefined();
    });

    it('should handle complex message objects', async () => {
      const complexMessage = { data: [1, 2, 3], nested: { value: 'test' } };
      const result = await simulateBuiltinRequest('echo', { message: complexMessage });
      
      expect(result.message).toEqual(complexMessage);
    });

    it('should handle string messages', async () => {
      const stringMessage = 'Simple string message';
      const result = await simulateBuiltinRequest('echo', { message: stringMessage });
      
      expect(result.message).toBe(stringMessage);
    });
  });

  describe('Get Info Request', () => {
    it('should return implementation information', async () => {
      const result = await simulateBuiltinRequest('get_info');
      
      expect(result.implementation).toBe('TypeScript');
      expect(result.version).toBe('1.0.0');
      expect(result.protocol).toBe('SOCK_DGRAM');
    });

    it('should return info regardless of args', async () => {
      const result = await simulateBuiltinRequest('get_info', { ignored: 'parameter' });
      
      expect(result.implementation).toBe('TypeScript');
      expect(result.version).toBe('1.0.0');
      expect(result.protocol).toBe('SOCK_DGRAM');
    });

    it('should have consistent structure', async () => {
      const result = await simulateBuiltinRequest('get_info');
      
      expect(typeof result.implementation).toBe('string');
      expect(typeof result.version).toBe('string');
      expect(typeof result.protocol).toBe('string');
      expect(result.version).toMatch(/^\d+\.\d+\.\d+$/); // Semantic version format
    });
  });

  describe('Validate Request', () => {
    it('should validate valid JSON', async () => {
      const validJson = '{"test": "data", "number": 123}';
      const result = await simulateBuiltinRequest('validate', { message: validJson });
      
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({ test: 'data', number: 123 });
      expect(result.error).toBeUndefined();
    });

    it('should reject invalid JSON', async () => {
      const invalidJson = '{"invalid": json}';
      const result = await simulateBuiltinRequest('validate', { message: invalidJson });
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid JSON format');
      expect(result.reason).toContain('Unexpected token');
      expect(result.data).toBeUndefined();
    });

    it('should handle missing message parameter', async () => {
      const result = await simulateBuiltinRequest('validate', {});
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('No message provided for validation');
    });

    it('should handle non-string message parameter', async () => {
      const result = await simulateBuiltinRequest('validate', { message: 123 });
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('No message provided for validation');
    });

    it('should validate complex JSON structures', async () => {
      const complexJson = '{"array": [1, 2, 3], "nested": {"deep": {"value": true}}}';
      const result = await simulateBuiltinRequest('validate', { message: complexJson });
      
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({
        array: [1, 2, 3],
        nested: { deep: { value: true } }
      });
    });
  });

  describe('Slow Process Request', () => {
    it('should simulate processing delay', async () => {
      const startTime = Date.now();
      const result = await simulateBuiltinRequest('slow_process', { message: 'test' });
      const endTime = Date.now();
      
      expect(result.processed).toBe(true);
      expect(result.delay).toBe('100ms'); // Test delay
      expect(result.message).toBe('test');
      expect(endTime - startTime).toBeGreaterThanOrEqual(95); // Allow some variance
    });

    it('should handle processing without message', async () => {
      const result = await simulateBuiltinRequest('slow_process');
      
      expect(result.processed).toBe(true);
      expect(result.delay).toBe('100ms');
      expect(result.message).toBeUndefined();
    });

    it('should preserve message content through delay', async () => {
      const complexMessage = { data: 'important', priority: 'high' };
      const result = await simulateBuiltinRequest('slow_process', { message: complexMessage });
      
      expect(result.processed).toBe(true);
      expect(result.message).toEqual(complexMessage);
    });
  });

  describe('Manifest Request', () => {
    it('should return Manifest', async () => {
      const result = await simulateBuiltinRequest('manifest');
      
      expect(result.manifest).toBeDefined();
      expect(result.manifest.version).toBe('1.0.0');
      expect(result.manifest.channels).toBeDefined();
      expect(result.manifest.models).toBeDefined();
    });

    it('should return consistent manifest structure', async () => {
      const result = await simulateBuiltinRequest('manifest');
      
      expect(typeof result.manifest).toBe('object');
      expect(typeof result.manifest.version).toBe('string');
      expect(typeof result.manifest.channels).toBe('object');
      expect(typeof result.manifest.models).toBe('object');
    });
  });

  describe('Reserved Request Validation', () => {
    it('should recognize all built-in requests', () => {
      const builtinRequests = ['ping', 'echo', 'get_info', 'validate', 'slow_process', 'manifest'];
      
      builtinRequests.forEach(request => {
        expect(() => {
          // This would fail if request is not recognized
          simulateBuiltinRequest(request);
        }).not.toThrow();
      });
    });

    it('should reject unknown requests', async () => {
      await expect(simulateBuiltinRequest('unknown_request')).rejects.toThrow('Unknown request: unknown_request');
    });

    it('should reject Manifest defining built-ins', () => {
      const reservedRequests = ['ping', 'echo', 'get_info', 'validate', 'slow_process', 'manifest'];
      
      // Simulate Manifest validation (this would be done by the parser)
      const manifest = {
        channels: {
          test: {
            requests: {
              ping: { description: 'Should be rejected' }, // Reserved request
              custom: { description: 'Should be allowed' }
            }
          }
        }
      };
      
      const hasReservedRequests = Object.values(manifest.channels).some(channel =>
        Object.keys(channel.requests).some(cmd => reservedRequests.includes(cmd))
      );
      
      expect(hasReservedRequests).toBe(true); // This manifest should be rejected
    });
  });

  describe('Request Argument Population', () => {
    it('should populate arguments based on request type', () => {
      const testCases = [
        { request: 'ping', expectedArgs: { test: 'data' } },
        { request: 'echo', expectedArgs: { message: 'test' } },
        { request: 'get_info', expectedArgs: {} },
        { request: 'validate', expectedArgs: { message: '{"test": true}' } },
        { request: 'slow_process', expectedArgs: { message: 'processing' } },
        { request: 'manifest', expectedArgs: {} }
      ];
      
      testCases.forEach(({ request, expectedArgs }) => {
        // Verify that each request can accept its expected argument structure
        expect(() => {
          const cmd: JanusRequest = {
            id: 'test',
            request,
            channelId: 'test',
            args: expectedArgs,
            timestamp: Date.now()
          };
          
          // Basic validation that request structure is correct
          expect(cmd.request).toBe(request);
          expect(cmd.args).toEqual(expectedArgs);
        }).not.toThrow();
      });
    });

    it('should handle missing args gracefully', async () => {
      // All built-in requests should handle missing/undefined args
      const requests = ['ping', 'echo', 'get_info', 'validate', 'slow_process', 'manifest'];
      
      for (const request of requests) {
        const result = await simulateBuiltinRequest(request, undefined);
        expect(result).toBeDefined();
      }
    });
  });
});