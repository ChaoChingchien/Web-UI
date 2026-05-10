import log from 'electron-log';
import type { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc-channels';

export interface LogEntry {
  id: number;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  source: string;
}

const MAX_LOGS = 500;
let logs: LogEntry[] = [];
let nextId = 1;
let mainWindow: BrowserWindow | null = null;

function formatArgs(args: unknown[]): string {
  return args.map((d) => {
    if (d instanceof Error) return d.stack || d.message;
    if (typeof d === 'object') return JSON.stringify(d, null, 2);
    return String(d);
  }).join(' ');
}

function pushLog(level: LogEntry['level'], args: unknown[]): void {
  const entry: LogEntry = {
    id: nextId++,
    timestamp: new Date().toISOString(),
    level,
    message: formatArgs(args),
    source: 'main',
  };

  logs.push(entry);
  if (logs.length > MAX_LOGS) logs = logs.slice(-MAX_LOGS);

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.LOG_NEW, entry);
  }
}

export function initLogCollector(window: BrowserWindow): void {
  mainWindow = window;

  // Wrap log methods to capture to memory
  const originalInfo = log.info.bind(log);
  const originalWarn = log.warn.bind(log);
  const originalError = log.error.bind(log);
  const originalDebug = log.debug.bind(log);

  log.info = (...args: unknown[]) => {
    pushLog('info', args);
    return originalInfo(...args);
  };
  log.warn = (...args: unknown[]) => {
    pushLog('warn', args);
    return originalWarn(...args);
  };
  log.error = (...args: unknown[]) => {
    pushLog('error', args);
    return originalError(...args);
  };
  log.debug = (...args: unknown[]) => {
    pushLog('debug', args);
    return originalDebug(...args);
  };
}

export function getLogs(): LogEntry[] {
  return [...logs];
}

export function clearLogs(): void {
  logs = [];
  nextId = 1;
}
