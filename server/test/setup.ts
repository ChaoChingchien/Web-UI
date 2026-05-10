// Mock platform for tests
import { vi } from 'vitest';

vi.mock('../src/platform', () => ({
  getDbPath: () => ':memory:',
  getDataPath: () => '/tmp/web-ai-test',
  SERVER_CONFIG: {
    port: 3001,
    corsOrigin: 'http://localhost:5199',
  },
  log: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
}));

// Reset DatabaseManager singleton between tests
import { DatabaseManager } from '../src/database/DatabaseManager';

beforeEach(() => {
  // @ts-ignore - reset singleton for clean test state
  DatabaseManager['instance'] = null;
});
