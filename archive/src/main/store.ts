import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import type { AppSettings } from '@shared/types';

/** ============================================
 *  简单的 JSON 文件设置存储
 *  (替代 electron-store，避免 ESM 兼容问题)
 *  ============================================ */

interface StoreData {
  settings: AppSettings;
  windowBounds: { x: number; y: number; width: number; height: number };
  isMaximized: boolean;
}

const defaultData: StoreData = {
  settings: {
    theme: 'system',
    sidebarCollapsed: false,
    sidebarWidth: 260,
  },
  windowBounds: { x: 100, y: 100, width: 1280, height: 800 },
  isMaximized: false,
};

class SimpleStore {
  private filePath: string;
  private data: StoreData;

  constructor() {
    const userDataPath = app.getPath('userData');
    this.filePath = path.join(userDataPath, 'settings.json');
    this.data = this.load();
  }

  private load(): StoreData {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        return { ...defaultData, ...JSON.parse(raw) };
      }
    } catch {
      // 忽略读取错误
    }
    return { ...defaultData };
  }

  private save(): void {
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }

  get<K extends keyof StoreData>(key: K): StoreData[K] {
    return this.data[key];
  }

  set<K extends keyof StoreData>(key: K, value: StoreData[K]): void {
    this.data[key] = value;
    this.save();
  }
}

// 延迟初始化（等 app.ready）
let storeInstance: SimpleStore | null = null;

export function getStore(): SimpleStore {
  if (!storeInstance) {
    storeInstance = new SimpleStore();
  }
  return storeInstance;
}
