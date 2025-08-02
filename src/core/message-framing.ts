/**
 * Message Framing for Janus Protocol
 * Implements 4-byte big-endian length prefix framing
 */

import { SocketMessage, JanusCommand, JanusResponse } from '../types/protocol';
import { JSONRPCErrorBuilder, JSONRPCErrorCode, JSONRPCErrorClass } from '../types/jsonrpc-error';

export class MessageFraming {
  private static readonly LENGTH_PREFIX_SIZE = 4;
  private static readonly MAX_MESSAGE_SIZE = 10 * 1024 * 1024; // 10MB default

  /**
   * Encode a message with 4-byte big-endian length prefix
   */
  static encodeMessage(message: JanusCommand | JanusResponse): Buffer {
    try {
      // Create message envelope
      const messageType = 'id' in message ? 'command' : 'response';
      const jsonPayload = JSON.stringify(message);
      const payloadBuffer = Buffer.from(jsonPayload, 'utf8');
      
      // Create envelope with base64 payload for type safety
      const envelope: SocketMessage = {
        type: messageType,
        payload: payloadBuffer.toString('base64')
      };
      
      const envelopeJson = JSON.stringify(envelope);
      const messageBuffer = Buffer.from(envelopeJson, 'utf8');
      
      // Validate message size
      if (messageBuffer.length > this.MAX_MESSAGE_SIZE) {
        throw new JSONRPCErrorClass(JSONRPCErrorBuilder.create(
          JSONRPCErrorCode.MESSAGE_FRAMING_ERROR,
          `Message size ${messageBuffer.length} exceeds maximum ${this.MAX_MESSAGE_SIZE}`
        ));
      }
      
      // Create length prefix (4-byte big-endian)
      const lengthBuffer = Buffer.alloc(this.LENGTH_PREFIX_SIZE);
      lengthBuffer.writeUInt32BE(messageBuffer.length, 0);
      
      // Combine length prefix and message
      return Buffer.concat([lengthBuffer, messageBuffer]);
    } catch (error) {
      if (error instanceof JSONRPCErrorClass) {
        throw error;
      }
      throw new JSONRPCErrorClass(JSONRPCErrorBuilder.create(
        JSONRPCErrorCode.MESSAGE_FRAMING_ERROR,
        `Failed to encode message: ${error instanceof Error ? error.message : String(error)}`
      ));
    }
  }

  /**
   * Decode a message from buffer with length prefix
   */
  static decodeMessage(buffer: Buffer): { message: JanusCommand | JanusResponse; remainingBuffer: Buffer } {
    try {
      // Check if we have at least the length prefix
      if (buffer.length < this.LENGTH_PREFIX_SIZE) {
        throw new JSONRPCErrorClass(JSONRPCErrorBuilder.create(
          JSONRPCErrorCode.MESSAGE_FRAMING_ERROR,
          `Buffer too small for length prefix: ${buffer.length} < ${this.LENGTH_PREFIX_SIZE}`
        ));
      }
      
      // Read message length from big-endian prefix
      const messageLength = buffer.readUInt32BE(0);
      
      // Validate message length
      if (messageLength > this.MAX_MESSAGE_SIZE) {
        throw new JSONRPCErrorClass(JSONRPCErrorBuilder.create(
          JSONRPCErrorCode.MESSAGE_FRAMING_ERROR,
          `Message length ${messageLength} exceeds maximum ${this.MAX_MESSAGE_SIZE}`
        ));
      }
      
      if (messageLength === 0) {
        throw new JSONRPCErrorClass(JSONRPCErrorBuilder.create(
          JSONRPCErrorCode.MESSAGE_FRAMING_ERROR,
          'Message length cannot be zero'
        ));
      }
      
      // Check if we have the complete message
      const totalRequired = this.LENGTH_PREFIX_SIZE + messageLength;
      if (buffer.length < totalRequired) {
        throw new JSONRPCErrorClass(JSONRPCErrorBuilder.create(
          JSONRPCErrorCode.MESSAGE_FRAMING_ERROR,
          `Buffer too small for complete message: ${buffer.length} < ${totalRequired}`
        ));
      }
      
      // Extract message data
      const messageBuffer = buffer.subarray(this.LENGTH_PREFIX_SIZE, this.LENGTH_PREFIX_SIZE + messageLength);
      const remainingBuffer = buffer.subarray(this.LENGTH_PREFIX_SIZE + messageLength);
      
      // Parse JSON envelope
      const envelopeJson = messageBuffer.toString('utf8');
      let envelope: SocketMessage;
      
      try {
        envelope = JSON.parse(envelopeJson);
      } catch (jsonError) {
        throw new JSONRPCErrorClass(JSONRPCErrorBuilder.create(
          JSONRPCErrorCode.MESSAGE_FRAMING_ERROR,
          `Failed to parse message envelope JSON: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}`
        ));
      }
      
      // Validate envelope structure
      if (!envelope || typeof envelope !== 'object') {
        throw new JSONRPCErrorClass(JSONRPCErrorBuilder.create(
          JSONRPCErrorCode.MESSAGE_FRAMING_ERROR,
          'Message envelope must be an object'
        ));
      }
      
      if (!envelope.type || !envelope.payload) {
        throw new JSONRPCErrorClass(JSONRPCErrorBuilder.create(
          JSONRPCErrorCode.MESSAGE_FRAMING_ERROR,
          'Message envelope missing required fields (type, payload)'
        ));
      }
      
      if (envelope.type !== 'command' && envelope.type !== 'response') {
        throw new JSONRPCErrorClass(JSONRPCErrorBuilder.create(
          JSONRPCErrorCode.MESSAGE_FRAMING_ERROR,
          `Invalid message type: ${envelope.type}`
        ));
      }
      
      // Decode base64 payload
      let payloadBuffer: Buffer;
      try {
        payloadBuffer = Buffer.from(envelope.payload, 'base64');
      } catch (base64Error) {
        throw new JSONRPCErrorClass(JSONRPCErrorBuilder.create(
          JSONRPCErrorCode.MESSAGE_FRAMING_ERROR,
          `Failed to decode base64 payload: ${base64Error instanceof Error ? base64Error.message : String(base64Error)}`
        ));
      }
      
      // Parse payload JSON
      const payloadJson = payloadBuffer.toString('utf8');
      let message: JanusCommand | JanusResponse;
      
      try {
        message = JSON.parse(payloadJson);
      } catch (jsonError) {
        throw new JSONRPCErrorClass(JSONRPCErrorBuilder.create(
          JSONRPCErrorCode.MESSAGE_FRAMING_ERROR,
          `Failed to parse payload JSON: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}`
        ));
      }
      
      // Validate message structure based on type
      if (envelope.type === 'command') {
        this.validateCommandStructure(message);
      } else {
        this.validateResponseStructure(message);
      }
      
      return { message, remainingBuffer };
    } catch (error) {
      if (error instanceof JSONRPCErrorClass) {
        throw error;
      }
      throw new JSONRPCErrorClass(JSONRPCErrorBuilder.create(
        JSONRPCErrorCode.MESSAGE_FRAMING_ERROR,
        `Failed to decode message: ${error instanceof Error ? error.message : String(error)}`
      ));
    }
  }

