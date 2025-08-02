/**
 * JSON-RPC 2.0 compliant error codes
 */
export enum JSONRPCErrorCode {
    // Standard JSON-RPC 2.0 error codes
    PARSE_ERROR = -32700,
    INVALID_REQUEST = -32600,
    METHOD_NOT_FOUND = -32601,
    INVALID_PARAMS = -32602,
    INTERNAL_ERROR = -32603,

    // Implementation-defined server error codes (-32000 to -32099)
    SERVER_ERROR = -32000,
    SERVICE_UNAVAILABLE = -32001,
    AUTHENTICATION_FAILED = -32002,
    RATE_LIMIT_EXCEEDED = -32003,
    RESOURCE_NOT_FOUND = -32004,
    VALIDATION_FAILED = -32005,
    HANDLER_TIMEOUT = -32006,
    SOCKET_ERROR = -32007,
    CONFIGURATION_ERROR = -32008,
    SECURITY_VIOLATION = -32009,
    RESOURCE_LIMIT_EXCEEDED = -32010,

    // Janus Protocol-Specific Error Codes (-32011 to -32013)
    MESSAGE_FRAMING_ERROR = -32011,
    RESPONSE_TRACKING_ERROR = -32012,
    MANIFEST_VALIDATION_ERROR = -32013,
}

/**
 * Returns the string representation of the error code
 */
export function getErrorCodeString(code: JSONRPCErrorCode): string {
    switch (code) {
        case JSONRPCErrorCode.PARSE_ERROR: return 'PARSE_ERROR';
        case JSONRPCErrorCode.INVALID_REQUEST: return 'INVALID_REQUEST';
        case JSONRPCErrorCode.METHOD_NOT_FOUND: return 'METHOD_NOT_FOUND';
        case JSONRPCErrorCode.INVALID_PARAMS: return 'INVALID_PARAMS';
        case JSONRPCErrorCode.INTERNAL_ERROR: return 'INTERNAL_ERROR';
        case JSONRPCErrorCode.SERVER_ERROR: return 'SERVER_ERROR';
        case JSONRPCErrorCode.SERVICE_UNAVAILABLE: return 'SERVICE_UNAVAILABLE';
        case JSONRPCErrorCode.AUTHENTICATION_FAILED: return 'AUTHENTICATION_FAILED';
        case JSONRPCErrorCode.RATE_LIMIT_EXCEEDED: return 'RATE_LIMIT_EXCEEDED';
        case JSONRPCErrorCode.RESOURCE_NOT_FOUND: return 'RESOURCE_NOT_FOUND';
        case JSONRPCErrorCode.VALIDATION_FAILED: return 'VALIDATION_FAILED';
        case JSONRPCErrorCode.HANDLER_TIMEOUT: return 'HANDLER_TIMEOUT';
        case JSONRPCErrorCode.SOCKET_ERROR: return 'SOCKET_ERROR';
        case JSONRPCErrorCode.CONFIGURATION_ERROR: return 'CONFIGURATION_ERROR';
        case JSONRPCErrorCode.SECURITY_VIOLATION: return 'SECURITY_VIOLATION';
        case JSONRPCErrorCode.RESOURCE_LIMIT_EXCEEDED: return 'RESOURCE_LIMIT_EXCEEDED';
        case JSONRPCErrorCode.MESSAGE_FRAMING_ERROR: return 'MESSAGE_FRAMING_ERROR';
        case JSONRPCErrorCode.RESPONSE_TRACKING_ERROR: return 'RESPONSE_TRACKING_ERROR';
        case JSONRPCErrorCode.MANIFEST_VALIDATION_ERROR: return 'MANIFEST_VALIDATION_ERROR';
        default: return `UNKNOWN_ERROR_${code}`;
    }
}

/**
 * Returns the standard human-readable message for the error code
 */
