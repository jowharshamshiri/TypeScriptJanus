/**
 * Timeout Management Tests
 * Tests for ResponseTracker timeout functionality and request timeout handling
 */

import { ResponseTracker } from '../core/response-tracker';
import { JSONRPCErrorClass } from '../types/jsonrpc-error';
import { JanusResponse } from '../types/protocol';

describe('Timeout Management', () => {
  let tracker: ResponseTracker;

  beforeEach(() => {
    tracker = new ResponseTracker({
      defaultTimeout: 1.0, // 1 second for fast tests
      maxPendingRequests: 100,
      cleanupInterval: 5000
    });
  });

  afterEach(() => {
    tracker.removeAllListeners();
    tracker.shutdown();
  });

  describe('Timeout Registration', () => {
    it('should register timeout with callback', (done) => {
      const requestId = 'test-request-1';
      
      let timeoutCalled = false;
      tracker.on('timeout', (id) => {
        expect(id).toBe(requestId);
        timeoutCalled = true;
      });

      tracker.trackRequest(
        requestId,
        () => {
          done(new Error('Should not resolve - should timeout'));
        },
        (error) => {
          expect(error.message).toContain('Handler timeout');
          expect(timeoutCalled).toBe(true);
          done();
        },
        0.1 // 100ms timeout
      );
    }, 1000);

    it('should register multiple timeouts', (done) => {
      const requests = ['cmd-1', 'cmd-2', 'cmd-3'];
      let timeoutCount = 0;

      tracker.on('timeout', () => {
        timeoutCount++;
        if (timeoutCount === requests.length) {
          expect(timeoutCount).toBe(3);
          done();
        }
      });

      requests.forEach((cmdId, index) => {
        tracker.trackRequest(
          cmdId,
          () => {},
          () => {}, // Ignore rejection for this test
          0.1 + (index * 0.05) // Staggered timeouts
        );
      });
    }, 1000);
  });

  describe('Timeout Cancellation', () => {
    it('should cancel manifestific timeouts when response received', (done) => {
      const requestId = 'test-request-cancel';
      
      let timeoutCalled = false;
      tracker.on('timeout', () => {
        timeoutCalled = true;
      });

      tracker.trackRequest(
        requestId,
        (response) => {
          expect(response.requestId).toBe(requestId);
          
          // Give timeout a chance to fire (it shouldn't)
          setTimeout(() => {
            expect(timeoutCalled).toBe(false);
            done();
          }, 200);
        },
        (error) => {
          done(new Error(`Should not reject: ${error.message}`));
        },
        0.5 // 500ms timeout
      );

      // Send response before timeout
      setTimeout(() => {
        const response: JanusResponse = {
          requestId,
          method: 'slow_request',
          success: true,
          result: { result: 'test' },
          timestamp: new Date().toISOString()
        };
        tracker.handleResponse(response);
      }, 100);
    }, 1000);

    it('should cancel all timeouts on cleanup', () => {
      const requests = ['cleanup-1', 'cleanup-2', 'cleanup-3'];
      
      requests.forEach(cmdId => {
        tracker.trackRequest(
          cmdId,
          () => {},
          () => {},
          5.0 // Long timeout
        );
      });

      expect(tracker.getPendingCount()).toBe(3);
      
      tracker.cancelAllRequests();
      expect(tracker.getPendingCount()).toBe(0);
    });
  });

  describe('Active Timeout Monitoring', () => {
    it('should count active timeouts correctly', () => {
      expect(tracker.getPendingCount()).toBe(0);

      tracker.trackRequest('cmd-1', () => {}, () => {}, 5.0);
      expect(tracker.getPendingCount()).toBe(1);

      tracker.trackRequest('cmd-2', () => {}, () => {}, 5.0);
      expect(tracker.getPendingCount()).toBe(2);

      tracker.trackRequest('cmd-3', () => {}, () => {}, 5.0);
      expect(tracker.getPendingCount()).toBe(3);
    });

    it('should check active timeouts status', () => {
      expect(tracker.getPendingCount() > 0).toBe(false);

      tracker.trackRequest('active-test', () => {}, () => {}, 5.0);
      expect(tracker.getPendingCount() > 0).toBe(true);

      const response: JanusResponse = {
        requestId: 'active-test',
        method: 'slow_request',
        success: true,
        result: {},
        timestamp: new Date().toISOString()
      };
      tracker.handleResponse(response);
      
      expect(tracker.getPendingCount()).toBe(0);
    });
  });

  describe('Resource Cleanup', () => {
    it('should clean up completed requests', (done) => {
      const requestId = 'cleanup-test';
      
      tracker.on('cleanup', (id) => {
        expect(id).toBe(requestId);
        expect(tracker.getPendingCount()).toBe(0);
        done();
      });

      tracker.trackRequest(
        requestId,
        () => {},
        () => {},
        5.0
      );

      // Simulate response
      const response: JanusResponse = {
        requestId,
        method: 'slow_request',
        success: true,
        result: {},
        timestamp: new Date().toISOString()
      };
      tracker.handleResponse(response);
    }, 1000);

    it('should clean up timed out requests', (done) => {
      const requestId = 'timeout-cleanup';
      
      let cleanupCalled = false;
      tracker.on('cleanup', (id) => {
        expect(id).toBe(requestId);
        cleanupCalled = true;
      });

      tracker.trackRequest(
        requestId,
        () => {},
        (error) => {
          expect(error.message).toContain('Handler timeout');
          
          // Cleanup should be called after timeout
          setTimeout(() => {
            expect(cleanupCalled).toBe(true);
            done();
          }, 10);
        },
        0.1 // 100ms timeout
      );
    }, 1000);
  });

  describe('Thread-Safe Operations', () => {
    it('should handle concurrent timeout operations', (done) => {
      const requestCount = 10;
      let completedCount = 0;
      let errors: Error[] = [];

      for (let i = 0; i < requestCount; i++) {
        const requestId = `concurrent-${i}`;
        
        tracker.trackRequest(
          requestId,
          () => {
            completedCount++;
            if (completedCount + errors.length === requestCount) {
              expect(errors.length).toBe(0);
              done();
            }
          },
          (error) => {
            errors.push(error);
            if (completedCount + errors.length === requestCount) {
              done(new Error(`Concurrent operations failed: ${errors.map(e => e.message).join(', ')}`));
            }
          },
          5.0
        );

        // Immediately send response for half the requests
        if (i % 2 === 0) {
          setTimeout(() => {
            const response: JanusResponse = {
              requestId,
              method: 'slow_request',
              success: true,
              result: { index: i },
              timestamp: new Date().toISOString()
            };
            tracker.handleResponse(response);
          }, 10);
        }
      }

      // Cancel the odd-numbered requests that won't get responses
      setTimeout(() => {
        for (let i = 1; i < requestCount; i += 2) {
          const requestId = `concurrent-${i}`;
          const response: JanusResponse = {
            requestId,
            method: 'slow_request',
            success: true,
            result: { index: i },
            timestamp: new Date().toISOString()
          };
          tracker.handleResponse(response);
        }
      }, 50);
    }, 2000);
  });

  describe('Timeout Statistics', () => {
    it('should provide timeout metrics', () => {
      const stats = tracker.getStatistics();
      
      expect(stats).toHaveProperty('pendingCount');
      expect(stats).toHaveProperty('averageAge');
      
      expect(typeof stats.pendingCount).toBe('number');
      expect(typeof stats.averageAge).toBe('number');
    });

    it('should track timeout statistics correctly', (done) => {
      // Initial stats not needed for this test
      
      tracker.trackRequest(
        'stats-test',
        () => {
          const finalStats = tracker.getStatistics();
          expect(finalStats.pendingCount).toBe(0); // Should be cleaned up after response
          done();
        },
        (error) => {
          done(new Error(`Should not timeout: ${error.message}`));
        },
        5.0
      );

      // Send response
      setTimeout(() => {
        const response: JanusResponse = {
          requestId: 'stats-test',
          method: 'slow_request',
          success: true,
          result: {},
          timestamp: new Date().toISOString()
        };
        tracker.handleResponse(response);
      }, 10);
    }, 1000);
  });

  describe('Error Handling', () => {
    it('should handle duplicate request tracking', (done) => {
      const requestId = 'duplicate-test';
      
      // First tracking should succeed
      tracker.trackRequest(
        requestId,
        () => {},
        () => {},
        5.0
      );

      // Second tracking should fail
      tracker.trackRequest(
        requestId,
        () => {
          done(new Error('Should not resolve - should reject duplicate'));
        },
        (error) => {
          expect(error).toBeInstanceOf(Error);
          expect(error.message).toContain('Invalid Request');
          done();
        },
        5.0
      );
    }, 1000);

    it('should handle request limit exceeded', (done) => {
      const limitedTracker = new ResponseTracker({
        maxPendingRequests: 2,
        defaultTimeout: 5.0
      });

      // Fill up to limit
      limitedTracker.trackRequest('cmd-1', () => {}, () => {}, 5.0);
      limitedTracker.trackRequest('cmd-2', () => {}, () => {}, 5.0);

      // This should fail
      limitedTracker.trackRequest(
        'cmd-3',
        () => {
          done(new Error('Should not resolve - should reject limit exceeded'));
        },
        (error) => {
          expect(error).toBeInstanceOf(JSONRPCErrorClass);
          expect(error.message).toContain('Resource limit exceeded');
          limitedTracker.shutdown();
          done();
        },
        5.0
      );
    }, 1000);
  });

  describe('Bilateral Timeout Management', () => {
    it('should register request/response timeout pairs', (done) => {
      const baseRequestId = 'bilateral-test';
      let requestTimeoutCalled = false;
      let responseTimeoutCalled = false;
      
      tracker.trackBilateralTimeout(
        baseRequestId,
        () => {
          done(new Error('Request should not resolve - should timeout'));
        },
        (error) => {
          expect(error.message).toContain('Handler timeout');
          requestTimeoutCalled = true;
          if (responseTimeoutCalled) {
            done();
          }
        },
        () => {
          done(new Error('Response should not resolve - should timeout'));
        },
        (error) => {
          expect(error.message).toContain('Handler timeout');
          responseTimeoutCalled = true;
          if (requestTimeoutCalled) {
            done();
          }
        },
        0.1, // 100ms request timeout
        0.15 // 150ms response timeout
      );

      // Verify both timeouts are tracked
      expect(tracker.isTracking(`${baseRequestId}-request`)).toBe(true);
      expect(tracker.isTracking(`${baseRequestId}-response`)).toBe(true);
      expect(tracker.getPendingCount()).toBe(2);
    }, 1000);

    it('should cancel bilateral timeouts', () => {
      const baseRequestId = 'bilateral-cancel-test';
      
      tracker.trackBilateralTimeout(
        baseRequestId,
        () => {},
        () => {},
        () => {},
        () => {},
        5.0,
        5.0
      );

      expect(tracker.getPendingCount()).toBe(2);
      
      const cancelledCount = tracker.cancelBilateralTimeout(baseRequestId);
      expect(cancelledCount).toBe(2);
      expect(tracker.getPendingCount()).toBe(0);
    });

    it('should handle partial bilateral cancellation', () => {
      const baseRequestId = 'partial-bilateral-test';
      
      tracker.trackBilateralTimeout(
        baseRequestId,
        () => {},
        () => {},
        () => {},
        () => {},
        5.0,
        5.0
      );

      // Cancel request timeout manually
      tracker.cancelRequest(`${baseRequestId}-request`);
      expect(tracker.getPendingCount()).toBe(1);
      
      // Cancel bilateral - should only cancel the remaining response timeout
      const cancelledCount = tracker.cancelBilateralTimeout(baseRequestId);
      expect(cancelledCount).toBe(1);
      expect(tracker.getPendingCount()).toBe(0);
    });
  });

  describe('Timeout Extension', () => {
    it('should return true for extending existing timeout', () => {
      const requestId = 'extend-test';
      
      tracker.trackRequest(requestId, () => {}, () => {}, 5.0);
      
      const extended = tracker.extendTimeout(requestId, 2.0);
      expect(extended).toBe(true);
      
      // Cleanup
      tracker.cancelRequest(requestId);
    });

    it('should return false for non-existent timeout extension', () => {
      const extended = tracker.extendTimeout('non-existent-request', 1.0);
      expect(extended).toBe(false);
    });

    it('should update timeout value in statistics', () => {
      const requestId = 'stats-extend-test';
      
      tracker.trackRequest(requestId, () => {}, () => {}, 1.0);
      
      const extended = tracker.extendTimeout(requestId, 2.0);
      expect(extended).toBe(true);
      
      // Cleanup
      tracker.cancelRequest(requestId);
    });
  });

  describe('Error-Handled Registration', () => {
    it('should call error callback on registration failure', (done) => {
      const requestId = 'error-handled-test';
      
      // First registration succeeds
      tracker.trackRequest(requestId, () => {}, () => {}, 5.0);
      
      // Second registration should fail and call error callback
      tracker.trackRequestWithErrorHandling(
        requestId,
        () => {
          done(new Error('Should not resolve - should fail registration'));
        },
        () => {
          done(new Error('Should not call reject - should call error handler'));
        },
        (error) => {
          expect(error).toBeInstanceOf(Error);
          expect(error.message).toContain('Invalid Request');
          done();
        },
        5.0
      );
    }, 1000);

    it('should track request normally when no registration error', (done) => {
      const requestId = 'error-handled-success-test';
      
      tracker.trackRequestWithErrorHandling(
        requestId,
        (response) => {
          expect(response.requestId).toBe(requestId);
          done();
        },
        (error) => {
          done(new Error(`Should not reject: ${error.message}`));
        },
        (error) => {
          done(new Error(`Should not call error handler: ${error.message}`));
        },
        5.0
      );

      // Send response
      setTimeout(() => {
        const response: JanusResponse = {
          requestId,
          method: 'slow_request',
          success: true,
          result: { success: true },
          timestamp: new Date().toISOString()
        };
        tracker.handleResponse(response);
      }, 10);
    }, 1000);

    it('should handle registration with request limit error', (done) => {
      const limitedTracker = new ResponseTracker({
        maxPendingRequests: 1,
        defaultTimeout: 5.0
      });

      // Fill up to limit
      limitedTracker.trackRequest('limit-cmd', () => {}, () => {}, 5.0);

      // This should fail and call error handler
      limitedTracker.trackRequestWithErrorHandling(
        'over-limit-cmd',
        () => {
          done(new Error('Should not resolve - should fail registration'));
        },
        () => {
          done(new Error('Should not call reject - should call error handler'));
        },
        (error) => {
          expect(error).toBeInstanceOf(JSONRPCErrorClass);
          expect(error.message).toContain('Resource limit exceeded');
          limitedTracker.shutdown();
          done();
        },
        5.0
      );
    }, 1000);
  });
});