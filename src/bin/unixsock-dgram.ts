#!/usr/bin/env node

import { Command } from 'commander';
import * as dgram from 'dgram';
import * as fs from 'fs';
import { SocketCommand, SocketResponse } from '../types/protocol.js';
import { UnixDatagramClient } from '../core/unix-datagram-client.js';

const program = new Command();

program
  .name('unixsock-dgram')
  .description('Unified SOCK_DGRAM Unix Socket Process')
  .option('-s, --socket <path>', 'Unix socket path', '/tmp/typescript-unixsock.sock')
  .option('-l, --listen', 'Listen for datagrams on socket')
  .option('--send-to <path>', 'Send datagram to socket path')
  .option('-c, --command <cmd>', 'Command to send', 'ping')
  .option('-m, --message <msg>', 'Message to send', 'hello')
  .parse();

const options = program.opts();

async function main() {
    if (options.listen) {
        await listenForDatagrams(options.socket);
    } else if (options.sendTo) {
        await sendDatagram(options.sendTo, options.command, options.message);
    } else {
        console.error('Usage: either --listen or --send-to required');
        process.exit(1);
    }
}

async function listenForDatagrams(socketPath: string): Promise<void> {
    console.log(`Listening for SOCK_DGRAM on: ${socketPath}`);
    
    // Remove existing socket
    try {
        fs.unlinkSync(socketPath);
    } catch (err) {
        // Ignore if doesn't exist
    }
    
    const socket = dgram.createSocket('udp4'); // Note: Will need proper unix domain socket support
    
    socket.on('message', (buffer: Buffer) => {
        try {
            const cmd: SocketCommand = JSON.parse(buffer.toString());
            console.log(`Received datagram: ${cmd.command} (ID: ${cmd.id})`);
            
            // Send response via reply_to if specified
            if (cmd.reply_to) {
                sendResponse(cmd.id, cmd.channelId, cmd.command, cmd.args, cmd.reply_to);
            }
        } catch (error) {
            console.error('Failed to parse datagram:', error);
        }
    });
    
    socket.on('error', (error) => {
        console.error('Socket error:', error);
    });
    
    socket.bind(8080); // TODO: Convert to proper unix domain socket path
    console.log('Ready to receive datagrams');
    
    // Graceful shutdown
    process.on('SIGINT', () => {
        console.log('\nShutting down...');
        socket.close();
        try {
            fs.unlinkSync(socketPath);
        } catch (err) {
            // Ignore
        }
        process.exit(0);
    });
    
    // Keep process alive
    await new Promise(() => {});
}

async function sendDatagram(target: string, command: string, message: string): Promise<void> {
    console.log(`Sending SOCK_DGRAM to: ${target}`);
    
    const client = new UnixDatagramClient({ socketPath: target });
    
    // Create response socket path
    const responseSocket = `/tmp/typescript-response-${process.pid}.sock`;
    
    const cmd: SocketCommand = {
        id: generateId(),
        channelId: 'test',
        command,
        reply_to: responseSocket,
        args: { message },
        timeout: 5.0,
        timestamp: new Date().toISOString()
    };
    
    // const cmdData = Buffer.from(JSON.stringify(cmd)); // Not needed for direct sendCommand
    
    try {
        // Send datagram and wait for response
        const response = await client.sendCommand(cmd);
        console.log(`Response: Success=${response.success}, Result=${JSON.stringify(response.result)}`);
    } catch (error) {
        console.error('Failed to send datagram:', error);
    }
}

function sendResponse(
    commandId: string,
    channelId: string,
    command: string,
    args: Record<string, any> | undefined,
    _replyTo: string
): void {
    let result: Record<string, any> = {};
    let success = true;
    
    switch (command) {
        case 'ping':
            result.pong = true;
            result.echo = args;
            break;
        case 'echo':
            if (args?.message) {
                result.message = args.message;
            }
            break;
        case 'get_info':
            result.implementation = 'TypeScript';
            result.version = '1.0.0';
            result.protocol = 'SOCK_DGRAM';
            break;
        default:
            success = false;
            result.error = `Unknown command: ${command}`;
    }
    
    const response: SocketResponse = {
        commandId,
        channelId,
        success,
        ...(Object.keys(result).length > 0 && { result }),
        ...(!success && { error: {
            code: 'UNKNOWN_COMMAND',
            message: 'Unknown command'
        } }),
        timestamp: new Date().toISOString()
    };
    
    const responseData = Buffer.from(JSON.stringify(response));
    
    // Send response datagram to reply_to socket
    const replySocket = dgram.createSocket('udp4'); // Note: Will need proper unix domain socket support
    
    replySocket.send(responseData, 8081, 'localhost', (error) => { // TODO: Fix for unix domain sockets
        if (error) {
            console.error('Failed to send response:', error);
        }
        replySocket.close();
    });
}

function generateId(): string {
    return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

main().catch(console.error);