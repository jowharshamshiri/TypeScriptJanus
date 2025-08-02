/**
 * Enhanced Handler System for TypeScript/Node.js
 * Supports direct value responses and native Promise-based async patterns
 */

import { JanusCommand } from '../types/protocol';
import { JSONRPCError, JSONRPCErrorCode, JSONRPCErrorBuilder } from '../types/jsonrpc-error';

/// Result of a handler execution with type safety
export type HandlerResult<T> = {
  success: true;
  value: T;
} | {
  success: false;
  error: JSONRPCError;
};

export namespace HandlerResult {
  /// Create success result
  export function success<T>(value: T): HandlerResult<T> {
    return { success: true, value };
  }
  
  /// Create error result
  export function error<T>(error: JSONRPCError): HandlerResult<T> {
    return { success: false, error };
  }
  
  /// Create result from Promise result
  export function fromPromise<T>(promise: Promise<T>): Promise<HandlerResult<T>> {
    return promise.then(
      value => HandlerResult.success(value),
      error => HandlerResult.error(mapErrorToJSONRPC(error))
    );
  }
  
  /// Create result from synchronous operation
  export function fromSync<T>(operation: () => T): HandlerResult<T> {
    try {
      return HandlerResult.success(operation());
    } catch (error) {
      return HandlerResult.error(mapErrorToJSONRPC(error));
    }
  }
}

/// Enhanced command handler interface for direct value responses
export interface CommandHandler<T = any> {
  handle(command: JanusCommand): Promise<HandlerResult<T>>;
}

/// Synchronous handler wrapper for direct value responses
export class SyncHandler<T> implements CommandHandler<T> {
  constructor(private handler: (command: JanusCommand) => HandlerResult<T>) {}
  
  async handle(command: JanusCommand): Promise<HandlerResult<T>> {
    return this.handler(command);
  }
}

/// Asynchronous handler wrapper for direct value responses
export class AsyncHandler<T> implements CommandHandler<T> {
  constructor(private handler: (command: JanusCommand) => Promise<HandlerResult<T>>) {}
  
  async handle(command: JanusCommand): Promise<HandlerResult<T>> {
    return await this.handler(command);
  }
}

// Direct Value Handler Constructors

/// Create a boolean handler
export function boolHandler(handler: (command: JanusCommand) => boolean | Promise<boolean>): CommandHandler<boolean> {
  return new AsyncHandler(async (command) => {
    try {
      const result = await handler(command);
      return HandlerResult.success(result);
    } catch (error) {
      return HandlerResult.error(mapErrorToJSONRPC(error));
    }
  });
}

/// Create a string handler
export function stringHandler(handler: (command: JanusCommand) => string | Promise<string>): CommandHandler<string> {
  return new AsyncHandler(async (command) => {
    try {
      const result = await handler(command);
      return HandlerResult.success(result);
    } catch (error) {
      return HandlerResult.error(mapErrorToJSONRPC(error));
    }
  });
}

/// Create a number handler
export function numberHandler(handler: (command: JanusCommand) => number | Promise<number>): CommandHandler<number> {
  return new AsyncHandler(async (command) => {
    try {
      const result = await handler(command);
      return HandlerResult.success(result);
    } catch (error) {
      return HandlerResult.error(mapErrorToJSONRPC(error));
    }
  });
}

/// Create an array handler
export function arrayHandler<T>(handler: (command: JanusCommand) => T[] | Promise<T[]>): CommandHandler<T[]> {
  return new AsyncHandler(async (command) => {
    try {
      const result = await handler(command);
      return HandlerResult.success(result);
    } catch (error) {
      return HandlerResult.error(mapErrorToJSONRPC(error));
    }
  });
}

/// Create an object handler
export function objectHandler<T extends Record<string, any>>(handler: (command: JanusCommand) => T | Promise<T>): CommandHandler<T> {
  return new AsyncHandler(async (command) => {
    try {
      const result = await handler(command);
      return HandlerResult.success(result);
    } catch (error) {
      return HandlerResult.error(mapErrorToJSONRPC(error));
    }
  });
}

/// Create a custom type handler
export function customHandler<T>(handler: (command: JanusCommand) => T | Promise<T>): CommandHandler<T> {
  return new AsyncHandler(async (command) => {
    try {
      const result = await handler(command);
      return HandlerResult.success(result);
    } catch (error) {
      return HandlerResult.error(mapErrorToJSONRPC(error));
    }
  });
}

// Async Handler Constructors (explicit Promise-based)

/// Create an async boolean handler
export function asyncBoolHandler(handler: (command: JanusCommand) => Promise<boolean>): CommandHandler<boolean> {
  return new AsyncHandler(async (command) => {
    return HandlerResult.fromPromise(handler(command));
  });
}

/// Create an async string handler
export function asyncStringHandler(handler: (command: JanusCommand) => Promise<string>): CommandHandler<string> {
  return new AsyncHandler(async (command) => {
    return HandlerResult.fromPromise(handler(command));
  });
}

