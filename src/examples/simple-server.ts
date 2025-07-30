#!/usr/bin/env ts-node

/**
 * Simple server example for TypeScript Unix Socket API
 * Demonstrates basic server setup with command handlers
 */

import { JanusServer } from '../server/janus-server';
import * as path from 'path';

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  let socketPath = path.join('/tmp', 'typescript-unix-sock-api-example.sock');

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;
    
    // Handle --socket-path=value format
    if (arg.startsWith('--socket-path=')) {
      socketPath = arg.substring('--socket-path='.length);
    }
    // Handle --socket-path value format
    else if (arg === '--socket-path' && i + 1 < args.length) {
      const nextArg = args[i + 1];
      if (nextArg) {
        socketPath = nextArg;
        i++;
      }
    }
  }

  return { socketPath };
}

const { socketPath: SOCKET_PATH } = parseArgs();

async function main() {
  console.log('🚀 Starting TypeScript Unix Socket API Server Example');
  console.log(`📍 Socket path: ${SOCKET_PATH}`);

  // Create server
  const server = new JanusServer({
    socketPath: SOCKET_PATH,
    maxConnections: 10,
    defaultTimeout: 30.0,
    cleanupOnStart: true,
    cleanupOnShutdown: true
  });

  // Register command handlers
  setupCommandHandlers(server);

  // Setup event listeners
  setupEventListeners(server);

  // Start listening
  try {
    await server.startListening();
    console.log('✅ Server is listening for connections');
    console.log('💡 Test with: npm run client');
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }

  // Graceful shutdown
  setupGracefulShutdown(server);
}

function setupCommandHandlers(server: JanusServer) {
  // User service commands
  server.registerCommandHandler('user-service', 'create-user', async (args) => {
    console.log('📝 Creating user:', args);
    
    // Simulate user creation logic
    const userId = `user-${Date.now()}`;
    await new Promise(resolve => setTimeout(resolve, 100)); // Simulate async work
    
    return {
      userId,
      status: 'created',
      message: 'User created successfully',
      createdAt: new Date().toISOString(),
      user: {
        userId,
        username: args.username,
        email: args.email,
        role: args.role || 'user',
        status: 'active',
        createdAt: new Date().toISOString()
      }
    };
  });

  server.registerCommandHandler('user-service', 'get-user', async (args) => {
    console.log('🔍 Getting user:', args);
    
    // Simulate user lookup
    await new Promise(resolve => setTimeout(resolve, 50));
    
    if (!args.userId && !args.username) {
      throw new Error('Either userId or username must be provided');
    }
    
    return {
      userId: args.userId || 'user-123',
      username: args.username || 'john_doe',
      email: 'john@example.com',
      role: 'user',
      status: 'active',
      createdAt: '2025-01-01T00:00:00.000Z',
      lastLoginAt: new Date().toISOString(),
      profile: args.includeProfile ? {
        firstName: 'John',
        lastName: 'Doe',
        age: 30,
        bio: 'Software developer',
        location: 'San Francisco, CA'
      } : undefined
    };
  });

  server.registerCommandHandler('user-service', 'update-user', async (args) => {
    console.log('✏️ Updating user:', args);
    
    // Simulate update logic
    await new Promise(resolve => setTimeout(resolve, 150));
    
    return {
      userId: args.userId,
      username: 'updated_user',
      email: args.updates.email || 'updated@example.com',
      role: args.updates.role || 'user',
      status: args.updates.status || 'active',
      createdAt: '2025-01-01T00:00:00.000Z',
      lastLoginAt: new Date().toISOString()
    };
  });

  server.registerCommandHandler('user-service', 'delete-user', async (args) => {
    console.log('🗑️ Deleting user:', args);
    
    if (args.confirmation !== 'DELETE') {
      throw new Error('Deletion must be confirmed with "DELETE"');
    }
    
    // Simulate deletion
    await new Promise(resolve => setTimeout(resolve, 200));
    
    return {
      deleted: true,
      deletedAt: new Date().toISOString()
    };
  });

  // Session service commands
  server.registerCommandHandler('session-service', 'validate-session', async (args) => {
    console.log('🔑 Validating session:', args.sessionToken?.substring(0, 10) + '...');
    
    await new Promise(resolve => setTimeout(resolve, 30));
    
    // Simple validation (always valid for demo)
    return {
      valid: true,
      user: {
        userId: 'user-123',
        username: 'john_doe',
        email: 'john@example.com',
        role: 'user',
        status: 'active',
        createdAt: '2025-01-01T00:00:00.000Z'
      },
      expiresAt: new Date(Date.now() + 3600000).toISOString() // 1 hour from now
    };
  });

  server.registerCommandHandler('session-service', 'logout', async (args) => {
    console.log('👋 Logging out session:', args.sessionToken?.substring(0, 10) + '...');
    
    await new Promise(resolve => setTimeout(resolve, 50));
    
    return {
      loggedOut: true,
      loggedOutAt: new Date().toISOString()
    };
  });

  // Echo service for testing
  server.registerCommandHandler('echo-service', 'echo', async (args) => {
    console.log('🔄 Echo command:', args);
    return { echoed: args };
  });

  server.registerCommandHandler('echo-service', 'ping', async () => {
    console.log('🏓 Ping command');
    return { 
      pong: true, 
      timestamp: new Date().toISOString(),
      serverInfo: {
        name: 'TypeScript Unix Socket API Server',
        version: '1.0.0',
        uptime: process.uptime()
      }
    };
  });

  console.log('📋 Registered command handlers:');
  console.log('   • user-service: create-user, get-user, update-user, delete-user');
  console.log('   • session-service: validate-session, logout');
  console.log('   • echo-service: echo, ping');
}

function setupEventListeners(server: JanusServer) {
  server.on('listening', () => {
    console.log('👂 Server is listening for connections');
  });

  server.on('connection', (clientId) => {
    console.log(`🔌 Client connected: ${clientId}`);
  });

  server.on('disconnection', (clientId) => {
    console.log(`🔌 Client disconnected: ${clientId}`);
  });

  server.on('command', (command, clientId) => {
    console.log(`📨 Command received from ${clientId}: ${command.channelId}.${command.command}`);
  });

  server.on('response', (response, clientId) => {
    const status = response.success ? '✅' : '❌';
    console.log(`📤 Response sent to ${clientId}: ${status} ${response.commandId}`);
  });

  server.on('error', (error) => {
    console.error('🚨 Server error:', error.message);
  });
}

function setupGracefulShutdown(server: JanusServer) {
  const shutdown = async (signal: string) => {
    console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
    
    try {
      await server.stopListening();
      console.log('✅ Server stopped successfully');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught exception:', error);
    shutdown('uncaughtException');
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled rejection at:', promise, 'reason:', reason);
    shutdown('unhandledRejection');
  });
}

// Only run if this file is executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
}