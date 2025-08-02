#!/usr/bin/env ts-node

/**
 * Simple client example for TypeScript Janus
 * Demonstrates basic client usage and command execution
 */

import { APIClient } from '../api/api-client';
import * as path from 'path';
import * as fs from 'fs';

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  let socketPath = path.join('/tmp', 'typescript-unix-sock-api-example.sock');
  let specPath = path.join(__dirname, '../../..', 'example-manifest.json');

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
    // Handle --spec=value format
    else if (arg.startsWith('--spec=')) {
      specPath = arg.substring('--spec='.length);
    }
    // Handle --spec value format
    else if (arg === '--spec' && i + 1 < args.length) {
      const nextArg = args[i + 1];
      if (nextArg) {
        specPath = nextArg;
        i++;
      }
    }
  }

  return { socketPath, specPath };
}

const { socketPath: SOCKET_PATH, specPath: MANIFEST_PATH } = parseArgs();

async function main() {
  console.log('🚀 Starting TypeScript Janus Client Example');
  console.log(`📍 Socket path: ${SOCKET_PATH}`);

  // Load Manifest
  let manifest;
  try {
    const manifestContent = await fs.promises.readFile(MANIFEST_PATH, 'utf8');
    manifest = JSON.parse(manifestContent);
    console.log(`📋 Loaded Manifest: ${manifest.name} v${manifest.version}`);
  } catch (error) {
    console.warn(`⚠️ Could not load Manifest from ${MANIFEST_PATH}, continuing without validation`);
  }

  // Create client
  const client = new APIClient({
    socketPath: SOCKET_PATH,
    defaultTimeout: 10.0,
    manifest,
    validateAgainstManifest: !!manifest,
    autoReconnect: true
  });

  try {
    // Test server connectivity (SOCK_DGRAM is connectionless)
    console.log('🔌 Testing server connectivity...');
    const isReachable = await client.testConnection();
    if (!isReachable) {
      throw new Error('Server is not reachable');
    }
    console.log('✅ Server is reachable');

    // Show available channels and commands
    if (manifest) {
      console.log('\n📋 Available channels and commands:');
      for (const channelId of client.getAvailableChannels()) {
        console.log(`   📁 ${channelId}:`);
        for (const commandName of client.getAvailableCommands(channelId)) {
          console.log(`      • ${commandName}`);
        }
      }
    }

    // Run example commands
    await runExampleCommands(client);

  } catch (error) {
    console.error('❌ Client error:', error);
  } finally {
    // No explicit disconnect needed for SOCK_DGRAM (connectionless)
    console.log('👋 Client finished');
  }
}

async function runExampleCommands(client: APIClient) {
  console.log('\n🧪 Running example commands...\n');

  try {
    // Test echo service
    console.log('1️⃣ Testing echo service...');
    const echoResult = await client.executeCommand('echo-service', 'echo', {
      message: 'Hello from TypeScript client!',
      timestamp: new Date().toISOString(),
      data: { foo: 'bar', numbers: [1, 2, 3] }
    });
    console.log('✅ Echo result:', JSON.stringify(echoResult, null, 2));

    // Test ping
    console.log('\n2️⃣ Testing ping...');
    const pingResult = await client.executeCommand('echo-service', 'ping');
    console.log('✅ Ping result:', JSON.stringify(pingResult, null, 2));

    // Test user creation
    console.log('\n3️⃣ Creating a user...');
    const createUserResult = await client.executeCommand('user-service', 'create-user', {
      username: 'typescript_user',
      email: 'typescript@example.com',
      password: 'secure_password_123',
      role: 'user',
      profile: {
        firstName: 'TypeScript',
        lastName: 'User',
        age: 25,
        bio: 'I love TypeScript and Unix sockets!',
        location: 'Code Land'
      }
    });
    console.log('✅ User created:', JSON.stringify(createUserResult, null, 2));

    // Test user retrieval
    console.log('\n4️⃣ Getting user information...');
    const getUserResult = await client.executeCommand('user-service', 'get-user', {
      userId: createUserResult.userId,
      includeProfile: true
    });
    console.log('✅ User info:', JSON.stringify(getUserResult, null, 2));

    // Test session validation
    console.log('\n5️⃣ Validating session...');
    const sessionResult = await client.executeCommand('session-service', 'validate-session', {
      sessionToken: 'mock-jwt-token-' + Date.now()
    });
    console.log('✅ Session validation:', JSON.stringify(sessionResult, null, 2));

    // Test parallel execution
    console.log('\n6️⃣ Testing parallel command execution...');
    const parallelResults = await client.executeCommands([
      { channelId: 'echo-service', commandName: 'ping' },
      { channelId: 'user-service', commandName: 'get-user', args: { username: 'john_doe' } },
      { channelId: 'session-service', commandName: 'validate-session', args: { sessionToken: 'test-token' } }
    ]);
    console.log('✅ Parallel results:');
    parallelResults.forEach((result, index) => {
      console.log(`   ${index + 1}: ${JSON.stringify(result, null, 2)}`);
    });

    // Test channel proxy
    console.log('\n7️⃣ Testing channel proxy...');
    const userChannel = client.channel('user-service');
    const updateResult = await userChannel.execute('update-user', {
      userId: createUserResult.userId,
      updates: {
        email: 'updated-typescript@example.com',
        role: 'moderator'
      }
    });
    console.log('✅ Update via channel proxy:', JSON.stringify(updateResult, null, 2));

    // Test error handling
    console.log('\n8️⃣ Testing error handling...');
    try {
      await client.executeCommand('user-service', 'delete-user', {
        userId: createUserResult.userId,
        confirmation: 'WRONG' // This should cause an error
      });
    } catch (error: any) {
      console.log('✅ Expected error caught:', error.message);
    }

    // Proper deletion
    console.log('\n9️⃣ Properly deleting user...');
    const deleteResult = await client.executeCommand('user-service', 'delete-user', {
      userId: createUserResult.userId,
      confirmation: 'DELETE'
    });
    console.log('✅ User deleted:', JSON.stringify(deleteResult, null, 2));

    // Test command validation (if Manifest is loaded)
    if (client.getManifest()) {
      console.log('\n🔟 Testing command validation...');
      const validation = client.validateCommandArgs('user-service', 'create-user', {
        username: 'test',
        email: 'invalid-email', // This should fail validation
        password: 'short' // This might fail validation too
      });
      
      if (!validation.valid) {
        console.log('✅ Validation correctly caught errors:', validation.errors);
      } else {
        console.log('⚠️ Validation passed unexpectedly');
      }
    }

    console.log('\n🎉 All example commands completed successfully!');

  } catch (error: any) {
    console.error(`❌ Error during command execution: ${error.message}`);
    if (error.code) {
      console.error(`   Code: ${error.code}`);
    }
    if (error.details) {
      console.error(`   Details: ${error.details}`);
    }
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
}