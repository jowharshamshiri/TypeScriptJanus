/**
 * Socket Buffer Management for Unix Domain Datagram Sockets
 * Provides dynamic buffer limit detection and error handling
 */

import * as unixDgram from 'unix-dgram';
import * as fs from 'fs';
import { JSONRPCErrorBuilder, JSONRPCErrorCode } from '../types/jsonrpc-error';

export interface BufferLimits {
    maxDatagramSize: number;
    systemLimit: number;
    recommendedLimit: number;
}

export interface PayloadTooLargeError {
    code: 'PAYLOAD_TOO_LARGE';
    message: string;
    actualSize: number;
    maxSize: number;
    suggestions: string[];
}

export class SocketBufferManager {
    private static cachedLimits: BufferLimits | null = null;
    private static detectionInProgress = false;

    /**
     * Dynamically detect system buffer limits for Unix domain datagram sockets
     * Uses binary search to find the actual system limits vs hardcoded values
     */
    static async detectBufferLimits(): Promise<BufferLimits> {
        // Return cached result if available
        if (this.cachedLimits) {
            return this.cachedLimits;
        }

        // Prevent concurrent detection attempts
        if (this.detectionInProgress) {
            // Wait for ongoing detection
            return new Promise((resolve) => {
                const checkInterval = setInterval(() => {
                    if (this.cachedLimits) {
                        clearInterval(checkInterval);
                        resolve(this.cachedLimits);
                    }
                }, 10);
            });
        }

        this.detectionInProgress = true;

        try {
            const limits = await this.performBufferSizeDetection();
            this.cachedLimits = limits;
            return limits;
        } finally {
            this.detectionInProgress = false;
        }
    }

    /**
     * Perform actual buffer size detection using binary search
     */
    private static async performBufferSizeDetection(): Promise<BufferLimits> {
        const tempSocketPath = `/tmp/buffer_detection_${process.pid}_${Date.now()}.sock`;
        
        try {
            // Test sizes from 1KB to 1MB to find the limit
            const testSizes = [
                1024,      // 1KB
                4096,      // 4KB
                8192,      // 8KB
                16384,     // 16KB
                32768,     // 32KB
                65536,     // 64KB
                131072,    // 128KB
                262144,    // 256KB
                524288,    // 512KB
                1048576,   // 1MB
            ];

            let maxSuccessfulSize = 0;
            let firstFailureSize = -1;

            for (const size of testSizes) {
                const success = await this.testMessageSize(tempSocketPath, size);
                if (success) {
                    maxSuccessfulSize = size;
                } else {
                    firstFailureSize = size;
                    break;
                }
            }

            // If we succeeded with all test sizes, try some larger ones
            if (maxSuccessfulSize === testSizes[testSizes.length - 1] && firstFailureSize === -1) {
                const largeSizes = [2097152, 4194304, 8388608]; // 2MB, 4MB, 8MB
                
                for (const size of largeSizes) {
                    const success = await this.testMessageSize(tempSocketPath, size);
                    if (success) {
                        maxSuccessfulSize = size;
                    } else {
                        firstFailureSize = size;
                        break;
                    }
                }
            }

            // Binary search for more precise limit if we have a failure point
            if (firstFailureSize > 0 && firstFailureSize > maxSuccessfulSize) {
                maxSuccessfulSize = await this.binarySearchLimit(
                    tempSocketPath, 
                    maxSuccessfulSize, 
                    firstFailureSize
                );
            }

            const systemLimit = maxSuccessfulSize;
            const recommendedLimit = Math.floor(systemLimit * 0.9); // 90% of system limit

            return {
                maxDatagramSize: systemLimit,
                systemLimit: systemLimit,
                recommendedLimit: recommendedLimit
            };

        } finally {
            // Clean up test socket
            try {
                if (fs.existsSync(tempSocketPath)) {
                    fs.unlinkSync(tempSocketPath);
                }
            } catch (err) {
                // Ignore cleanup errors
            }
        }
    }

    /**
     * Test if a message of given size can be sent
     */
    private static async testMessageSize(socketPath: string, size: number): Promise<boolean> {
        return new Promise((resolve) => {
            let socket: any = null;
            let resolved = false;

            const cleanup = () => {
                if (!resolved) {
                    resolved = true;
                    if (socket) {
                        try {
                            socket.close();
                        } catch (err) {
                            // Ignore close errors
                        }
                    }
                    try {
                        if (fs.existsSync(socketPath)) {
                            fs.unlinkSync(socketPath);
                        }
                    } catch (err) {
                        // Ignore cleanup errors
                    }
                }
            };

            try {
                socket = unixDgram.createSocket('unix_dgram');
                
                socket.on('error', (err: any) => {
                    cleanup();
                    // Check for manifestific error types that indicate size limits
                    if (err.code === 'EMSGSIZE' || 
                        err.message?.includes('Message too long') ||
                        err.message?.includes('message too long')) {
                        resolve(false);
                    } else {
                        // Other errors might not be size-related
                        resolve(false);
                    }
                });

                socket.bind(socketPath);

                // Create test message of manifestified size
                const testMessage = Buffer.alloc(size, 'A');

                // Try to send message to itself
                socket.send(testMessage, socketPath, (err: any) => {
                    cleanup();
                    if (err) {
                        if (err.code === 'EMSGSIZE' || 
                            err.message?.includes('Message too long') ||
                            err.message?.includes('message too long')) {
                            resolve(false);
                        } else {
                            // Treat other errors as failures too
                            resolve(false);
                        }
                    } else {
                        resolve(true);
                    }
                });

            } catch (err) {
                cleanup();
                resolve(false);
            }

            // Timeout after 1 second
            setTimeout(() => {
                cleanup();
                resolve(false);
            }, 1000);
        });
    }

