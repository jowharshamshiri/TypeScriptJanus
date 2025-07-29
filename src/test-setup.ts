/**
 * Jest test setup configuration
 */

// Increase test timeout for socket operations
jest.setTimeout(10000);

// Mock console.log in tests unless explicitly needed
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: console.warn,
  error: console.error,
};

// Cleanup function for test resources
afterEach(() => {
  // Clear all mocks
  jest.clearAllMocks();
});

// Global test teardown
afterAll(() => {
  // Any global cleanup
});