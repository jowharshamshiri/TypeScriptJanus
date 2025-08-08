/**
 * Response Tracker for Janus Protocol
 * Manages async response correlation and timeout handling
 */

import { EventEmitter } from 'events';
import { JanusResponse, PendingRequest } from '../types/protocol';
import { JSONRPCErrorBuilder, JSONRPCErrorCode, JSONRPCErrorClass } from '../types/jsonrpc-error';

export interface ResponseTrackerEvents {
  'timeout': (requestId: string) => void;
  'response': (requestId: string, response: JanusResponse) => void;
  'cleanup': (requestId: string) => void;
}

export interface TrackerConfig {
  /** Maximum number of pending requests */
  maxPendingRequests?: number;
  
  /** Cleanup interval in milliseconds */
  cleanupInterval?: number;
  
  /** Default timeout in seconds */
  defaultTimeout?: number;
}

export class ResponseTracker extends EventEmitter {
  private pendingRequests = new Map<string, PendingRequest>();
  private cleanupTimer: NodeJS.Timeout | null = null;
  private config: Required<TrackerConfig>;

  constructor(config: TrackerConfig = {}) {
    super();
    
    this.config = {
      maxPendingRequests: config.maxPendingRequests ?? 1000,
      cleanupInterval: config.cleanupInterval ?? 30000, // 30 seconds
      defaultTimeout: config.defaultTimeout ?? 30.0
    };
    
    this.startCleanupTimer();
  }

  /**
   * Track a request awaiting response
   */
  trackRequest(
    requestId: string,
    resolve: (response: JanusResponse) => void,
    reject: (error: Error) => void,
    timeout: number = this.config.defaultTimeout
  ): void {
    // Check limits
    if (this.pendingRequests.size >= this.config.maxPendingRequests) {
      reject(new JSONRPCErrorClass(JSONRPCErrorBuilder.create(
        JSONRPCErrorCode.RESOURCE_LIMIT_EXCEEDED,
        `Too many pending requests: Maximum ${this.config.maxPendingRequests} requests allowed`
      )));
      return;
    }

    // Check for duplicate tracking
    if (this.pendingRequests.has(requestId)) {
      reject(new JSONRPCErrorClass(JSONRPCErrorBuilder.create(
        JSONRPCErrorCode.INVALID_REQUEST,
        `Request already being tracked: Request ${requestId} is already awaiting response`
      )));
      return;
    }

    // Create pending request entry
    const pending: PendingRequest = {
      resolve,
      reject,
      timestamp: Date.now(),
      timeout
    };

    this.pendingRequests.set(requestId, pending);

    // Set individual timeout
    setTimeout(() => {
      this.handleTimeout(requestId);
    }, timeout * 1000);
  }

  /**
   * Handle an incoming response
   */
  handleResponse(response: JanusResponse): boolean {
    const pending = this.pendingRequests.get(response.request_id);
    
    if (!pending) {
      // Response for unknown request (possibly timed out)
      return false;
    }

    // Remove from tracking
    this.pendingRequests.delete(response.request_id);
    this.emit('cleanup', response.request_id);

    // Emit response event
    this.emit('response', response.request_id, response);

    // Resolve or reject based on response
    if (response.success) {
      pending.resolve(response);
    } else {
      const error = new JSONRPCErrorClass(JSONRPCErrorBuilder.create(
        JSONRPCErrorCode.RESPONSE_TRACKING_ERROR,
        response.error?.message ?? 'Request failed'
      ));
      pending.reject(error);
    }

    return true;
  }

  /**
   * Cancel tracking for a request
   */
  cancelRequest(requestId: string, reason?: string): boolean {
    const pending = this.pendingRequests.get(requestId);
    
    if (!pending) {
      return false;
    }

    this.pendingRequests.delete(requestId);
    this.emit('cleanup', requestId);

    const error = new JSONRPCErrorClass(JSONRPCErrorBuilder.create(
      JSONRPCErrorCode.RESPONSE_TRACKING_ERROR,
      reason ?? `Request ${requestId} was cancelled`
    ));
    pending.reject(error);

    return true;
  }

  /**
   * Cancel all pending requests
   */
  cancelAllRequests(reason?: string): number {
    const count = this.pendingRequests.size;
    
    for (const [requestId, pending] of this.pendingRequests) {
      const error = new JSONRPCErrorClass(JSONRPCErrorBuilder.create(
        JSONRPCErrorCode.RESPONSE_TRACKING_ERROR,
        reason ?? 'All pending requests were cancelled'
      ));
      pending.reject(error);
      this.emit('cleanup', requestId);
    }
    
    this.pendingRequests.clear();
    return count;
  }

  /**
   * Get number of pending requests
   */
  getPendingCount(): number {
    return this.pendingRequests.size;
  }

  /**
   * Get list of pending request IDs
   */
  getPendingRequestIds(): string[] {
    return Array.from(this.pendingRequests.keys());
  }

  /**
   * Check if a request is being tracked
   */
  isTracking(requestId: string): boolean {
    return this.pendingRequests.has(requestId);
  }