  /**
   * Extract complete messages from a buffer, handling partial messages
   */
  static extractMessages(buffer: Buffer): { messages: (JanusCommand | JanusResponse)[]; remainingBuffer: Buffer } {
    const messages: (JanusCommand | JanusResponse)[] = [];
    let currentBuffer = buffer;
    
    while (currentBuffer.length > 0) {
      try {
        // Try to decode a message
        const result = this.decodeMessage(currentBuffer);
        messages.push(result.message);
        currentBuffer = result.remainingBuffer;
      } catch (error) {
        if (error instanceof JSONRPCErrorClass && error.data?.details &&
            (error.data.details.includes('Buffer too small for length prefix') || 
             error.data.details.includes('Buffer too small for complete message'))) {
          // Not enough data for complete message, save remaining buffer
          break;
        }
        // Re-throw other errors
        throw error;
      }
    }
    
    return { messages, remainingBuffer: currentBuffer };
  }

  /**
   * Calculate the total size needed for a message when framed
   */
  static calculateFramedSize(message: JanusCommand | JanusResponse): number {
    const encoded = this.encodeMessage(message);
    return encoded.length;
  }

  /**
   * Validate command structure
   */
  private static validateCommandStructure(message: any): asserts message is JanusCommand {
    if (!message || typeof message !== 'object') {
      throw new JSONRPCErrorClass(JSONRPCErrorBuilder.create(
        JSONRPCErrorCode.MESSAGE_FRAMING_ERROR,
        'Command must be an object'
      ));
    }
    
    const requiredStringFields = ['id', 'channelId', 'command'];
    for (const field of requiredStringFields) {
      if (!(field in message) || typeof message[field] !== 'string') {
        throw new JSONRPCErrorClass(JSONRPCErrorBuilder.create(
          JSONRPCErrorCode.MESSAGE_FRAMING_ERROR,
          `Command missing required string field: ${field}`
        ));
      }
    }
    
    // Validate timestamp as number (Unix timestamp)
    if (!('timestamp' in message) || typeof message.timestamp !== 'number') {
      throw new JSONRPCErrorClass(JSONRPCErrorBuilder.create(
        JSONRPCErrorCode.MESSAGE_FRAMING_ERROR,
        'Command missing required number field: timestamp'
      ));
    }
    
    if (message.args !== undefined && (typeof message.args !== 'object' || message.args === null)) {
      throw new JSONRPCErrorClass(JSONRPCErrorBuilder.create(
        JSONRPCErrorCode.MESSAGE_FRAMING_ERROR,
        'Command args must be an object'
      ));
    }
    
    if (message.timeout !== undefined && typeof message.timeout !== 'number') {
      throw new JSONRPCErrorClass(JSONRPCErrorBuilder.create(
        JSONRPCErrorCode.MESSAGE_FRAMING_ERROR,
        'Command timeout must be a number'
      ));
    }
  }

