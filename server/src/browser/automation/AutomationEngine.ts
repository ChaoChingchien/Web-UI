import type { Page } from 'playwright-core';
import type { AIProvider, WebAutomationConfig } from '@shared/types';
import { log } from '../../platform';

/** ============================================
 *  自动化引擎
 *  填表、点击发送、等待回复、抓取内容
 *  ============================================ */

/** 常见加载占位文本 —— 这些不算是真正的回复 */
const LOADING_PLACEHOLDERS = [
  '...', '…', '·', '思考中', 'Thinking', '思考中...', 'Thinking...',
  '正在思考', '正在回答', '生成中', '',
];

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

  async execute(message: string, options?: { mode?: string; model?: string; toggles?: Record<string, boolean>; isNewConversation?: boolean; resumeUrl?: string }): Promise<{ response: string; finalUrl: string }> {
    log.info(`[${this.provider.name}] 开始自动化执行`);

    await this.waitForPageReady();

    // 优先恢复已有对话：若提供 resumeUrl 且当前页面不在该 URL，则导航过去
    if (options?.resumeUrl) {
      const current = this.page.url();
      if (!this.urlMatches(current, options.resumeUrl)) {
        try {
          log.info(`[${this.provider.name}] 恢复对话: ${options.resumeUrl}`);
          await this.page.goto(options.resumeUrl, { waitUntil: 'load', timeout: 30000 });
          await this.page.waitForTimeout(2000);
          await this.waitForPageReady();
        } catch (err) {
          log.warn(`[${this.provider.name}] 恢复对话失败，回退到新对话:`, err);
          await this.startConversation();
        }
      }
    } else if (options?.isNewConversation) {
      // 没有 resumeUrl 且被标记为新对话时，才主动导航到"新对话"页面
      await this.startConversation();
    }

    // 按需设置模型、模式和开关
    if (options?.model) {
      await this.setModel(options.model);
    } else {
      await this.selectDefaultModel();
    }
    if (options?.mode) {
      await this.setMode(options.mode);
    } else {
      await this.selectDefaultMode();
    }
    if (options?.toggles) {
      await this.applyToggles(options.toggles);
    }

    await this.fillInput(message);
    const preSendUrl = this.page.url();
    await this.clickSend();

    // 短暂等待页面响应 Enter 键，然后立即进入回复检测
    await this.page.waitForTimeout(1500);

    const response = await this.waitForResponse(preSendUrl);
    const finalUrl = this.page.url();

    log.info(`[${this.provider.name}] 完成，回复长度: ${response.length}，URL: ${finalUrl.substring(0, 80)}`);
    return { response, finalUrl };
  }

  /** 比较两个 URL 是否指向同一对话（忽略 query / hash / 尾斜杠） */
  private urlMatches(a: string, b: string): boolean {
    try {
      const ua = new URL(a);
      const ub = new URL(b);
      const pa = (ua.origin + ua.pathname).replace(/\/+$/, '');
      const pb = (ub.origin + ub.pathname).replace(/\/+$/, '');
      return pa === pb;
    } catch {
      return a === b;
    }
  }

  // ==================== 页面准备 ====================

  private async waitForPageReady(): Promise<void> {
    // 只等 5 秒 networkidle，避免 SPA 长轮询/WS 连接导致 30s 超时
    try {
      await this.page.waitForLoadState('networkidle', { timeout: 5000 });
    } catch {
      log.debug(`[${this.provider.name}] networkidle 超时(5s)，继续执行`);
    }

    await this.page.waitForTimeout(2000);

    // 检查页面状态
    try {
      const url = this.page.url();
      const title = await this.page.title().catch(() => '');
      const bodyText = await this.page.evaluate(() => document.body?.innerText?.substring(0, 500) || '').catch(() => '');

      log.info(`[${this.provider.name}] URL: ${url.substring(0, 80)}`);
      log.info(`[${this.provider.name}] 标题: ${title}`);

      if (bodyText.includes('404') || bodyText.includes('Not Found')) {
        throw new Error('页面 404');
      }

      if (bodyText.includes('登录') || bodyText.includes('Log in') || bodyText.includes('Sign in')) {
        log.warn(`[${this.provider.name}] 页面显示登录页，请先使用 🔑 按钮登录`);
      }
    } catch (err) {
      if ((err as Error)?.message === '页面 404') throw err;
      log.warn(`[${this.provider.name}] 页面状态检查失败:`, err);
    }
  }

  // ==================== 对话启动 ====================

  /** 启动新对话（针对需要先点击进入聊天界面的提供商） */
  async startConversation(): Promise<void> {
    const cc = this.webConfig.conversationStart;
    if (!cc) return;

    try {
      if (cc.url) {
        // 导航到新对话 URL
        const fullUrl = cc.url.startsWith('http') ? cc.url : new URL(cc.url, this.page.url()).href;
        log.info(`[${this.provider.name}] 导航到新对话: ${fullUrl}`);
        await this.page.goto(fullUrl, { waitUntil: 'load', timeout: 30000 });
        await this.page.waitForTimeout(2000);
      }

      if (cc.clickStarter) {
        // 点击启动对话（支持 :has-text() 等 Playwright 伪选择器）
        log.info(`[${this.provider.name}] 点击启动对话: ${cc.clickStarter}`);
        const starter = this.page.locator(cc.clickStarter).first();
        const count = await starter.count();
        if (count > 0) {
          await starter.click();
          await this.page.waitForTimeout(2000);
        } else {
          log.warn(`[${this.provider.name}] 未找到启动按钮: ${cc.clickStarter}`);
        }
      }

      // 选择对话风格（如 Claude 的 "Write"/"Code"/"Claude's choice"）
      if (cc.starterStyle) {
        log.info(`[${this.provider.name}] 选择对话风格: ${cc.starterStyle}`);
        const styleBtn = this.page.locator(cc.starterStyle).first();
        const styleCount = await styleBtn.count();
        if (styleCount > 0) {
          await styleBtn.click();
          await this.page.waitForTimeout(1500);
        } else {
          log.warn(`[${this.provider.name}] 未找到对话风格按钮: ${cc.starterStyle}`);
        }
      }

      await this.waitForPageReady();
      await this.page.waitForTimeout(cc.waitAfterMs ?? 3000);
    } catch (err) {
      log.warn(`[${this.provider.name}] 启动对话失败:`, err);
    }
  }

  // ==================== 模式选择 ====================

  /** 选择默认模式 */
  async selectDefaultMode(): Promise<void> {
    const modeCfg = this.webConfig.modeSelector;
    if (!modeCfg) return;
    await this.selectDropdownOption(modeCfg, modeCfg.defaultMode, '模式');
  }

  /** 切换到指定模式 */
  async setMode(modeName: string): Promise<void> {
    const modeCfg = this.webConfig.modeSelector;
    if (!modeCfg) return;
    await this.selectDropdownOption(modeCfg, modeName, '模式');
  }

  // ==================== 模型选择 ====================

  /** 选择默认模型 */
  async selectDefaultModel(): Promise<void> {
    const modelCfg = this.webConfig.modelSelector;
    if (!modelCfg) return;
    await this.selectDropdownOption(modelCfg, modelCfg.defaultModel, '模型');
  }

  /** 切换到指定模型 */
  async setModel(modelName: string): Promise<void> {
    const modelCfg = this.webConfig.modelSelector;
    if (!modelCfg) return;
    await this.selectDropdownOption(modelCfg, modelName, '模型');
  }

  /** 通用下拉选择：模式/模型 复用 */
  private async selectDropdownOption(
    cfg: { container: string; buttons: { name: string; selector: string }[]; defaultMode?: string; defaultModel?: string },
    optionName: string,
    label: string,
  ): Promise<void> {
    const btn = cfg.buttons.find((b) => b.name === optionName);
    if (!btn) {
      log.warn(`[${this.provider.name}] 未知${label}: ${optionName}，可用: ${cfg.buttons.map(b => b.name).join(', ')}`);
      return;
    }

    try {
      const container = await this.page.$(cfg.container);
      if (!container) {
        const el = await this.page.$(btn.selector);
        if (el) {
          await el.click();
          await this.page.waitForTimeout(500);
          log.info(`[${this.provider.name}] 已选择${label}: ${optionName}`);
        }
        return;
      }

      const targetBtn = await container.$(btn.selector);
      if (targetBtn) {
        // 检查目标按钮是否已处于激活状态（而非检查容器文本）
        const isActive = await targetBtn.evaluate((el) => {
          const htmlEl = el as HTMLElement;
          return htmlEl.classList.contains('active')
            || htmlEl.classList.contains('selected')
            || htmlEl.getAttribute('aria-selected') === 'true'
            || htmlEl.getAttribute('aria-checked') === 'true'
            || htmlEl.getAttribute('aria-current') === 'true';
        }).catch(() => false);

        if (isActive) {
          log.info(`[${this.provider.name}] 已是 ${optionName} ${label}`);
          return;
        }

        await targetBtn.click();
        await this.page.waitForTimeout(500);
        log.info(`[${this.provider.name}] 已选择${label}: ${optionName}`);
      }
    } catch (err) {
      log.warn(`[${this.provider.name}] 切换${label}失败:`, err);
    }
  }

  // ==================== 开关控制（联网搜索、深度思考等） ====================

  /** 应用所有开关状态 */
  async applyToggles(toggles: Record<string, boolean>): Promise<void> {
    const toggleCfgs = this.webConfig.toggles || [];
    for (const cfg of toggleCfgs) {
      const targetState = toggles[cfg.label];
      if (targetState === undefined) continue;
      await this.setToggle(cfg, targetState);
    }
  }

  /** 设置单个开关 */
  private async setToggle(cfg: NonNullable<WebAutomationConfig['toggles']>[0], on: boolean): Promise<void> {
    try {
      const container = cfg.container ? await this.page.$(cfg.container) : this.page;
      if (!container) return;

      const el = await container.$(cfg.selector);
      if (!el) return;

      // 判断当前是否已处于目标状态
      const isActive = await el.evaluate((node) => {
        const el = node as HTMLElement;
        return el.getAttribute('aria-checked') === 'true'
          || el.classList.contains('active')
          || el.classList.contains('on')
          || el.getAttribute('data-active') === 'true';
      }).catch(() => false);

      if (isActive === on) {
        log.info(`[${this.provider.name}] 开关「${cfg.label}」已是 ${on ? '开' : '关'}`);
        return;
      }

      await el.click();
      await this.page.waitForTimeout(300);
      log.info(`[${this.provider.name}] 已${on ? '开启' : '关闭'}「${cfg.label}」`);
    } catch (err) {
      log.warn(`[${this.provider.name}] 开关「${cfg.label}」操作失败:`, err);
    }
  }

  // ==================== 填表 + 发送 ====================

  async fillInput(text: string): Promise<void> {
    const selector = await this.findWithFallback('input');
    if (!selector) throw new Error('未找到输入框，页面可能未正确加载');

    await this.page.waitForSelector(selector, { state: 'visible', timeout: 10000 }).catch(() => {});

    // 统一使用 Playwright 原生 fill（支持 input/textarea/contenteditable）
    // Playwright 会正确派遣 ProseMirror/TipTap 所需的输入事件
    try {
      await this.page.locator(selector).fill(text);
      await this.page.waitForTimeout(300);
      log.info(`[${this.provider.name}] 已填入消息 (${text.length} 字符)`);
      return;
    } catch (err) {
      log.debug(`[${this.provider.name}] Playwright fill 失败，回退到 evaluate 方式:`, err);
    }

    // 回退：手动事件注入（React SPA 等）
    await this.page.evaluate(({ sel, txt }) => {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!el) return;

      el.focus();
      el.dispatchEvent(new Event('focus', { bubbles: true }));
      el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));

      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
        el.value = txt;
      } else {
        el.innerHTML = '';
        el.textContent = txt;
      }

      el.dispatchEvent(new CompositionEvent('compositionend', {
        bubbles: true,
        data: txt,
      }));

      el.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: txt,
      }));

      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, { sel: selector, txt: text });

    await this.page.waitForTimeout(300);
    log.info(`[${this.provider.name}] 已填入消息 (${text.length} 字符)`);
  }

  async clickSend(): Promise<void> {
    const inputSelector = await this.findWithFallback('input');
    const isContentEditable = inputSelector ? await this.isContentEditable(inputSelector) : false;

    if (isContentEditable) {
      // contenteditable (Claude, ChatGPT): Enter 可能不会发送，优先使用发送按钮
      const buttonClicked = await this.tryClickSendButton();
      if (buttonClicked) return;

      if (await this.trySendEnter()) return;
      if (await this.trySendCtrlEnter()) return;
      if (await this.trySendJsHeuristic()) return;
    } else {
      // textarea/input (DeepSeek, Kimi 等): Enter 可靠
      if (await this.trySendEnter()) return;
      const buttonClicked = await this.tryClickSendButton();
      if (buttonClicked) return;
      if (await this.trySendCtrlEnter()) return;
      if (await this.trySendJsHeuristic()) return;
    }

    throw new Error('所有发送方式均失败');
  }

  /** 尝试用 Enter 发送，并验证输入框是否清空 */
  private async trySendEnter(): Promise<boolean> {
    const inputSelector = await this.findWithFallback('input');
    if (!inputSelector) return false;

    try {
      // 先聚焦输入框
      await this.page.click(inputSelector);
      await this.page.waitForTimeout(200);

      // 输入 Enter
      await this.page.press(inputSelector, 'Enter');
      await this.page.waitForTimeout(500);

      // 验证：输入框内容是否被清空？
      if (await this.isInputEmpty(inputSelector)) {
        log.info(`[${this.provider.name}] 已通过 Enter 发送（输入框已清空）`);
        return true;
      }

      // 再试一次（某些页面第一次 Enter 可能只是提交草稿）
      await this.page.press(inputSelector, 'Enter');
      await this.page.waitForTimeout(500);

      if (await this.isInputEmpty(inputSelector)) {
        log.info(`[${this.provider.name}] 已通过第二次 Enter 发送`);
        return true;
      }

      log.debug(`[${this.provider.name}] Enter 后输入框未清空，尝试其他方式`);
      return false;
    } catch (err) {
      log.warn(`[${this.provider.name}] Enter 发送失败:`, err);
      return false;
    }
  }

  /** 尝试用 Ctrl+Enter 发送 */
  private async trySendCtrlEnter(): Promise<boolean> {
    const inputSelector = await this.findWithFallback('input');
    if (!inputSelector) return false;

    try {
      await this.page.press(inputSelector, 'Control+Enter');
      await this.page.waitForTimeout(500);
      if (await this.isInputEmpty(inputSelector)) {
        log.info(`[${this.provider.name}] 已通过 Ctrl+Enter 发送`);
        return true;
      }
    } catch { /* ignore */ }
    return false;
  }

  /** 检查选择器是否指向 contenteditable 元素 */
  private async isContentEditable(selector: string): Promise<boolean> {
    try {
      return await this.page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return false;
        return el.getAttribute('contenteditable') === 'true' || el.getAttribute('role') === 'textbox';
      }, selector);
    } catch {
      return false;
    }
  }

  /** 检查输入框内容是否为空（排除占位文本干扰） */
  private async isInputEmpty(selector: string): Promise<boolean> {
    try {
      return await this.page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        let raw: string;
        if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
          raw = el.value;
        } else {
          raw = el.textContent || '';
        }
        const trimmed = raw.trim();
        // 匹配完整占位字符串（而非子串），避免把正常消息误判为占位符
        const placeholders = [
          'Send a message', 'Message ChatGPT', 'Type a message',
          'Ask anything', 'Enter your message', '输入消息',
          '发送消息', '请输入...', 'Ask Claude anything',
          'Claude 3.7 Sonnet', 'What can I help with?',
          'Message DeepSeek', '向 DeepSeek 发送消息',
        ];
        for (const ph of placeholders) {
          if (trimmed === ph) return true;
        }
        return trimmed.length === 0;
      }, selector);
    } catch {
      return false;
    }
  }

  /** 智能查找并点击发送按钮（带排除和验证） */
  private async tryClickSendButton(): Promise<boolean> {
    const allSels = [
      // 高精度优先
      this.selectors.sendButton,
      ...(this.selectors.fallbackSelectors?.sendButton || []),
    ].filter(Boolean);

    // 先尝试精确匹配：按钮同时是 input 区域的兄弟/父级元素内的 button:has(svg)
    // 多数 AI 聊天页的发送按钮在输入框附近，且是最后一个可见的 button
    try {
      const inputSel = await this.findWithFallback('input');
      if (inputSel) {
        // 查找输入框附近（同级或父级容器内）的最后一个 button
        const clicked = await this.page.evaluate((sel) => {
          const input = document.querySelector(sel);
          if (!input) return false;

          // 限制搜索范围：输入框的父级容器及相邻容器
          const container = input.closest('div')?.parentElement || input.parentElement;
          if (!container) return false;

          // 找到容器内所有 buttons，取最后一个可见的
          const buttons = container.querySelectorAll('button');
          let target: HTMLElement | null = null;
          for (const btn of buttons) {
            const rect = btn.getBoundingClientRect();
            const text = btn.textContent?.toLowerCase() || '';
            const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
            // 排除已知的非发送按钮
            if (text.includes('upload') || text.includes('file') || text.includes('attach')
                || ariaLabel.includes('upload') || ariaLabel.includes('file')
                || text.includes('voice') || text.includes('录音')
                || ariaLabel.includes('voice')
                || text.includes('emoji') || text.includes('表情')
                || ariaLabel.includes('emoji')
                || text.includes('image') || text.includes('图片')) {
              continue;
            }
            // 可见的 button
            if (rect.width > 10 && rect.height > 10) {
              target = btn as HTMLElement;
            }
          }

          // 如果找到了，点击最后一个（通常是发送按钮）
          if (target) {
            target.click();
            return true;
          }
          return false;
        }, inputSel);

        if (clicked) {
          await this.page.waitForTimeout(500);
          if (inputSel && await this.isInputEmpty(inputSel)) {
            log.info(`[${this.provider.name}] 已通过智能查找点击发送`);
            return true;
          }
        }
      }
    } catch { /* fall through */ }

    // 逐个尝试所有选择器
    for (const sel of allSels) {
      if (!sel) continue;
      try {
        const elements = await this.page.$$(sel);
        if (elements.length === 0) continue;

        // 如果有多个匹配，跳过内容明显不是发送按钮的
        for (const el of elements) {
          const ariaLabel = await el.getAttribute('aria-label').catch(() => '') || '';
          const text = await el.textContent().catch(() => '') || '';
          if (ariaLabel.includes('upload') || ariaLabel.includes('file')
              || ariaLabel.includes('voice') || ariaLabel.includes('emoji')) {
            continue;
          }
        }

        // 点击最后一个匹配的元素（发送按钮通常在最后）
        const target = elements[elements.length - 1];
        await target.click({ force: true });
        await this.page.waitForTimeout(500);

        // 验证输入框是否被清空
        const inputSel = await this.findWithFallback('input');
        if (inputSel && await this.isInputEmpty(inputSel)) {
          log.info(`[${this.provider.name}] 已通过选择器 "${sel}" 发送`);
          return true;
        }

        // 检查是否有停止按钮出现（表明回复开始了）
        const stopSel = this.selectors.stopButton;
        if (stopSel) {
          const hasStop = await this.page.$(stopSel).catch(() => null);
          if (hasStop) {
            log.info(`[${this.provider.name}] 停止按钮出现，发送成功`);
            return true;
          }
        }

        log.debug(`[${this.provider.name}] 点击 "${sel}" 后输入框未清空`);
      } catch { continue; }
    }

    return false;
  }

  /** JS 启发式查找发送按钮 */
  private async trySendJsHeuristic(): Promise<boolean> {
    try {
      const clicked = await this.page.evaluate(() => {
        const candidates = document.querySelectorAll('button, div[role="button"]');
        for (let i = candidates.length - 1; i >= 0; i--) {
          const el = candidates[i];
          const text = el.textContent?.toLowerCase() || '';
          const cls = el.className?.toString().toLowerCase() || '';
          const ariaLabel = el.getAttribute('aria-label')?.toLowerCase() || '';
          if (text.includes('send') || cls.includes('send') || ariaLabel.includes('send')
              || ariaLabel.includes('发送') || text.includes('发送')) {
            (el as HTMLElement).click();
            return true;
          }
        }
        return false;
      });
      if (clicked) {
        await this.page.waitForTimeout(500);
        log.info(`[${this.provider.name}] 已通过 JS 查找点击发送`);
        return true;
      }
    } catch { /* ignore */ }
    return false;
  }

  // ==================== 等待回复 ====================

  async waitForResponse(preSendUrl?: string): Promise<string> {
    const opts = this.waitOptions;
    const containerSel = this.selectors.responseContainer;
    const textSel = this.selectors.responseText;
    const stopSel = this.selectors.stopButton;

    // Step 0: 检查 URL 是否变化（Claude 发送后会从 /new → /chat/{uuid}）
    if (preSendUrl) {
      const currentUrl = this.page.url();
      if (currentUrl !== preSendUrl) {
        log.info(`[${this.provider.name}] 检测到 URL 变化: ${preSendUrl.substring(0, 60)} → ${currentUrl.substring(0, 60)}`);
        await this.page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
        await this.page.waitForTimeout(2000);
      } else {
        // 短暂等待，给 SPA 导航一点时间
        for (let i = 0; i < 5; i++) {
          await this.page.waitForTimeout(500);
          if (this.page.url() !== preSendUrl) {
            log.info(`[${this.provider.name}] URL 已变化: ${this.page.url().substring(0, 60)}`);
            await this.page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
            await this.page.waitForTimeout(2000);
            break;
          }
        }
      }
    }

    // Step 1: if stopButton exists, wait for it to appear (AI started replying)
    if (stopSel && this.waitStrategy === 'stopButton') {
      await this.waitForStopButton(stopSel, opts);
    }

    // Step 2: wait for reply to complete
    if (this.waitStrategy === 'stopButton') {
      return this.waitByStopButton(opts);
    }
    return this.waitByNoNewText(opts);
  }

  /** 等待 AI 开始回复：停止按钮出现 或 最后一条消息内容改变 */

  /** 等待停止按钮出现（短超时，不阻塞无 stopButton 的提供商） */
  private async waitForStopButton(stopSel: string, opts: WebAutomationConfig['waitOptions']): Promise<void> {
    try {
      await this.page.waitForSelector(stopSel, { timeout: 15000 });
      log.info(`[${this.provider.name}] 停止按钮出现，回复已开始`);
      await this.page.waitForTimeout(1500);
    } catch {
      log.info(`[${this.provider.name}] 停止按钮未出现，进入稳定检测`);
    }
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
    const stopSel = this.selectors.stopButton;
    const pollMs = opts?.pollingIntervalMs || 500;
    const stableMs = opts?.noNewTextTimeoutMs || 5000;
    const deadline = Date.now() + (opts?.fallbackTimeoutMs || 120000);

    let lastText = '';
    let lastChangeTime = Date.now();
    let stableSinceEmpty = 0;
    let consecutiveEmpty = 0;
    let statusLogInterval = 0;

    log.info(`[${this.provider.name}] 开始稳定检测`);

    while (Date.now() < deadline) {
      try {
        // 多级回退文本提取
        let currentText = await this.safeExtractText(containerSel, textSel);

        // 如果是加载占位文本，当作空处理
        if (LOADING_PLACEHOLDERS.includes(currentText.trim())) {
          currentText = '';
        }

        if (currentText.length > 0) {
          consecutiveEmpty = 0;
          stableSinceEmpty = 0;
          if (currentText !== lastText) {
            lastText = currentText;
            lastChangeTime = Date.now();
            log.info(`[${this.provider.name}] 检测到新内容 (${currentText.length} 字符): ${currentText.substring(0, 100)}`);
          }

          const timeStable = Date.now() - lastChangeTime;
          if (timeStable >= stableMs && currentText.length > 5) {
            // 额外检查：如果有 stopButton 且还在页面上，等它消失
            if (stopSel) {
              const stopBtn = await this.page.$(stopSel).catch(() => null);
              if (stopBtn) {
                log.debug(`[${this.provider.name}] 内容稳定但停止按钮仍在，继续等待`);
                lastChangeTime = Date.now();
                await this.page.waitForTimeout(pollMs);
                continue;
              }
            }
            return currentText.trim();
          }
        } else {
          stableSinceEmpty += pollMs;
          consecutiveEmpty++;
          if (stableSinceEmpty > 3000 && stableSinceEmpty < 10000) {
            log.info(`[${this.provider.name}] 等待回复内容出现... (${consecutiveEmpty} 次轮询)`);
          }

          // 长时间无内容 → 选择器可能不匹配，回退到页面级文本
          if (consecutiveEmpty === 40) { // ~20s empty
            log.warn(`[${this.provider.name}] 选择器未命中，尝试页面级回退`);
          }
        }
      } catch { /* 页面加载中 */ }
      await this.page.waitForTimeout(pollMs);
    }

    if (lastText.length > 0) {
      log.warn(`[${this.provider.name}] 等待超时，返回部分内容 (${lastText.length} 字符)`);
      return lastText.trim();
    }
    // 终极回退：页面级文本提取
    const pageText = await this.scrapePageText();
    if (pageText.length > 10) {
      log.warn(`[${this.provider.name}] 选择器未命中，使用页面回退文本 (${pageText.length} 字符)`);
      return pageText;
    }
    throw new Error('等待回复超时');
  }

  /** 多级回退文本提取：textSel → containerSel → 页面主区域 */
  private async safeExtractText(containerSel: string, textSel?: string): Promise<string> {
    // 1. 首选：textSel 最后一个匹配元素（AI 最新回复）
    if (textSel) {
      try {
        const text = await this.page.locator(textSel).last().innerText();
        if (text && text.trim().length > 0 && !LOADING_PLACEHOLDERS.includes(text.trim())) {
          return text;
        }
      } catch { /* fall through */ }
    }

    // 2. 回退：容器最后一个匹配的文本
    if (textSel) {
      try {
        const text = await this.page.locator(containerSel).last().locator(textSel).last().innerText();
        if (text && text.trim().length > 0 && !LOADING_PLACEHOLDERS.includes(text.trim())) {
          return text;
        }
      } catch { /* fall through */ }
    }

    // 3. 回退：直接用 container 的文本
    try {
      const text = await this.page.locator(containerSel).last().innerText();
      if (text && text.trim().length > 0 && !LOADING_PLACEHOLDERS.includes(text.trim())) {
        return text;
      }
    } catch { /* fall through */ }

    // 4. 回退：查找页面主要聊天区域
    try {
      const text = await this.page.evaluate(() => {
        const mainArea: Element | null =
          document.querySelector('main') ||
          document.querySelector('[class*="chat"]') ||
          document.querySelector('[class*="conversation"]') ||
          document.querySelector('[class*="message"]') ||
          document.querySelector('[role="main"]') ||
          document.querySelector('[class*="content"]');
        if (!mainArea) return '';
        const raw = (mainArea as HTMLElement).innerText || mainArea.textContent || '';
        return raw
          .split('\n')
          .map((l: string) => l.trim())
          .filter((l: string) => l.length > 1 && !['...', '···', '·'].includes(l))
          .join('\n');
      });
      if (text) return text;
    } catch { /* fall through */ }

    return '';
  }

  /** 页面级文本提取（终极回退 — 仅在超时时使用） */
  private async scrapePageText(): Promise<string> {
    try {
      return await this.page.evaluate(() => {
        // 尝试找到最可能是 AI 回复内容的区域
        const main =
          document.querySelector('main') ||
          document.querySelector('[class*="chat"]') ||
          document.querySelector('[class*="conversation"]');
        const src = main || document.body;
        return (src.innerText || '').trim();
      });
    } catch {
      return '';
    }
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

  // ==================== 选择器查找 ====================

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
