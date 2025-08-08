/**
 * TypeScript Janus - Main Export File
 */

// Core types
export * from './types/protocol';

// Core components
export { JanusClient as CoreJanusClient, JanusClientError as CoreJanusClientError } from './core/janus-client';
export { JanusServer, JanusServerError } from './server/janus-server';
export { SecurityValidator, ValidationResult } from './core/security-validator';
export { MessageFraming } from './core/message-framing';
export { ResponseTracker } from './core/response-tracker';

// High-level API
export { APIClient, APIClientError } from './api/api-client';

// Manifest parsing
export { ManifestParser, ManifestError } from './manifest/manifest-parser';

// Protocol layer (main API)
export { JanusClient, JanusClientError } from './protocol/janus-client';

// Re-export commonly used types for convenience
export type {
  JanusRequest,
  JanusResponse,
  PendingRequest,
  ConnectionConfig,
  SecurityConfig,
  Manifest,
  Request,
  Argument,
  RequestHandler,
  RequestHandlerRegistry
} from './types/protocol';

// Export JSON-RPC error types
export {
  JSONRPCError,
  JSONRPCErrorCode,
  JSONRPCErrorData,
  JSONRPCErrorBuilder,
  JSONRPCErrorClass,
  JSONRPCErrorUtils
} from './types/jsonrpc-error';