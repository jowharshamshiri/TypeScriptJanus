/**
 * Tests for MessageFraming
 */

import { MessageFraming, MessageFramingError } from '../core/message-framing';
import { SocketCommand, SocketResponse } from '../types/protocol';

describe('MessageFraming', () => {
  const sampleCommand: SocketCommand = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    channelId: 'test-service',
    command: 'ping',
    timestamp: '2025-07-29T10:50:00.000Z'
  };

  const sampleResponse: SocketResponse = {
    commandId: '550e8400-e29b-41d4-a716-446655440000',
    channelId: 'test-service',
    success: true,
    result: { pong: true },
    timestamp: '2025-07-29T10:50:01.000Z'
  };

  describe('encodeMessage', () => {
    it('should encode a command message', () => {
      const encoded = MessageFraming.encodeMessage(sampleCommand);
      
      expect(encoded).toBeInstanceOf(Buffer);
      expect(encoded.length).toBeGreaterThan(4); // At least length prefix + content
      
      // Check length prefix (first 4 bytes)
      const messageLength = encoded.readUInt32BE(0);
      expect(messageLength).toBe(encoded.length - 4);
    });

    it('should encode a response message', () => {
      const encoded = MessageFraming.encodeMessage(sampleResponse);
      
      expect(encoded).toBeInstanceOf(Buffer);
      expect(encoded.length).toBeGreaterThan(4);
      
      const messageLength = encoded.readUInt32BE(0);
      expect(messageLength).toBe(encoded.length - 4);
    });

    it('should throw error for messages that are too large', () => {
      const largeCommand = {
        ...sampleCommand,
        args: { data: 'x'.repeat(20 * 1024 * 1024) } // 20MB
      };
      
      expect(() => {
        MessageFraming.encodeMessage(largeCommand);
      }).toThrow(MessageFramingError);
    });
  });

  describe('decodeMessage', () => {
    it('should decode a command message', () => {
      const encoded = MessageFraming.encodeMessage(sampleCommand);
      const { message, remainingBuffer } = MessageFraming.decodeMessage(encoded);
      
      expect(message).toEqual(sampleCommand);
      expect(remainingBuffer.length).toBe(0);
    });

    it('should decode a response message', () => {
      const encoded = MessageFraming.encodeMessage(sampleResponse);
      const { message, remainingBuffer } = MessageFraming.decodeMessage(encoded);
      
      expect(message).toEqual(sampleResponse);
      expect(remainingBuffer.length).toBe(0);
    });

    it('should handle multiple messages in buffer', () => {
      const encoded1 = MessageFraming.encodeMessage(sampleCommand);
      const encoded2 = MessageFraming.encodeMessage(sampleResponse);
      const combined = Buffer.concat([encoded1, encoded2]);
      
      // Extract first message
      const { message: message1, remainingBuffer } = MessageFraming.decodeMessage(combined);
      expect(message1).toEqual(sampleCommand);
      
      // Extract second message
      const { message: message2, remainingBuffer: final } = MessageFraming.decodeMessage(remainingBuffer);
      expect(message2).toEqual(sampleResponse);
      expect(final.length).toBe(0);
    });

    it('should throw error for incomplete length prefix', () => {
      const shortBuffer = Buffer.from([0x00, 0x00]); // Only 2 bytes
      
      expect(() => {
        MessageFraming.decodeMessage(shortBuffer);
      }).toThrow(MessageFramingError);
    });

    it('should throw error for incomplete message', () => {
      const encoded = MessageFraming.encodeMessage(sampleCommand);
      const truncated = encoded.subarray(0, encoded.length - 10); // Remove last 10 bytes
      
      expect(() => {
        MessageFraming.decodeMessage(truncated);
      }).toThrow(MessageFramingError);
    });

    it('should throw error for zero-length message', () => {
      const zeroLengthBuffer = Buffer.from([0x00, 0x00, 0x00, 0x00]); // 0 length
      
      expect(() => {
        MessageFraming.decodeMessage(zeroLengthBuffer);
      }).toThrow(MessageFramingError);
    });
  });

  describe('extractMessages', () => {
    it('should extract multiple complete messages', () => {
      const encoded1 = MessageFraming.encodeMessage(sampleCommand);
      const encoded2 = MessageFraming.encodeMessage(sampleResponse);
      const combined = Buffer.concat([encoded1, encoded2]);
      
      const { messages, remainingBuffer } = MessageFraming.extractMessages(combined);
      
      expect(messages).toHaveLength(2);
      expect(messages[0]).toEqual(sampleCommand);
      expect(messages[1]).toEqual(sampleResponse);
      expect(remainingBuffer.length).toBe(0);
    });

    it('should handle partial messages', () => {
      const encoded1 = MessageFraming.encodeMessage(sampleCommand);
      const encoded2 = MessageFraming.encodeMessage(sampleResponse);
      const combined = Buffer.concat([encoded1, encoded2]);
      
      // Take only part of the second message
      const partial = combined.subarray(0, encoded1.length + 10);
      
      const { messages, remainingBuffer } = MessageFraming.extractMessages(partial);
      
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual(sampleCommand);
      expect(remainingBuffer.length).toBe(10); // Partial second message
    });

    it('should handle empty buffer', () => {
      const { messages, remainingBuffer } = MessageFraming.extractMessages(Buffer.alloc(0));
      
      expect(messages).toHaveLength(0);
      expect(remainingBuffer.length).toBe(0);
    });

    it('should handle buffer with only partial length prefix', () => {
      const partial = Buffer.from([0x00, 0x00]); // Incomplete length prefix
      
      const { messages, remainingBuffer } = MessageFraming.extractMessages(partial);
      
      expect(messages).toHaveLength(0);
      expect(remainingBuffer).toEqual(partial);
    });
  });

  describe('calculateFramedSize', () => {
    it('should calculate correct framed size', () => {
      const size = MessageFraming.calculateFramedSize(sampleCommand);
      const encoded = MessageFraming.encodeMessage(sampleCommand);
      
      expect(size).toBe(encoded.length);
    });
  });

  describe('encodeDirectMessage', () => {
    it('should encode message without envelope', () => {
      const encoded = MessageFraming.encodeDirectMessage(sampleCommand);
      
      expect(encoded).toBeInstanceOf(Buffer);
      expect(encoded.length).toBeGreaterThan(4);
      
      // Should be smaller than envelope version (no base64 overhead)
      const envelopeEncoded = MessageFraming.encodeMessage(sampleCommand);
      expect(encoded.length).toBeLessThan(envelopeEncoded.length);
    });
  });

  describe('decodeDirectMessage', () => {
    it('should decode direct message without envelope', () => {
      const encoded = MessageFraming.encodeDirectMessage(sampleCommand);
      const { message, remainingBuffer } = MessageFraming.decodeDirectMessage(encoded);
      
      expect(message).toEqual(sampleCommand);
      expect(remainingBuffer.length).toBe(0);
    });

    it('should roundtrip command through direct encoding', () => {
      const encoded = MessageFraming.encodeDirectMessage(sampleCommand);
      const { message } = MessageFraming.decodeDirectMessage(encoded);
      
      expect(message).toEqual(sampleCommand);
    });

    it('should roundtrip response through direct encoding', () => {
      const encoded = MessageFraming.encodeDirectMessage(sampleResponse);
      const { message } = MessageFraming.decodeDirectMessage(encoded);
      
      expect(message).toEqual(sampleResponse);
    });
  });
});