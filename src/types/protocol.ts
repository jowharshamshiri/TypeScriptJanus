/**
 * TypeScript type definitions for Janus Protocol
 * Based on the comprehensive protocol specification
 */

export interface SocketCommand {
  /** UUID v4 string for response correlation */
  id: string;
  
  /** Channel routing identifier (1-256 chars, alphanumeric + '-_') */
  channelId: string;
  
  /** Command name (1-256 chars, alphanumeric + '-_') */
  command: string;
  
  /** Socket path for response (SOCK_DGRAM connectionless communication) */
  reply_to?: string;
  
  /** Command arguments object (max 5MB) */
  args?: Record<string, any>;
  
  /** Timeout in seconds (0.1-300.0, default: 30.0) */
  timeout?: number;
  
  /** Unix timestamp as number (matching Go/Rust/Swift) */
  timestamp: number;
}

export interface SocketResponse {
  /** UUID from original command for correlation */
  commandId: string;
  
  /** Channel verification */
  channelId: string;
  
  /** Boolean success/failure indicator */
  success: boolean;
  
  /** Response data object (if success=true) */
  result?: Record<string, any>;
  
  /** Error information (if success=false) */
  error?: SocketError;
  
  /** Response generation timestamp as Unix timestamp */
  timestamp: number;
}

export interface SocketError {
  /** Error code from predefined set */
  code: string;
  
  /** Human-readable error message */
  message: string;
  
  /** Additional error context */
  details?: string;
  
  /** Field that caused validation error */
  field?: string;
  
  /** Invalid value that caused error */
  value?: any;
  
  /** Validation constraints that were violated */
  constraints?: Record<string, any>;
}

export interface SocketMessage {
  /** Message type discriminator */
  type: 'command' | 'response';
  
  /** Base64-encoded JSON payload */
  payload: string;
}

export interface PendingCommand {
  /** Promise resolve function */
  resolve: (response: SocketResponse) => void;
  
  /** Promise reject function */
  reject: (error: Error) => void;
  
  /** Command creation timestamp */
  timestamp: number;
  
  /** Timeout duration in seconds */
  timeout: number;
}

export interface ConnectionConfig {
  /** Unix socket path */
  socketPath: string;
  
  /** Default timeout for commands */
  defaultTimeout?: number;
  
  /** Maximum message size in bytes */
  maxMessageSize?: number;
  
  /** Connection timeout in milliseconds */
  connectionTimeout?: number;
  
  /** Maximum pending commands */
  maxPendingCommands?: number;
}

export interface SecurityConfig {
  /** Maximum channel/command name length */
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

export interface APISpecification {
  /** Semantic version of the API specification */
  version: string;
  
  /** Human-readable name of the API */
  name?: string;
  
  /** Detailed description of the API */
  description?: string;
  
  /** Map of channel IDs to channel definitions */
  channels: Record<string, Channel>;
  
  /** Reusable model definitions */
  models?: Record<string, Model>;
}

export interface Channel {
  /** Human-readable channel name */
  name?: string;
  
  /** Detailed description of the channel */
  description?: string;
  
  /** Map of command names to command definitions */
  commands: Record<string, Command>;
}

export interface Command {
  /** Human-readable command name */
  name?: string;
  
  /** Detailed description of the command */
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

export type CommandHandler = (args: Record<string, any>) => Promise<Record<string, any>>;

export interface CommandHandlerRegistry {
  [channelId: string]: {
    [commandName: string]: CommandHandler;
  };
}