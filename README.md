# TypeScript Janus

TypeScript implementation of the Janus Protocol providing cross-platform inter-process communication with comprehensive security validation and async patterns.

## Features

- **Full Protocol Compatibility**: 100% compatible with Go, Rust, and Swift implementations
- **Async/Await Support**: Modern TypeScript async patterns throughout
- **Comprehensive Security**: 25+ security validation mechanisms
- **Type Safety**: Full TypeScript type definitions for all protocol components
- **Manifest Support**: JSON schema-based API validation and documentation
- **High-Level API Client**: Convenient abstraction for common use cases
- **Cross-Platform Testing**: Validated against all other language implementations

## Installation

```bash
npm install typescript-unix-sock-api
```

## Quick Start

### Server Example

```typescript
import { JanusServer } from 'typescript-unix-sock-api';

const server = new JanusServer({
  socketPath: '/tmp/my-app.sock',
  maxConnections: 100,
  defaultTimeout: 30.0
});

// Register command handlers
server.registerCommandHandler('user-service', 'create-user', async (args) => {
  const user = await createUser(args.username, args.email);
  return { userId: user.id, status: 'created' };
});

// Start listening
await server.startListening();
console.log('Server listening on /tmp/my-app.sock');
```

### Client Example

```typescript
import { APIClient } from 'typescript-unix-sock-api';

const client = new APIClient({
  socketPath: '/tmp/my-app.sock',
  defaultTimeout: 10.0
});

// Connect and execute commands
await client.connect();

const result = await client.executeCommand('user-service', 'create-user', {
  username: 'john_doe',
  email: 'john@example.com'
});

console.log('User created:', result);
await client.disconnect();
```

### Channel Proxy Example

```typescript
// Use channel-specific proxy for cleaner code
const userService = client.channel('user-service');

const user = await userService.execute('create-user', {
  username: 'jane_doe',
  email: 'jane@example.com'
});

const userInfo = await userService.execute('get-user', {
  userId: user.userId,
  includeProfile: true
});
```

## Manifest Support

The TypeScript implementation supports JSON-based Manifests for validation and documentation:

```typescript
import { APIClient } from 'typescript-unix-sock-api';
import manifest from './my-manifest.json';

const client = new APIClient({
  socketPath: '/tmp/my-app.sock',
  manifest,
  validateAgainstSpec: true  // Enable automatic validation
});

// Commands are automatically validated against the specification
await client.executeCommand('user-service', 'create-user', args);
```

## Security Features

The implementation includes comprehensive security validation:

- **Socket Path Validation**: Directory whitelist, path traversal prevention
- **Input Sanitization**: Null byte detection, UTF-8 validation
- **Size Limits**: Configurable message and argument size limits
- **Resource Limits**: Connection limits, timeout enforcement
- **Protocol Validation**: Message format and structure verification

## Architecture

### Core Components

- **JanusClient**: Low-level socket client with async message handling
- **JanusServer**: Server with command routing and handler management
- **APIClient**: High-level client with Manifest support
- **SecurityValidator**: Comprehensive security validation framework
- **MessageFraming**: 4-byte length prefix message framing
- **ResponseTracker**: Async response correlation and timeout management

### Protocol Compatibility

The TypeScript implementation follows the exact same protocol specification as other language implementations:

- **Message Format**: 4-byte big-endian length prefix + JSON payload
- **UUID Correlation**: v4 UUIDs for request/response correlation
- **Async Patterns**: Non-blocking command execution with response tracking
- **Error Handling**: Standardized error codes and response format

## Development

### Building

```bash
npm run build
```

### Testing

```bash
npm test
npm run test:watch
```

### Examples

```bash
# Terminal 1: Start server
npm run server

# Terminal 2: Run client
npm run client
```

### Linting

```bash
npm run lint
```

## Cross-Platform Testing

The TypeScript implementation is tested against all other language implementations:

```bash
# Run cross-platform tests (requires other implementations)
../test_cross_platform.sh
```

Test matrix includes:
- TypeScript ↔ Go
- TypeScript ↔ Rust  
- TypeScript ↔ Swift
- Plus all other language pairs

## API Reference

### Core Types

```typescript
interface JanusCommand {
  id: string;              // UUID v4
  channelId: string;       // Channel identifier
  command: string;         // Command name
  args?: Record<string, any>; // Command arguments
  timeout?: number;        // Timeout in seconds
  timestamp: string;       // ISO 8601 timestamp
}

interface JanusResponse {
  commandId: string;       // Correlates to command.id
  channelId: string;       // Channel verification
  success: boolean;        // Success/failure flag
  result?: Record<string, any>; // Success result
  error?: SocketError;     // Error information
  timestamp: string;       // Response timestamp
}
```

### Configuration

```typescript
interface ConnectionConfig {
  socketPath: string;           // Unix socket path
  defaultTimeout?: number;      // Default command timeout (30s)
  maxMessageSize?: number;      // Max message size (10MB)
  connectionTimeout?: number;   // Connection timeout (10s)
  maxPendingCommands?: number;  // Max pending commands (1000)
}

interface ServerConfig extends ConnectionConfig {
  maxConnections?: number;      // Max concurrent connections (100)
  cleanupOnStart?: boolean;     // Cleanup socket on start (true)
  cleanupOnShutdown?: boolean;  // Cleanup socket on shutdown (true)
}
```

## Error Handling

All errors include standardized error codes:

```typescript
try {
  await client.executeCommand('user-service', 'create-user', args);
} catch (error) {
  console.log(error.code);     // e.g., 'VALIDATION_FAILED'
  console.log(error.message);  // Human-readable message
  console.log(error.details);  // Additional context
}
```

Common error codes:
- `VALIDATION_FAILED` - Input validation failure
- `COMMAND_TIMEOUT` - Command execution timeout
- `CONNECTION_ERROR` - Socket connection issues
- `HANDLER_NOT_FOUND` - No handler for command
- `SECURITY_VIOLATION` - Security validation failure

## Performance

The TypeScript implementation is optimized for performance:

- **Sub-millisecond Response Times**: For local Unix socket communication
- **Efficient Message Framing**: Minimal serialization overhead
- **Connection Pooling**: Reuse connections for multiple operations
- **Async Patterns**: Non-blocking operations throughout
- **Memory Management**: Automatic cleanup and resource limits

## Protocol Specification

This implementation follows the comprehensive [Janus Protocol Specification](../PROTOCOL.md) ensuring compatibility with all other language implementations.

## Contributing

1. Follow existing code style and patterns
2. Add tests for new functionality
3. Ensure cross-platform compatibility
4. Update documentation for API changes
5. Validate against protocol specification

## License

MIT License - see LICENSE file for details.