  /**
   * Validate response structure
   */
  private static validateResponseStructure(message: any): asserts message is JanusResponse {
    if (!message || typeof message !== 'object') {
      throw new JSONRPCErrorClass(JSONRPCErrorBuilder.create(
        JSONRPCErrorCode.MESSAGE_FRAMING_ERROR,
        'Response must be an object'
      ));
    }
    
    const requiredFields = ['commandId', 'channelId', 'success', 'timestamp'];
    for (const field of requiredFields) {
      if (!(field in message)) {
        throw new JSONRPCErrorClass(JSONRPCErrorBuilder.create(
          JSONRPCErrorCode.MESSAGE_FRAMING_ERROR,
          `Response missing required field: ${field}`
        ));
      }
    }
    
    if (typeof message.commandId !== 'string' || typeof message.channelId !== 'string' ||
        typeof message.success !== 'boolean' || typeof message.timestamp !== 'number') {
      throw new JSONRPCErrorClass(JSONRPCErrorBuilder.create(
        JSONRPCErrorCode.MESSAGE_FRAMING_ERROR,
        'Response field types invalid'
      ));
    }
    
    if (message.result !== undefined && (typeof message.result !== 'object' || message.result === null)) {
      throw new JSONRPCErrorClass(JSONRPCErrorBuilder.create(
        JSONRPCErrorCode.MESSAGE_FRAMING_ERROR,
        'Response result must be an object'
      ));
    }
    
    if (message.error !== undefined && (typeof message.error !== 'object' || message.error === null)) {
      throw new JSONRPCErrorClass(JSONRPCErrorBuilder.create(
        JSONRPCErrorCode.MESSAGE_FRAMING_ERROR,
        'Response error must be an object'
      ));
    }
  }

  /**
   * Create a direct JSON message for simple cases (without envelope)
   */
  static encodeDirectMessage(message: JanusCommand | JanusResponse): Buffer {
    try {
      const jsonPayload = JSON.stringify(message);
      const messageBuffer = Buffer.from(jsonPayload, 'utf8');
      
      // Validate message size
      if (messageBuffer.length > this.MAX_MESSAGE_SIZE) {
        throw new JSONRPCErrorClass(JSONRPCErrorBuilder.create(
          JSONRPCErrorCode.MESSAGE_FRAMING_ERROR,
          `Message size ${messageBuffer.length} exceeds maximum ${this.MAX_MESSAGE_SIZE}`
        ));
      }
      
      // Create length prefix
      const lengthBuffer = Buffer.alloc(this.LENGTH_PREFIX_SIZE);
      lengthBuffer.writeUInt32BE(messageBuffer.length, 0);
      
      return Buffer.concat([lengthBuffer, messageBuffer]);
    } catch (error) {
      if (error instanceof JSONRPCErrorClass) {
        throw error;
      }
      throw new JSONRPCErrorClass(JSONRPCErrorBuilder.create(
        JSONRPCErrorCode.MESSAGE_FRAMING_ERROR,
        `Failed to encode direct message: ${error instanceof Error ? error.message : String(error)}`
      ));
    }
  }

  /**
   * Decode a direct JSON message (without envelope)
   */
  static decodeDirectMessage(buffer: Buffer): { message: JanusCommand | JanusResponse; remainingBuffer: Buffer } {
    try {
      // Check length prefix
      if (buffer.length < this.LENGTH_PREFIX_SIZE) {
        throw new JSONRPCErrorClass(JSONRPCErrorBuilder.create(
          JSONRPCErrorCode.MESSAGE_FRAMING_ERROR,
          `Buffer too small for length prefix: ${buffer.length} < ${this.LENGTH_PREFIX_SIZE}`
        ));
      }
      
      const messageLength = buffer.readUInt32BE(0);
      const totalRequired = this.LENGTH_PREFIX_SIZE + messageLength;
      
      if (buffer.length < totalRequired) {
        throw new JSONRPCErrorClass(JSONRPCErrorBuilder.create(
          JSONRPCErrorCode.MESSAGE_FRAMING_ERROR,
          `Buffer too small for complete message: ${buffer.length} < ${totalRequired}`
        ));
      }
      
      // Extract and parse message
      const messageBuffer = buffer.subarray(this.LENGTH_PREFIX_SIZE, this.LENGTH_PREFIX_SIZE + messageLength);
      const remainingBuffer = buffer.subarray(this.LENGTH_PREFIX_SIZE + messageLength);
      
      const messageJson = messageBuffer.toString('utf8');
      const message = JSON.parse(messageJson);
      
      return { message, remainingBuffer };
    } catch (error) {
      if (error instanceof JSONRPCErrorClass) {
        throw error;
      }
      throw new JSONRPCErrorClass(JSONRPCErrorBuilder.create(
        JSONRPCErrorCode.MESSAGE_FRAMING_ERROR,
        `Failed to decode direct message: ${error instanceof Error ? error.message : String(error)}`
      ));
    }
  }
}