export function getErrorCodeMessage(code: JSONRPCErrorCode): string {
    switch (code) {
        case JSONRPCErrorCode.PARSE_ERROR: return 'Parse error';
        case JSONRPCErrorCode.INVALID_REQUEST: return 'Invalid Request';
        case JSONRPCErrorCode.METHOD_NOT_FOUND: return 'Method not found';
        case JSONRPCErrorCode.INVALID_PARAMS: return 'Invalid params';
        case JSONRPCErrorCode.INTERNAL_ERROR: return 'Internal error';
        case JSONRPCErrorCode.SERVER_ERROR: return 'Server error';
        case JSONRPCErrorCode.SERVICE_UNAVAILABLE: return 'Service unavailable';
        case JSONRPCErrorCode.AUTHENTICATION_FAILED: return 'Authentication failed';
        case JSONRPCErrorCode.RATE_LIMIT_EXCEEDED: return 'Rate limit exceeded';
        case JSONRPCErrorCode.RESOURCE_NOT_FOUND: return 'Resource not found';
        case JSONRPCErrorCode.VALIDATION_FAILED: return 'Validation failed';
        case JSONRPCErrorCode.HANDLER_TIMEOUT: return 'Handler timeout';
        case JSONRPCErrorCode.SOCKET_ERROR: return 'Socket error';
        case JSONRPCErrorCode.CONFIGURATION_ERROR: return 'Configuration error';
        case JSONRPCErrorCode.SECURITY_VIOLATION: return 'Security violation';
        case JSONRPCErrorCode.RESOURCE_LIMIT_EXCEEDED: return 'Resource limit exceeded';
        case JSONRPCErrorCode.MESSAGE_FRAMING_ERROR: return 'Message framing error';
        case JSONRPCErrorCode.RESPONSE_TRACKING_ERROR: return 'Response tracking error';
        case JSONRPCErrorCode.MANIFEST_VALIDATION_ERROR: return 'Manifest validation error';
        default: return 'Unknown error';
    }
}

/**
 * Additional error context information
 */
export interface JSONRPCErrorData {
    details?: string;
    field?: string;
    value?: any;
    constraints?: Record<string, any>;
    context?: Record<string, any>;
}

/**
 * JSON-RPC 2.0 compliant error structure
 */
export interface JSONRPCError {
    code: number;
    message: string;
    data?: JSONRPCErrorData;
}

/**
 * JSON-RPC Error builder class for convenient error creation
 */
export class JSONRPCErrorBuilder {
    /**
     * Creates a new JSON-RPC error with the specified code and optional details
     */
    static create(code: JSONRPCErrorCode, details?: string): JSONRPCError {
        const error: JSONRPCError = {
            code,
            message: getErrorCodeMessage(code),
        };

        if (details) {
            error.data = { details };
        }

        return error;
    }

    /**
     * Creates a new JSON-RPC error with additional context
     */
    static createWithContext(
        code: JSONRPCErrorCode,
        details?: string,
        context?: Record<string, any>
    ): JSONRPCError {
        return {
            code,
            message: getErrorCodeMessage(code),
            ...(details || context ? {
                data: {
                    ...(details && { details }),
                    ...(context && { context }),
                }
            } : {})
        };
    }

    /**
     * Creates a validation-specific JSON-RPC error
     */
    static validationError(
        field: string,
        value: any,
        details: string,
        constraints?: Record<string, any>
    ): JSONRPCError {
        return {
            code: JSONRPCErrorCode.VALIDATION_FAILED,
            message: getErrorCodeMessage(JSONRPCErrorCode.VALIDATION_FAILED),
            data: {
                details,
                field,
                value,
                ...(constraints && { constraints }),
            }
        };
    }

    /**
     * Creates a parse error from a JSON parsing exception
     */
    static parseError(originalError?: Error): JSONRPCError {
        return {
            code: JSONRPCErrorCode.PARSE_ERROR,
            message: getErrorCodeMessage(JSONRPCErrorCode.PARSE_ERROR),
            data: {
                details: originalError?.message || 'Invalid JSON was received',
            },
        };
    }

    /**
     * Creates a method not found error
     */
    static methodNotFound(method: string): JSONRPCError {
        return {
            code: JSONRPCErrorCode.METHOD_NOT_FOUND,
            message: getErrorCodeMessage(JSONRPCErrorCode.METHOD_NOT_FOUND),
            data: {
                details: `Method '${method}' not found`,
                context: { method },
            },
        };
    }

    /**
     * Creates an invalid parameters error
     */
    static invalidParams(details: string, field?: string, value?: any): JSONRPCError {
        const error: JSONRPCError = {
            code: JSONRPCErrorCode.INVALID_PARAMS,
            message: getErrorCodeMessage(JSONRPCErrorCode.INVALID_PARAMS),
            data: { details },
        };

        if (field !== undefined) {
            error.data!.field = field;
        }
        if (value !== undefined) {
            error.data!.value = value;
        }

        return error;
    }

    /**
     * Creates an internal error
     */
    static internalError(details?: string, originalError?: Error): JSONRPCError {
        return {
            code: JSONRPCErrorCode.INTERNAL_ERROR,
            message: getErrorCodeMessage(JSONRPCErrorCode.INTERNAL_ERROR),
            data: {
                details: details || originalError?.message || 'Internal server error',
                ...(originalError && { context: { originalError: originalError.message } }),
            }
        };
    }

