import type { ApiConfig } from '@shared/types';
import { log } from '../platform';

/** ============================================
 *  API / 本地模型 AI 调用
 *  兼容 OpenAI API 格式（支持 Ollama、LM Studio 等）
 *  ============================================ */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class ApiClient {
  /** 发送聊天请求（非流式） */
  async chat(config: ApiConfig, messages: ChatMessage[]): Promise<{ content: string; error: string }> {
    const { baseUrl, apiKey, model, headers: extraHeaders } = config;

    try {
      log.info(`[API] 请求 ${baseUrl}/chat/completions, 模型: ${model}`);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);

      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          ...extraHeaders,
        },
        body: JSON.stringify({
          model,
          messages,
          stream: false,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API 请求失败 [${response.status}]: ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('API 返回内容为空');

      return { content, error: '' };
    } catch (err) {
      return { content: '', error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** 发送聊天请求（流式，通过回调返回） */
  async chatStream(
    config: ApiConfig,
    messages: ChatMessage[],
    onChunk: (chunk: string) => void,
    onDone: () => void,
    onError: (err: Error) => void
  ): Promise<void> {
    const { baseUrl, apiKey, model, headers: extraHeaders } = config;

    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          ...extraHeaders,
        },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
        }),
        signal: AbortSignal.timeout(120000),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API 请求失败 [${response.status}]: ${errorText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('无法读取响应流');

      const decoder = new TextDecoder();
      let buffer = '';
      let doneCalled = false;

      const safeDone = () => {
        if (!doneCalled) {
          doneCalled = true;
          onDone();
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') {
            safeDone();
            return;
          }
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) onChunk(delta);
          } catch {
            // 忽略解析错误
          }
        }
      }

      safeDone();
    } catch (err) {
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  /** 列出可用模型 */
  async listModels(config: ApiConfig): Promise<{ models: string[]; error: string }> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);

      const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/models`, {
        headers: {
          ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return { models: [], error: `HTTP ${response.status}: ${await response.text().catch(() => '')}` };
      }
      const data = await response.json();
      return { models: (data.data || []).map((m: { id: string }) => m.id), error: '' };
    } catch (err) {
      return { models: [], error: err instanceof Error ? err.message : String(err) };
    }
  }
}
