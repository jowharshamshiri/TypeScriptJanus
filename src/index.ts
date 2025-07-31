/**
 * TypeScript Janus - Main Export File
 */

// Core types
export * from './types/protocol';

// Core components
export { JanusClient, JanusClientError } from './core/unix-datagram-client';
export { JanusServer, JanusServerError } from './server/janus-server';
export { SecurityValidator, ValidationResult } from './core/security-validator';
export { MessageFraming, MessageFramingError } from './core/message-framing';
export { ResponseTracker, ResponseTrackerError } from './core/response-tracker';

// High-level API
export { APIClient, APIClientError } from './api/api-client';

// Specification parsing
export { APISpecificationParser, APISpecificationError } from './specification/api-specification-parser';

// Protocol layer
export { JanusClient, JanusClientError } from './protocol/janus-client';

// Re-export commonly used types for convenience
export type {
  SocketCommand,
  SocketResponse,
  SocketError,
  PendingCommand,
  ConnectionConfig,
  SecurityConfig,
  APISpecification,
  Channel,
  Command,
  Argument,
  CommandHandler,
  CommandHandlerRegistry
} from './types/protocol';