    /**
     * Creates a handler timeout error
     */
    static handlerTimeout(handler: string, timeoutMs: number): JSONRPCError {
        return {
            code: JSONRPCErrorCode.HANDLER_TIMEOUT,
            message: getErrorCodeMessage(JSONRPCErrorCode.HANDLER_TIMEOUT),
            data: {
                details: `Handler '${handler}' timed out after ${timeoutMs}ms`,
                context: { handler, timeoutMs },
            },
        };
    }

    /**
     * Creates a security violation error
     */
    static securityViolation(violation: string): JSONRPCError {
        return {
            code: JSONRPCErrorCode.SECURITY_VIOLATION,
            message: getErrorCodeMessage(JSONRPCErrorCode.SECURITY_VIOLATION),
            data: {
                details: violation,
            },
        };
    }
}

/**
 * Custom error class that extends the built-in Error with JSON-RPC error information
 */
export class JSONRPCErrorClass extends Error implements JSONRPCError {
    public readonly code: number;
    public readonly data?: JSONRPCErrorData;

    constructor(jsonrpcError: JSONRPCError) {
        super(jsonrpcError.message);
        this.name = 'JSONRPCError';
        this.code = jsonrpcError.code;
        if (jsonrpcError.data !== undefined) {
            this.data = jsonrpcError.data;
        }

        // Maintain proper stack trace for V8 (Node.js & Chrome)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, JSONRPCErrorClass);
        }
    }

    /**
     * Returns the error code as an enum if it's a known code
     */
    get errorCode(): JSONRPCErrorCode | undefined {
        return Object.values(JSONRPCErrorCode).includes(this.code as JSONRPCErrorCode) 
            ? this.code as JSONRPCErrorCode 
            : undefined;
    }

    /**
     * Returns a formatted error description
     */
    get errorDescription(): string {
        if (this.data?.details) {
            return `JSON-RPC Error ${this.code}: ${this.message} - ${this.data.details}`;
        }
        return `JSON-RPC Error ${this.code}: ${this.message}`;
    }

    /**
     * Converts to JSON-RPC error object
     */
    toJSONRPCError(): JSONRPCError {
        const result: JSONRPCError = {
            code: this.code,
            message: this.message,
        };
        if (this.data !== undefined) {
            result.data = this.data;
        }
        return result;
    }

    override toString(): string {
        return this.errorDescription;
    }
}

// Legacy error mapping removed - all error handling now uses JSONRPCError directly

/**
 * Utility functions for working with JSON-RPC errors
 */
export const JSONRPCErrorUtils = {
    /**
     * Checks if an error code is a standard JSON-RPC 2.0 error
     */
    isStandardError(code: number): boolean {
        return code >= -32768 && code <= -32000;
    },

    /**
     * Checks if an error code is a server error (implementation-defined)
     */
    isServerError(code: number): boolean {
        return code >= -32099 && code <= -32000;
    },

    /**
     * Checks if an error code is an application error
     */
    isApplicationError(code: number): boolean {
        return code >= -31999 && code <= -1;
    },

    /**
     * Validates that an error object conforms to JSON-RPC 2.0 specification
     */
    isValidJSONRPCError(error: any): error is JSONRPCError {
        return (
            typeof error === 'object' &&
            error !== null &&
            typeof error.code === 'number' &&
            typeof error.message === 'string' &&
            (error.data === undefined || typeof error.data === 'object')
        );
    },

    /**
     * Converts any error to a JSON-RPC error
     */
    fromError(error: Error | string | any): JSONRPCError {
        if (typeof error === 'string') {
            return JSONRPCErrorBuilder.internalError(error);
        }

        if (error instanceof Error) {
            return JSONRPCErrorBuilder.internalError(error.message, error);
        }

        if (JSONRPCErrorUtils.isValidJSONRPCError(error)) {
            return error;
        }

        return JSONRPCErrorBuilder.internalError('Unknown error occurred');
    },
};

/**
 * Type guard to check if an object is a JSON-RPC error
 */
export function isJSONRPCError(obj: any): obj is JSONRPCError {
    return JSONRPCErrorUtils.isValidJSONRPCError(obj);
}

/**
 * Type guard to check if an error is a JSON-RPC error class instance
 */
export function isJSONRPCErrorClass(obj: any): obj is JSONRPCErrorClass {
    return obj instanceof JSONRPCErrorClass;
}