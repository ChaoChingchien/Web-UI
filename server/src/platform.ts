import path from 'path';
import fs from 'fs';
import winston from 'winston';

/** ============================================
 *  平台抽象层
 *  替代 Electron 的 app.getPath()、electron-log 等
 *  ============================================ */

function getAppDataRoot(): string {
  if (process.env.WEB_AI_DATA_DIR) {
    return process.env.WEB_AI_DATA_DIR;
  }
  // Windows: %APPDATA%/web-ai
  if (process.env.APPDATA) {
    return path.join(process.env.APPDATA, 'web-ai');
  }
  // Unix: ~/.local/share/web-ai
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return path.join(home, '.local', 'share', 'web-ai');
}

const dataDir = getAppDataRoot();

/** 确保 data 目录存在 */
function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// 创建子目录
const subDirs = ['', 'browser-data', 'logs', 'claude-sessions'];
for (const sub of subDirs) {
  ensureDir(path.join(dataDir, sub));
}

/** 获取数据根目录 */
export function getDataPath(): string {
  return dataDir;
}

/** 获取数据库文件路径 */
export function getDbPath(): string {
  return path.join(dataDir, 'web-ai.db');
}

/** 获取设置文件路径 */
export function getSettingsPath(): string {
  return path.join(dataDir, 'settings.json');
}

/** 获取浏览器数据路径 */
export function getBrowserDataPath(): string {
  return path.join(dataDir, 'browser-data');
}

/** 获取 Claude 会话路径 */
export function getClaudeSessionsPath(): string {
  return path.join(dataDir, 'claude-sessions');
}

/** 日志记录器 */
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message }) => {
          return `[${timestamp}] ${level}: ${message}`;
        })
      ),
    }),
    new winston.transports.File({
      filename: path.join(dataDir, 'logs', 'combined.log'),
      maxsize: 5 * 1024 * 1024,
      maxFiles: 3,
    }),
  ],
});

/** 服务器配置 */
export const SERVER_CONFIG = {
  port: parseInt(process.env.WEB_AI_PORT || '3001', 10),
  corsOrigin: process.env.WEB_AI_CORS || 'http://localhost:5199',
};

/** 兼容 electron-log 的接口 */
export const log = {
  info: (...args: unknown[]) => logger.info(args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')),
  warn: (...args: unknown[]) => logger.warn(args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')),
  error: (...args: unknown[]) => logger.error(args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')),
  debug: (...args: unknown[]) => logger.debug(args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')),
};
