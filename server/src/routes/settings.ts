import { Router, Request, Response } from 'express';
import fs from 'fs';
import type { AppSettings } from '@shared/types';
import { getSettingsPath, log } from '../platform';
import { EmbeddingService } from '../services/EmbeddingService';

const router = Router();

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  accentColor: 'indigo',
  sidebarCollapsed: false,
  sidebarWidth: 260,
  headless: false,
  embedding: {
    enabled: false,
    provider: 'local',
    apiUrl: 'http://localhost:11434/api',
    apiModel: 'nomic-embed-text',
  },
};

function readSettings(): AppSettings {
  try {
    const settingsPath = getSettingsPath();
    if (fs.existsSync(settingsPath)) {
      const raw = fs.readFileSync(settingsPath, 'utf-8');
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch (err) {
    log.error('读取设置失败:', err);
  }
  return { ...DEFAULT_SETTINGS };
}

function writeSettings(settings: AppSettings): void {
  try {
    const settingsPath = getSettingsPath();
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (err) {
    log.error('写入设置失败:', err);
    throw err;
  }
}

// GET /api/settings — 读取设置
router.get('/api/settings', (_req: Request, res: Response) => {
  const settings = readSettings();
  res.json(settings);
});

// PUT /api/settings — 更新设置
router.put('/api/settings', (req: Request, res: Response) => {
  const current = readSettings();
  const merged: AppSettings = { ...current, ...req.body };
  writeSettings(merged);
  // 同步 embedding 配置到服务
  if (merged.embedding) {
    try {
      EmbeddingService.getInstance().configure(merged.embedding);
    } catch { /* non-critical */ }
  }
  res.json(merged);
});

// GET /api/embedding/status — 嵌入服务状态
router.get('/api/embedding/status', (_req: Request, res: Response) => {
  res.json({
    available: EmbeddingService.getInstance().isAvailable(),
    configured: readSettings().embedding,
    embeddedCount: 0, // 前端调用时可通过 DB 查询填充
  });
});

export default router;
