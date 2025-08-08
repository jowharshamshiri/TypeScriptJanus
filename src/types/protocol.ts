/**
 * TypeScript type definitions for Janus Protocol
 * Based on the comprehensive protocol manifest
 */

export interface JanusRequest {
  /** UUID v4 string for response correlation */
  id: string;
  
  /** Method name being invoked (PRIME DIRECTIVE) */
  method: string;
  
  /** Request name (1-256 chars, alphanumeric + '-_') */
  request: string;
  
  /** Socket path for response (SOCK_DGRAM connectionless communication) */
  reply_to?: string;
  
  /** Request arguments object (max 5MB) */
  args?: Record<string, any>;
  
  /** Timeout in seconds (0.1-300.0, default: 30.0) */
  timeout?: number;
  
  /** RFC 3339 timestamp with milliseconds (PRIME DIRECTIVE) */
  timestamp: string;
}

export interface JanusResponse {
  /** Unwrapped response data (PRIME DIRECTIVE) */
  result?: any;
  
  /** Error information (JSON-RPC 2.0 compliant) - null if success */
  error?: import('./jsonrpc-error').JSONRPCError;
  
  /** Boolean success/failure indicator */
  success: boolean;
  
  /** Request ID that this response correlates to */
  request_id: string;
  
  /** Unique identifier for this response */
  id: string;
  
  /** Response generation timestamp (RFC 3339 format) */
  timestamp: string;
}

// Legacy SocketError interface removed - replaced by JSONRPCError in jsonrpc-error.ts

/**
 * RequestHandle provides a user-friendly interface to track and manage requests
 * Hides internal UUID complexity from users
 */
export class RequestHandle {
  private readonly internalID: string;
  private readonly request: string;
  private readonly timestamp: Date;
  private cancelled: boolean = false;

  constructor(internalID: string, request: string) {
    this.internalID = internalID;
    this.request = request;
    this.timestamp = new Date();
  }

  /** Get the request name for this request */
  getRequest(): string {
    return this.request;
  }

  /** Get when this request was created */
  getTimestamp(): Date {
    return this.timestamp;
  }

  /** Check if this request has been cancelled */
  isCancelled(): boolean {
    return this.cancelled;
  }

  /** Get the internal UUID (for internal use only) */
  getInternalID(): string {
    return this.internalID;
  }

  /** Mark this handle as cancelled (internal use only) */
  markCancelled(): void {
    this.cancelled = true;
  }
}

/** RequestStatus represents the status of a tracked request */
export enum RequestStatus {
  Pending = 'pending',
  Completed = 'completed',
  Failed = 'failed',
  Cancelled = 'cancelled',
  Timeout = 'timeout'
}

export interface SocketMessage {
  /** Message type discriminator */
  type: 'request' | 'response';
  
  /** Base64-encoded JSON payload */
  payload: string;
}

export interface PendingRequest {
  /** Promise resolve function */
  resolve: (response: JanusResponse) => void;
  
  /** Promise reject function */
  reject: (error: Error) => void;
  
  /** Request creation timestamp */
  timestamp: number;
  
  /** Timeout duration in seconds */
  timeout: number;
}

export interface ConnectionConfig {
  /** Unix socket path */
  socketPath: string;
  
  /** Default timeout for requests */
  defaultTimeout?: number;
  
  /** Maximum message size in bytes */
  maxMessageSize?: number;
  
  /** Connection timeout in milliseconds */
  connectionTimeout?: number;
  
  /** Maximum pending requests */
  maxPendingRequests?: number;
}

export interface SecurityConfig {
  /** Maximum channel/request name length */
  maxNameLength?: number;
  
  /** Maximum argument data size */
  maxArgsSize?: number;
  
  /** Maximum total message size */
  maxTotalSize?: number;
  
  /** Minimum timeout value */
  minTimeout?: number;
  
  /** Maximum timeout value */
  maxTimeout?: number;
  
  /** Allowed socket path directories */
  allowedDirectories?: string[];
}

export interface Manifest {
  /** Semantic version of the Manifest */
  version: string;
  
  /** Human-readable name of the API */
  name?: string;
  
  /** Detailed description of the API */
  description?: string;
  
  /** Available requests */
  requests?: Record<string, Request>;
  
  /** Reusable model definitions */
  models?: Record<string, Model>;
}

// Channel interface removed - channels no longer part of protocol

export interface Request {
  /** Human-readable request name */
  name?: string;
  
  /** Detailed description of the request */
  description: string;
  
  /** Map of argument names to argument definitions */
  args?: Record<string, Argument>;
  
  /** Expected response format */
  response?: ResponseDefinition;
  
  /** List of possible error codes */
  errorCodes?: string[];
  
  /** Default timeout in seconds */
  timeout?: number;
}

export interface Argument {
  /** Human-readable argument name */
  name?: string;
  
  /** Data type of the argument */
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  
  /** Detailed description of the argument */
  description: string;
  
  /** Whether this argument is required */
  required?: boolean;
  
  /** Default value if argument is not provided */
  default?: any;
  
  /** Regular expression pattern for string validation */
  pattern?: string;
  
  /** Minimum string length */
  minLength?: number;
  
  /** Maximum string length */
  maxLength?: number;
  
  /** Minimum numeric value */
  minimum?: number;
  
  /** Maximum numeric value */
  maximum?: number;
  
  /** List of allowed values */
  enum?: any[];
  
  /** Reference to a model definition */
  modelRef?: string;
  
  /** Type definition for array items */
  items?: Argument;
  
  /** Properties for object type */
  properties?: Record<string, Argument>;
}

export interface ResponseDefinition {
  /** Data type of the response */
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  
  /** Detailed description of the response */
  description: string;
  
  /** Properties for object response type */
  properties?: Record<string, Argument>;
  
  /** Reference to a model definition */
  modelRef?: string;
  
  /** Type definition for array items */
  items?: Argument;
}

export interface Model {
  /** Human-readable model name */
  name: string;
  
  /** Base type of the model */
  type: 'object' | 'string' | 'number' | 'integer' | 'boolean' | 'array';
  
  /** Detailed description of the model */
  description: string;
  
  /** Model properties for object types */
  properties?: Record<string, Argument>;
  
  /** List of required property names */
  required?: string[];
  
  /** Reference to parent model for inheritance */
  extends?: string;
  
  /** Type definition for array items */
  items?: Argument;
}

export type RequestHandler = (args: Record<string, any>) => Promise<Record<string, any>>;

export interface RequestHandlerRegistry {
  [requestName: string]: RequestHandler;
}