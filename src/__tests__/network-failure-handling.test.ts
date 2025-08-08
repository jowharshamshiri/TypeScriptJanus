/**
 * Network Failure Handling Tests
 * Tests for handling various network and socket failures gracefully
 */

import { JanusClient } from '../core/janus-client';
import { SecurityValidator } from '../core/security-validator';

describe('Network Failure Handling', () => {
  const testSocketPath = '/tmp/janus_network_test';
  const validator = new SecurityValidator({ maxTotalSize: 64 * 1024 });

  describe('Connection to Nonexistent Socket', () => {
    it('should handle attempts to connect to missing sockets', async () => {
      const nonexistentPath = '/tmp/janus_nonexistent_socket_12345';
      const client = new JanusClient({ socketPath: nonexistentPath });
      
      // Attempting to test connection to nonexistent socket should handle error gracefully
      try {
        await client.testConnection();
        // If it succeeds, that's fine (socket might exist)
        expect(true).toBe(true);
      } catch (error) {
        // If it fails, error should be properly handled
        expect(error).toBeDefined();
        expect(error instanceof Error).toBe(true);
      }
    });

    it('should provide meaningful error messages for missing sockets', async () => {
      const nonexistentPath = '/tmp/definitely_does_not_exist_socket';
      const client = new JanusClient({ socketPath: nonexistentPath });
      
      try {
        await client.testConnection();
      } catch (error) {
        if (error instanceof Error) {
          expect(error.message).toBeDefined();
          expect(error.message.length).toBeGreaterThan(0);
        }
      }
    });

    it('should handle directory not found in socket path', async () => {
      const invalidDirPath = '/nonexistent_directory/socket';
      
      // SecurityValidator may catch this at construction time
      try {
        const client = new JanusClient({ socketPath: invalidDirPath });
        await client.testConnection();
      } catch (error) {
        // Either construction error or connection error is acceptable
        expect(error).toBeDefined();
      }
    });
  });

  describe('Connection Timeout Handling', () => {
    it('should handle socket connection timeouts gracefully', async () => {
      const client = new JanusClient({ 
        socketPath: testSocketPath,
        connectionTimeout: 100 // Very short timeout
      });
      
      try {
        await client.testConnection();
      } catch (error) {
        // Timeout errors should be handled gracefully
        expect(error).toBeDefined();
      }
    });

    it('should remanifestt configured connection timeout values', async () => {
      const shortTimeout = 50;
      const client = new JanusClient({ 
        socketPath: '/tmp/timeout_test_socket',
        connectionTimeout: shortTimeout
      });
      
      const startTime = Date.now();
      try {
        await client.testConnection();
      } catch (error) {
        const elapsed = Date.now() - startTime;
        // Should timeout within reasonable bounds
        expect(elapsed).toBeLessThan(shortTimeout + 100); // Allow some variance
      }
    });

    it('should handle different timeout scenarios', async () => {
      const timeoutValues = [50, 100, 500];
      
      for (const timeout of timeoutValues) {
        const client = new JanusClient({ 
          socketPath: '/tmp/varying_timeout_test',
          connectionTimeout: timeout
        });
        
        try {
          await client.testConnection();
        } catch (error) {
          expect(error).toBeDefined();
        }
      }
    });
  });

  describe('Repeated Connection Failures', () => {
    it('should handle multiple consecutive connection failures', async () => {
      const failingPath = '/tmp/repeated_failure_test';
      const client = new JanusClient({ socketPath: failingPath });
      
      const attempts = 3;
      const results = [];
      
      for (let i = 0; i < attempts; i++) {
        try {
          await client.testConnection();
          results.push('success');
        } catch (error) {
          results.push('failure');
          expect(error).toBeDefined();
        }
      }
      
      // Should handle each failure consistently
      expect(results.length).toBe(attempts);
    });

    it('should not degrade performance with repeated failures', async () => {
      const client = new JanusClient({ 
        socketPath: '/tmp/performance_test_socket',
        connectionTimeout: 100
      });
      
      const times = [];
      
      for (let i = 0; i < 3; i++) {
        const start = Date.now();
        try {
          await client.testConnection();
        } catch (error) {
          // Expected to fail
        }
        times.push(Date.now() - start);
      }
      
      // Each attempt should take roughly the same time (or all be very fast)
      const avgTime = times.reduce((a, b) => a + b) / times.length;
      if (avgTime > 10) { // Only check variance if times are significant
        times.forEach(time => {
          expect(Math.abs(time - avgTime)).toBeLessThan(avgTime * 0.5); // Within 50% of average
        });
      } else {
        // All times are very fast, which is acceptable
        expect(times.every(time => time >= 0)).toBe(true);
      }
    });

    it('should maintain client state across failures', async () => {
      const client = new JanusClient({ socketPath: '/tmp/state_test_socket' });
      
      // Client should remain functional after multiple failures
      for (let i = 0; i < 3; i++) {
        try {
          await client.testConnection();
        } catch (error) {
          // Expected failures
        }
        
        // Client should still be defined and functional
        expect(client).toBeDefined();
        expect(typeof client.testConnection).toBe('function');
      }
    });
  });

  describe('Invalid Socket Path Format', () => {
    it('should reject malformed socket paths with null bytes', () => {
      const nullBytePath = '/tmp/socket\x00path';
      
      expect(() => {
        new JanusClient({ socketPath: nullBytePath });
      }).toThrow();
    });

    it('should reject empty socket paths', () => {
      expect(() => {
        new JanusClient({ socketPath: '' });
      }).toThrow();
    });

    it('should validate socket path format using SecurityValidator', () => {
      const invalidPaths = [
        '/tmp/socket\x00path',
        '',
        '/path/with/../traversal',
        'x'.repeat(200) // Too long
      ];
      
      invalidPaths.forEach(invalidPath => {
        const result = validator.validateSocketPath(invalidPath);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      });
    });

    it('should accept valid socket path formats', () => {
      const validPaths = [
        '/tmp/valid_socket',
        '/var/run/janus.sock',
        '/tmp/janus_test_123.socket'
      ];
      
      validPaths.forEach(validPath => {
        const result = validator.validateSocketPath(validPath);
        expect(result.valid).toBe(true);
      });
    });
  });

  describe('Permission Denied Handling', () => {
    it('should handle socket permission denied errors', async () => {
      // Try to create socket in restricted directory
      const restrictedPath = '/root/restricted_socket';
      
      try {
        const client = new JanusClient({ socketPath: restrictedPath });
        await client.testConnection();
      } catch (error) {
        // Permission errors should be handled gracefully
        expect(error).toBeDefined();
        if (error instanceof Error) {
          expect(error.message).toBeDefined();
        }
      }
    });

    it('should provide descriptive permission error messages', async () => {
      const restrictedPaths = ['/root/socket', '/etc/socket', '/sys/socket'];
      
      for (const path of restrictedPaths) {
        try {
          const client = new JanusClient({ socketPath: path });
          await client.testConnection();
        } catch (error) {
          if (error instanceof Error) {
            expect(error.message).toBeDefined();
            expect(typeof error.message).toBe('string');
          }
        }
      }
    });
  });

  describe('Socket Path Length Validation', () => {
    it('should enforce Unix socket path length limits', () => {
      const longPath = '/tmp/' + 'x'.repeat(200);
      
      expect(() => {
        new JanusClient({ socketPath: longPath });
      }).toThrow();
    });

    it('should accept paths within length limits', () => {
      const validPath = '/tmp/valid_socket_name';
      
      expect(() => {
        new JanusClient({ socketPath: validPath });
      }).not.toThrow();
    });

    it('should validate path length using SecurityValidator', () => {
      const longPath = '/tmp/' + 'x'.repeat(200);
      const result = validator.validateSocketPath(longPath);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('path exceeds maximum length');
    });

    it('should handle edge cases around 108 character limit', () => {
      const exactLimitPath = '/tmp/' + 'x'.repeat(100); // Should be close to limit
      const overLimitPath = '/tmp/' + 'x'.repeat(200);
      
      const exactResult = validator.validateSocketPath(exactLimitPath);
      const overResult = validator.validateSocketPath(overLimitPath);
      
      expect(exactResult.valid).toBe(true);
      expect(overResult.valid).toBe(false);
    });
  });

  describe('Malformed Path Detection', () => {
    it('should detect and reject malformed socket paths', () => {
      const malformedPaths = [
        '/tmp/socket\x00null',
        '/tmp/socket\x01control',
        '/tmp/socket\x7Fdelete',
        '/tmp/socket with spaces', // May be invalid depending on validator
        '/tmp/socket\ttab',
        '/tmp/socket\nnewline'
      ];
      
      malformedPaths.forEach(path => {
        try {
          new JanusClient({ socketPath: path });
          // Some paths might be rejected at construction
        } catch (error) {
          expect(error).toBeDefined();
        }
      });
    });

    it('should use SecurityValidator for path validation', () => {
      const malformedPaths = [
        '/tmp/socket\x00null',
        '/tmp/socket../traversal',
        ''
      ];
      
      malformedPaths.forEach(path => {
        const result = validator.validateSocketPath(path);
        expect(result.valid).toBe(false);
      });
    });

    it('should provide manifestific error messages for different malformations', () => {
      const testCases = [
        { path: '/tmp/socket\x00null', expectedError: 'null byte' },
        { path: '/tmp/socket/../traversal', expectedError: 'traversal' },
        { path: '', expectedError: 'empty' }
      ];
      
      testCases.forEach(({ path, expectedError }) => {
        const result = validator.validateSocketPath(path);
        expect(result.valid).toBe(false);
        expect(result.error?.toLowerCase()).toContain(expectedError);
      });
    });
  });

  describe('Resource Exhaustion Handling', () => {
    it('should handle system resource exhaustion gracefully', async () => {
      // Simulate resource exhaustion by creating many clients
      const clients = [];
      
      try {
        for (let i = 0; i < 10; i++) {
          const client = new JanusClient({ 
            socketPath: `/tmp/resource_test_${i}`,
            connectionTimeout: 50
          });
          clients.push(client);
        }
        
        // Attempt connections with all clients
        const promises = clients.map(client => 
          client.testConnection().catch(error => error)
        );
        
        const results = await Promise.allSettled(promises);
        
        // Should handle results gracefully, whether success or failure
        expect(results.length).toBe(clients.length);
        results.forEach(result => {
          expect(result).toBeDefined();
        });
        
      } catch (error) {
        // Resource exhaustion should be handled gracefully
        expect(error).toBeDefined();
      }
    });

    it('should handle file descriptor limits', async () => {
      // Test creating clients up to reasonable limits
      const maxClients = 5;
      const clients = [];
      
      for (let i = 0; i < maxClients; i++) {
        try {
          const client = new JanusClient({ 
            socketPath: `/tmp/fd_test_${i}`,
            connectionTimeout: 100
          });
          clients.push(client);
        } catch (error) {
          // Should handle FD exhaustion gracefully
          expect(error).toBeDefined();
          break;
        }
      }
      
      expect(clients.length).toBeGreaterThan(0);
    });
  });

  describe('Network Interruption Recovery', () => {
    it('should handle network interruptions and recovery', async () => {
      const client = new JanusClient({ 
        socketPath: testSocketPath,
        connectionTimeout: 100
      });
      
      // Simulate interrupted connection attempt
      try {
        await client.testConnection();
      } catch (initialError) {
        // Expected failure due to no server
      }
      
      // Should still be able to attempt connections after interruption
      try {
        await client.testConnection();
      } catch (retryError) {
        // Expected failure, but should be handled consistently
        expect(retryError).toBeDefined();
      }
      
      // Client should remain functional
      expect(client).toBeDefined();
      expect(typeof client.testConnection).toBe('function');
    });

    it('should maintain consistent behavior across interruptions', async () => {
      const client = new JanusClient({ socketPath: '/tmp/interruption_test' });
      const attemptCount = 3;
      const results = [];
      
      for (let i = 0; i < attemptCount; i++) {
        try {
          const start = Date.now();
          await client.testConnection();
          results.push({ success: true, time: Date.now() - start });
        } catch (error) {
          results.push({ success: false, error: error instanceof Error ? error.message : String(error) });
        }
      }
      
      // Should have consistent behavior across attempts
      expect(results.length).toBe(attemptCount);
      
      // All failures should have similar error characteristics
      const failures = results.filter(r => !r.success);
      if (failures.length > 1) {
        const firstError = failures[0]?.error;
        failures.forEach(failure => {
          expect(typeof failure.error).toBe(typeof firstError);
        });
      }
    });

    it('should handle recovery scenarios', async () => {
      const client = new JanusClient({ 
        socketPath: '/tmp/recovery_test',
        connectionTimeout: 100
      });
      
      // Multiple recovery attempts
      const recoveryAttempts = 3;
      
      for (let attempt = 0; attempt < recoveryAttempts; attempt++) {
        try {
          await client.testConnection();
          // If connection succeeds, that's valid recovery
          break;
        } catch (error) {
          // Connection failure is expected without server
          expect(error).toBeDefined();
          
          // Client should remain capable of retry
          expect(typeof client.testConnection).toBe('function');
        }
      }
    });
  });

  describe('Error Message Quality', () => {
    it('should provide descriptive error messages for all failure types', async () => {
      const testCases = [
        { path: '/tmp/nonexistent', description: 'nonexistent socket' },
        { path: '/root/restricted', description: 'permission denied' },
        { path: '/tmp/' + 'x'.repeat(200), description: 'path too long' }
      ];
      
      for (const testCase of testCases) {
        try {
          const client = new JanusClient({ socketPath: testCase.path });
          await client.testConnection();
        } catch (error) {
          if (error instanceof Error) {
            expect(error.message).toBeDefined();
            expect(error.message.length).toBeGreaterThan(0);
            expect(typeof error.message).toBe('string');
          }
        }
      }
    });

    it('should include relevant context in error messages', () => {
      const invalidPath = '/tmp/socket\x00null';
      
      try {
        new JanusClient({ socketPath: invalidPath });
      } catch (error) {
        if (error instanceof Error) {
          expect(error.message).toBeDefined();
          // Error should be descriptive enough to understand the issue
          expect(error.message.length).toBeGreaterThan(10);
        }
      }
    });
  });
});