import type { AIProvider } from '@shared/types';
import { WebAutomation } from './WebAutomation';
import { ApiClient, type ChatMessage } from './ApiClient';

/** ============================================
 *  统一 AI 路由器
 *  根据 provider.type 选择对应的调用方式
 *  ============================================ */

export interface ChatStreamOptions {
  mode?: string;
  model?: string;
  toggles?: Record<string, boolean>;
  /** 对应 DB Conversation.id，仅用于回调标识 */
  conversationId?: string;
  /** 已知的网页对话 URL（web 类型 provider 专用），提供则恢复、否则开新对话 */
  webUrl?: string;
}

export interface ChatStreamMeta {
  /** web 类型 provider 发送完成后浏览器所在的网页对话 URL */
  finalUrl?: string;
}

export class AIRouter {
  private webAutomation = new WebAutomation();
  private apiClient = new ApiClient();

  /** 发送消息并获取回复（非流式，不返回 finalUrl） */
  async chat(provider: AIProvider, messages: ChatMessage[]): Promise<string> {
    switch (provider.type) {
      case 'api':
        return this.apiChat(provider, messages);
      case 'local':
        return this.localChat(provider, messages);
      case 'web':
      default: {
        const { response } = await this.webChat(provider, messages);
        return response;
      }
    }
  }

  /** 流式发送消息 */
  async chatStream(
    provider: AIProvider,
    messages: ChatMessage[],
    options: ChatStreamOptions = {},
    onChunk: (chunk: string) => void,
    onDone: (meta?: ChatStreamMeta) => void,
    onError: (err: Error) => void
  ): Promise<void> {
    switch (provider.type) {
      case 'api':
        this.apiClient.chatStream(provider.api_config!, messages, onChunk, () => onDone(), onError);
        break;
      case 'local':
        this.apiClient.chatStream(provider.local_config!, messages, onChunk, () => onDone(), onError);
        break;
      case 'web':
      default:
        // Web 自动化不支持真流式，按段落拆分模拟流式输出
        try {
          const { response, finalUrl } = await this.webChat(provider, messages, {
            mode: options.mode,
            model: options.model,
            toggles: options.toggles,
            resumeUrl: options.webUrl,
          });
          const paragraphs = response.split(/\n{2,}/).filter(p => p.trim().length > 0);
          for (const paragraph of paragraphs) {
            onChunk(paragraph + '\n\n');
          }
          onDone({ finalUrl });
        } catch (err) {
          onError(err instanceof Error ? err : new Error(String(err)));
        }
        break;
    }
  }

  /** 测试提供商连接 */
  async testProvider(provider: AIProvider): Promise<{ success: boolean; message: string }> {
    try {
      switch (provider.type) {
        case 'api': {
          const result = await this.apiClient.listModels(provider.api_config!);
          if (result.error) {
            return { success: false, message: `获取模型列表失败: ${result.error}` };
          }
          return { success: true, message: `连接成功，可用模型: ${result.models.length} 个` };
        }
        case 'local': {
          const result = await this.apiClient.listModels(provider.local_config!);
          if (result.error) {
            return { success: false, message: `获取模型列表失败: ${result.error}` };
          }
          return { success: true, message: `连接成功，可用模型: ${result.models.join(', ')}` };
        }
        case 'web': {
          const browserManager = (await import('../browser/BrowserManager')).BrowserManager.getInstance();
          await browserManager.getPage(provider);
          return { success: true, message: '浏览器页面加载成功，请在窗口中完成登录' };
        }
      }
    } catch (err) {
      return { success: false, message: `连接失败: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  // --- Private ---

  private webChat(
    provider: AIProvider,
    messages: ChatMessage[],
    options?: { mode?: string; model?: string; toggles?: Record<string, boolean>; resumeUrl?: string }
  ): Promise<{ response: string; finalUrl: string }> {
    // 对于 web 自动化：将 system prompt + 上下文 + 用户消息组装成一条完整输入
    // 因为网页聊天只有一个输入框，无法像 API 那样分别传 role
    const systemMsgs = messages.filter((m) => m.role === 'system').map((m) => m.content);
    const historyMsgs = messages.filter((m) => m.role === 'assistant' || m.role === 'user');
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');

    if (!lastUserMsg) throw new Error('没有用户消息');

    const parts: string[] = [];

    // 系统提示：角色定义 + 任务说明
    if (systemMsgs.length > 0) {
      parts.push('【系统指令】\n' + systemMsgs.join('\n\n'));
    }

    // 上下文：之前的对话
    if (historyMsgs.length > 1) {
      const context = historyMsgs
        .slice(0, -1) // 排除最后一条用户消息（它就是我们要发的）
        .map((m) => (m.role === 'user' ? '👤 用户' : '🤖 AI') + '：' + m.content)
        .join('\n\n');
      if (context) {
        parts.push('【对话上下文】\n' + context);
      }
    }

    // 当前用户消息
    parts.push('【当前消息】\n' + lastUserMsg.content);

    const combined = parts.join('\n\n---\n\n');
    return this.webAutomation.chat(provider, combined, options);
  }

  private async apiChat(provider: AIProvider, messages: ChatMessage[]): Promise<string> {
    if (!provider.api_config) throw new Error('API 配置缺失');
    const result = await this.apiClient.chat(provider.api_config, messages);
    if (result.error) throw new Error(result.error);
    return result.content;
  }

  private async localChat(provider: AIProvider, messages: ChatMessage[]): Promise<string> {
    if (!provider.local_config) throw new Error('本地模型配置缺失');
    const result = await this.apiClient.chat(provider.local_config, messages);
    if (result.error) throw new Error(result.error);
    return result.content;
  }
}
