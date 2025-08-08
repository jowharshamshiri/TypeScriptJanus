#!/usr/bin/env ts-node

/**
 * Simple client example for TypeScript Janus
 * Demonstrates basic client usage and request execution
 */

import { APIClient } from '../api/api-client';
import * as path from 'path';
import * as fs from 'fs';

// Parse request line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  let socketPath = path.join('/tmp', 'typescript-unix-sock-api-example.sock');
  let manifestPath = path.join(__dirname, '../../..', 'example-manifest.json');

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
    // Handle --manifest=value format
    else if (arg.startsWith('--manifest=')) {
      manifestPath = arg.substring('--manifest='.length);
    }
    // Handle --manifest value format
    else if (arg === '--manifest' && i + 1 < args.length) {
      const nextArg = args[i + 1];
      if (nextArg) {
        manifestPath = nextArg;
        i++;
      }
    }
  }

  return { socketPath, manifestPath };
}

const { socketPath: SOCKET_PATH, manifestPath: MANIFEST_PATH } = parseArgs();

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

    // Show available channels and requests
    if (manifest) {
      console.log('\n📋 Available channels and requests:');
      for (const channelId of client.getAvailableChannels()) {
        console.log(`   📁 ${channelId}:`);
        for (const requestName of client.getAvailableRequests(channelId)) {
          console.log(`      • ${requestName}`);
        }
      }
    }

    // Run example requests
    await runExampleRequests(client);

  } catch (error) {
    console.error('❌ Client error:', error);
  } finally {
    // No explicit disconnect needed for SOCK_DGRAM (connectionless)
    console.log('👋 Client finished');
  }
}

async function runExampleRequests(client: APIClient) {
  console.log('\n🧪 Running example requests...\n');

  try {
    // Test echo service
    console.log('1️⃣ Testing echo service...');
    const echoResult = await client.executeRequest('echo-service', 'echo', {
      message: 'Hello from TypeScript client!',
      timestamp: new Date().toISOString(),
      data: { foo: 'bar', numbers: [1, 2, 3] }
    });
    console.log('✅ Echo result:', JSON.stringify(echoResult, null, 2));

    // Test ping
    console.log('\n2️⃣ Testing ping...');
    const pingResult = await client.executeRequest('echo-service', 'ping');
    console.log('✅ Ping result:', JSON.stringify(pingResult, null, 2));

    // Test user creation
    console.log('\n3️⃣ Creating a user...');
    const createUserResult = await client.executeRequest('user-service', 'create-user', {
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
    const getUserResult = await client.executeRequest('user-service', 'get-user', {
      userId: createUserResult.userId,
      includeProfile: true
    });
    console.log('✅ User info:', JSON.stringify(getUserResult, null, 2));

    // Test session validation
    console.log('\n5️⃣ Validating session...');
    const sessionResult = await client.executeRequest('session-service', 'validate-session', {
      sessionToken: 'mock-jwt-token-' + Date.now()
    });
    console.log('✅ Session validation:', JSON.stringify(sessionResult, null, 2));

    // Test parallel execution
    console.log('\n6️⃣ Testing parallel request execution...');
    const parallelResults = await client.executeRequests([
      { channelId: 'echo-service', requestName: 'ping' },
      { channelId: 'user-service', requestName: 'get-user', args: { username: 'john_doe' } },
      { channelId: 'session-service', requestName: 'validate-session', args: { sessionToken: 'test-token' } }
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
      await client.executeRequest('user-service', 'delete-user', {
        userId: createUserResult.userId,
        confirmation: 'WRONG' // This should cause an error
      });
    } catch (error: any) {
      console.log('✅ Expected error caught:', error.message);
    }

    // Proper deletion
    console.log('\n9️⃣ Properly deleting user...');
    const deleteResult = await client.executeRequest('user-service', 'delete-user', {
      userId: createUserResult.userId,
      confirmation: 'DELETE'
    });
    console.log('✅ User deleted:', JSON.stringify(deleteResult, null, 2));

    // Test request validation (if Manifest is loaded)
    if (client.getManifest()) {
      console.log('\n🔟 Testing request validation...');
      const validation = client.validateRequestArgs('user-service', 'create-user', {
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

    console.log('\n🎉 All example requests completed successfully!');

  } catch (error: any) {
    console.error(`❌ Error during request execution: ${error.message}`);
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