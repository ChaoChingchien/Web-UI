// Mock Electron app module for testing
import { vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/web-ai-test',
  },
}));

vi.mock('electron-log', () => ({
  default: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
}));

// Reset DatabaseManager singleton between tests
import { DatabaseManager } from '../src/main/database/DatabaseManager';

beforeEach(() => {
  // @ts-ignore - reset singleton for clean test state
  DatabaseManager.instance = null;
});
