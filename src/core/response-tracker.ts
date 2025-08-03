/**
 * Response Tracker for Janus Protocol
 * Manages async response correlation and timeout handling
 */

import { EventEmitter } from 'events';
import { JanusResponse, PendingCommand } from '../types/protocol';
import { JSONRPCErrorBuilder, JSONRPCErrorCode, JSONRPCErrorClass } from '../types/jsonrpc-error';

export interface ResponseTrackerEvents {
  'timeout': (commandId: string) => void;
  'response': (commandId: string, response: JanusResponse) => void;
  'cleanup': (commandId: string) => void;
}

export interface TrackerConfig {
  /** Maximum number of pending commands */
  maxPendingCommands?: number;
  
  /** Cleanup interval in milliseconds */
  cleanupInterval?: number;
  
  /** Default timeout in seconds */
  defaultTimeout?: number;
}

export class ResponseTracker extends EventEmitter {
  private pendingCommands = new Map<string, PendingCommand>();
  private cleanupTimer: NodeJS.Timeout | null = null;
  private config: Required<TrackerConfig>;

  constructor(config: TrackerConfig = {}) {
    super();
    
    this.config = {
      maxPendingCommands: config.maxPendingCommands ?? 1000,
      cleanupInterval: config.cleanupInterval ?? 30000, // 30 seconds
      defaultTimeout: config.defaultTimeout ?? 30.0
    };
    
    this.startCleanupTimer();
  }

  /**
   * Track a command awaiting response
   */
  trackCommand(
    commandId: string,
    resolve: (response: JanusResponse) => void,
    reject: (error: Error) => void,
    timeout: number = this.config.defaultTimeout
  ): void {
    // Check limits
    if (this.pendingCommands.size >= this.config.maxPendingCommands) {
      reject(new JSONRPCErrorClass(JSONRPCErrorBuilder.create(
        JSONRPCErrorCode.RESOURCE_LIMIT_EXCEEDED,
        `Too many pending commands: Maximum ${this.config.maxPendingCommands} commands allowed`
      )));
      return;
    }

    // Check for duplicate tracking
    if (this.pendingCommands.has(commandId)) {
      reject(new JSONRPCErrorClass(JSONRPCErrorBuilder.create(
        JSONRPCErrorCode.INVALID_REQUEST,
        `Command already being tracked: Command ${commandId} is already awaiting response`
      )));
      return;
    }

    // Create pending command entry
    const pending: PendingCommand = {
      resolve,
      reject,
      timestamp: Date.now(),
      timeout
    };

    this.pendingCommands.set(commandId, pending);

    // Set individual timeout
    setTimeout(() => {
      this.handleTimeout(commandId);
    }, timeout * 1000);
  }

  /**
   * Handle an incoming response
   */
  handleResponse(response: JanusResponse): boolean {
    const pending = this.pendingCommands.get(response.commandId);
    
    if (!pending) {
      // Response for unknown command (possibly timed out)
      return false;
    }

    // Remove from tracking
    this.pendingCommands.delete(response.commandId);
    this.emit('cleanup', response.commandId);

    // Emit response event
    this.emit('response', response.commandId, response);

    // Resolve or reject based on response
    if (response.success) {
      pending.resolve(response);
    } else {
      const error = new JSONRPCErrorClass(JSONRPCErrorBuilder.create(
        JSONRPCErrorCode.RESPONSE_TRACKING_ERROR,
        response.error?.message ?? 'Command failed'
      ));
      pending.reject(error);
    }

    return true;
  }

  /**
   * Cancel tracking for a command
   */
  cancelCommand(commandId: string, reason?: string): boolean {
    const pending = this.pendingCommands.get(commandId);
    
    if (!pending) {
      return false;
    }

    this.pendingCommands.delete(commandId);
    this.emit('cleanup', commandId);

    const error = new JSONRPCErrorClass(JSONRPCErrorBuilder.create(
      JSONRPCErrorCode.RESPONSE_TRACKING_ERROR,
      reason ?? `Command ${commandId} was cancelled`
    ));
    pending.reject(error);

    return true;
  }

  /**
   * Cancel all pending commands
   */
  cancelAllCommands(reason?: string): number {
    const count = this.pendingCommands.size;
    
    for (const [commandId, pending] of this.pendingCommands) {
      const error = new JSONRPCErrorClass(JSONRPCErrorBuilder.create(
        JSONRPCErrorCode.RESPONSE_TRACKING_ERROR,
        reason ?? 'All pending commands were cancelled'
      ));
      pending.reject(error);
      this.emit('cleanup', commandId);
    }
    
    this.pendingCommands.clear();
    return count;
  }

  /**
   * Get number of pending commands
   */
  getPendingCount(): number {
    return this.pendingCommands.size;
  }

  /**
   * Get list of pending command IDs
   */
  getPendingCommandIds(): string[] {
    return Array.from(this.pendingCommands.keys());
  }

