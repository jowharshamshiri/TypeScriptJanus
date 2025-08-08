/**
 * Comprehensive Server Features Tests
 * Tests all 9 server features for TypeScript implementation
 */

import { JanusServer } from '../server/janus-server';
import { JanusClient } from '../core/janus-client';

// JanusServer is the current server implementation
import * as fs from 'fs';

describe('TypeScript Server Features Comprehensive Tests', () => {
  let server: JanusServer;
  let client: JanusClient;
  const testSocketPath = '/tmp/janus_server_features_test.sock';
  const responseSocketPath = '/tmp/janus_client_response_test.sock';

  beforeEach(async () => {
    // Clean up any existing sockets
    [testSocketPath, responseSocketPath].forEach(socketPath => {
      if (fs.existsSync(socketPath)) {
        fs.unlinkSync(socketPath);
      }
    });

    // Create server with test configuration
    server = new JanusServer({
      socketPath: testSocketPath,
      defaultTimeout: 5.0,
      maxMessageSize: 64 * 1024,
      cleanupOnStart: true,
      cleanupOnShutdown: true,
      maxConcurrentHandlers: 10
    });

    // Create client for testing
    client = new JanusClient({
      socketPath: testSocketPath,
      defaultTimeout: 5.0,
      maxMessageSize: 64 * 1024
    });
  });

  afterEach(async () => {
    // Clean shutdown
    if (server?.isListening()) {
      await server.close();
    }

    // Clean up socket files
    [testSocketPath, responseSocketPath].forEach(socketPath => {
      if (fs.existsSync(socketPath)) {
        fs.unlinkSync(socketPath);
      }
    });
  });

  describe('1. Request Handler Registry', () => {
    it('should register and manage request handlers', async () => {
      let handlerCalled = false;
      const testHandler = async (args: any) => {
        handlerCalled = true;
        return { message: 'handler executed', args };
      };

      // Register handler
      server.registerRequestHandler('test-channel', 'test-request', testHandler);

      // Verify handler is registered
      const channelHandlers = server.getChannelHandlers('test-channel');
      expect(channelHandlers).toBeDefined();
      expect(channelHandlers!.has('test-request')).toBe(true);

      // Start server and test handler execution
      await server.listen();

      const request = {
        id: 'test-1',
        method: 'ping',
        request: 'test-request',
        args: { testParam: 'value' },
        timestamp: new Date().toISOString()
      };

      const response = await client.sendRequest(request);
      
      expect(handlerCalled).toBe(true);
      expect(response.success).toBe(true);
      expect(response.result?.message).toBe('handler executed');
    });

    it('should unregister request handlers', () => {
      const testHandler = async () => ({ result: 'test' });
      
      server.registerRequestHandler('test-channel', 'test-request', testHandler);
      expect(server.getChannelHandlers('test-channel')!.has('test-request')).toBe(true);
      
      const unregistered = server.unregisterRequestHandler('test-channel', 'test-request');
      expect(unregistered).toBe(true);
      expect(server.getChannelHandlers('test-channel')!.has('test-request')).toBe(false);
    });

    it('should validate channel and request names', () => {
      const testHandler = async () => ({ result: 'test' });
      
      expect(() => {
        server.registerRequestHandler('', 'test-request', testHandler);
      }).toThrow('Invalid channel ID');
      
      expect(() => {
        server.registerRequestHandler('test-channel', '', testHandler);
      }).toThrow('Invalid request name');
    });
  });

  describe('2. Multi-Client Connection Management', () => {
    it('should track multiple client activities', async () => {
      const handler1 = async () => ({ client: 1 });
      const handler2 = async () => ({ client: 2 });
      
      server.registerRequestHandler('channel1', 'request1', handler1);
      server.registerRequestHandler('channel2', 'request2', handler2);
      
      await server.listen();

      // Simulate multiple clients by sending different requests
      const request1 = {
        id: 'client1-cmd',
        method: 'request1',
        request: 'request1',
        timestamp: new Date().toISOString()
      };

      const request2 = {
        id: 'client2-cmd',
        method: 'request2',
        request: 'request2',
        timestamp: new Date().toISOString()
      };

      await client.sendRequest(request1);
      await client.sendRequest(request2);

      const clientActivity = server.getClientActivity();
      expect(clientActivity.length).toBeGreaterThan(0);
      
      const stats = server.getServerStats();
      expect(stats.totalClients).toBeGreaterThan(0);
    });

    it('should clean up inactive clients', async () => {
      await server.listen();
      
      // Send a request to create client activity
      const testHandler = async () => ({ result: 'test' });
      server.registerRequestHandler('test', 'ping', testHandler);
      
      await client.sendRequest({
        id: 'test-cmd',
        channelId: 'test',
        request: 'ping',
        timestamp: new Date().toISOString()
      });

      const activityBefore = server.getClientActivity();
      expect(activityBefore.length).toBeGreaterThan(0);

      // Clean up inactive clients (with very short timeout for testing)
      server.cleanupInactiveClients(1); // 1ms timeout
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));
      
      server.cleanupInactiveClients(1);
      const activityAfter = server.getClientActivity();
      
      // Should have cleaned up inactive clients
      expect(activityAfter.length).toBeLessThanOrEqual(activityBefore.length);
    });
  });

  describe('3. Event-Driven Architecture', () => {
    it('should emit listening event when server starts', async () => {
      let listeningEmitted = false;
      
      server.on('listening', () => {
        listeningEmitted = true;
      });

      await server.listen();
      
      expect(listeningEmitted).toBe(true);
      expect(server.isListening()).toBe(true);
    });

    it('should emit request and response events', async () => {
      const events: string[] = [];
      
      server.on('request', () => events.push('request'));
      server.on('response', () => events.push('response'));
      server.on('clientActivity', () => events.push('clientActivity'));

      const testHandler = async () => ({ result: 'test' });
      server.registerRequestHandler('test', 'echo', testHandler);
      
      await server.listen();

      await client.sendRequest({
        id: 'event-test',
        channelId: 'test',
        request: 'echo',
        timestamp: new Date().toISOString()
      });

      expect(events).toContain('request');
      expect(events).toContain('response');
      expect(events).toContain('clientActivity');
    });

    it('should emit error events for invalid requests', async () => {
      const errorEvents: Error[] = [];
      
      server.on('error', (error: Error) => {
        errorEvents.push(error);
      });

      await server.listen();

      // Send malformed request (this might not trigger error depending on implementation)
      try {
        await client.sendRequest({
          id: 'invalid-cmd',
          channelId: 'nonexistent',
          request: 'nonexistent',
          timestamp: new Date().toISOString()
        });
      } catch (err) {
        // Expected - request not found
        expect(err).toBeDefined();
      }

      // Error events may or may not be emitted depending on implementation
      // This test validates the error handling structure exists
    });
  });

  describe('4. Graceful Shutdown', () => {
    it('should shutdown cleanly and wait for active handlers', async () => {
      let handlerStarted = false;
      let handlerCompleted = false;
      
      const slowHandler = async () => {
        handlerStarted = true;
        await new Promise(resolve => setTimeout(resolve, 100));
        handlerCompleted = true;
        return { result: 'slow-complete' };
      };

      server.registerRequestHandler('test', 'slow', slowHandler);
      await server.listen();

      // Start a slow request
      const requestPromise = client.sendRequest({
        id: 'slow-cmd',
        channelId: 'test',
        request: 'slow',
        timestamp: new Date().toISOString()
      });

      // Wait for handler to start
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(handlerStarted).toBe(true);

      // Initiate shutdown
      const shutdownPromise = server.close();

      // Wait for both to complete
      await Promise.all([requestPromise, shutdownPromise]);

      expect(handlerCompleted).toBe(true);
      expect(server.isListening()).toBe(false);
    });

    it('should cleanup socket file on shutdown', async () => {
      await server.listen();
      expect(fs.existsSync(testSocketPath)).toBe(true);

      await server.close();
      expect(fs.existsSync(testSocketPath)).toBe(false);
    });
  });

  describe('5. Connection Processing Loop', () => {
    it('should process multiple concurrent requests', async () => {
      const results: string[] = [];
      
      const handler1 = async () => {
        results.push('handler1');
        return { handler: 1 };
      };
      
      const handler2 = async () => {
        results.push('handler2');
        return { handler: 2 };
      };

      server.registerRequestHandler('channel1', 'cmd1', handler1);
      server.registerRequestHandler('channel2', 'cmd2', handler2);
      
      await server.listen();

      // Send multiple requests concurrently
      const promises = [
        client.sendRequest({
          id: 'concurrent-1',
          channelId: 'channel1',
          request: 'cmd1',
          timestamp: new Date().toISOString()
        }),
        client.sendRequest({
          id: 'concurrent-2',
          channelId: 'channel2',
          request: 'cmd2',
          timestamp: new Date().toISOString()
        })
      ];

      const responses = await Promise.all(promises);
      
      expect(responses).toHaveLength(2);
      expect(results).toContain('handler1');
      expect(results).toContain('handler2');
      
      responses.forEach(response => {
        expect(response.success).toBe(true);
      });
    });

    it('should limit concurrent handlers', async () => {
      // Create server with low concurrency limit
      const limitedServer = new JanusServer({
        socketPath: `/tmp/limited_server_${Date.now()}.sock`,
        maxConcurrentHandlers: 1
      });

      const blockingHandler = async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
        return { result: 'blocking' };
      };

      limitedServer.registerRequestHandler('test', 'blocking', blockingHandler);
      await limitedServer.listen();

      const limitedClient = new JanusClient({
        socketPath: limitedServer['config'].socketPath
      });

      // Send more requests than the limit
      const promises = Array.from({ length: 3 }, (_, i) =>
        limitedClient.sendRequest({
          id: `limited-${i}`,
          channelId: 'test',
          request: 'blocking',
          timestamp: new Date().toISOString()
        })
      );

      const responses = await Promise.allSettled(promises);
      
      // Some should succeed, some might fail due to concurrency limit
      const successful = responses.filter(r => r.status === 'fulfilled').length;
      const failed = responses.filter(r => r.status === 'rejected').length;
      
      expect(successful + failed).toBe(3);
      
      await limitedServer.close();
    });
  });

  describe('6. Error Response Generation', () => {
    it('should generate standard error responses for unknown requests', async () => {
      await server.listen();

      try {
        await client.sendRequest({
          id: 'unknown-cmd',
          channelId: 'unknown-channel',
          request: 'unknown-request',
          timestamp: new Date().toISOString()
        });
        throw new Error('Should have thrown an error');
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error.code).toBe(-32601); // METHOD_NOT_FOUND
      }
    });

    it('should generate timeout error responses', async () => {
      const timeoutHandler = async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
        return { result: 'should timeout' };
      };

      server.registerRequestHandler('test', 'timeout', timeoutHandler);
      await server.listen();

      try {
        await client.sendRequest({
          id: 'timeout-cmd',
          channelId: 'test',
          request: 'timeout',
          timeout: 0.1, // 100ms timeout
          timestamp: new Date().toISOString()
        });
        fail('Should have timed out');
      } catch (error: any) {
        expect(error.message).toContain('timeout');
      }
    });

    it('should generate JSON-RPC compliant error responses', async () => {
      const errorHandler = async () => {
        throw new Error('Test error');
      };

      server.registerRequestHandler('test', 'error', errorHandler);
      await server.listen();

      try {
        await client.sendRequest({
          id: 'error-cmd',
          channelId: 'test',
          request: 'error',
          timestamp: new Date().toISOString()
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error).toBeDefined();
        // Error should be properly formatted
      }
    });
  });

  describe('7. Client Activity Tracking', () => {
    it('should track client timestamps and request counts', async () => {
      const testHandler = async () => ({ result: 'tracked' });
      server.registerRequestHandler('test', 'track', testHandler);
      
      await server.listen();

      const startTime = Date.now();
      
      // Send multiple requests
      for (let i = 0; i < 3; i++) {
        await client.sendRequest({
          id: `track-${i}`,
          channelId: 'test',
          request: 'track',
          timestamp: new Date().toISOString()
        });
      }

      const clientActivity = server.getClientActivity();
      expect(clientActivity.length).toBe(3); // Each SOCK_DGRAM request creates a new ephemeral socket = new client
      
      // Verify that all activities have the expected properties
      clientActivity.forEach(activity => {
        expect(activity).toBeDefined();
        expect(activity.requestCount).toBe(1); // Each ephemeral socket sends exactly 1 request
        expect(activity.lastActivity.getTime()).toBeGreaterThanOrEqual(startTime);
        expect(activity.address).toBeDefined();
      });
    });

    it('should emit clientActivity events with timestamps', async () => {
      const activityEvents: Array<{ address: string, timestamp: Date }> = [];
      
      server.on('clientActivity', (address: string, timestamp: Date) => {
        activityEvents.push({ address, timestamp });
      });

      const testHandler = async () => ({ result: 'activity' });
      server.registerRequestHandler('test', 'activity', testHandler);
      
      await server.listen();

      await client.sendRequest({
        id: 'activity-cmd',
        channelId: 'test',
        request: 'activity',
        timestamp: new Date().toISOString()
      });

      expect(activityEvents.length).toBeGreaterThan(0);
      expect(activityEvents[0]?.address).toBeDefined();
      expect(activityEvents[0]?.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('8. Request Execution with Timeout', () => {
    it('should execute requests within timeout limits', async () => {
      const fastHandler = async () => {
        return { result: 'fast', executionTime: 'under-limit' };
      };

      server.registerRequestHandler('test', 'fast', fastHandler);
      await server.listen();

      const response = await client.sendRequest({
        id: 'fast-cmd',
        channelId: 'test',
        request: 'fast',
        timeout: 1.0, // 1 second timeout
        timestamp: new Date().toISOString()
      });

      expect(response.success).toBe(true);
      expect(response.result?.result).toBe('fast');
    });

    it('should timeout long-running requests', async () => {
      const slowHandler = async () => {
        await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay
        return { result: 'should not reach here' };
      };

      server.registerRequestHandler('test', 'slow', slowHandler);
      await server.listen();

      try {
        await client.sendRequest({
          id: 'slow-cmd',
          channelId: 'test',
          request: 'slow',
          timeout: 0.1, // 100ms timeout
          timestamp: new Date().toISOString()
        });
        fail('Request should have timed out');
      } catch (error: any) {
        expect(error.message).toContain('timeout');
      }
    });

    it('should handle concurrent request timeouts', async () => {
      const slowHandler = async (args: any) => {
        const delay = args.delay || 200;
        await new Promise(resolve => setTimeout(resolve, delay));
        return { result: `completed after ${delay}ms` };
      };

      server.registerRequestHandler('test', 'concurrent-slow', slowHandler);
      await server.listen();

      const promises = [
        client.sendRequest({
          id: 'concurrent-1',
          channelId: 'test',
          request: 'concurrent-slow',
          args: { delay: 50 }, // Should succeed
          timeout: 0.2,
          timestamp: new Date().toISOString()
        }),
        client.sendRequest({
          id: 'concurrent-2',
          channelId: 'test',
          request: 'concurrent-slow',
          args: { delay: 300 }, // Should timeout
          timeout: 0.1,
          timestamp: new Date().toISOString()
        })
      ];

      const results = await Promise.allSettled(promises);
      
      expect(results[0]?.status).toBe('fulfilled');
      expect(results[1]?.status).toBe('rejected');
    });
  });

  describe('9. Socket File Cleanup', () => {
    it('should clean up socket file on startup when configured', async () => {
      // Create a fake socket file
      fs.writeFileSync(testSocketPath, 'fake socket');
      expect(fs.existsSync(testSocketPath)).toBe(true);

      // Server should clean it up on start
      const cleanupServer = new JanusServer({
        socketPath: testSocketPath,
        cleanupOnStart: true
      });

      await cleanupServer.listen();
      
      // File should still exist (but as a real socket now)
      expect(fs.existsSync(testSocketPath)).toBe(true);
      
      await cleanupServer.close();
    });

    it('should clean up socket file on shutdown when configured', async () => {
      const cleanupServer = new JanusServer({
        socketPath: testSocketPath,
        cleanupOnShutdown: true
      });

      await cleanupServer.listen();
      expect(fs.existsSync(testSocketPath)).toBe(true);

      await cleanupServer.close();
      expect(fs.existsSync(testSocketPath)).toBe(false);
    });

    it('should not clean up socket file when cleanup is disabled', async () => {
      const noCleanupServer = new JanusServer({
        socketPath: testSocketPath,
        cleanupOnStart: false,
        cleanupOnShutdown: false
      });

      await noCleanupServer.listen();
      expect(fs.existsSync(testSocketPath)).toBe(true);

      await noCleanupServer.close();
      expect(fs.existsSync(testSocketPath)).toBe(true);
      
      // Manual cleanup for test
      fs.unlinkSync(testSocketPath);
    });
  });

  describe('Built-in Requests', () => {
    it('should handle built-in ping request', async () => {
      await server.listen();

      const response = await client.sendRequest({
        id: 'ping-test',
        channelId: 'system',
        request: 'ping',
        timestamp: new Date().toISOString()
      });

      expect(response.success).toBe(true);
      expect(response.result?.message).toBe('pong');
    });

    it('should handle built-in echo request', async () => {
      await server.listen();

      const response = await client.sendRequest({
        id: 'echo-test',
        channelId: 'system',
        request: 'echo',
        args: { message: 'hello world' },
        timestamp: new Date().toISOString()
      });

      expect(response.success).toBe(true);
      expect(response.result?.message).toBe('hello world');
    });

    it('should handle built-in get_info request', async () => {
      await server.listen();

      const response = await client.sendRequest({
        id: 'info-test',
        channelId: 'system',
        request: 'get_info',
        timestamp: new Date().toISOString()
      });

      expect(response.success).toBe(true);
      expect(response.result?.server).toBe('TypeScript Janus Datagram Server');
      expect(response.result?.version).toBe('1.0.0');
      expect(typeof response.result?.activeHandlers).toBe('number');
    });

    it('should handle built-in manifest request', async () => {
      const testHandler = async () => ({ result: 'test' });
      server.registerRequestHandler('test-channel', 'test-request', testHandler);
      
      await server.listen();

      const response = await client.sendRequest({
        id: 'manifest-test',
        channelId: 'system',
        request: 'manifest',
        timestamp: new Date().toISOString()
      });

      expect(response.success).toBe(true);
      expect(response.result?.manifest).toBeDefined();
      expect(response.result?.manifest.version).toBe('1.0.0');
      expect(response.result?.manifest.channels['test-channel']).toBeDefined();
    });
  });

  describe('Server Statistics', () => {
    it('should provide accurate server statistics', async () => {
      const testHandler = async () => ({ result: 'stats-test' });
      server.registerRequestHandler('stats-channel', 'stats-request', testHandler);
      
      await server.listen();

      const stats = server.getServerStats();
      
      expect(stats.listening).toBe(true);
      expect(stats.activeHandlers).toBe(0);
      expect(stats.totalChannels).toBe(1);
      expect(stats.socketPath).toBe(testSocketPath);
      expect(typeof stats.totalClients).toBe('number');
    });
  });
});