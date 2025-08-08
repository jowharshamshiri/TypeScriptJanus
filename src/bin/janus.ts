#!/usr/bin/env node

import { Command } from 'commander';
import { JanusRequest } from '../types/protocol.js';
import { JanusClient } from '../core/janus-client.js';
import { JanusServer } from '../server/janus-server.js';

const program = new Command();

program
  .name('janus-dgram')
  .description('Unified SOCK_DGRAM Unix Socket Process')
  .option('-s, --socket <path>', 'Unix socket path', '/tmp/typescript-janus.sock')
  .option('-l, --listen', 'Listen for datagrams on socket')
  .option('--send-to <path>', 'Send datagram to socket path')
  .option('-c, --request <cmd>', 'Request to send', 'ping')
  .option('-m, --message <msg>', 'Message to send', 'hello')
  .parse();

const options = program.opts();

async function main() {
    if (options.listen) {
        await listenForDatagrams(options.socket);
    } else if (options.sendTo) {
        await sendDatagram(options.sendTo, options.request, options.message);
    } else {
        console.error('Usage: either --listen or --send-to required');
        process.exit(1);
    }
}

async function listenForDatagrams(socketPath: string): Promise<void> {
    console.log(`Listening for SOCK_DGRAM on: ${socketPath}`);
    
    // Create and configure server using library API
    const server = new JanusServer({
        socketPath,
        cleanupOnStart: true,
        cleanupOnShutdown: true
    });
    
    // Built-in handlers are automatically registered by JanusServer
    console.log('Ready to receive datagrams');
    
    // Start server - this handles all socket logic
    await server.listen();
    
    // Graceful shutdown
    process.on('SIGINT', async () => {
        console.log('\nGracefully shutting down...');
        await server.close();
        process.exit(0);
    });
    
    // Keep process alive
    await new Promise(() => {});
}

async function sendDatagram(target: string, request: string, message: string): Promise<void> {
    console.log(`Sending SOCK_DGRAM to: ${target}`);
    
    const client = new JanusClient({ socketPath: target });
    
    // Prepare arguments based on request type (matching Go/Rust/Swift pattern)
    let args: Record<string, any> = {};
    if (['echo', 'get_info', 'validate', 'slow_process'].includes(request)) {
        args.message = message;
    }

    const cmd: JanusRequest = {
        id: generateId(),
        method: request,
        request,
        reply_to: `/tmp/typescript-response-${process.pid}.sock`,
        args,
        timeout: 5.0,
        timestamp: new Date().toISOString()
    };
    
    try {
        // Send request using library API
        const response = await client.sendRequest(cmd);
        console.log(`Response: Success=${response.success}, Result=${JSON.stringify(response.result)}`);
    } catch (error) {
        console.error('Failed to send datagram:', error);
    }
}

function generateId(): string {
    return Math.random().toString(36).substr(2, 9);
}

main().catch(console.error);