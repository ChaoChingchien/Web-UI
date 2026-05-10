import type { AIProvider } from '@shared/types';
import { BrowserManager } from '../browser/BrowserManager';
import { AutomationEngine } from '../browser/automation/AutomationEngine';

/** ============================================
 *  Web 自动化 AI 调用
 *  通过 Playwright 操控网页与 AI 对话
 *  ============================================ */

export interface ChatOptions {
  mode?: string;
  model?: string;
  toggles?: Record<string, boolean>;
  /** 已知的网页对话 URL：若提供则导航到该 URL 继续，否则启动一个新对话 */
  resumeUrl?: string;
}

export class WebAutomation {
  /** 发送消息，返回回复内容及最终的网页对话 URL */
  async chat(provider: AIProvider, message: string, options?: ChatOptions): Promise<{ response: string; finalUrl: string }> {
    const browserManager = BrowserManager.getInstance();
    const page = await browserManager.getPage(provider);
    const engine = new AutomationEngine(page, provider);
    return engine.execute(message, {
      mode: options?.mode,
      model: options?.model,
      toggles: options?.toggles,
      resumeUrl: options?.resumeUrl,
      isNewConversation: !options?.resumeUrl,
    });
  }

  /** 多轮对话：取最后一条用户消息发送 */
  async chatWithHistory(
    provider: AIProvider,
    messages: { role: string; content: string }[],
    options?: ChatOptions
  ): Promise<{ response: string; finalUrl: string }> {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUserMsg) throw new Error('没有用户消息');
    return this.chat(provider, lastUserMsg.content, options);
  }
}
