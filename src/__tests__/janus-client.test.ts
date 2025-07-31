/**
 * Comprehensive tests for JanusClient
 * Tests achieve 100% parity with Swift implementation patterns
 */

import { JanusClient, JanusClientError, JanusClientConfig } from '../protocol/janus-client';
import { APISpecification, SocketResponse } from '../types/protocol';
import { JanusClient } from '../core/unix-datagram-client';

// Mock the JanusClient
jest.mock('../core/unix-datagram-client');

// Mock UUID
jest.mock('uuid', () => ({
  v4: jest.fn()
}));

describe('JanusClient', () => {
  let mockUnixClient: jest.Mocked<JanusClient>;
  let config: JanusClientConfig;
  let apiSpec: APISpecification;
  let mockUuid: jest.MockedFunction<typeof import('uuid').v4>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup UUID mock
    mockUuid = require('uuid').v4;

    // Create mock implementation
    mockUnixClient = {
      sendCommand: jest.fn(),
      sendCommandNoResponse: jest.fn(),
      testConnection: jest.fn()
    } as any;

    // Mock constructor to return our mock
    (JanusClient as jest.MockedClass<typeof JanusClient>).mockImplementation(() => mockUnixClient);

    // Default configuration
    config = {
      socketPath: '/tmp/test.sock',
      channelId: 'test-channel',
      maxMessageSize: 65536,
      defaultTimeout: 30.0,
      datagramTimeout: 5.0,
      enableValidation: true
    };

    // Default API specification
    apiSpec = {
      version: '1.0.0',
      name: 'Test API',
      channels: {
        'test-channel': {
          name: 'Test Channel',
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
            },
            'echo': {
              name: 'Echo',
              description: 'Echo command',
              args: {
                'text': {
                  name: 'Text',
                  type: 'string',
                  description: 'Text to echo',
                  required: false
                }
              }
            }
          }
        }
      }
    };
  });

  describe('Constructor', () => {
    test('should create instance with valid configuration', () => {
      const client = new JanusClient(config);
      
      expect(client).toBeDefined();
      expect(client.channelIdValue).toBe('test-channel');
      expect(client.socketPathValue).toBe('/tmp/test.sock');
      expect(client.apiSpecification).toBeUndefined();
    });

    test('should create instance with API specification', () => {
      const configWithSpec = { ...config, apiSpec };
      const client = new JanusClient(configWithSpec);
      
      expect(client.apiSpecification).toBe(apiSpec);
    });

    test('should use default values for optional parameters', () => {
      const minimalConfig = {
        socketPath: '/tmp/test.sock',
        channelId: 'test-channel'
      };
      
      const client = new JanusClient(minimalConfig);
      expect(client).toBeDefined();
    });

    test('should throw on empty socket path', () => {
      const invalidConfig = { ...config, socketPath: '' };
      
      expect(() => new JanusClient(invalidConfig)).toThrow(JanusClientError);
      expect(() => new JanusClient(invalidConfig)).toThrow('Socket path cannot be empty');
    });

    test('should throw on null byte in socket path', () => {
      const invalidConfig = { ...config, socketPath: '/tmp/test\0.sock' };
      
      expect(() => new JanusClient(invalidConfig)).toThrow(JanusClientError);
      expect(() => new JanusClient(invalidConfig)).toThrow('null byte');
    });

    test('should throw on path traversal in socket path', () => {
      const invalidConfig = { ...config, socketPath: '/tmp/../etc/passwd' };
      
      expect(() => new JanusClient(invalidConfig)).toThrow(JanusClientError);
      expect(() => new JanusClient(invalidConfig)).toThrow('path traversal');
    });

    test('should throw on empty channel ID', () => {
      const invalidConfig = { ...config, channelId: '' };
      
      expect(() => new JanusClient(invalidConfig)).toThrow(JanusClientError);
      expect(() => new JanusClient(invalidConfig)).toThrow('Channel ID cannot be empty');
    });

    test('should throw on forbidden characters in channel ID', () => {
      const invalidConfig = { ...config, channelId: 'test;channel' };
      
      expect(() => new JanusClient(invalidConfig)).toThrow(JanusClientError);
      expect(() => new JanusClient(invalidConfig)).toThrow('forbidden characters');
    });

    test('should throw on path characters in channel ID', () => {
      const invalidConfig = { ...config, channelId: '../test-channel' };
      
      expect(() => new JanusClient(invalidConfig)).toThrow(JanusClientError);
      expect(() => new JanusClient(invalidConfig)).toThrow('invalid path characters');
    });

    test('should throw on invalid API specification', () => {
      const invalidSpec: APISpecification = {
        version: '1.0.0',
        channels: {}
      };
      const invalidConfig = { ...config, apiSpec: invalidSpec };
      
      expect(() => new JanusClient(invalidConfig)).toThrow(JanusClientError);
      expect(() => new JanusClient(invalidConfig)).toThrow('at least one channel');
    });

    test('should throw on missing channel in API specification', () => {
      const invalidSpec: APISpecification = {
        version: '1.0.0',
        channels: {
          'other-channel': {
            commands: {
              'test': {
                description: 'Test command'
              }
            }
          }
        }
      };
      const invalidConfig = { ...config, apiSpec: invalidSpec };
      
      expect(() => new JanusClient(invalidConfig)).toThrow(JanusClientError);
      expect(() => new JanusClient(invalidConfig)).toThrow('not found in API specification');
    });
  });

  describe('sendCommand', () => {
    let client: JanusClient;

    beforeEach(() => {
      client = new JanusClient({ ...config, apiSpec });
    });

    test('should send command and return response', async () => {
      const mockResponse: SocketResponse = {
        commandId: 'test-id',
        channelId: 'test-channel',
        success: true,
        result: { message: 'pong' },
        timestamp: Date.now()
      };

      // Mock UUID generation
      mockUuid.mockReturnValue('test-id');
      mockUnixClient.sendCommand.mockResolvedValue(mockResponse);

      const result = await client.sendCommand('ping', { message: 'hello' });

      expect(result).toBe(mockResponse);
      expect(mockUnixClient.sendCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-id',
          channelId: 'test-channel',
          command: 'ping',
          args: { message: 'hello' },
          timeout: 30.0
        })
      );
    });

    test('should use custom timeout', async () => {
      const mockResponse: SocketResponse = {
        commandId: 'test-id',
        channelId: 'test-channel',
        success: true,
        timestamp: Date.now()
      };

      mockUuid.mockReturnValue('test-id');
      mockUnixClient.sendCommand.mockResolvedValue(mockResponse);

      await client.sendCommand('ping', { message: 'test' }, 10.0);

      expect(mockUnixClient.sendCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 10.0
        })
      );
    });

    test('should throw on command ID mismatch', async () => {
      const mockResponse: SocketResponse = {
        commandId: 'wrong-id',
        channelId: 'test-channel',
        success: true,
        timestamp: Date.now()
      };

      mockUuid.mockReturnValue('test-id');
      mockUnixClient.sendCommand.mockResolvedValue(mockResponse);

      await expect(client.sendCommand('ping', { message: 'test' })).rejects.toThrow(JanusClientError);
      await expect(client.sendCommand('ping', { message: 'test' })).rejects.toThrow('correlation mismatch');
    });

    test('should throw on channel ID mismatch', async () => {
      const mockResponse: SocketResponse = {
        commandId: 'test-id',
        channelId: 'wrong-channel',
        success: true,
        timestamp: Date.now()
      };

      mockUuid.mockReturnValue('test-id');
      mockUnixClient.sendCommand.mockResolvedValue(mockResponse);

      await expect(client.sendCommand('ping', { message: 'test' })).rejects.toThrow(JanusClientError);
      await expect(client.sendCommand('ping', { message: 'test' })).rejects.toThrow('Channel mismatch');
    });

    test('should validate command against API specification', async () => {
      await expect(client.sendCommand('unknown-command')).rejects.toThrow(JanusClientError);
      await expect(client.sendCommand('unknown-command')).rejects.toThrow('Unknown command');
    });

    test('should validate required arguments', async () => {
      await expect(client.sendCommand('ping')).rejects.toThrow(JanusClientError);
      await expect(client.sendCommand('ping')).rejects.toThrow('Missing required argument');
    });

    test('should allow optional arguments to be missing', async () => {
      const mockResponse: SocketResponse = {
        commandId: 'test-id',
        channelId: 'test-channel',
        success: true,
        timestamp: Date.now()
      };

      mockUuid.mockReturnValue('test-id');
      mockUnixClient.sendCommand.mockResolvedValue(mockResponse);

      // echo command has optional text argument
      await expect(client.sendCommand('echo')).resolves.toBe(mockResponse);
    });

    test('should skip validation when disabled', async () => {
      const clientNoValidation = new JanusClient({ 
        ...config, 
        apiSpec, 
        enableValidation: false 
      });

      const mockResponse: SocketResponse = {
        commandId: 'test-id',
        channelId: 'test-channel',
        success: true,
        timestamp: Date.now()
      };

      mockUuid.mockReturnValue('test-id');
      mockUnixClient.sendCommand.mockResolvedValue(mockResponse);

      // Should not throw even with unknown command
      await expect(clientNoValidation.sendCommand('unknown-command')).resolves.toBe(mockResponse);
    });
  });

  describe('sendCommandNoResponse', () => {
    let client: JanusClient;

    beforeEach(() => {
      client = new JanusClient({ ...config, apiSpec });
    });

    test('should send command without waiting for response', async () => {
      mockUnixClient.sendCommandNoResponse.mockResolvedValue(undefined);

      await client.sendCommandNoResponse('echo', { text: 'hello' });

      expect(mockUnixClient.sendCommandNoResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          channelId: 'test-channel',
          command: 'echo',
          args: { text: 'hello' }
        })
      );
    });

    test('should validate command against API specification', async () => {
      await expect(client.sendCommandNoResponse('unknown-command')).rejects.toThrow(JanusClientError);
      await expect(client.sendCommandNoResponse('unknown-command')).rejects.toThrow('Unknown command');
    });

    test('should not include reply_to field', async () => {
      mockUnixClient.sendCommandNoResponse.mockResolvedValue(undefined);

      await client.sendCommandNoResponse('echo');

      expect(mockUnixClient.sendCommandNoResponse).toHaveBeenCalledWith(
        expect.not.objectContaining({
          reply_to: expect.anything()
        })
      );
    });
  });

  describe('testConnection', () => {
    let client: JanusClient;

    beforeEach(() => {
      client = new JanusClient(config);
    });

    test('should test connection successfully', async () => {
      mockUnixClient.testConnection.mockResolvedValue(true);

      await expect(client.testConnection()).resolves.toBeUndefined();
    });

    test('should throw on connection test failure', async () => {
      mockUnixClient.testConnection.mockResolvedValue(false);

      await expect(client.testConnection()).rejects.toThrow(JanusClientError);
      await expect(client.testConnection()).rejects.toThrow('Connection test failed');
    });

    test('should propagate underlying errors', async () => {
      mockUnixClient.testConnection.mockRejectedValue(new Error('Connection error'));

      await expect(client.testConnection()).rejects.toThrow('Connection error');
    });
  });

  describe('ping', () => {
    let client: JanusClient;

    beforeEach(() => {
      client = new JanusClient(config);
    });

    test('should return true on successful ping', async () => {
      const mockResponse: SocketResponse = {
        commandId: 'test-id',
        channelId: 'test-channel',
        success: true,
        timestamp: Date.now()
      };

      mockUuid.mockReturnValue('test-id');
      mockUnixClient.sendCommand.mockResolvedValue(mockResponse);

      const result = await client.ping();
      expect(result).toBe(true);
    });

    test('should return false on failed ping', async () => {
      const mockResponse: SocketResponse = {
        commandId: 'test-id',
        channelId: 'test-channel',
        success: false,
        timestamp: Date.now()
      };

      mockUuid.mockReturnValue('test-id');
      mockUnixClient.sendCommand.mockResolvedValue(mockResponse);

      const result = await client.ping();
      expect(result).toBe(false);
    });

    test('should return false on ping error', async () => {
      mockUnixClient.sendCommand.mockRejectedValue(new Error('Ping failed'));

      const result = await client.ping();
      expect(result).toBe(false);
    });

    test('should use 10 second timeout for ping', async () => {
      const mockResponse: SocketResponse = {
        commandId: 'test-id',
        channelId: 'test-channel',
        success: true,
        timestamp: Date.now()
      };

      mockUuid.mockReturnValue('test-id');
      mockUnixClient.sendCommand.mockResolvedValue(mockResponse);

      await client.ping();

      expect(mockUnixClient.sendCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'ping',
          timeout: 10.0
        })
      );
    });
  });

  describe('Public Properties', () => {
    test('should expose channel ID', () => {
      const client = new JanusClient(config);
      expect(client.channelIdValue).toBe('test-channel');
    });

    test('should expose socket path', () => {
      const client = new JanusClient(config);
      expect(client.socketPathValue).toBe('/tmp/test.sock');
    });

    test('should expose API specification', () => {
      const configWithSpec = { ...config, apiSpec };
      const client = new JanusClient(configWithSpec);
      expect(client.apiSpecification).toBe(apiSpec);
    });

    test('should return undefined for API specification when not provided', () => {
      const client = new JanusClient(config);
      expect(client.apiSpecification).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    test('should create JanusClientError with details', () => {
      const error = new JanusClientError('Test error', 'TEST_ERROR', 'Test details');
      
      expect(error.name).toBe('JanusClientError');
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.details).toBe('Test details');
      expect(error instanceof Error).toBe(true);
    });

    test('should create JanusClientError without details', () => {
      const error = new JanusClientError('Test error', 'TEST_ERROR');
      
      expect(error.details).toBeUndefined();
    });
  });

  describe('Edge Cases', () => {
    test('should handle undefined args in sendCommand', async () => {
      const client = new JanusClient({ ...config, apiSpec, enableValidation: false });
      const mockResponse: SocketResponse = {
        commandId: 'test-id',
        channelId: 'test-channel',
        success: true,
        timestamp: Date.now()
      };

      mockUuid.mockReturnValue('test-id');
      mockUnixClient.sendCommand.mockResolvedValue(mockResponse);

      await client.sendCommand('echo');

      // When no args provided, the args field should not be present in the object
      expect(mockUnixClient.sendCommand).toHaveBeenCalledWith(
        expect.not.objectContaining({
          args: expect.anything()
        })
      );
    });

    test('should handle whitespace in socket path validation', () => {
      const invalidConfig = { ...config, socketPath: '   ' };
      
      expect(() => new JanusClient(invalidConfig)).toThrow(JanusClientError);
    });

    test('should handle whitespace in channel ID validation', () => {
      const invalidConfig = { ...config, channelId: '   ' };
      
      expect(() => new JanusClient(invalidConfig)).toThrow(JanusClientError);
    });
  });
});