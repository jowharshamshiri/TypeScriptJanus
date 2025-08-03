/**
 * Test Server Setup Utilities
 * Provides proper server infrastructure for tests requiring manifest/connection
 * Following the Swift test pattern for reliable test server management
 */

import { JanusServer } from '../server/janus-server';
import { JanusClient } from '../core/janus-client';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

export interface TestServerSetup {
  server: JanusServer;
  client: JanusClient;
  socketPath: string;
  responseSocketPath: string;
  cleanup: () => Promise<void>;
}

/**
 * Setup a test server with basic configuration for tests requiring server connection
 * Returns complete test setup with automatic cleanup
 */
export async function setupTestServer(): Promise<TestServerSetup> {
  const testId = uuidv4().substring(0, 8);
  const socketPath = `/tmp/janus_test_server_${testId}.sock`;
  const responseSocketPath = `/tmp/janus_test_response_${testId}.sock`;

  // Clean up any existing sockets
  [socketPath, responseSocketPath].forEach(socketPath => {
    if (fs.existsSync(socketPath)) {
      fs.unlinkSync(socketPath);
    }
  });

  // Create server with test configuration
  const server = new JanusServer({
    socketPath: socketPath,
    defaultTimeout: 5.0,
    maxMessageSize: 64 * 1024,
    cleanupOnStart: true,
    cleanupOnShutdown: true,
    maxConcurrentHandlers: 10
  });

  // Create client for testing
  const client = new JanusClient({
    socketPath: socketPath,
    defaultTimeout: 5.0,
    maxMessageSize: 64 * 1024
  });

  // Start server
  await server.listen();

  // Give server time to initialize
  await new Promise(resolve => setTimeout(resolve, 100));

  const cleanup = async () => {
    // Clean shutdown
    if (server?.isListening()) {
      await server.close();
    }

    // Clean up socket files
    [socketPath, responseSocketPath].forEach(socketPath => {
      if (fs.existsSync(socketPath)) {
        try {
          fs.unlinkSync(socketPath);
        } catch (error) {
          // Ignore cleanup errors in test environment
        }
      }
    });
  };

  return {
    server,
    client,
    socketPath,
    responseSocketPath,
    cleanup
  };
}

/**
 * Create a test manifest for server tests
 */
export function createTestManifest() {
  return {
    name: "Test Manifest",
    version: "1.0.0",
    description: "Test manifest for unit tests",
    channels: {
      test: {
        channel: "test",
        description: "Test channel",
        commands: {
          test_command: {
            command: "test_command",
            description: "Test command for server tests",
            arguments: [
              {
                name: "message",
                type: "string",
                required: false,
                description: "Test message"
              }
            ],
            response: {
              type: "object",
              description: "Test response",
              properties: {},
              required: []
            }
          }
        }
      }
    },
    models: {}
  };
}

/**
 * Setup test environment with server and multiple clients for complex tests
 */
export async function setupMultiClientTestEnvironment(clientCount: number = 3): Promise<{
  server: JanusServer;
  clients: JanusClient[];
  socketPath: string;
  cleanup: () => Promise<void>;
}> {
  const testId = uuidv4().substring(0, 8);
  const socketPath = `/tmp/janus_test_multiclient_${testId}.sock`;

  // Clean up any existing socket
  if (fs.existsSync(socketPath)) {
    fs.unlinkSync(socketPath);
  }

  // Create server with test configuration
  const server = new JanusServer({
    socketPath: socketPath,
    defaultTimeout: 5.0,
    maxMessageSize: 64 * 1024,
    cleanupOnStart: true,
    cleanupOnShutdown: true,
    maxConcurrentHandlers: clientCount * 2
  });

  // Create multiple clients
  const clients: JanusClient[] = [];
  for (let i = 0; i < clientCount; i++) {
    clients.push(new JanusClient({
      socketPath: socketPath,
      defaultTimeout: 5.0,
      maxMessageSize: 64 * 1024
    }));
  }

  // Start server
  await server.listen();

  // Give server time to initialize
  await new Promise(resolve => setTimeout(resolve, 100));

  const cleanup = async () => {
    // Clean shutdown
    if (server?.isListening()) {
      await server.close();
    }

    // Clean up socket file
    if (fs.existsSync(socketPath)) {
      try {
        fs.unlinkSync(socketPath);
      } catch (error) {
        // Ignore cleanup errors in test environment
      }
    }
  };

  return {
    server,
    clients,
    socketPath,
    cleanup
  };
}