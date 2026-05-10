import type { Page } from 'playwright-core';
import type { AIProvider, WebAutomationConfig } from '@shared/types';
import log from 'electron-log';

/** ============================================
 *  自动化引擎
 *  填表、点击发送、等待回复、抓取内容
 *  ============================================ */

export class AutomationEngine {
  private page: Page;
  private provider: AIProvider;

  constructor(page: Page, provider: AIProvider) {
    this.page = page;
    this.provider = provider;
  }

  private get webConfig(): WebAutomationConfig {
    return (this.provider.web_config || {}) as WebAutomationConfig;
  }

  private get selectors() {
    return this.webConfig.selectors || { input: '', sendButton: '', responseContainer: '', responseText: '' };
  }

  private get waitOptions() {
    return this.webConfig.waitOptions || {
      pollingIntervalMs: 500,
      noNewTextTimeoutMs: 5000,
      fallbackTimeoutMs: 120000,
    };
  }

  private get waitStrategy(): 'stopButton' | 'noNewText' {
    return this.webConfig.waitStrategy || 'noNewText';
  }

  async execute(message: string): Promise<string> {
    log.info(`[${this.provider.name}] 开始自动化执行`);

    // 等待页面稳定
    await this.waitForPageReady();

    await this.fillInput(message);
    await this.clickSend();
    const response = await this.waitForResponse();

    log.info(`[${this.provider.name}] 完成，回复长度: ${response.length}`);
    return response;
  }

  /** 等待页面完全加载并稳定 */
  private async waitForPageReady(): Promise<void> {
    try {
      // 先等页面不处于加载状态
      await this.page.waitForLoadState('networkidle', { timeout: 30000 });
    } catch {
      log.warn(`[${this.provider.name}] networkidle 超时，继续执行`);
    }

    // 额外等待一下，让 SPA 完成渲染
    await this.page.waitForTimeout(2000);

    // 检查页面是否有明显错误
    const bodyText = await this.page.evaluate(() => document.body?.innerText?.substring(0, 200) || '').catch(() => '');
    if (bodyText.includes('404') || bodyText.includes('Not Found') || bodyText.includes('Access Denied')) {
      log.warn(`[${this.provider.name}] 页面可能异常: ${bodyText.substring(0, 100)}`);
    }
  }

  async fillInput(text: string): Promise<void> {
    const selector = await this.findWithFallback('input');
    if (!selector) throw new Error('未找到输入框，页面可能未正确加载');

    // 确保元素可见并可交互
    await this.page.waitForSelector(selector, { state: 'visible', timeout: 10000 }).catch(() => {});
    await this.page.click(selector, { clickCount: 3 });
    await this.page.fill(selector, text);
    log.info(`[${this.provider.name}] 已填入消息: ${text.substring(0, 30)}...`);
  }

  async clickSend(): Promise<void> {
    const selector = await this.findWithFallback('sendButton');
    if (!selector) throw new Error('未找到发送按钮');

    // 等待按钮可点击
    await this.page.waitForSelector(selector, { state: 'visible', timeout: 10000 }).catch(() => {});
    await this.page.click(selector);
    log.info(`[${this.provider.name}] 已点击发送`);
  }

  async waitForResponse(): Promise<string> {
    const strategy = this.waitStrategy;
    const opts = this.waitOptions;

    // 等待回复容器出现
    try {
      await this.page.waitForSelector(this.selectors.responseContainer, { timeout: 30000 });
    } catch {
      log.warn(`[${this.provider.name}] 回复容器未在 30s 内出现，尝试直接等待`);
    }

    if (strategy === 'stopButton' && this.selectors.stopButton) {
      return this.waitByStopButton(opts);
    }
    return this.waitByNoNewText(opts);
  }

  private async waitByStopButton(opts: WebAutomationConfig['waitOptions']): Promise<string> {
    const stopSel = this.selectors.stopButton!;
    const deadline = Date.now() + (opts?.fallbackTimeoutMs || 120000);

    try {
      await this.page.waitForSelector(stopSel, { timeout: 10000 });
    } catch { /* 可能回复很快 */ }

    while (Date.now() < deadline) {
      try {
        const stopBtn = await this.page.$(stopSel);
        if (!stopBtn) return this.scrapeLatestResponse();
      } catch { /* 页面可能还在更新 */ }
      await this.page.waitForTimeout(opts?.pollingIntervalMs || 500);
    }
    throw new Error('等待回复超时');
  }

  private async waitByNoNewText(opts: WebAutomationConfig['waitOptions']): Promise<string> {
    const containerSel = this.selectors.responseContainer;
    const textSel = this.selectors.responseText;
    const pollMs = opts?.pollingIntervalMs || 500;
    const stableMs = opts?.noNewTextTimeoutMs || 5000;
    const deadline = Date.now() + (opts?.fallbackTimeoutMs || 120000);

    let lastText = '';
    let lastChangeTime = Date.now();

    while (Date.now() < deadline) {
      try {
        const latest = this.page.locator(containerSel).last();
        const textLocator = textSel ? latest.locator(textSel).first() : latest;
        const currentText = (await textLocator.textContent()) || '';

        if (currentText !== lastText) {
          lastText = currentText;
          lastChangeTime = Date.now();
        }
        if (Date.now() - lastChangeTime >= stableMs && currentText.length > 0) {
          return currentText.trim();
        }
      } catch { /* 页面加载中 */ }
      await this.page.waitForTimeout(pollMs);
    }

    if (lastText.length > 0) {
      log.warn(`[${this.provider.name}] 等待超时，返回部分内容`);
      return lastText.trim();
    }
    throw new Error('等待回复超时');
  }

  private async scrapeLatestResponse(): Promise<string> {
    const containerSel = this.selectors.responseContainer;
    const textSel = this.selectors.responseText;
    try {
      const latest = this.page.locator(containerSel).last();
      const textLocator = textSel ? latest.locator(textSel).first() : latest;
      return ((await textLocator.textContent()) || '').trim();
    } catch {
      return '';
    }
  }

  private async findWithFallback(type: 'input' | 'sendButton'): Promise<string | null> {
    const primary = this.selectors[type];
    const fallbacks = this.selectors.fallbackSelectors?.[type] || [];
    const all = [primary, ...fallbacks];
    for (const sel of all) {
      if (!sel) continue;
      try {
        const el = await this.page.$(sel);
        if (el) return sel;
      } catch { continue; }
    }
    return null;
  }
}