  /**
   * Check if a command is being tracked
   */
  isTracking(commandId: string): boolean {
    return this.pendingCommands.has(commandId);
  }

  /**
   * Get statistics about pending commands
   */
  getStatistics(): {
    pendingCount: number;
    averageAge: number;
    oldestCommand?: { id: string; age: number } | undefined;
    newestCommand?: { id: string; age: number } | undefined;
  } {
    const now = Date.now();
    const commands = Array.from(this.pendingCommands.entries());
    
    if (commands.length === 0) {
      return { pendingCount: 0, averageAge: 0 };
    }

    const ages = commands.map(([id, pending]) => ({
      id,
      age: (now - pending.timestamp) / 1000 // Convert to seconds
    }));

    const totalAge = ages.reduce((sum, cmd) => sum + cmd.age, 0);
    const averageAge = totalAge / ages.length;

    const sortedByAge = ages.sort((a, b) => b.age - a.age);
    const oldestCommand = sortedByAge[0];
    const newestCommand = sortedByAge[sortedByAge.length - 1];

    return {
      pendingCount: commands.length,
      averageAge,
      oldestCommand,
      newestCommand
    };
  }

  /**
   * Track command with error callback support (matches Swift error-handled registration)
   */
  trackCommandWithErrorHandling(
    commandId: string,
    resolve: (response: JanusResponse) => void,
    reject: (error: Error) => void,
    onError: (error: Error) => void,
    timeout: number = this.config.defaultTimeout
  ): void {
    // Check limits
    if (this.pendingCommands.size >= this.config.maxPendingCommands) {
      onError(new JSONRPCErrorClass(JSONRPCErrorBuilder.create(
        JSONRPCErrorCode.RESOURCE_LIMIT_EXCEEDED,
        `Too many pending commands: Maximum ${this.config.maxPendingCommands} commands allowed`
      )));
      return;
    }

    // Check for duplicate tracking
    if (this.pendingCommands.has(commandId)) {
      onError(new JSONRPCErrorClass(JSONRPCErrorBuilder.create(
        JSONRPCErrorCode.INVALID_REQUEST,
        `Command already being tracked: Command ${commandId} is already awaiting response`
      )));
      return;
    }

    // If no errors, proceed with normal tracking
    this.trackCommand(commandId, resolve, reject, timeout);
  }

  /**
   * Register bilateral timeout for request/response pairs (matches Go/Swift implementation)
   */
  trackBilateralTimeout(
    baseCommandId: string,
    requestResolve: (response: JanusResponse) => void,
    requestReject: (error: Error) => void,
    responseResolve: (response: JanusResponse) => void,
    responseReject: (error: Error) => void,
    requestTimeout: number = this.config.defaultTimeout,
    responseTimeout: number = this.config.defaultTimeout
  ): void {
    const requestId = `${baseCommandId}-request`;
    const responseId = `${baseCommandId}-response`;

    // Track request timeout
    this.trackCommand(requestId, requestResolve, requestReject, requestTimeout);
    
    // Track response timeout
    this.trackCommand(responseId, responseResolve, responseReject, responseTimeout);
  }

  /**
   * Cancel bilateral timeout (matches Swift implementation)
   */
  cancelBilateralTimeout(baseCommandId: string): number {
    const requestId = `${baseCommandId}-request`;
    const responseId = `${baseCommandId}-response`;
    
    let cancelledCount = 0;
    
    if (this.cancelCommand(requestId)) {
      cancelledCount++;
    }
    
    if (this.cancelCommand(responseId)) {
      cancelledCount++;
    }
    
    return cancelledCount;
  }

  /**
   * Extend timeout for existing command (matches Swift extendTimeout implementation)
   */
  extendTimeout(commandId: string, additionalTime: number): boolean {
    const pending = this.pendingCommands.get(commandId);
    
    if (!pending) {
      return false;
    }

    // Update the timeout value and reset the timer
    pending.timeout += additionalTime;
    
    // We need to restart the timeout with the additional time
    // Create a new timeout that will trigger after the additional time
    setTimeout(() => {
      this.handleTimeout(commandId);
    }, additionalTime * 1000);
    
    return true;
  }

  /**
   * Cleanup expired commands
   */
  cleanup(): number {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [commandId, pending] of this.pendingCommands) {
      const age = (now - pending.timestamp) / 1000; // Convert to seconds
      
      if (age >= pending.timeout) {
        this.handleTimeout(commandId);
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

    this.cancelAllCommands('Tracker shutdown');
  }

  /**
   * Handle command timeout
   */
  private handleTimeout(commandId: string): void {
    const pending = this.pendingCommands.get(commandId);
    
    if (!pending) {
      return; // Already handled
    }

    this.pendingCommands.delete(commandId);
    this.emit('timeout', commandId);
    this.emit('cleanup', commandId);

    const error = new JSONRPCErrorClass(JSONRPCErrorBuilder.create(
      JSONRPCErrorCode.HANDLER_TIMEOUT,
      `Command ${commandId} timed out after ${pending.timeout} seconds`
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