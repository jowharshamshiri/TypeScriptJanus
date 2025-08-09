# TypeScript Janus

TypeScript implementation of the Janus Protocol providing **SOCK_DGRAM connectionless communication** with automatic ID management and full type safety.

## Features

- **Connectionless SOCK_DGRAM**: Unix domain datagram sockets with reply-to mechanism
- **Automatic ID Management**: RequestHandle system hides UUID complexity from users
- **Modern TypeScript**: Native async/await patterns with full type safety
- **Cross-Language Compatibility**: Perfect compatibility with Go, Rust, and Swift implementations
- **Dynamic Manifest**: Server-provided Manifests with auto-fetch validation
- **Security Framework**: 27 comprehensive security mechanisms and attack prevention
- **JSON-RPC 2.0 Compliance**: Standardized error codes and response format
- **Type Safety**: Complete TypeScript definitions for all protocol components
- **High-Level API Client**: Convenient abstraction for common use cases
- **Cross-Platform Testing**: Validated against all other language implementations

## Installation

```bash
npm install typescript-unix-sock-api
```

## Quick Start

## Installation

```bash
# Use local path for development
npm install typescript-janus@file:../TypeScriptJanus
```

## Quick Start

### API Manifest

Before creating servers or clients, you need a manifest file defining your API:

**my-api-manifest.json:**
```json
{
  "name": "My Application API",
  "version": "1.0.0",
  "description": "Example API for demonstration",
  "models": {
    "GetUserRequest": {
      "type": "object",
      "properties": {
        "user_id": {
          "type": "string",
          "description": "User identifier"
        }
      },
      "required": ["user_id"]
    },
    "GetUserResponse": {
      "type": "object",
      "properties": {
        "id": {"type": "string"},
        "name": {"type": "string"},
        "email": {"type": "string"}
      }
    }
  }
}
```

**Note**: Built-in requests (`ping`, `echo`, `get_info`, `validate`, `slow_process`, `manifest`) are always available and cannot be overridden in manifests.

### Simple Client Example

```typescript
import { JanusClient, JanusClientConfig } from 'typescript-janus';

async function main() {
  // Create client - manifest is fetched automatically from server
  const config: JanusClientConfig = {
    socketPath: '/tmp/my-server.sock'
  };
  const client = await JanusClient.create(config);

  // Built-in requests (always available)
  const response = await client.sendRequest('ping');
  if (response.success) {
    console.log('Server ping:', response.result);
  }

  // Custom request defined in manifest (arguments validated automatically)
  const userArgs = {
    user_id: 'user123'
  };

  const userResponse = await client.sendRequest('get_user', userArgs);
  if (userResponse.success) {
    console.log('User data:', userResponse.result);
  } else {
    console.log('Error:', userResponse.error);
  }
}

main().catch(console.error);
```

### Advanced Request Tracking

```typescript
import { JanusClient, RequestHandle, RequestStatus } from 'typescript-unix-sock-api';

async function main() {
  const client = await JanusClient.create({
    socketPath: '/tmp/my_socket.sock',
    channelId: 'my_channel'
  });

  const args = {
    data: 'processing_task'
  };

  // Send request with RequestHandle for tracking
  const { handle, responsePromise } = await client.sendRequestWithHandle(
    'process_data',
    args,
    30 // timeout in seconds
  );

  console.log(`Request started: ${handle.getRequest()} on channel ${handle.getChannel()}`);

  // Can check status or cancel if needed
  if (handle.isCancelled()) {
    console.log('Request was cancelled');
    return;
  }

  // Wait for response with timeout handling
  try {
    const response = await Promise.race([
      responsePromise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('timeout')), 10000)
      )
    ]);
    console.log('Success:', response);
  } catch (error) {
    client.cancelRequest(handle);
    console.log('Request failed or cancelled:', error);
  }
}

main().catch(console.error);
```

### Server Usage

```typescript
import { JanusServer, JSONRPCError } from 'typescript-janus';

async function main() {
  // Create server
  const server = new JanusServer({ socketPath: '/tmp/my-server.sock' });
  
  // Register handlers for custom requests defined in the manifest
  server.registerRequestHandler('get_user', async (request) => {
    if (!request.args?.user_id) {
      throw new JSONRPCError(-32602, 'Missing user_id argument');
    }
    
    // Simulate user lookup
    return {
      id: request.args.user_id,
      name: 'John Doe',
      email: 'john@example.com'
    };
  });
  
  server.registerRequestHandler('update_profile', async (request) => {
    if (!request.args?.user_id) {
      throw new JSONRPCError(-32602, 'Missing user_id argument');
    }
    
    const updatedFields = [];
    if (request.args.name) updatedFields.push('name');
    if (request.args.email) updatedFields.push('email');
    
    return {
      success: true,
      updated_fields: updatedFields
    };
  });
  
  // Start listening (blocks until stopped)
  await server.listen();
  console.log('Server listening on /tmp/my-server.sock...');
}

main().catch(console.error);
```

### Client Usage

