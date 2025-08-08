#!/usr/bin/env ts-node

/**
 * Simple client example for TypeScript Janus
 * Demonstrates basic client usage and request execution (channel-free)
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
        i++; // Skip next arg
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
        i++; // Skip next arg
      }
    }
  }

  return { socketPath, manifestPath };
}

async function main() {
  const { socketPath, manifestPath } = parseArgs();
  
  console.log('🚀 TypeScript Janus Simple Client');
  console.log(`📡 Connecting to: ${socketPath}`);
  console.log(`📋 Manifest path: ${manifestPath}`);

  // Load manifest if it exists
  let manifest;
  try {
    if (fs.existsSync(manifestPath)) {
      const manifestData = fs.readFileSync(manifestPath, 'utf8');
      manifest = JSON.parse(manifestData);
      console.log('✅ Manifest loaded');
    } else {
      console.log('⚠️ Manifest file not found, proceeding without validation');
    }
  } catch (error) {
    console.log('⚠️ Failed to load manifest:', error instanceof Error ? error.message : error);
  }

  // Create client
  const client = new APIClient({
    socketPath,
    defaultTimeout: 10.0,
    manifest,
    validateAgainstManifest: !!manifest
  });

  try {
    // Test server connectivity (SOCK_DGRAM is connectionless)
    console.log('🔌 Testing server connectivity...');
    const isReachable = await client.testConnection();
    if (!isReachable) {
      throw new Error('Server is not reachable');
    }
    console.log('✅ Server is reachable');

    // Show available requests
    if (manifest) {
      console.log('\n📋 Available requests:');
      const availableRequests = client.getAvailableRequests();
      for (const requestName of availableRequests) {
        console.log(`      • ${requestName}`);
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
    // Test built-in requests first
    console.log('1️⃣ Testing ping...');
    const pingResult = await client.executeRequest('ping');
    console.log('✅ Ping result:', JSON.stringify(pingResult, null, 2));

    // Test echo service
    console.log('\n2️⃣ Testing echo service...');
    const echoResult = await client.executeRequest('echo', {
      message: 'Hello from TypeScript client!'
    });
    console.log('✅ Echo result:', JSON.stringify(echoResult, null, 2));

    // Test get_info
    console.log('\n3️⃣ Testing get_info...');
    const infoResult = await client.executeRequest('get_info');
    console.log('✅ Info result:', JSON.stringify(infoResult, null, 2));

    // Test manifest request if available
    const manifest = client.getManifest();
    if (manifest && manifest.requests) {
      const requestNames = Object.keys(manifest.requests);
      if (requestNames.length > 0) {
        console.log('\n4️⃣ Testing manifest requests...');
        for (const requestName of requestNames.slice(0, 2)) { // Test up to 2 requests
          try {
            console.log(`Testing ${requestName}...`);
            const result = await client.executeRequest(requestName, {});
            console.log(`✅ ${requestName} result:`, JSON.stringify(result, null, 2));
          } catch (error) {
            console.log(`⚠️ ${requestName} failed:`, error instanceof Error ? error.message : error);
          }
        }
      }
    }

    // Test parallel execution with simplified requests
    console.log('\n5️⃣ Testing parallel request execution...');
    const parallelResults = await client.executeRequests([
      { requestName: 'ping' },
      { requestName: 'echo', args: { message: 'parallel test' } },
      { requestName: 'get_info' }
    ]);
    console.log('✅ Parallel results:');
    parallelResults.forEach((result, index) => {
      console.log(`   ${index + 1}: ${JSON.stringify(result, null, 2)}`);
    });

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
  main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}