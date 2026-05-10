import type { AIProvider } from '@shared/types';
import { BrowserManager } from '../browser/BrowserManager';
import { AutomationEngine } from '../browser/automation/AutomationEngine';
import log from 'electron-log';

/** ============================================
 *  Web 自动化 AI 调用
 *  通过 Playwright 操控网页与 AI 对话
 *  ============================================ */

export class WebAutomation {
  /** 发送消息并获取回复 */
  async chat(provider: AIProvider, message: string): Promise<string> {
    const browserManager = BrowserManager.getInstance();
    const page = await browserManager.getPage(provider);
    const engine = new AutomationEngine(page, provider);
    const response = await engine.execute(message);

    // 保存登录态
    await browserManager.saveStorageState(provider.id);

    return response;
  }

  /** 多轮对话：发送消息并获取回复（带上下文） */
  async chatWithHistory(
    provider: AIProvider,
    messages: { role: string; content: string }[]
  ): Promise<string> {
    // Web 自动化模式下，上下文通过网页对话历史自然保持
    // 只需发送最后一条用户消息
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUserMsg) throw new Error('没有用户消息');

    return this.chat(provider, lastUserMsg.content);
  }
}
