import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import path from 'path';
import { app } from 'electron';
import fs from 'fs';
import log from 'electron-log';
import type { AIProvider } from '@shared/types';

/** ============================================
 *  Playwright 浏览器管理器
 *  每个 AI 提供商 → 独立 BrowserContext
 *  ============================================ */

export class BrowserManager {
  private browser: Browser | null = null;
  private contexts: Map<string, { context: BrowserContext; url: string }> = new Map();
  private userDataPath: string;
  private static instance: BrowserManager | null = null;

  private constructor() {
    this.userDataPath = path.join(app.getPath('userData'), 'browser-data');
    if (!fs.existsSync(this.userDataPath)) {
      fs.mkdirSync(this.userDataPath, { recursive: true });
    }
  }

  static getInstance(): BrowserManager {
    if (!BrowserManager.instance) {
      BrowserManager.instance = new BrowserManager();
    }
    return BrowserManager.instance;
  }

  /** 启动浏览器 */
  async launch(): Promise<void> {
    if (this.browser && this.browser.isConnected()) return;

    // 关闭旧实例
    if (this.browser) {
      try { await this.browser.close(); } catch { /* ignore */ }
      this.browser = null;
      this.contexts.clear();
    }

    this.browser = await chromium.launch({
      headless: false,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
      ],
    });

    log.info('Playwright 浏览器已启动');

    // 监听浏览器断开连接，自动清理
    this.browser.on('disconnected', () => {
      log.warn('Playwright 浏览器连接断开，清理所有上下文');
      this.contexts.clear();
      this.browser = null;
    });
  }

  /** 确保获取一个有效的页面 */
  async ensurePage(provider: AIProvider): Promise<Page> {
    await this.launch();

    const existing = this.contexts.get(provider.id);

    // 如果有缓存的 context，检查是否还有有效页面
    if (existing) {
      const pages = existing.context.pages();
      const validPage = pages.find(p => !p.isClosed());
      if (validPage) {
        // 检查页面 URL 是否仍然在目标域
        try {
          const currentUrl = validPage.url();
          if (provider.url && currentUrl && !currentUrl.startsWith('about:blank')) {
            log.info(`[${provider.name}] 使用已有页面: ${currentUrl.substring(0, 60)}`);
            return validPage;
          }
        } catch { /* page might be in error state */ }
        // URL 不对，重新导航
        log.info(`[${provider.name}] 页面 URL 无效，重新导航`);
        try {
          await validPage.goto(provider.url!, { waitUntil: 'load', timeout: 60000 });
          return validPage;
        } catch (err) {
          log.warn(`[${provider.name}] 重新导航失败:`, err);
        }
      }
      // 页面无效，清除缓存
      log.info(`[${provider.name}] 缓存上下文无效，重新创建`);
      this.contexts.delete(provider.id);
    }

    // 创建新上下文
    const context = await this.browser!.newContext({
      storageState: this.loadStorageState(provider.id),
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
    });

    // 导航到提供商页面（带重试）
    const page = await context.newPage();
    await this.navigateWithRetry(page, provider);

    this.contexts.set(provider.id, { context, url: provider.url || '' });
    log.info(`[${provider.name}] 浏览器上下文已创建`);

    return page;
  }

  /** 带重试的页面导航 */
  private async navigateWithRetry(page: Page, provider: AIProvider, maxRetries = 3): Promise<void> {
    if (!provider.url) {
      log.warn(`[${provider.name}] 没有配置 URL`);
      return;
    }

    for (let i = 0; i < maxRetries; i++) {
      try {
        await page.goto(provider.url, {
          waitUntil: 'load',
          timeout: 60000,
        });
        log.info(`[${provider.name}] 导航成功: ${provider.url}`);
        return;
      } catch (err) {
        log.warn(`[${provider.name}] 导航尝试 ${i + 1}/${maxRetries} 失败:`, (err as Error)?.message?.substring(0, 100));
        if (i < maxRetries - 1) {
          // 等一会再重试
          await page.waitForTimeout(2000 * (i + 1));
        }
      }
    }

    // 所有重试都失败，查看页面当前状态
    try {
      const currentUrl = page.url();
      if (currentUrl && !currentUrl.startsWith('about:blank')) {
        log.info(`[${provider.name}] 虽然导航报错，但页面已跳转到: ${currentUrl.substring(0, 60)}`);
        return;
      }
    } catch { /* page is closed */ }

    throw new Error(`[${provider.name}] 页面加载失败，已重试 ${maxRetries} 次`);
  }

  /** 获取提供商页面（供 WebAutomation 使用） */
  async getPage(provider: AIProvider): Promise<Page> {
    return this.ensurePage(provider);
  }

  /** 保存登录态 */
  async saveStorageState(providerId: string): Promise<void> {
    const existing = this.contexts.get(providerId);
    if (!existing) return;

    try {
      const state = await existing.context.storageState();
      const statePath = path.join(this.userDataPath, providerId, 'storage-state.json');
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
      log.info(`已保存 ${providerId} 的登录态`);
    } catch (err) {
      log.warn(`保存 ${providerId} 登录态失败:`, err);
    }
  }

  /** 加载登录态 */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private loadStorageState(providerId: string): any {
    const statePath = path.join(this.userDataPath, providerId, 'storage-state.json');
    if (!fs.existsSync(statePath)) return undefined;

    try {
      const raw = fs.readFileSync(statePath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  }

  /** 关闭指定 Context */
  async closeContext(providerId: string): Promise<void> {
    const existing = this.contexts.get(providerId);
    if (existing) {
      await this.saveStorageState(providerId);
      try { await existing.context.close(); } catch { /* ignore */ }
      this.contexts.delete(providerId);
      log.info(`已关闭 ${providerId} 的 BrowserContext`);
    }
  }

  /** 关闭浏览器 */
  async close(): Promise<void> {
    for (const [id] of this.contexts) {
      await this.saveStorageState(id);
    }
    this.contexts.clear();

    if (this.browser) {
      try {
        await this.browser.close();
      } catch { /* ignore */ }
      this.browser = null;
    }

    log.info('Playwright 浏览器已关闭');
  }
}
