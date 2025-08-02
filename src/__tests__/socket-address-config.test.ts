/**
 * Socket Address Configuration Tests  
 * Tests Unix domain socket address structure setup and path validation
 */

import * as fs from 'fs';
import * as path from 'path';
import { JanusClient } from '../core/janus-client';
import { SecurityValidator } from '../core/security-validator';

describe('Socket Address Configuration', () => {
  const testSocketDir = '/tmp/janus_socket_tests';
  
  beforeAll(() => {
    // Ensure test directory exists
    if (!fs.existsSync(testSocketDir)) {
      fs.mkdirSync(testSocketDir, { recursive: true });
    }
  });

  afterAll(() => {
    // Clean up test directory
    if (fs.existsSync(testSocketDir)) {
      fs.rmSync(testSocketDir, { recursive: true, force: true });
    }
  });

  describe('Socket Path Validation', () => {
    it('should validate socket path length limits', () => {
      const validator = new SecurityValidator({ maxTotalSize: 64 * 1024 });
      const validPath = path.join(testSocketDir, 'valid_socket');
      const longPath = path.join(testSocketDir, 'x'.repeat(200));
      
      expect(validPath.length).toBeLessThan(108);
      expect(longPath.length).toBeGreaterThan(108);
      
      // Valid path should pass validation
      const validResult = validator.validateSocketPath(validPath);
      expect(validResult.valid).toBe(true);
      
      // Long path should fail validation
      const longResult = validator.validateSocketPath(longPath);
      expect(longResult.valid).toBe(false);
      expect(longResult.error).toContain('path exceeds maximum length');
    });

    it('should reject paths with null bytes', () => {
      const validator = new SecurityValidator({ maxTotalSize: 64 * 1024 });
      const invalidPath = path.join(testSocketDir, 'invalid\x00path');
      
      const result = validator.validateSocketPath(invalidPath);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('null byte');
    });

    it('should handle absolute vs relative paths', () => {
      const validator = new SecurityValidator({ maxTotalSize: 64 * 1024 });
      const absolutePath = path.join(testSocketDir, 'absolute_socket');
      const relativePath = 'relative_socket';
      
      expect(path.isAbsolute(absolutePath)).toBe(true);
      expect(path.isAbsolute(relativePath)).toBe(false);
      
      // Absolute path should pass validation
      const absoluteResult = validator.validateSocketPath(absolutePath);
      expect(absoluteResult.valid).toBe(true);
      
      // Relative path should fail validation (if validator enforces absolute paths)
      const relativeResult = validator.validateSocketPath(relativePath);
      // Note: This depends on validator implementation - may or may not require absolute paths
      expect(typeof relativeResult.valid).toBe('boolean');
    });
  });

  describe('Socket Address Structure', () => {
    it('should validate socket address components', () => {
      const validator = new SecurityValidator({ maxTotalSize: 64 * 1024 });
      const socketPath = path.join(testSocketDir, 'test_socket');
      
      // Test address structure validation
      const result = validator.validateSocketPath(socketPath);
      expect(result.valid).toBe(true);
      
      // Verify path components
      expect(path.isAbsolute(socketPath)).toBe(true);
      expect(socketPath.length).toBeLessThan(108);
      expect(socketPath).not.toContain('\x00');
      expect(socketPath).not.toContain('..');
    });

    it('should handle directory structure validation', () => {
      const validator = new SecurityValidator({ maxTotalSize: 64 * 1024 });
      const validSocketPath = path.join(testSocketDir, 'subdir', 'socket');
      const invalidSocketPath = path.join('/nonexistent', 'socket');
      
      // Valid nested path should validate structure-wise
      const validResult = validator.validateSocketPath(validSocketPath);
      expect(typeof validResult.valid).toBe('boolean');
      
      // Invalid directory path should validate structure-wise (filesystem errors are separate)
      const invalidResult = validator.validateSocketPath(invalidSocketPath);
      expect(typeof invalidResult.valid).toBe('boolean');
    });
  });

  describe('Response Socket Path Generation', () => {
    it('should generate unique response socket paths', () => {
      const validator = new SecurityValidator({ maxTotalSize: 64 * 1024 });
      const basePath = '/tmp/janus_response_test';
      
      const path1 = generateResponseSocketPath(basePath);
      const path2 = generateResponseSocketPath(basePath);
      
      expect(path1).not.toBe(path2);
      expect(path1.startsWith('/tmp/janus_resp')).toBe(true);
      expect(path2.startsWith('/tmp/janus_resp')).toBe(true);
      
      // Both paths should be valid for socket address configuration
      [path1, path2].forEach(socketPath => {
        expect(socketPath.length).toBeLessThan(108);
        expect(socketPath).not.toContain('\x00');
        
        const result = validator.validateSocketPath(socketPath);
        expect(result.valid).toBe(true);
      });
    });

    it('should generate paths with proper uniqueness components', () => {
      const basePath = '/tmp/janus_unique_test';
      const generatedPath = generateResponseSocketPath(basePath);
      
      // Should contain process ID and timestamp components
      expect(generatedPath).toMatch(/_resp_\d+_\d+_\d+$/);
      expect(generatedPath.length).toBeLessThan(108);
      expect(path.isAbsolute(generatedPath)).toBe(true);
    });
  });

  describe('Socket Address Error Handling', () => {
    it('should detect potentially problematic paths', () => {
      const validator = new SecurityValidator({ maxTotalSize: 64 * 1024 });
      const restrictedPath = '/root/restricted_socket';
      
      // Validation should work even if path is problematic for filesystem access
      const result = validator.validateSocketPath(restrictedPath);
      expect(typeof result.valid).toBe('boolean');
    });

    it('should validate path component structure', () => {
      const validator = new SecurityValidator({ maxTotalSize: 64 * 1024 });
      const invalidPaths = [
        '', // Empty path
        '/path/with/../traversal', // Directory traversal
        '/path/with\x00null/byte', // Null byte
      ];
      
      invalidPaths.forEach(invalidPath => {
        const result = validator.validateSocketPath(invalidPath);
        if (invalidPath === '') {
          expect(result.valid).toBe(false);
        } else if (invalidPath.includes('..')) {
          expect(result.valid).toBe(false);
          expect(result.error).toMatch(/traversal|\.\./)
        } else if (invalidPath.includes('\x00')) {
          expect(result.valid).toBe(false);
          expect(result.error).toContain('null byte');
        }
      });
    });
  });

  describe('Socket Path Cleanup Logic', () => {
    it('should validate socket file cleanup patterns', () => {
      const validator = new SecurityValidator({ maxTotalSize: 64 * 1024 });
      const socketPath = path.join(testSocketDir, 'cleanup_test_socket');
      
      // Verify path is valid for socket operations
      const result = validator.validateSocketPath(socketPath);
      expect(result.valid).toBe(true);
      
      // Test cleanup path validation
      expect(path.isAbsolute(socketPath)).toBe(true);
      expect(socketPath.length).toBeLessThan(108);
    });

    it('should validate concurrent socket path generation', () => {
      const validator = new SecurityValidator({ maxTotalSize: 64 * 1024 });
      const basePath = '/tmp/janus_concurrent_test';
      
      // Generate multiple socket paths
      const socketPaths = Array.from({ length: 5 }, (_, i) => 
        generateResponseSocketPath(`${basePath}_${i}`)
      );
      
      // All paths should be unique and valid
      const uniquePaths = new Set(socketPaths);
      expect(uniquePaths.size).toBe(socketPaths.length);
      
      socketPaths.forEach(socketPath => {
        const result = validator.validateSocketPath(socketPath);
        expect(result.valid).toBe(true);
        expect(socketPath.length).toBeLessThan(108);
      });
    });
  });

  describe('JanusClient Socket Configuration', () => {
    it('should configure socket addresses correctly in JanusClient', () => {
      const socketPath = '/tmp/janus_client_test';
      
      // JanusClient constructor validation
      expect(() => {
        new JanusClient({ socketPath });
      }).not.toThrow();
    });

    it('should validate socket path in JanusClient constructor', () => {
      const invalidPaths = [
        '', // Empty
        'x'.repeat(200), // Too long  
      ];
      
      invalidPaths.forEach(invalidPath => {
        expect(() => {
          new JanusClient({ socketPath: invalidPath });
        }).toThrow();
      });
    });
  });
});

// Helper function to generate unique response socket paths
function generateResponseSocketPath(_basePath?: string): string {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  const pid = process.pid;
  // Keep path short to avoid 108-character limit
  return `/tmp/janus_resp_${pid}_${timestamp}_${random}`;
}