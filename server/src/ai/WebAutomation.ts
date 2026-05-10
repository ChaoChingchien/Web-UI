import type { AIProvider } from '@shared/types';
import { BrowserManager } from '../browser/BrowserManager';
import { AutomationEngine } from '../browser/automation/AutomationEngine';
import { log } from '../platform';

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

  /** 同步网页对话消息到本地：抓取网页上的所有消息，与本地对比后导入新消息 */
  async syncConversation(
    provider: AIProvider,
    conversationId: string,
    { MessageModel }: { MessageModel: { findByConversation: (convId: string) => Array<{ role: string; content: string }>; create: (convId: string, role: 'user' | 'assistant' | 'system', content: string) => unknown } }
  ): Promise<{ imported: number }> {
    const browserManager = BrowserManager.getInstance();
    const page = await browserManager.getPage(provider);
    const engine = new AutomationEngine(page, provider);
    const webMessages = await engine.scrapeConversationMessages();
    if (webMessages.length === 0) return { imported: 0 };

    const localMessages = MessageModel.findByConversation(conversationId);
    const localContents = new Set(localMessages.map((m) => m.content));

    let imported = 0;
    for (const wm of webMessages) {
      if (!localContents.has(wm.content)) {
        MessageModel.create(conversationId, wm.role as 'user' | 'assistant', wm.content);
        localContents.add(wm.content);
        imported++;
      }
    }
    return { imported };
  }

  /** 同步网页上所有对话到本地 DB（含消息内容） */
  async syncAllConversations(
    provider: AIProvider,
    providerId: string,
    { ConversationModel, MessageModel }: {
      ConversationModel: { findAll: (pid: string) => Array<{ web_url?: string; id: string }>; create: (pid: string, title: string) => { id: string }; updateWebUrl: (id: string, url: string) => void };
      MessageModel: { findByConversation: (cid: string) => Array<{ content: string }>; create: (cid: string, role: string, content: string) => unknown };
    }
  ): Promise<{ imported: number; messages: number }> {
    const browserManager = BrowserManager.getInstance();
    const page = await browserManager.getPage(provider);
    const engine = new AutomationEngine(page, provider);
    const webConvs = await engine.scrapeConversationList();
    if (webConvs.length === 0) return { imported: 0, messages: 0 };

    const localConvs = ConversationModel.findAll(providerId);
    // 本地 URL 也标准化后去重
    const localUrls = new Set(localConvs.map((c) => {
      if (!c.web_url) return null;
      try { const u = new URL(c.web_url); return u.origin + u.pathname.replace(/\/$/, ''); }
      catch { return c.web_url; }
    }).filter(Boolean) as string[]);

    let imported = 0;
    let totalMessages = 0;

    for (const wc of webConvs) {
      // 标准化 web URL 后比较
      let normalizedWc: string;
      try { const u = new URL(wc.url); normalizedWc = u.origin + u.pathname.replace(/\/$/, ''); }
      catch { normalizedWc = wc.url; }
      if (localUrls.has(normalizedWc)) continue;
      try {
        const title = wc.title.length > 80 ? wc.title.slice(0, 80) + '...' : wc.title;
        const conv = ConversationModel.create(providerId, title);
        ConversationModel.updateWebUrl(conv.id, wc.url);
        localUrls.add(wc.url);
        imported++;

        // 同步该对话的消息内容
        try {
          await page.goto(wc.url, { waitUntil: 'load', timeout: 30000 });
          await page.waitForTimeout(2000);
          const webMsgs = await engine.scrapeConversationMessages();
          const localMsgs = new Set(MessageModel.findByConversation(conv.id).map((m) => m.content));
          for (const wm of webMsgs) {
            if (!localMsgs.has(wm.content) && wm.content.length > 2) {
              MessageModel.create(conv.id, wm.role, wm.content);
              localMsgs.add(wm.content);
              totalMessages++;
            }
          }
        } catch (msgErr) {
          log.warn(`[sync:all] 同步消息失败 (${wc.url}):`, msgErr);
        }
      } catch { /* skip */ }
    }

    // 同时同步已有对话中缺失消息的
    for (const lc of localConvs) {
      if (!lc.web_url) continue;
      try {
        const localMsgs = MessageModel.findByConversation(lc.id);
        if (localMsgs.length > 0) continue; // 已有消息，跳过
        await page.goto(lc.web_url, { waitUntil: 'load', timeout: 30000 });
        await page.waitForTimeout(2000);
        const webMsgs = await engine.scrapeConversationMessages();
        const existingContents = new Set(localMsgs.map((m) => m.content));
        for (const wm of webMsgs) {
          if (!existingContents.has(wm.content) && wm.content.length > 2) {
            MessageModel.create(lc.id, wm.role, wm.content);
            existingContents.add(wm.content);
            totalMessages++;
          }
        }
      } catch { /* skip */ }
    }

    return { imported, messages: totalMessages };
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
