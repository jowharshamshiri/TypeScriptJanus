/**
 * Comprehensive CommandHandler Tests for TypeScript Janus Implementation
 * Tests all direct value response handlers and async patterns
 */

import {
  HandlerResult,
  boolHandler,
  stringHandler,
  numberHandler,
  arrayHandler,
  objectHandler,
  customHandler,
  asyncBoolHandler,
  asyncStringHandler,
  asyncNumberHandler,
  asyncArrayHandler,
  asyncObjectHandler,
  asyncCustomHandler,
} from '../server/command-handler';
import { SocketCommand } from '../types/protocol';
import { JSONRPCErrorCode, JSONRPCErrorBuilder } from '../types/jsonrpc-error';

describe('CommandHandler System', () => {
  
  // Helper to create test command
  const createTestCommand = (args: Record<string, any> = {}): SocketCommand => ({
    id: 'test-id',
    channelId: 'test-channel',
    command: 'test-command',
    args,
    timestamp: Date.now(),
    reply_to: '/tmp/test-reply.sock'
  });

  describe('Direct Value Handlers', () => {
    
    test('boolHandler - returns boolean directly', async () => {
      const handler = boolHandler((_cmd) => true);
      const command = createTestCommand();
      
      const result = await handler.handle(command);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe(true);
      }
    });

    test('stringHandler - returns string directly', async () => {
      const handler = stringHandler((_cmd) => 'test response');
      const command = createTestCommand();
      
      const result = await handler.handle(command);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe('test response');
      }
    });

    test('numberHandler - returns number directly', async () => {
      const handler = numberHandler((_cmd) => 42);
      const command = createTestCommand();
      
      const result = await handler.handle(command);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe(42);
      }
    });

    test('arrayHandler - returns array directly', async () => {
      const testArray = ['item1', 'item2', 123];
      const handler = arrayHandler((_cmd) => testArray);
      const command = createTestCommand();
      
      const result = await handler.handle(command);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual(testArray);
      }
    });

    test('objectHandler - returns object directly', async () => {
      const testObject = { key1: 'value1', key2: 42, key3: true };
      const handler = objectHandler((_cmd) => testObject);
      const command = createTestCommand();
      
      const result = await handler.handle(command);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual(testObject);
      }
    });

    test('customHandler - returns custom type directly', async () => {
      interface User {
        id: number;
        name: string;
      }
      
      const testUser: User = { id: 123, name: 'Test User' };
      const handler = customHandler<User>((_cmd) => testUser);
      const command = createTestCommand();
      
      const result = await handler.handle(command);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual(testUser);
      }
    });
  });

  describe('Async Handlers', () => {
    
    test('asyncBoolHandler - returns boolean via Promise', async () => {
      const handler = asyncBoolHandler(async (_cmd) => {
        await new Promise(resolve => setTimeout(resolve, 10)); // Simulate async work
        return true;
      });
      const command = createTestCommand();
      
      const start = Date.now();
      const result = await handler.handle(command);
      const duration = Date.now() - start;
      
      expect(duration).toBeGreaterThanOrEqual(10); // Verify async execution
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe(true);
      }
    });

    test('asyncStringHandler - returns string via Promise', async () => {
      const handler = asyncStringHandler(async (_cmd) => {
        await new Promise(resolve => setTimeout(resolve, 10)); // Simulate async work
        return 'async response';
      });
      const command = createTestCommand();
      
      const start = Date.now();
      const result = await handler.handle(command);
      const duration = Date.now() - start;
      
      expect(duration).toBeGreaterThanOrEqual(10); // Verify async execution
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe('async response');
      }
    });

    test('asyncNumberHandler - returns number via Promise', async () => {
      const handler = asyncNumberHandler(async (_cmd) => {
        await new Promise(resolve => setTimeout(resolve, 5));
        return 3.14;
      });
      const command = createTestCommand();
      
      const result = await handler.handle(command);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe(3.14);
      }
    });

    test('asyncArrayHandler - returns array via Promise', async () => {
      const testArray = [1, 2, 3];
      const handler = asyncArrayHandler(async (_cmd) => {
        await new Promise(resolve => setTimeout(resolve, 5));
        return testArray;
      });
      const command = createTestCommand();
      
      const result = await handler.handle(command);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual(testArray);
      }
    });

    test('asyncObjectHandler - returns object via Promise', async () => {
      const testObject = { status: 'success', data: { id: 1 } };
      const handler = asyncObjectHandler(async (_cmd) => {
        await new Promise(resolve => setTimeout(resolve, 5));
        return testObject;
      });
      const command = createTestCommand();
      
      const result = await handler.handle(command);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual(testObject);
      }
    });

    test('asyncCustomHandler - returns custom type via Promise', async () => {
      interface ApiResponse {
        success: boolean;
        message: string;
        data?: any;
      }
      
      const testResponse: ApiResponse = {
        success: true,
        message: 'Operation completed',
        data: { userId: 456 }
      };
      
      const handler = asyncCustomHandler<ApiResponse>(async (_cmd) => {
        await new Promise(resolve => setTimeout(resolve, 5));
        return testResponse;
      });
      const command = createTestCommand();
      
      const result = await handler.handle(command);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual(testResponse);
      }
    });
  });

  describe('Error Handling', () => {
    
    test('sync handler error handling', async () => {
      const handler = stringHandler((_cmd) => {
        throw new Error('sync handler error');
      });
      const command = createTestCommand();
      
      const result = await handler.handle(command);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('Internal error'); // Error mapper converts to standard message
        expect(result.error.code).toBe(JSONRPCErrorCode.INTERNAL_ERROR);
      }
    });

    test('async handler error handling', async () => {
      const handler = asyncStringHandler(async (_cmd) => {
        throw new Error('async handler error');
      });
      const command = createTestCommand();
      
      const result = await handler.handle(command);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('Internal error'); // Error mapper converts to standard message
        expect(result.error.code).toBe(JSONRPCErrorCode.INTERNAL_ERROR);
      }
    });

    test('JSON-RPC error handling', async () => {
      const handler = stringHandler((_cmd) => {
        throw JSONRPCErrorBuilder.createWithContext(
          JSONRPCErrorCode.INVALID_PARAMS,
          'Invalid parameters provided',
          { field: 'missing_arg' }
        );
      });
      const command = createTestCommand();
      
      const result = await handler.handle(command);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(JSONRPCErrorCode.INVALID_PARAMS);
        expect(result.error.message).toBe('Invalid params'); // JSONRPCErrorBuilder uses standard message
        expect(result.error.data).toEqual({
          details: 'Invalid parameters provided', // Custom message goes in details
          context: { field: 'missing_arg' }
        });
      }
    });
  });

  describe('Handler Arguments Access', () => {
    
    test('handler can access command arguments', async () => {
      const handler = objectHandler((cmd) => {
        const name = cmd.args?.name as string;
        const age = cmd.args?.age as number;
        
        if (!name || typeof age !== 'number') {
          throw new Error('missing required arguments');
        }

        return {
          processed_name: `Hello, ${name}`,
          processed_age: age + 1,
          original_command: cmd.command
        };
      });

      const command = createTestCommand({
        name: 'John',
        age: 25
      });
      
      const result = await handler.handle(command);
      
      expect(result.success).toBe(true);
      if (result.success) {
        const response = result.value;
        expect(response.processed_name).toBe('Hello, John');
        expect(response.processed_age).toBe(26);
        expect(response.original_command).toBe('test-command');
      }
    });

    test('handler validates required arguments', async () => {
      const handler = objectHandler((cmd) => {
        const name = cmd.args?.name as string;
        const age = cmd.args?.age as number;
        
        if (!name || typeof age !== 'number') {
          throw JSONRPCErrorBuilder.create(
            JSONRPCErrorCode.INVALID_PARAMS,
            'Missing required arguments'
          );
        }

        return { name, age };
      });

      const command = createTestCommand({
        name: 'John'
        // missing age
      });
      
      const result = await handler.handle(command);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(JSONRPCErrorCode.INVALID_PARAMS);
        expect(result.error.message).toBe('Invalid params'); // JSONRPCErrorBuilder uses standard message
        expect(result.error.data?.details).toBe('Missing required arguments'); // Custom message in details
      }
    });
  });


  describe('Handler Result Utilities', () => {
    
    test('HandlerResult.success creates success result', () => {
      const result = HandlerResult.success('test value');
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe('test value');
      }
    });

    test('HandlerResult.error creates error result', () => {
      const error = JSONRPCErrorBuilder.create(JSONRPCErrorCode.INTERNAL_ERROR, 'Test error');
      const result = HandlerResult.error(error);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(error);
      }
    });

    test('HandlerResult.fromPromise handles successful promise', async () => {
      const promise = Promise.resolve('success value');
      const result = await HandlerResult.fromPromise(promise);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe('success value');
      }
    });

    test('HandlerResult.fromPromise handles rejected promise', async () => {
      const promise = Promise.reject(new Error('promise error'));
      const result = await HandlerResult.fromPromise(promise);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('Internal error'); // Error mapper converts to standard message
        expect(result.error.code).toBe(JSONRPCErrorCode.INTERNAL_ERROR);
      }
    });
  });
});