  /**
   * Get statistics about pending requests
   */
  getStatistics(): {
    pendingCount: number;
    averageAge: number;
    oldestRequest?: { id: string; age: number } | undefined;
    newestRequest?: { id: string; age: number } | undefined;
  } {
    const now = Date.now();
    const requests = Array.from(this.pendingRequests.entries());
    
    if (requests.length === 0) {
      return { pendingCount: 0, averageAge: 0 };
    }

    const ages = requests.map(([id, pending]) => ({
      id,
      age: (now - pending.timestamp) / 1000 // Convert to seconds
    }));

    const totalAge = ages.reduce((sum, cmd) => sum + cmd.age, 0);
    const averageAge = totalAge / ages.length;

    const sortedByAge = ages.sort((a, b) => b.age - a.age);
    const oldestRequest = sortedByAge[0];
    const newestRequest = sortedByAge[sortedByAge.length - 1];

    return {
      pendingCount: requests.length,
      averageAge,
      oldestRequest,
      newestRequest
    };
  }

  /**
   * Track request with error callback support (matches Swift error-handled registration)
   */
  trackRequestWithErrorHandling(
    requestId: string,
    resolve: (response: JanusResponse) => void,
    reject: (error: Error) => void,
    onError: (error: Error) => void,
    timeout: number = this.config.defaultTimeout
  ): void {
    // Check limits
    if (this.pendingRequests.size >= this.config.maxPendingRequests) {
      onError(new JSONRPCErrorClass(JSONRPCErrorBuilder.create(
        JSONRPCErrorCode.RESOURCE_LIMIT_EXCEEDED,
        `Too many pending requests: Maximum ${this.config.maxPendingRequests} requests allowed`
      )));
      return;
    }

    // Check for duplicate tracking
    if (this.pendingRequests.has(requestId)) {
      onError(new JSONRPCErrorClass(JSONRPCErrorBuilder.create(
        JSONRPCErrorCode.INVALID_REQUEST,
        `Request already being tracked: Request ${requestId} is already awaiting response`
      )));
      return;
    }

    // If no errors, proceed with normal tracking
    this.trackRequest(requestId, resolve, reject, timeout);
  }

  /**
   * Register bilateral timeout for request/response pairs (matches Go/Swift implementation)
   */
  trackBilateralTimeout(
    baseRequestId: string,
    requestResolve: (response: JanusResponse) => void,
    requestReject: (error: Error) => void,
    responseResolve: (response: JanusResponse) => void,
    responseReject: (error: Error) => void,
    requestTimeout: number = this.config.defaultTimeout,
    responseTimeout: number = this.config.defaultTimeout
  ): void {
    const requestId = `${baseRequestId}-request`;
    const responseId = `${baseRequestId}-response`;

    // Track request timeout
    this.trackRequest(requestId, requestResolve, requestReject, requestTimeout);
    
    // Track response timeout
    this.trackRequest(responseId, responseResolve, responseReject, responseTimeout);
  }

  /**
   * Cancel bilateral timeout (matches Swift implementation)
   */
  cancelBilateralTimeout(baseRequestId: string): number {
    const requestId = `${baseRequestId}-request`;
    const responseId = `${baseRequestId}-response`;
    
    let cancelledCount = 0;
    
    if (this.cancelRequest(requestId)) {
      cancelledCount++;
    }
    
    if (this.cancelRequest(responseId)) {
      cancelledCount++;
    }
    
    return cancelledCount;
  }

  /**
   * Extend timeout for existing request (matches Swift extendTimeout implementation)
   */
  extendTimeout(requestId: string, additionalTime: number): boolean {
    const pending = this.pendingRequests.get(requestId);
    
    if (!pending) {
      return false;
    }

    // Update the timeout value and reset the timer
    pending.timeout += additionalTime;
    
    // We need to restart the timeout with the additional time
    // Create a new timeout that will trigger after the additional time
    setTimeout(() => {
      this.handleTimeout(requestId);
    }, additionalTime * 1000);
    
    return true;
  }

  /**
   * Cleanup expired requests
   */
  cleanup(): number {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [requestId, pending] of this.pendingRequests) {
      const age = (now - pending.timestamp) / 1000; // Convert to seconds
      
      if (age >= pending.timeout) {
        this.handleTimeout(requestId);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  /**
   * Shutdown the tracker and cleanup resources
   */
  shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    this.cancelAllRequests('Tracker shutdown');
  }

  /**
   * Handle request timeout
   */
  private handleTimeout(requestId: string): void {
    const pending = this.pendingRequests.get(requestId);
    
    if (!pending) {
      return; // Already handled
    }

    this.pendingRequests.delete(requestId);
    this.emit('timeout', requestId);
    this.emit('cleanup', requestId);

    const error = new JSONRPCErrorClass(JSONRPCErrorBuilder.create(
      JSONRPCErrorCode.HANDLER_TIMEOUT,
      `Request ${requestId} timed out after ${pending.timeout} seconds`
    ));
    pending.reject(error);
  }

  /**
   * Start the cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      const cleaned = this.cleanup();
      if (cleaned > 0) {
        // Could emit cleanup stats event here
      }
    }, this.config.cleanupInterval);

    // Don't keep the process alive just for cleanup
    this.cleanupTimer.unref();
  }

  // Event emitter type safety
  override on<K extends keyof ResponseTrackerEvents>(
    event: K,
    listener: ResponseTrackerEvents[K]
  ): this {
    return super.on(event, listener);
  }

  override emit<K extends keyof ResponseTrackerEvents>(
    event: K,
    ...args: Parameters<ResponseTrackerEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}