import { Router, Request, Response } from 'express';
import fs from 'fs';
import type { AppSettings } from '@shared/types';
import { getSettingsPath, log } from '../platform';

const router = Router();

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  accentColor: 'indigo',
  sidebarCollapsed: false,
  sidebarWidth: 260,
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
  res.json(merged);
});

export default router;