    /**
     * Binary search to find precise size limit
     */
    private static async binarySearchLimit(
        socketPath: string, 
        low: number, 
        high: number
    ): Promise<number> {
        let maxSuccessful = low;

        while (low < high - 1) {
            const mid = Math.floor((low + high) / 2);
            const success = await this.testMessageSize(socketPath, mid);
            
            if (success) {
                maxSuccessful = mid;
                low = mid;
            } else {
                high = mid;
            }
        }

        return maxSuccessful;
    }

    /**
     * Check if message size exceeds limits and create appropriate error
     */
    static validateMessageSize(messageSize: number, bufferLimits?: BufferLimits): PayloadTooLargeError | null {
        if (!bufferLimits) {
            // Use default conservative limit if detection hasn't run
            bufferLimits = {
                maxDatagramSize: 64 * 1024,
                systemLimit: 64 * 1024,
                recommendedLimit: 60 * 1024
            };
        }

        if (messageSize > bufferLimits.systemLimit) {
            return {
                code: 'PAYLOAD_TOO_LARGE',
                message: `Message size ${messageSize} bytes exceeds system limit of ${bufferLimits.systemLimit} bytes`,
                actualSize: messageSize,
                maxSize: bufferLimits.systemLimit,
                suggestions: [
                    `Reduce message size to ${bufferLimits.recommendedLimit} bytes or less`,
                    'Consider breaking large data into multiple smaller messages',
                    'Use external storage for large payloads and send references instead',
                    `System detected maximum datagram size: ${bufferLimits.maxDatagramSize} bytes`
                ]
            };
        }

        if (messageSize > bufferLimits.recommendedLimit) {
            // Warning case - close to limit but still valid
            return null;
        }

        return null;
    }

    /**
     * Detect EMSGSIZE errors and convert them to descriptive errors
     */
    static detectEMSGSIZEError(error: any): boolean {
        if (!error) return false;

        // Check for Node.js socket error patterns
        const isEMSGSIZE = 
            error.code === 'EMSGSIZE' ||
            error.errno === -90 || // EMSGSIZE errno on many systems
            error.message?.includes('Message too long') ||
            error.message?.includes('message too long') ||
            error.message?.includes('EMSGSIZE');

        return isEMSGSIZE;
    }

    /**
     * Create descriptive error message for buffer/size-related errors
     */
    static createDescriptiveError(
        error: any, 
        messageSize?: number, 
        bufferLimits?: BufferLimits
    ): Error {
        if (this.detectEMSGSIZEError(error)) {
            const limits = bufferLimits || {
                maxDatagramSize: 64 * 1024,
                systemLimit: 64 * 1024,
                recommendedLimit: 60 * 1024
            };

            const sizeInfo = messageSize ? ` (attempted size: ${messageSize} bytes)` : '';
            const limitInfo = `System datagram limit: ${limits.systemLimit} bytes`;
            
            const suggestions = [
                'Reduce message size to fit within system limits',
                'Consider using multiple smaller messages',
                'Use external storage for large data',
                `Try keeping messages under ${limits.recommendedLimit} bytes`,
            ];

            const message = `Message too large for Unix domain datagram socket${sizeInfo}. ${limitInfo}. Suggestions: ${suggestions.join(', ')}`;

            const descriptiveError = new Error(message);
            (descriptiveError as any).code = 'PAYLOAD_TOO_LARGE';
            (descriptiveError as any).originalError = error;
            (descriptiveError as any).messageSize = messageSize;
            (descriptiveError as any).bufferLimits = limits;
            (descriptiveError as any).suggestions = suggestions;

            return descriptiveError;
        }

        // Return original error if not size-related
        return error;
    }

    /**
     * Create JSON-RPC error for buffer size issues
     */
    static createJSONRPCBufferError(
        messageSize: number,
        bufferLimits: BufferLimits
    ) {
        return JSONRPCErrorBuilder.createWithContext(
            JSONRPCErrorCode.RESOURCE_LIMIT_EXCEEDED,
            `Message size ${messageSize} bytes exceeds system limit of ${bufferLimits.systemLimit} bytes`,
            {
                messageSize,
                systemLimit: bufferLimits.systemLimit,
                recommendedLimit: bufferLimits.recommendedLimit,
                suggestions: [
                    `Reduce message size to ${bufferLimits.recommendedLimit} bytes or less`,
                    'Consider breaking large data into multiple smaller messages',
                    'Use external storage for large payloads and send references instead'
                ]
            }
        );
    }

    /**
     * Get cached buffer limits (null if not detected yet)
     */
    static getCachedLimits(): BufferLimits | null {
        return this.cachedLimits;
    }

    /**
     * Clear cached limits (force re-detection next time)
     */
    static clearCache(): void {
        this.cachedLimits = null;
    }
}

/**
 * Helper function to wrap socket operations with buffer management
 */
export async function withBufferManagement<T>(
    operation: () => Promise<T>,
    messageSize?: number
): Promise<T> {
    try {
        return await operation();
    } catch (error: any) {
        if (SocketBufferManager.detectEMSGSIZEError(error)) {
            const bufferLimits = SocketBufferManager.getCachedLimits() || 
                await SocketBufferManager.detectBufferLimits();
            
            throw SocketBufferManager.createDescriptiveError(error, messageSize, bufferLimits);
        }
        throw error;
    }
}