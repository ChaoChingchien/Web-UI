import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { log, getBrowserDataPath, getSettingsPath } from '../platform';
import type { AIProvider } from '@shared/types';

/** ============================================
 *  Playwright 浏览器管理器
 *
 *  连接策略（按优先级）：
 *    1. 连接到已运行的 Chrome (CDP) — 使用现有登录态
 *    2. 启动本机 Chrome — 持久化用户数据目录
 *    3. 回退到内置 Chromium
 *
 *  Headless 策略：
 *    默认按设置使用 headless
 *    检测到登录页 → 自动切换到 GUI 模式
 *    登录完成后可手动切回 headless
 *  ============================================ */

function findChromeExecutable(): string | null {
  const candidates: { path: string; name: string }[] = [
    { path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', name: 'Chrome' },
    { path: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', name: 'Chrome' },
    { path: path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'), name: 'Chrome' },
    { path: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', name: 'Edge' },
    { path: path.join(process.env.LOCALAPPDATA || '', 'Microsoft\\Edge\\Application\\msedge.exe'), name: 'Edge' },
  ];
  for (const c of candidates) {
    if (fs.existsSync(c.path)) { log.info(`检测到本机 ${c.name}: ${c.path}`); return c.path; }
  }
  try {
    const { execSync } = require('child_process');
    const result = execSync(
      'reg query "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe" /ve 2>nul',
      { encoding: 'utf8', timeout: 3000 }
    );
    const match = result.match(/:\s+(.+chrome\.exe)/i);
    if (match && fs.existsSync(match[1].trim())) { log.info(`检测到 Chrome (注册表): ${match[1].trim()}`); return match[1].trim(); }
  } catch { /* ignore */ }
  log.warn('未找到本机 Chrome/Edge');
  return null;
}

function checkCdpPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/json/version`, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => { try { resolve(!!JSON.parse(data).Browser); } catch { resolve(false); } });
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => { req.destroy(); resolve(false); });
  });
}

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  /** providerId → conversationId → page 映射（支持并行对话） */
  private pagePool: Map<string, Map<string, { page: Page; url: string }>> = new Map();
  private profilePath: string;
  private connectedToExisting = false;
  /** 运行时强制 GUI 模式（登录场景自动切换） */
  private forceGUI = false;
  private static instance: BrowserManager | null = null;

  private constructor() {
    this.profilePath = path.join(getBrowserDataPath(), 'chrome-profile');
    if (!fs.existsSync(this.profilePath)) fs.mkdirSync(this.profilePath, { recursive: true });
  }

  static getInstance(): BrowserManager {
    if (!BrowserManager.instance) BrowserManager.instance = new BrowserManager();
    return BrowserManager.instance;
  }

  private isHeadless(): boolean {
    try {
      const settingsPath = getSettingsPath();
      if (fs.existsSync(settingsPath)) {
        const raw = fs.readFileSync(settingsPath, 'utf-8');
        return JSON.parse(raw).headless === true;
      }
    } catch { /* ignore */ }
    return false;
  }

  private isEffectivelyHeadless(): boolean {
    return !this.forceGUI && this.isHeadless();
  }

  /** 公开：当前是否是无头模式 */
  isHeadlessNow(): boolean { return this.isEffectivelyHeadless(); }

  /** 切换为 GUI 模式（登录场景），返回之前的状态 */
  async switchToGUI(): Promise<{ wasHeadless: boolean }> {
    const wasHeadless = this.isEffectivelyHeadless();
    if (!wasHeadless) return { wasHeadless: false }; // 已经是 GUI
    this.forceGUI = true;
    log.info('切换到 GUI 模式...');
    await this.restart(); // 重启浏览器以应用 GUI
    return { wasHeadless: true };
  }

  /** 切回之前的模式 */
  async switchBack(wasHeadless: boolean): Promise<void> {
    if (!wasHeadless) return;
    this.forceGUI = false;
    // 不重启 — 让用户继续用 GUI 窗口，下次 launch 时再切回
  }

  /** 重启浏览器（关闭 + 重新启动） */
  async restart(): Promise<void> {
    // 关闭所有页面但不关 context（保持 cookie）
    for (const [, providerPages] of this.pagePool) {
      for (const [, cached] of providerPages) {
        try { await cached.page.close(); } catch { /* ignore */ }
      }
    }
    this.pagePool.clear();

    if (this.browser) {
      try { await this.browser.close(); } catch { /* ignore */ }
      this.browser = null;
      this.context = null;
    }

    await this.launch();
  }

  /** 启动浏览器 */
  async launch(): Promise<void> {
    if (this.browser && this.browser.isConnected()) return;
    if (this.browser) {
      try { await this.browser.close(); } catch { /* ignore */ }
      this.browser = null;
      this.context = null;
      this.pagePool.clear();
    }

    // 策略 1: CDP
    if (await checkCdpPort(9222)) {
      try {
        this.browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
        const contexts = this.browser.contexts();
        this.context = contexts[0] || await this.browser.newContext();
        this.connectedToExisting = true;
        log.info('已连接到正在运行的 Chrome 浏览器');
        this.setupDisconnectHandler();
        return;
      } catch (err) {
        log.warn('CDP 连接失败，尝试启动新实例:', (err as Error)?.message?.substring(0, 100));
      }
    }

    // 策略 2: 启动本机 Chrome
    const chromePath = findChromeExecutable();
    const actualHeadless = this.isEffectivelyHeadless();
    const modeLabel = actualHeadless ? '无头' : 'GUI';
    log.info(`启动浏览器（${modeLabel}模式）`);

    const launchOpts: Parameters<typeof chromium.launchPersistentContext>[1] = {
      headless: actualHeadless,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
        '--no-first-run', '--disable-default-apps',
        ...(actualHeadless ? ['--window-size=1920,1080'] : []),
      ],
      ...(actualHeadless ? {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
      } : {}),
    };

    if (chromePath) {
      launchOpts.executablePath = chromePath;
      log.info(`使用本机 Chrome，数据目录: ${this.profilePath}`);
    } else {
      log.info(`使用内置 Chromium，数据目录: ${this.profilePath}`);
    }

    try {
      this.context = await chromium.launchPersistentContext(this.profilePath, launchOpts);
      this.browser = this.context.browser();
      if (!this.browser) throw new Error('browser() returned null');
    } catch (err) {
      if (chromePath) {
        log.warn('本机 Chrome 启动失败，回退到内置 Chromium');
        delete launchOpts.executablePath;
        this.context = await chromium.launchPersistentContext(this.profilePath, launchOpts);
        this.browser = this.context.browser();
        if (!this.browser) throw new Error('browser() returned null');
      } else { throw err; }
    }

    this.connectedToExisting = false;
    log.info('浏览器已启动');
    this.importCookiesAsync();
    this.setupDisconnectHandler();
  }

  /** 获取提供商页面 */
  async getPage(provider: AIProvider): Promise<Page> {
    await this.launch();
    if (!this.context) throw new Error('浏览器上下文不可用');

    const providerPages = this.pagePool.get(provider.id);
    const cached = providerPages?.get('__default__');
    if (cached && !cached.page.isClosed()) {
      try {
        const currentUrl = cached.page.url();
        if (provider.url && currentUrl && !currentUrl.startsWith('about:blank')) {
          return cached.page;
        }
      } catch { /* ignore */ }
      try {
        await cached.page.goto(provider.url!, { waitUntil: 'load', timeout: 60000 });
        return cached.page;
      } catch (err) {
        log.warn(`[${provider.name}] 重新导航失败:`, err);
        return cached.page;
      }
    }

    const page = await this.context.newPage();
    page.setDefaultTimeout(60000);

    if (this.isEffectivelyHeadless()) {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        // @ts-ignore
        window.chrome = { runtime: {} };
      });
    }

    if (provider.url) await this.navigateWithRetry(page, provider);
    if (!this.pagePool.has(provider.id)) this.pagePool.set(provider.id, new Map());
    this.pagePool.get(provider.id)!.set('__default__', { page, url: provider.url || '' });
    log.info(`[${provider.name}] 页面已创建`);
    return page;
  }

  /** 获取对话专用的浏览器页面（支持并行对话） */
  async getPageForConversation(provider: AIProvider, conversationId: string, webUrl?: string): Promise<Page> {
    await this.launch();
    if (!this.context) throw new Error('浏览器上下文不可用');

    if (!this.pagePool.has(provider.id)) this.pagePool.set(provider.id, new Map());
    const providerPages = this.pagePool.get(provider.id)!;
    const cached = providerPages.get(conversationId);

    if (cached && !cached.page.isClosed()) {
      try {
        if (webUrl && !BrowserManager.urlMatches(cached.page.url(), webUrl)) {
          await cached.page.goto(webUrl, { waitUntil: 'load', timeout: 60000 });
          await cached.page.waitForTimeout(2000);
        }
        return cached.page;
      } catch { /* ignore */ }
      try {
        const target = webUrl || cached.url || provider.url;
        if (target) { await cached.page.goto(target, { waitUntil: 'load', timeout: 60000 }); return cached.page; }
      } catch { /* ignore */ }
    }

    const page = await this.context.newPage();
    page.setDefaultTimeout(60000);

    if (this.isEffectivelyHeadless()) {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        // @ts-ignore
        window.chrome = { runtime: {} };
      });
    }

    const targetUrl = webUrl || provider.url;
    if (targetUrl) await this.navigateWithRetry(page, provider, 3, webUrl);

    providerPages.set(conversationId, { page, url: targetUrl || '' });
    log.info(`[${provider.name}] 对话页面 #${providerPages.size} (conv: ${conversationId.substring(0, 8)}...)`);
    return page;
  }

  private async navigateWithRetry(page: Page, provider: AIProvider, maxRetries = 3, specificUrl?: string): Promise<void> {
    const targetUrl = specificUrl || provider.url;
    if (!targetUrl) { log.warn(`[${provider.name}] 没有配置 URL`); return; }

    for (let i = 0; i < maxRetries; i++) {
      try {
        await page.goto(targetUrl, { waitUntil: 'load', timeout: 60000 });
        log.info(`[${provider.name}] 导航成功: ${targetUrl.substring(0, 80)}`);
        return;
      } catch (err) {
        log.warn(`[${provider.name}] 导航尝试 ${i + 1}/${maxRetries}`);
        if (i < maxRetries - 1) await page.waitForTimeout(2000 * (i + 1));
      }
    }
    try {
      const currentUrl = page.url();
      if (currentUrl && !currentUrl.startsWith('about:blank')) return;
    } catch { /* ignore */ }
    throw new Error(`[${provider.name}] 页面加载失败，已重试 ${maxRetries} 次`);
  }

  async closePage(providerId: string): Promise<void> {
    const providerPages = this.pagePool.get(providerId);
    if (providerPages) {
      for (const [, cached] of providerPages) { try { await cached.page.close(); } catch { /* ignore */ } }
      providerPages.clear();
    }
  }

  async closePageForConversation(providerId: string, conversationId: string): Promise<void> {
    const providerPages = this.pagePool.get(providerId);
    if (!providerPages) return;
    const cached = providerPages.get(conversationId);
    if (cached) {
      try { await cached.page.close(); } catch { /* ignore */ }
      providerPages.delete(conversationId);
    }
  }

  async close(): Promise<void> {
    for (const [, providerPages] of this.pagePool) {
      for (const [, cached] of providerPages) { try { await cached.page.close(); } catch { /* ignore */ } }
    }
    this.pagePool.clear();
    this.context = null;
    if (this.browser) {
      try { await this.browser.close(); } catch { /* ignore */ }
      log.info(this.connectedToExisting ? '已断开 Chrome 连接' : '浏览器已关闭');
      this.browser = null;
    }
    this.connectedToExisting = false;
  }

  private static urlMatches(a: string, b: string): boolean {
    if (!a || !b) return false;
    try {
      const ua = new URL(a), ub = new URL(b);
      return (ua.origin + ua.pathname).replace(/\/+$/, '') === (ub.origin + ub.pathname).replace(/\/+$/, '');
    } catch { return a === b; }
  }

  private setupDisconnectHandler(): void {
    this.browser?.on('disconnected', () => {
      log.warn('浏览器连接断开 — 将尝试自动重连');
      this.context = null;
      this.browser = null;
      setTimeout(() => { this.launch().catch((err) => log.warn('自动重连失败:', err)); }, 2000);
    });
  }

  private async importCookiesAsync(): Promise<void> {
    if (!this.context || this.connectedToExisting) return;
    try {
      const { importChromeCookies } = await import('./cookieImporter');
      const result = await importChromeCookies(this.context);
      if (result.imported > 0) log.info(`已从 Chrome 导入 ${result.imported} 个 Cookie`);
    } catch (err) { log.debug('Cookie 导入失败（非致命）'); }
  }
}