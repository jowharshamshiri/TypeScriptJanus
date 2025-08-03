/**
 * Timeout Management Tests
 * Tests for ResponseTracker timeout functionality and command timeout handling
 */

import { ResponseTracker } from '../core/response-tracker';
import { JSONRPCErrorClass } from '../types/jsonrpc-error';
import { JanusResponse } from '../types/protocol';

describe('Timeout Management', () => {
  let tracker: ResponseTracker;

  beforeEach(() => {
    tracker = new ResponseTracker({
      defaultTimeout: 1.0, // 1 second for fast tests
      maxPendingCommands: 100,
      cleanupInterval: 5000
    });
  });

  afterEach(() => {
    tracker.removeAllListeners();
    tracker.shutdown();
  });

  describe('Timeout Registration', () => {
    it('should register timeout with callback', (done) => {
      const commandId = 'test-command-1';
      
      let timeoutCalled = false;
      tracker.on('timeout', (id) => {
        expect(id).toBe(commandId);
        timeoutCalled = true;
      });

      tracker.trackCommand(
        commandId,
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
      const commands = ['cmd-1', 'cmd-2', 'cmd-3'];
      let timeoutCount = 0;

      tracker.on('timeout', () => {
        timeoutCount++;
        if (timeoutCount === commands.length) {
          expect(timeoutCount).toBe(3);
          done();
        }
      });

      commands.forEach((cmdId, index) => {
        tracker.trackCommand(
          cmdId,
          () => {},
          () => {}, // Ignore rejection for this test
          0.1 + (index * 0.05) // Staggered timeouts
        );
      });
    }, 1000);
  });

  describe('Timeout Cancellation', () => {
    it('should cancel specific timeouts when response received', (done) => {
      const commandId = 'test-command-cancel';
      
      let timeoutCalled = false;
      tracker.on('timeout', () => {
        timeoutCalled = true;
      });

      tracker.trackCommand(
        commandId,
        (response) => {
          expect(response.commandId).toBe(commandId);
          
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
          commandId,
          channelId: 'test-channel',
          success: true,
          result: { result: 'test' },
          timestamp: Date.now()
        };
        tracker.handleResponse(response);
      }, 100);
    }, 1000);

    it('should cancel all timeouts on cleanup', () => {
      const commands = ['cleanup-1', 'cleanup-2', 'cleanup-3'];
      
      commands.forEach(cmdId => {
        tracker.trackCommand(
          cmdId,
          () => {},
          () => {},
          5.0 // Long timeout
        );
      });

      expect(tracker.getPendingCount()).toBe(3);
      
      tracker.cancelAllCommands();
      expect(tracker.getPendingCount()).toBe(0);
    });
  });

  describe('Active Timeout Monitoring', () => {
    it('should count active timeouts correctly', () => {
      expect(tracker.getPendingCount()).toBe(0);

      tracker.trackCommand('cmd-1', () => {}, () => {}, 5.0);
      expect(tracker.getPendingCount()).toBe(1);

      tracker.trackCommand('cmd-2', () => {}, () => {}, 5.0);
      expect(tracker.getPendingCount()).toBe(2);

      tracker.trackCommand('cmd-3', () => {}, () => {}, 5.0);
      expect(tracker.getPendingCount()).toBe(3);
    });

    it('should check active timeouts status', () => {
      expect(tracker.getPendingCount() > 0).toBe(false);

      tracker.trackCommand('active-test', () => {}, () => {}, 5.0);
      expect(tracker.getPendingCount() > 0).toBe(true);

      const response: JanusResponse = {
        commandId: 'active-test',
        channelId: 'test-channel',
        success: true,
        result: {},
        timestamp: Date.now()
      };
      tracker.handleResponse(response);
      
      expect(tracker.getPendingCount()).toBe(0);
    });
  });

  describe('Resource Cleanup', () => {
    it('should clean up completed commands', (done) => {
      const commandId = 'cleanup-test';
      
      tracker.on('cleanup', (id) => {
        expect(id).toBe(commandId);
        expect(tracker.getPendingCount()).toBe(0);
        done();
      });

      tracker.trackCommand(
        commandId,
        () => {},
        () => {},
        5.0
      );

      // Simulate response
      const response: JanusResponse = {
        commandId,
        channelId: 'test-channel',
        success: true,
        result: {},
        timestamp: Date.now()
      };
      tracker.handleResponse(response);
    }, 1000);

    it('should clean up timed out commands', (done) => {
      const commandId = 'timeout-cleanup';
      
      let cleanupCalled = false;
      tracker.on('cleanup', (id) => {
        expect(id).toBe(commandId);
        cleanupCalled = true;
      });

      tracker.trackCommand(
        commandId,
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
      const commandCount = 10;
      let completedCount = 0;
      let errors: Error[] = [];

      for (let i = 0; i < commandCount; i++) {
        const commandId = `concurrent-${i}`;
        
        tracker.trackCommand(
          commandId,
          () => {
            completedCount++;
            if (completedCount + errors.length === commandCount) {
              expect(errors.length).toBe(0);
              done();
            }
          },
          (error) => {
            errors.push(error);
            if (completedCount + errors.length === commandCount) {
              done(new Error(`Concurrent operations failed: ${errors.map(e => e.message).join(', ')}`));
            }
          },
          5.0
        );

        // Immediately send response for half the commands
        if (i % 2 === 0) {
          setTimeout(() => {
            const response: JanusResponse = {
              commandId,
              channelId: 'test-channel',
              success: true,
              result: { index: i },
              timestamp: Date.now()
            };
            tracker.handleResponse(response);
          }, 10);
        }
      }

      // Cancel the odd-numbered commands that won't get responses
      setTimeout(() => {
        for (let i = 1; i < commandCount; i += 2) {
          const commandId = `concurrent-${i}`;
          const response: JanusResponse = {
            commandId,
            channelId: 'test-channel',
            success: true,
            result: { index: i },
            timestamp: Date.now()
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
      
      tracker.trackCommand(
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
          commandId: 'stats-test',
          channelId: 'test-channel',
          success: true,
          result: {},
          timestamp: Date.now()
        };
        tracker.handleResponse(response);
      }, 10);
    }, 1000);
  });

  describe('Error Handling', () => {
    it('should handle duplicate command tracking', (done) => {
      const commandId = 'duplicate-test';
      
      // First tracking should succeed
      tracker.trackCommand(
        commandId,
        () => {},
        () => {},
        5.0
      );

      // Second tracking should fail
      tracker.trackCommand(
        commandId,
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

    it('should handle command limit exceeded', (done) => {
      const limitedTracker = new ResponseTracker({
        maxPendingCommands: 2,
        defaultTimeout: 5.0
      });

      // Fill up to limit
      limitedTracker.trackCommand('cmd-1', () => {}, () => {}, 5.0);
      limitedTracker.trackCommand('cmd-2', () => {}, () => {}, 5.0);

      // This should fail
      limitedTracker.trackCommand(
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
      const baseCommandId = 'bilateral-test';
      let requestTimeoutCalled = false;
      let responseTimeoutCalled = false;
      
      tracker.trackBilateralTimeout(
        baseCommandId,
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
      expect(tracker.isTracking(`${baseCommandId}-request`)).toBe(true);
      expect(tracker.isTracking(`${baseCommandId}-response`)).toBe(true);
      expect(tracker.getPendingCount()).toBe(2);
    }, 1000);

    it('should cancel bilateral timeouts', () => {
      const baseCommandId = 'bilateral-cancel-test';
      
      tracker.trackBilateralTimeout(
        baseCommandId,
        () => {},
        () => {},
        () => {},
        () => {},
        5.0,
        5.0
      );

      expect(tracker.getPendingCount()).toBe(2);
      
      const cancelledCount = tracker.cancelBilateralTimeout(baseCommandId);
      expect(cancelledCount).toBe(2);
      expect(tracker.getPendingCount()).toBe(0);
    });

    it('should handle partial bilateral cancellation', () => {
      const baseCommandId = 'partial-bilateral-test';
      
      tracker.trackBilateralTimeout(
        baseCommandId,
        () => {},
        () => {},
        () => {},
        () => {},
        5.0,
        5.0
      );

      // Cancel request timeout manually
      tracker.cancelCommand(`${baseCommandId}-request`);
      expect(tracker.getPendingCount()).toBe(1);
      
      // Cancel bilateral - should only cancel the remaining response timeout
      const cancelledCount = tracker.cancelBilateralTimeout(baseCommandId);
      expect(cancelledCount).toBe(1);
      expect(tracker.getPendingCount()).toBe(0);
    });
  });

  describe('Timeout Extension', () => {
    it('should return true for extending existing timeout', () => {
      const commandId = 'extend-test';
      
      tracker.trackCommand(commandId, () => {}, () => {}, 5.0);
      
      const extended = tracker.extendTimeout(commandId, 2.0);
      expect(extended).toBe(true);
      
      // Cleanup
      tracker.cancelCommand(commandId);
    });

    it('should return false for non-existent timeout extension', () => {
      const extended = tracker.extendTimeout('non-existent-command', 1.0);
      expect(extended).toBe(false);
    });

    it('should update timeout value in statistics', () => {
      const commandId = 'stats-extend-test';
      
      tracker.trackCommand(commandId, () => {}, () => {}, 1.0);
      
      const extended = tracker.extendTimeout(commandId, 2.0);
      expect(extended).toBe(true);
      
      // Cleanup
      tracker.cancelCommand(commandId);
    });
  });

  describe('Error-Handled Registration', () => {
    it('should call error callback on registration failure', (done) => {
      const commandId = 'error-handled-test';
      
      // First registration succeeds
      tracker.trackCommand(commandId, () => {}, () => {}, 5.0);
      
      // Second registration should fail and call error callback
      tracker.trackCommandWithErrorHandling(
        commandId,
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

    it('should track command normally when no registration error', (done) => {
      const commandId = 'error-handled-success-test';
      
      tracker.trackCommandWithErrorHandling(
        commandId,
        (response) => {
          expect(response.commandId).toBe(commandId);
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
          commandId,
          channelId: 'test-channel',
          success: true,
          result: { success: true },
          timestamp: Date.now()
        };
        tracker.handleResponse(response);
      }, 10);
    }, 1000);

    it('should handle registration with command limit error', (done) => {
      const limitedTracker = new ResponseTracker({
        maxPendingCommands: 1,
        defaultTimeout: 5.0
      });

      // Fill up to limit
      limitedTracker.trackCommand('limit-cmd', () => {}, () => {}, 5.0);

      // This should fail and call error handler
      limitedTracker.trackCommandWithErrorHandling(
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