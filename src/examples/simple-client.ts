#!/usr/bin/env ts-node

/**
 * Simple client example for TypeScript Unix Socket API
 * Demonstrates basic client usage and command execution
 */

import { APIClient } from '../api/api-client';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

const SOCKET_PATH = path.join(os.tmpdir(), 'typescript-unix-sock-api-example.sock');
const API_SPEC_PATH = path.join(__dirname, '../../..', 'example-api-spec.json');

async function main() {
  console.log('🚀 Starting TypeScript Unix Socket API Client Example');
  console.log(`📍 Socket path: ${SOCKET_PATH}`);

  // Load API specification
  let apiSpec;
  try {
    const apiSpecContent = await fs.promises.readFile(API_SPEC_PATH, 'utf8');
    apiSpec = JSON.parse(apiSpecContent);
    console.log(`📋 Loaded API specification: ${apiSpec.name} v${apiSpec.version}`);
  } catch (error) {
    console.warn(`⚠️ Could not load API spec from ${API_SPEC_PATH}, continuing without validation`);
  }

  // Create client
  const client = new APIClient({
    socketPath: SOCKET_PATH,
    defaultTimeout: 10.0,
    apiSpec,
    validateAgainstSpec: !!apiSpec,
    autoReconnect: true
  });

  try {
    // Connect to server
    console.log('🔌 Connecting to server...');
    await client.connect();
    console.log('✅ Connected successfully');

    // Show available channels and commands
    if (apiSpec) {
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
    // Disconnect
    try {
      await client.disconnect();
      console.log('👋 Disconnected from server');
    } catch (error) {
      console.error('⚠️ Error during disconnect:', error);
    }
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

    // Test command validation (if API spec is loaded)
    if (client.getAPISpecification()) {
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