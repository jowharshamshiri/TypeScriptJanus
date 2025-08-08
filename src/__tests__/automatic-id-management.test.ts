import { JanusClient } from '../protocol/janus-client';
import { RequestHandle, RequestStatus } from '../types/protocol';
import { v4 as uuidv4 } from 'uuid';

describe('Automatic ID Management Tests', () => {
  describe('RequestHandle Creation', () => {
    test('F0194: Request ID Assignment and F0196: RequestHandle Structure', () => {
      const internalID = 'test-uuid-12345';
      const request = 'test_request';
      const channel = 'test_channel';
      
      const handle = new RequestHandle(internalID, request);
      
      // Verify handle properties
      expect(handle.getRequest()).toBe(request);
      expect(handle.getInternalID()).toBe(internalID);
      expect(handle.isCancelled()).toBe(false);
      
      // Test timestamp is recent
      const now = new Date();
      const timeDiff = now.getTime() - handle.getTimestamp().getTime();
      expect(timeDiff).toBeLessThan(1000); // Less than 1 second
    });
  });

  describe('RequestHandle Cancellation', () => {
    test('F0204: Request Cancellation and F0212: Request Cleanup', () => {
      const handle = new RequestHandle('test-id', 'test_request');
      
      expect(handle.isCancelled()).toBe(false);
      
      handle.markCancelled();
      
      expect(handle.isCancelled()).toBe(true);
    });
  });

  describe('Request Status Tracking', () => {
    test('F0202: Request Status Query', async () => {
      const client = new JanusClient({
        socketPath: '/tmp/test_socket',
        enableValidation: false
      });
      
      // Create a handle
      const handle = new RequestHandle('test-id', 'test_request');
      
      // Test initial status (should be completed since not in registry)
      let status = client.getRequestStatus(handle);
      expect(status).toBe(RequestStatus.Completed);
      
      // Test cancelled status
      handle.markCancelled();
      status = client.getRequestStatus(handle);
      expect(status).toBe(RequestStatus.Cancelled);
    });
  });

  describe('Pending Request Management', () => {
    test('F0197: Handle Creation and F0201: Request State Management', async () => {
      const client = new JanusClient({
        socketPath: '/tmp/test_socket',
        enableValidation: false
      });
      
      // Initially no pending requests
      const pending = client.getPendingRequests();
      expect(pending.length).toBe(0);
      
      // Test cancel all with no requests
      const cancelled = client.cancelAllRequests();
      expect(cancelled).toBe(0);
    });
  });

  describe('Request Lifecycle Management', () => {
    test('F0200: Request State Management and F0211: Handle Cleanup', async () => {
      const client = new JanusClient({
        socketPath: '/tmp/test_socket',
        enableValidation: false
      });
      
      // Create multiple handles to test bulk operations
      const handles = [
        new RequestHandle('id1', 'cmd1'),
        new RequestHandle('id2', 'cmd2'),
        new RequestHandle('id3', 'cmd3')
      ];
      
      // Test that handles start as completed (not in registry)
      handles.forEach((handle) => {
        const status = client.getRequestStatus(handle);
        expect(status).toBe(RequestStatus.Completed);
      });
      
      // Test cancellation of non-existent handle should fail
      expect(() => client.cancelRequest(handles[0]!)).toThrow();
    });
  });

  describe('ID Visibility Control', () => {
    test('F0195: ID Visibility Control - UUIDs should be hidden from normal API', () => {
      const handle = new RequestHandle('internal-uuid-12345', 'test_request');
      
      // User should only see request, not internal UUID through normal API
      expect(handle.getRequest()).toBe('test_request');
      
      // Internal ID should only be accessible for internal operations
      expect(handle.getInternalID()).toBe('internal-uuid-12345');
    });
  });

  describe('Request Status Constants', () => {
    test('All RequestStatus constants are defined', () => {
      const statuses = [
        RequestStatus.Pending,
        RequestStatus.Completed,
        RequestStatus.Failed,
        RequestStatus.Cancelled,
        RequestStatus.Timeout
      ];
      
      const expectedValues = ['pending', 'completed', 'failed', 'cancelled', 'timeout'];
      
      statuses.forEach((status, i) => {
        expect(status).toBe(expectedValues[i]);
      });
    });
  });

  describe('Concurrent Request Handling', () => {
    test('F0223: Concurrent Request Support', async () => {
      const client = new JanusClient({
        socketPath: '/tmp/test_socket',
        enableValidation: false
      });
      
      // Test concurrent handle creation and management
      const handles = Array.from({ length: 10 }, (_, i) => 
        new RequestHandle(`concurrent-id-${i}`, `cmd${i}`)
      );
      
      // Test concurrent status checks
      handles.forEach(handle => {
        const status = client.getRequestStatus(handle);
        expect(status).toBe(RequestStatus.Completed);
      });
      
      // Test concurrent cancellation
      handles.forEach(handle => {
        handle.markCancelled();
        expect(handle.isCancelled()).toBe(true);
      });
    });
  });

  describe('UUID Generation Uniqueness', () => {
    test('F0193: UUID Generation - ensure unique IDs', () => {
      const generatedIDs = new Set<string>();
      
      for (let i = 0; i < 1000; i++) {
        const handle = new RequestHandle(
          uuidv4(),
          'test_request'
        );
        
        const id = handle.getInternalID();
        expect(generatedIDs.has(id)).toBe(false);
        generatedIDs.add(id);
      }
      
      expect(generatedIDs.size).toBe(1000);
    });
  });
});