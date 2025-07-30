/**
 * Message Framing for Janus Protocol
 * Implements 4-byte big-endian length prefix framing
 */

import { SocketMessage, SocketCommand, SocketResponse } from '../types/protocol';

export class MessageFramingError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'MessageFramingError';
  }
}

export class MessageFraming {
  private static readonly LENGTH_PREFIX_SIZE = 4;
  private static readonly MAX_MESSAGE_SIZE = 10 * 1024 * 1024; // 10MB default

  /**
   * Encode a message with 4-byte big-endian length prefix
   */
  static encodeMessage(message: SocketCommand | SocketResponse): Buffer {
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
        throw new MessageFramingError(
          `Message size ${messageBuffer.length} exceeds maximum ${this.MAX_MESSAGE_SIZE}`,
          'MESSAGE_TOO_LARGE'
        );
      }
      
      // Create length prefix (4-byte big-endian)
      const lengthBuffer = Buffer.alloc(this.LENGTH_PREFIX_SIZE);
      lengthBuffer.writeUInt32BE(messageBuffer.length, 0);
      
      // Combine length prefix and message
      return Buffer.concat([lengthBuffer, messageBuffer]);
    } catch (error) {
      if (error instanceof MessageFramingError) {
        throw error;
      }
      throw new MessageFramingError(
        `Failed to encode message: ${error instanceof Error ? error.message : String(error)}`,
        'ENCODING_FAILED'
      );
    }
  }

  /**
   * Decode a message from buffer with length prefix
   */
  static decodeMessage(buffer: Buffer): { message: SocketCommand | SocketResponse; remainingBuffer: Buffer } {
    try {
      // Check if we have at least the length prefix
      if (buffer.length < this.LENGTH_PREFIX_SIZE) {
        throw new MessageFramingError(
          `Buffer too small for length prefix: ${buffer.length} < ${this.LENGTH_PREFIX_SIZE}`,
          'INCOMPLETE_LENGTH_PREFIX'
        );
      }
      
      // Read message length from big-endian prefix
      const messageLength = buffer.readUInt32BE(0);
      
      // Validate message length
      if (messageLength > this.MAX_MESSAGE_SIZE) {
        throw new MessageFramingError(
          `Message length ${messageLength} exceeds maximum ${this.MAX_MESSAGE_SIZE}`,
          'MESSAGE_TOO_LARGE'
        );
      }
      
      if (messageLength === 0) {
        throw new MessageFramingError(
          'Message length cannot be zero',
          'ZERO_LENGTH_MESSAGE'
        );
      }
      
      // Check if we have the complete message
      const totalRequired = this.LENGTH_PREFIX_SIZE + messageLength;
      if (buffer.length < totalRequired) {
        throw new MessageFramingError(
          `Buffer too small for complete message: ${buffer.length} < ${totalRequired}`,
          'INCOMPLETE_MESSAGE'
        );
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
        throw new MessageFramingError(
          `Failed to parse message envelope JSON: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}`,
          'INVALID_JSON_ENVELOPE'
        );
      }
      
      // Validate envelope structure
      if (!envelope || typeof envelope !== 'object') {
        throw new MessageFramingError(
          'Message envelope must be an object',
          'INVALID_ENVELOPE_TYPE'
        );
      }
      
      if (!envelope.type || !envelope.payload) {
        throw new MessageFramingError(
          'Message envelope missing required fields (type, payload)',
          'MISSING_ENVELOPE_FIELDS'
        );
      }
      
      if (envelope.type !== 'command' && envelope.type !== 'response') {
        throw new MessageFramingError(
          `Invalid message type: ${envelope.type}`,
          'INVALID_MESSAGE_TYPE'
        );
      }
      
      // Decode base64 payload
      let payloadBuffer: Buffer;
      try {
        payloadBuffer = Buffer.from(envelope.payload, 'base64');
      } catch (base64Error) {
        throw new MessageFramingError(
          `Failed to decode base64 payload: ${base64Error instanceof Error ? base64Error.message : String(base64Error)}`,
          'INVALID_BASE64_PAYLOAD'
        );
      }
      
      // Parse payload JSON
      const payloadJson = payloadBuffer.toString('utf8');
      let message: SocketCommand | SocketResponse;
      
      try {
        message = JSON.parse(payloadJson);
      } catch (jsonError) {
        throw new MessageFramingError(
          `Failed to parse payload JSON: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}`,
          'INVALID_PAYLOAD_JSON'
        );
      }
      
      // Validate message structure based on type
      if (envelope.type === 'command') {
        this.validateCommandStructure(message);
      } else {
        this.validateResponseStructure(message);
      }
      
      return { message, remainingBuffer };
    } catch (error) {
      if (error instanceof MessageFramingError) {
        throw error;
      }
      throw new MessageFramingError(
        `Failed to decode message: ${error instanceof Error ? error.message : String(error)}`,
        'DECODING_FAILED'
      );
    }
  }

  /**
   * Extract complete messages from a buffer, handling partial messages
   */
  static extractMessages(buffer: Buffer): { messages: (SocketCommand | SocketResponse)[]; remainingBuffer: Buffer } {
    const messages: (SocketCommand | SocketResponse)[] = [];
    let currentBuffer = buffer;
    
    while (currentBuffer.length > 0) {
      try {
        // Try to decode a message
        const result = this.decodeMessage(currentBuffer);
        messages.push(result.message);
        currentBuffer = result.remainingBuffer;
      } catch (error) {
        if (error instanceof MessageFramingError && 
            (error.code === 'INCOMPLETE_LENGTH_PREFIX' || error.code === 'INCOMPLETE_MESSAGE')) {
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
  static calculateFramedSize(message: SocketCommand | SocketResponse): number {
    const encoded = this.encodeMessage(message);
    return encoded.length;
  }

  /**
   * Validate command structure
   */
  private static validateCommandStructure(message: any): asserts message is SocketCommand {
    if (!message || typeof message !== 'object') {
      throw new MessageFramingError('Command must be an object', 'INVALID_COMMAND_STRUCTURE');
    }
    
    const requiredFields = ['id', 'channelId', 'command', 'timestamp'];
    for (const field of requiredFields) {
      if (!(field in message) || typeof message[field] !== 'string') {
        throw new MessageFramingError(
          `Command missing required string field: ${field}`,
          'MISSING_COMMAND_FIELD'
        );
      }
    }
    
    if (message.args !== undefined && (typeof message.args !== 'object' || message.args === null)) {
      throw new MessageFramingError('Command args must be an object', 'INVALID_COMMAND_ARGS');
    }
    
    if (message.timeout !== undefined && typeof message.timeout !== 'number') {
      throw new MessageFramingError('Command timeout must be a number', 'INVALID_COMMAND_TIMEOUT');
    }
  }

  /**
   * Validate response structure
   */
  private static validateResponseStructure(message: any): asserts message is SocketResponse {
    if (!message || typeof message !== 'object') {
      throw new MessageFramingError('Response must be an object', 'INVALID_RESPONSE_STRUCTURE');
    }
    
    const requiredFields = ['commandId', 'channelId', 'success', 'timestamp'];
    for (const field of requiredFields) {
      if (!(field in message)) {
        throw new MessageFramingError(
          `Response missing required field: ${field}`,
          'MISSING_RESPONSE_FIELD'
        );
      }
    }
    
    if (typeof message.commandId !== 'string' || typeof message.channelId !== 'string' ||
        typeof message.success !== 'boolean' || typeof message.timestamp !== 'string') {
      throw new MessageFramingError(
        'Response field types invalid',
        'INVALID_RESPONSE_FIELD_TYPES'
      );
    }
    
    if (message.result !== undefined && (typeof message.result !== 'object' || message.result === null)) {
      throw new MessageFramingError('Response result must be an object', 'INVALID_RESPONSE_RESULT');
    }
    
    if (message.error !== undefined && (typeof message.error !== 'object' || message.error === null)) {
      throw new MessageFramingError('Response error must be an object', 'INVALID_RESPONSE_ERROR');
    }
  }

  /**
   * Create a direct JSON message for simple cases (without envelope)
   */
  static encodeDirectMessage(message: SocketCommand | SocketResponse): Buffer {
    try {
      const jsonPayload = JSON.stringify(message);
      const messageBuffer = Buffer.from(jsonPayload, 'utf8');
      
      // Validate message size
      if (messageBuffer.length > this.MAX_MESSAGE_SIZE) {
        throw new MessageFramingError(
          `Message size ${messageBuffer.length} exceeds maximum ${this.MAX_MESSAGE_SIZE}`,
          'MESSAGE_TOO_LARGE'
        );
      }
      
      // Create length prefix
      const lengthBuffer = Buffer.alloc(this.LENGTH_PREFIX_SIZE);
      lengthBuffer.writeUInt32BE(messageBuffer.length, 0);
      
      return Buffer.concat([lengthBuffer, messageBuffer]);
    } catch (error) {
      if (error instanceof MessageFramingError) {
        throw error;
      }
      throw new MessageFramingError(
        `Failed to encode direct message: ${error instanceof Error ? error.message : String(error)}`,
        'ENCODING_FAILED'
      );
    }
  }

  /**
   * Decode a direct JSON message (without envelope)
   */
  static decodeDirectMessage(buffer: Buffer): { message: SocketCommand | SocketResponse; remainingBuffer: Buffer } {
    try {
      // Check length prefix
      if (buffer.length < this.LENGTH_PREFIX_SIZE) {
        throw new MessageFramingError(
          `Buffer too small for length prefix: ${buffer.length} < ${this.LENGTH_PREFIX_SIZE}`,
          'INCOMPLETE_LENGTH_PREFIX'
        );
      }
      
      const messageLength = buffer.readUInt32BE(0);
      const totalRequired = this.LENGTH_PREFIX_SIZE + messageLength;
      
      if (buffer.length < totalRequired) {
        throw new MessageFramingError(
          `Buffer too small for complete message: ${buffer.length} < ${totalRequired}`,
          'INCOMPLETE_MESSAGE'
        );
      }
      
      // Extract and parse message
      const messageBuffer = buffer.subarray(this.LENGTH_PREFIX_SIZE, this.LENGTH_PREFIX_SIZE + messageLength);
      const remainingBuffer = buffer.subarray(this.LENGTH_PREFIX_SIZE + messageLength);
      
      const messageJson = messageBuffer.toString('utf8');
      const message = JSON.parse(messageJson);
      
      return { message, remainingBuffer };
    } catch (error) {
      if (error instanceof MessageFramingError) {
        throw error;
      }
      throw new MessageFramingError(
        `Failed to decode direct message: ${error instanceof Error ? error.message : String(error)}`,
        'DECODING_FAILED'
      );
    }
  }
}