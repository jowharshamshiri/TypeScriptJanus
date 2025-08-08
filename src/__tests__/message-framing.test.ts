/**
 * Tests for MessageFraming
 */

import { MessageFraming } from '../core/message-framing';
import { JanusRequest, JanusResponse } from '../types/protocol';
import { JSONRPCErrorClass } from '../types/jsonrpc-error';

describe('MessageFraming', () => {
  const sampleRequest: JanusRequest = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    method: 'ping',
    request: 'ping',
    timestamp: '2024-07-29T12:30:00.000Z'
  };

  const sampleResponse: JanusResponse = {
    request_id: '550e8400-e29b-41d4-a716-446655440000',
    id: '550e8400-e29b-41d4-a716-446655440001',
    success: true,
    result: { pong: true },
    timestamp: '2024-07-29T12:30:01.000Z'
  };

  describe('encodeMessage', () => {
    it('should encode a request message', () => {
      const encoded = MessageFraming.encodeMessage(sampleRequest);
      
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
      const largeRequest = {
        ...sampleRequest,
        args: { data: 'x'.repeat(20 * 1024 * 1024) } // 20MB
      };
      
      expect(() => {
        MessageFraming.encodeMessage(largeRequest);
      }).toThrow(JSONRPCErrorClass);
    });
  });

  describe('decodeMessage', () => {
    it('should decode a request message', () => {
      const encoded = MessageFraming.encodeMessage(sampleRequest);
      const { message, remainingBuffer } = MessageFraming.decodeMessage(encoded);
      
      expect(message).toEqual(sampleRequest);
      expect(remainingBuffer.length).toBe(0);
    });

    it('should decode a response message', () => {
      const encoded = MessageFraming.encodeMessage(sampleResponse);
      const { message, remainingBuffer } = MessageFraming.decodeMessage(encoded);
      
      expect(message).toEqual(sampleResponse);
      expect(remainingBuffer.length).toBe(0);
    });

    it('should handle multiple messages in buffer', () => {
      const encoded1 = MessageFraming.encodeMessage(sampleRequest);
      const encoded2 = MessageFraming.encodeMessage(sampleResponse);
      const combined = Buffer.concat([encoded1, encoded2]);
      
      // Extract first message
      const { message: message1, remainingBuffer } = MessageFraming.decodeMessage(combined);
      expect(message1).toEqual(sampleRequest);
      
      // Extract second message
      const { message: message2, remainingBuffer: final } = MessageFraming.decodeMessage(remainingBuffer);
      expect(message2).toEqual(sampleResponse);
      expect(final.length).toBe(0);
    });

    it('should throw error for incomplete length prefix', () => {
      const shortBuffer = Buffer.from([0x00, 0x00]); // Only 2 bytes
      
      expect(() => {
        MessageFraming.decodeMessage(shortBuffer);
      }).toThrow(JSONRPCErrorClass);
    });

    it('should throw error for incomplete message', () => {
      const encoded = MessageFraming.encodeMessage(sampleRequest);
      const truncated = encoded.subarray(0, encoded.length - 10); // Remove last 10 bytes
      
      expect(() => {
        MessageFraming.decodeMessage(truncated);
      }).toThrow(JSONRPCErrorClass);
    });

    it('should throw error for zero-length message', () => {
      const zeroLengthBuffer = Buffer.from([0x00, 0x00, 0x00, 0x00]); // 0 length
      
      expect(() => {
        MessageFraming.decodeMessage(zeroLengthBuffer);
      }).toThrow(JSONRPCErrorClass);
    });
  });

  describe('extractMessages', () => {
    it('should extract multiple complete messages', () => {
      const encoded1 = MessageFraming.encodeMessage(sampleRequest);
      const encoded2 = MessageFraming.encodeMessage(sampleResponse);
      const combined = Buffer.concat([encoded1, encoded2]);
      
      const { messages, remainingBuffer } = MessageFraming.extractMessages(combined);
      
      expect(messages).toHaveLength(2);
      expect(messages[0]).toEqual(sampleRequest);
      expect(messages[1]).toEqual(sampleResponse);
      expect(remainingBuffer.length).toBe(0);
    });

    it('should handle partial messages', () => {
      const encoded1 = MessageFraming.encodeMessage(sampleRequest);
      const encoded2 = MessageFraming.encodeMessage(sampleResponse);
      const combined = Buffer.concat([encoded1, encoded2]);
      
      // Take only part of the second message
      const partial = combined.subarray(0, encoded1.length + 10);
      
      const { messages, remainingBuffer } = MessageFraming.extractMessages(partial);
      
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual(sampleRequest);
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
      const size = MessageFraming.calculateFramedSize(sampleRequest);
      const encoded = MessageFraming.encodeMessage(sampleRequest);
      
      expect(size).toBe(encoded.length);
    });
  });

  describe('encodeDirectMessage', () => {
    it('should encode message without envelope', () => {
      const encoded = MessageFraming.encodeDirectMessage(sampleRequest);
      
      expect(encoded).toBeInstanceOf(Buffer);
      expect(encoded.length).toBeGreaterThan(4);
      
      // Should be smaller than envelope version (no base64 overhead)
      const envelopeEncoded = MessageFraming.encodeMessage(sampleRequest);
      expect(encoded.length).toBeLessThan(envelopeEncoded.length);
    });
  });

  describe('decodeDirectMessage', () => {
    it('should decode direct message without envelope', () => {
      const encoded = MessageFraming.encodeDirectMessage(sampleRequest);
      const { message, remainingBuffer } = MessageFraming.decodeDirectMessage(encoded);
      
      expect(message).toEqual(sampleRequest);
      expect(remainingBuffer.length).toBe(0);
    });

    it('should roundtrip request through direct encoding', () => {
      const encoded = MessageFraming.encodeDirectMessage(sampleRequest);
      const { message } = MessageFraming.decodeDirectMessage(encoded);
      
      expect(message).toEqual(sampleRequest);
    });

    it('should roundtrip response through direct encoding', () => {
      const encoded = MessageFraming.encodeDirectMessage(sampleResponse);
      const { message } = MessageFraming.decodeDirectMessage(encoded);
      
      expect(message).toEqual(sampleResponse);
    });
  });
});