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
 *  ============================================ */

/** 查找本机已安装的 Chrome/Edge 可执行文件路径 */
function findChromeExecutable(): string | null {
  const candidates: { path: string; name: string }[] = [
    { path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', name: 'Chrome' },
    { path: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', name: 'Chrome' },
    { path: path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'), name: 'Chrome' },
    { path: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', name: 'Edge' },
    { path: path.join(process.env.LOCALAPPDATA || '', 'Microsoft\\Edge\\Application\\msedge.exe'), name: 'Edge' },
  ];

  for (const c of candidates) {
    if (fs.existsSync(c.path)) {
      log.info(`检测到本机 ${c.name}: ${c.path}`);
      return c.path;
    }
  }

  try {
    const { execSync } = require('child_process');
    const result = execSync(
      'reg query "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe" /ve 2>nul',
      { encoding: 'utf8', timeout: 3000 }
    );
    const match = result.match(/:\s+(.+chrome\.exe)/i);
    if (match && fs.existsSync(match[1].trim())) {
      log.info(`检测到 Chrome (注册表): ${match[1].trim()}`);
      return match[1].trim();
    }
  } catch { /* ignore */ }

  log.warn('未找到本机 Chrome/Edge');
  return null;
}

/** 检查 CDP 端口是否可连接 */
function checkCdpPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/json/version`, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const info = JSON.parse(data);
          resolve(!!info.Browser);
        } catch { resolve(false); }
      });
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => { req.destroy(); resolve(false); });
  });
}

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private pages: Map<string, { page: Page; url: string }> = new Map();
  private profilePath: string;
  private connectedToExisting = false;  // 是否连接到已有 Chrome
  private static instance: BrowserManager | null = null;

  private constructor() {
    this.profilePath = path.join(getBrowserDataPath(), 'chrome-profile');
    if (!fs.existsSync(this.profilePath)) {
      fs.mkdirSync(this.profilePath, { recursive: true });
    }
  }

  static getInstance(): BrowserManager {
    if (!BrowserManager.instance) {
      BrowserManager.instance = new BrowserManager();
    }
    return BrowserManager.instance;
  }

  /** 读取用户设置中是否启用 headless 模式（后台运行，不弹 GUI 窗口） */
  private isHeadless(): boolean {
    try {
      const settingsPath = getSettingsPath();
      if (fs.existsSync(settingsPath)) {
        const raw = fs.readFileSync(settingsPath, 'utf-8');
        const settings = JSON.parse(raw);
        return settings.headless === true;
      }
    } catch { /* 读取失败则不启用 headless */ }
    return false;
  }

  /** 启动浏览器 */
  async launch(): Promise<void> {
    if (this.browser && this.browser.isConnected()) return;

    // 关闭旧实例
    if (this.browser) {
      try { await this.browser.close(); } catch { /* ignore */ }
      this.browser = null;
      this.context = null;
      this.pages.clear();
    }

    // 策略 1: 尝试连接到已运行的 Chrome (CDP)
    if (await checkCdpPort(9222)) {
      try {
        this.browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
        // CDP 模式下使用默认上下文（包含所有 cookie/登录态）
        const contexts = this.browser.contexts();
        this.context = contexts[0] || await this.browser.newContext();
        this.connectedToExisting = true;
        log.info('已连接到正在运行的 Chrome 浏览器 — 使用您的现有登录状态');
        this.setupDisconnectHandler();
        return;
      } catch (err) {
        log.warn('CDP 连接失败，尝试启动新实例:', (err as Error)?.message?.substring(0, 100));
      }
    }

    // 策略 2: 启动本机 Chrome（持久化用户数据）
    // 使用 launchPersistentContext 替代 launch，避免 --user-data-dir 参数冲突
    const chromePath = findChromeExecutable();
    const isHeadless = this.isHeadless();
    const launchOpts: Parameters<typeof chromium.launchPersistentContext>[1] = {
      headless: isHeadless,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--no-first-run',
        '--disable-default-apps',
        ...(isHeadless ? [
          '--window-size=1920,1080',
        ] : []),
      ],
      // Headless 时伪装真实浏览器环境
      ...(isHeadless ? {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
      } : {}),
    };

    if (chromePath) {
      launchOpts.executablePath = chromePath;
      log.info(`使用本机 Chrome 启动，用户数据目录: ${this.profilePath}`);
    } else {
      log.info(`使用内置 Chromium 启动，用户数据目录: ${this.profilePath}`);
    }

    try {
      this.context = await chromium.launchPersistentContext(this.profilePath, launchOpts);
      this.browser = this.context.browser();
      if (!this.browser) throw new Error('browser() returned null');
    } catch (err) {
      if (chromePath) {
        log.warn(`使用本机 Chrome 启动失败，回退到内置 Chromium`);
        delete launchOpts.executablePath;
        this.context = await chromium.launchPersistentContext(this.profilePath, launchOpts);
        this.browser = this.context.browser();
        if (!this.browser) throw new Error('browser() returned null');
      } else {
        throw err;
      }
    }

    this.connectedToExisting = false;
    log.info('浏览器已启动（持久化模式 — 登录状态可保存）');

    // 尝试从 Chrome 默认配置中导入现有 Cookie（避免重新登录）
    this.importCookiesAsync();

    this.setupDisconnectHandler();
  }

  /** 获取提供商页面 */
  async getPage(provider: AIProvider): Promise<Page> {
    await this.launch();

    if (!this.context) {
      throw new Error('浏览器上下文不可用');
    }

    // 检查缓存页面是否可用
    const cached = this.pages.get(provider.id);
    if (cached && !cached.page.isClosed()) {
      try {
        const currentUrl = cached.page.url();
        if (provider.url && currentUrl && !currentUrl.startsWith('about:blank')) {
          log.info(`[${provider.name}] 使用已有页面`);
          return cached.page;
        }
      } catch { /* 页面可能出错 */ }

      try {
        await cached.page.goto(provider.url!, { waitUntil: 'load', timeout: 60000 });
        return cached.page;
      } catch (err) {
        log.warn(`[${provider.name}] 重新导航失败，继续使用当前页面:`, err);
        return cached.page;
      }
    }

    // 在持久化/CDP 上下文中创建新页面
    const page = await this.context.newPage();
    page.setDefaultTimeout(60000);

    // Headless 反检测：覆盖 navigator.webdriver
    if (this.isHeadless()) {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        // @ts-ignore
        window.chrome = { runtime: {} };
      });
    }

    if (provider.url) {
      await this.navigateWithRetry(page, provider);
    }

    this.pages.set(provider.id, { page, url: provider.url || '' });
    log.info(`[${provider.name}] 页面已创建`);

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
        await page.goto(provider.url, { waitUntil: 'load', timeout: 60000 });
        log.info(`[${provider.name}] 导航成功: ${provider.url}`);
        return;
      } catch (err) {
        log.warn(`[${provider.name}] 导航尝试 ${i + 1}/${maxRetries}:`, (err as Error)?.message?.substring(0, 100));
        if (i < maxRetries - 1) {
          await page.waitForTimeout(2000 * (i + 1));
        }
      }
    }

    try {
      const currentUrl = page.url();
      if (currentUrl && !currentUrl.startsWith('about:blank')) {
        log.info(`[${provider.name}] 导航报错但页面已跳转到: ${currentUrl.substring(0, 60)}`);
        return;
      }
    } catch { /* page is closed */ }

    throw new Error(`[${provider.name}] 页面加载失败，已重试 ${maxRetries} 次`);
  }

  /** 关闭指定提供商的页面 */
  async closePage(providerId: string): Promise<void> {
    const cached = this.pages.get(providerId);
    if (cached) {
      try { await cached.page.close(); } catch { /* ignore */ }
      this.pages.delete(providerId);
    }
  }

  /** 关闭浏览器 */
  async close(): Promise<void> {
    this.pages.clear();
    this.context = null;

    if (this.browser) {
      // close() 对 CDP 连接只断开不杀进程，对自有实例则关闭浏览器
      try { await this.browser.close(); } catch { /* ignore */ }
      log.info(this.connectedToExisting ? '已断开与 Chrome 的连接（您的浏览器保持运行）' : '浏览器已关闭（用户数据已保存）');
      this.browser = null;
    }

    this.connectedToExisting = false;
  }

  private setupDisconnectHandler(): void {
    this.browser?.on('disconnected', () => {
      log.warn('浏览器连接断开 — 将尝试自动重连');
      // 不清空 pages 缓存：重连后可以恢复页面
      this.context = null;
      this.browser = null;
      // 异步自动重连
      setTimeout(() => {
        this.launch().catch((err) => log.warn('自动重连失败:', err));
      }, 2000);
    });
  }

  /** 异步导入 Chrome 默认用户目录中的 Cookie（非阻塞） */
  private async importCookiesAsync(): Promise<void> {
    if (!this.context || this.connectedToExisting) return;
    try {
      const { importChromeCookies } = await import('./cookieImporter');
      const result = await importChromeCookies(this.context);
      if (result.imported > 0) {
        log.info(`已从 Chrome 导入 ${result.imported} 个登录 Cookie`);
      }
    } catch (err) {
      log.debug('Cookie 导入失败（非致命）:', (err as Error)?.message);
    }
  }
}