/// Create an async number handler
export function asyncNumberHandler(handler: (command: JanusCommand) => Promise<number>): CommandHandler<number> {
  return new AsyncHandler(async (command) => {
    return HandlerResult.fromPromise(handler(command));
  });
}

/// Create an async array handler
export function asyncArrayHandler<T>(handler: (command: JanusCommand) => Promise<T[]>): CommandHandler<T[]> {
  return new AsyncHandler(async (command) => {
    return HandlerResult.fromPromise(handler(command));
  });
}

/// Create an async object handler
export function asyncObjectHandler<T extends Record<string, any>>(handler: (command: JanusCommand) => Promise<T>): CommandHandler<T> {
  return new AsyncHandler(async (command) => {
    return HandlerResult.fromPromise(handler(command));
  });
}

/// Create an async custom type handler
export function asyncCustomHandler<T>(handler: (command: JanusCommand) => Promise<T>): CommandHandler<T> {
  return new AsyncHandler(async (command) => {
    return HandlerResult.fromPromise(handler(command));
  });
}

// Type-Erased Handler for Registry

/// Type-erased handler for registry storage
export interface BoxedHandler {
  handleBoxed(command: JanusCommand): Promise<{ success: true; value: any } | { success: false; error: JSONRPCError }>;
}

class TypedHandlerWrapper<T> implements BoxedHandler {
  constructor(private handler: CommandHandler<T>) {}
  
  async handleBoxed(command: JanusCommand): Promise<{ success: true; value: any } | { success: false; error: JSONRPCError }> {
    const result = await this.handler.handle(command);
    return result;
  }
}

// Enhanced Handler Registry

/// Enhanced handler registry with type safety and direct value support
export class HandlerRegistry {
  private handlers: Map<string, BoxedHandler> = new Map();
  
  constructor(private maxHandlers: number = 100) {}
  
  /// Register a handler for a command
  registerHandler<T>(command: string, handler: CommandHandler<T>): void {
    if (this.handlers.size >= this.maxHandlers) {
      throw new Error(`Maximum handlers (${this.maxHandlers}) exceeded`);
    }
    
    const boxed = new TypedHandlerWrapper(handler);
    this.handlers.set(command, boxed);
  }
  
  /// Unregister a handler
  unregisterHandler(command: string): boolean {
    return this.handlers.delete(command);
  }
  
  /// Execute a handler for a command
  async executeHandler(command: string, cmd: JanusCommand): Promise<{ success: true; value: any } | { success: false; error: JSONRPCError }> {
    const handler = this.handlers.get(command);
    if (!handler) {
      return {
        success: false,
        error: JSONRPCErrorBuilder.create(JSONRPCErrorCode.METHOD_NOT_FOUND, `Command not found: ${command}`)
      };
    }
    
    return await handler.handleBoxed(cmd);
  }
  
  /// Check if a handler exists for a command
  hasHandler(command: string): boolean {
    return this.handlers.has(command);
  }
  
  /// Get the current number of registered handlers
  handlerCount(): number {
    return this.handlers.size;
  }
}

// Error Mapping Utility

/// Map JavaScript Error to JSONRPCError
function mapErrorToJSONRPC(error: any): JSONRPCError {
  // If it's already a JSONRPCError, return as-is
  if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
    return error as JSONRPCError;
  }
  
  const message = error?.message || error?.toString() || 'Unknown error';
  
  // Determine appropriate error code based on error type/message
  let code: JSONRPCErrorCode;
  
  if (error instanceof SyntaxError) {
    code = JSONRPCErrorCode.PARSE_ERROR;
  } else if (error instanceof TypeError) {
    code = JSONRPCErrorCode.INVALID_PARAMS;
  } else if (error instanceof RangeError) {
    code = JSONRPCErrorCode.INVALID_PARAMS;
  } else {
    // Analyze error message for specific patterns
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes('validation')) {
      code = JSONRPCErrorCode.VALIDATION_FAILED;
    } else if (lowerMessage.includes('timeout')) {
      code = JSONRPCErrorCode.HANDLER_TIMEOUT;
    } else if (lowerMessage.includes('not found')) {
      code = JSONRPCErrorCode.RESOURCE_NOT_FOUND;
    } else if (lowerMessage.includes('invalid')) {
      code = JSONRPCErrorCode.INVALID_PARAMS;
    } else if (lowerMessage.includes('parse')) {
      code = JSONRPCErrorCode.PARSE_ERROR;
    } else if (lowerMessage.includes('security')) {
      code = JSONRPCErrorCode.SECURITY_VIOLATION;
    } else if (lowerMessage.includes('limit')) {
      code = JSONRPCErrorCode.RESOURCE_LIMIT_EXCEEDED;
    } else if (lowerMessage.includes('auth')) {
      code = JSONRPCErrorCode.AUTHENTICATION_FAILED;
    } else {
      code = JSONRPCErrorCode.INTERNAL_ERROR;
    }
  }
  
  return JSONRPCErrorBuilder.create(code, message);
}

// Types are already exported above