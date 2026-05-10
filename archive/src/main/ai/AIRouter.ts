import type { AIProvider } from '@shared/types';
import { WebAutomation } from './WebAutomation';
import { ApiClient, type ChatMessage } from './ApiClient';

/** ============================================
 *  统一 AI 路由器
 *  根据 provider.type 选择对应的调用方式
 *  ============================================ */

export class AIRouter {
  private webAutomation = new WebAutomation();
  private apiClient = new ApiClient();

  /** 发送消息并获取回复 */
  async chat(provider: AIProvider, messages: ChatMessage[]): Promise<string> {
    switch (provider.type) {
      case 'api':
        return this.apiChat(provider, messages);
      case 'local':
        return this.localChat(provider, messages);
      case 'web':
      default:
        return this.webChat(provider, messages);
    }
  }

  /** 流式发送消息 */
  async chatStream(
    provider: AIProvider,
    messages: ChatMessage[],
    onChunk: (chunk: string) => void,
    onDone: () => void,
    onError: (err: Error) => void
  ): Promise<void> {
    switch (provider.type) {
      case 'api':
        this.apiClient.chatStream(provider.api_config!, messages, onChunk, onDone, onError);
        break;
      case 'local':
        this.apiClient.chatStream(provider.local_config!, messages, onChunk, onDone, onError);
        break;
      case 'web':
      default:
        // Web 自动化不支持流式，先获取完整回复再回调
        try {
          const response = await this.webChat(provider, messages);
          onChunk(response);
          onDone();
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
          const models = await this.apiClient.listModels(provider.api_config!);
          return { success: true, message: `连接成功，可用模型: ${models.length} 个` };
        }
        case 'local': {
          const models = await this.apiClient.listModels(provider.local_config!);
          return { success: true, message: `连接成功，可用模型: ${models.join(', ')}` };
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

  private async webChat(provider: AIProvider, messages: ChatMessage[]): Promise<string> {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUserMsg) throw new Error('没有用户消息');
    return this.webAutomation.chat(provider, lastUserMsg.content);
  }

  private async apiChat(provider: AIProvider, messages: ChatMessage[]): Promise<string> {
    if (!provider.api_config) throw new Error('API 配置缺失');
    return this.apiClient.chat(provider.api_config, messages);
  }

  private async localChat(provider: AIProvider, messages: ChatMessage[]): Promise<string> {
    if (!provider.local_config) throw new Error('本地模型配置缺失');
    return this.apiClient.chat(provider.local_config, messages);
  }
}