```typescript
import { JanusClient, JanusClientConfig } from 'typescript-janus';

async function main() {
  // Create client - manifest is fetched automatically from server
  const config: JanusClientConfig = {
    socketPath: '/tmp/my-server.sock'
  };
  const client = await JanusClient.create(config);

  // Built-in requests (always available)
  const response = await client.sendRequest('ping');
  if (response.success) {
    console.log('Server ping:', response.result);
  }

  // Custom request defined in manifest (arguments validated automatically)
  const userArgs = {
    user_id: 'user123'
  };

  const userResponse = await client.sendRequest('get_user', userArgs);
  if (userResponse.success) {
    console.log('User data:', userResponse.result);
  } else {
    console.log('Error:', userResponse.error);
  }
  
  // Get server API manifest
  const manifestResponse = await client.sendRequest('manifest');
  console.log('Server API manifest:', manifestResponse.result);
}

main().catch(console.error);
```

### Fire-and-Forget Requests

```typescript
// Send request without waiting for response
const logArgs = {
  level: 'info',
  message: 'User profile updated'
};

try {
  await client.sendRequestNoResponse('log_event', logArgs);
  console.log('Event logged successfully');
} catch (error) {
  console.log('Failed to log event:', error);
}
```

## RequestHandle Management

```typescript
// Get all pending requests
const handles = client.getPendingRequests();
console.log(`Pending requests: ${handles.length}`);

for (const handle of handles) {
  console.log(`Request: ${handle.getRequest()} on ${handle.getChannel()} (created: ${handle.getTimestamp()})`);
  
  // Check status
  const status = client.getRequestStatus(handle);
  switch (status) {
    case RequestStatus.Pending:
      console.log('Status: Still processing');
      break;
    case RequestStatus.Completed:
      console.log('Status: Completed');
      break;
    case RequestStatus.Cancelled:
      console.log('Status: Cancelled');
      break;
  }
}

// Cancel all pending requests
const cancelled = client.cancelAllRequests();
console.log(`Cancelled ${cancelled} requests`);
```

## Configuration

```typescript
import { JanusClient, JanusClientConfig } from 'typescript-unix-sock-api';

const config: JanusClientConfig = {
  socketPath: '/tmp/my_socket.sock',
  channelId: 'my_channel',
  maxMessageSize: 10 * 1024 * 1024, // 10MB
  defaultTimeout: 30,
  datagramTimeout: 5,
  enableValidation: true
};

const client = await JanusClient.create(config);
```

## Configuration

```typescript
import { JanusClient, JanusClientConfig } from 'typescript-unix-sock-api';

const config: JanusClientConfig = {
  socketPath: '/tmp/my-server.sock',
  channelId: 'default',
  maxMessageSize: 10 * 1024 * 1024, // 10MB
  defaultTimeout: 30,
  datagramTimeout: 5,
  enableValidation: true
};

const client = await JanusClient.create(config);
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
- **JanusServer**: Server with request routing and handler management
- **APIClient**: High-level client with Manifest support
- **SecurityValidator**: Comprehensive security validation framework
- **MessageFraming**: 4-byte length prefix message framing
- **ResponseTracker**: Async response correlation and timeout management

### Protocol Compatibility

The TypeScript implementation follows the exact same protocol manifest as other language implementations:

- **Message Format**: 4-byte big-endian length prefix + JSON payload
- **UUID Correlation**: v4 UUIDs for request/response correlation
- **Async Patterns**: Non-blocking request execution with response tracking
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
interface JanusRequest {
  id: string;              // UUID v4
  channelId: string;       // Channel identifier
  request: string;         // Request name
  args?: Record<string, any>; // Request arguments
  timeout?: number;        // Timeout in seconds
  timestamp: string;       // ISO 8601 timestamp
}

interface JanusResponse {
  requestId: string;       // Correlates to request.id
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
  defaultTimeout?: number;      // Default request timeout (30s)
  maxMessageSize?: number;      // Max message size (10MB)
  connectionTimeout?: number;   // Connection timeout (10s)
  maxPendingRequests?: number;  // Max pending requests (1000)
}

interface ServerConfig extends ConnectionConfig {
  maxConnections?: number;      // Max concurrent connections (100)
  cleanupOnStart?: boolean;     // Cleanup socket on start (true)
  cleanupOnShutdown?: boolean;  // Cleanup socket on shutdown (true)
}
```

## Error Handling

JSON-RPC 2.0 compliant error handling:

```typescript
import { JSONRPCError } from 'typescript-unix-sock-api';

try {
  const response = await client.sendRequest('echo', args);
  console.log('Success:', response);
} catch (error) {
  if (error instanceof JSONRPCError) {
    switch (error.code) {
      case -32601:
        console.log('Request not found:', error.message);
        break;
      case -32602:
        console.log('Invalid parameters:', error.message);
        break;
      case -32603:
        console.log('Internal error:', error.message);
        break;
      case -32005:
        console.log('Validation failed:', error.message);
        break;
      default:
        console.log(`Error ${error.code}: ${error.message}`);
    }
  }
}
```

## Performance

The TypeScript implementation is optimized for performance:

- **Sub-millisecond Response Times**: For local Unix socket communication
- **Efficient Message Framing**: Minimal serialization overhead
- **Connection Pooling**: Reuse connections for multiple operations
- **Async Patterns**: Non-blocking operations throughout
- **Memory Management**: Automatic cleanup and resource limits

## Protocol Manifest

This implementation follows the comprehensive [Janus Protocol Manifest](../PROTOCOL.md) ensuring compatibility with all other language implementations.

## Contributing

1. Follow existing code style and patterns
2. Add tests for new functionality
3. Ensure cross-platform compatibility
4. Update documentation for API changes
5. Validate against protocol manifest

## License

MIT License - see LICENSE file for details.