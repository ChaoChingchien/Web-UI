/** ============================================
 *  EmbeddingService — 语义嵌入（L2 本地 / L3 API）
 *
 *  L2: @xenova/transformers + all-MiniLM-L6-v2（本机 CPU 推理）
 *  L3: OpenAI 兼容 API（ollama / 任何 OpenAI-compatible 端点）
 *
 *  单例模式，惰性初始化。
 *  ============================================ */

import { log } from '../platform';
import type { EmbeddingConfig } from '@shared/types';

type Embedder = (texts: string[]) => Promise<Float32Array[]>;

export class EmbeddingService {
  private config: EmbeddingConfig | null = null;
  private localPipeline: unknown = null; // @xenova pipeline 实例
  private initialized = false;
  private static instance: EmbeddingService | null = null;

  static getInstance(): EmbeddingService {
    if (!EmbeddingService.instance) {
      EmbeddingService.instance = new EmbeddingService();
    }
    return EmbeddingService.instance;
  }

  /** 是否已配置且可用 */
  isAvailable(): boolean {
    return this.config?.enabled === true;
  }

  /** 根据最新设置更新配置（可在运行时切换） */
  configure(config: EmbeddingConfig): void {
    const prevEnabled = this.config?.enabled;
    this.config = { ...config };
    if (config.enabled && !prevEnabled) {
      this.initAsync(); // 首次启用时后台加载模型
    }
  }

  /** 向量维度（all-MiniLM-L6-v2 = 384） */
  get dimension(): number {
    return 384;
  }

  /** 生成文本嵌入 */
  async embed(texts: string[]): Promise<Float32Array[]> {
    if (!this.config?.enabled) throw new Error('嵌入服务未启用');

    if (this.config.provider === 'local') {
      return this.embedLocal(texts);
    }
    return this.embedApi(texts);
  }

  /** 单条文本嵌入（便捷方法） */
  async embedOne(text: string): Promise<Float32Array> {
    const results = await this.embed([text]);
    return results[0];
  }

  /** 余弦相似度（两个向量） */
  static cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /** 反激活（释放模型内存） */
  deactivate(): void {
    this.localPipeline = null;
    this.initialized = false;
  }

  // ======================== L2: 本地模型 ========================

  /** 后台异步初始化本地模型 */
  private async initAsync(): Promise<void> {
    if (this.initialized || this.config?.provider !== 'local') return;
    try {
      log.info('[Embedding] 正在加载本地模型 all-MiniLM-L6-v2 ...');
      const { pipeline } = await import('@xenova/transformers');
      this.localPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
      this.initialized = true;
      log.info('[Embedding] 本地模型已就绪');
    } catch (err) {
      log.error('[Embedding] 本地模型加载失败:', err);
      // 静默回退：下一次 embed 调用时会报错
    }
  }

  private async embedLocal(texts: string[]): Promise<Float32Array[]> {
    if (!this.localPipeline) {
      // 首次调用时同步初始化
      await this.initAsync();
      if (!this.localPipeline) throw new Error('本地嵌入模型未就绪');
    }

    const pipe = this.localPipeline as {
      (text: string, opts: { pooling: string }): Promise<{ data: Float32Array }>;
    };

    const results: Float32Array[] = [];
    for (const text of texts) {
      const out = await pipe(text, { pooling: 'mean' });
      results.push(out.data);
    }
    return results;
  }

  // ======================== L3: API 接口槽 ========================

  /** 通过 OpenAI 兼容 API 生成嵌入（ollama / 任意兼容端点） */
  private async embedApi(texts: string[]): Promise<Float32Array[]> {
    if (!this.config?.apiUrl) throw new Error('未配置嵌入 API 端点');

    const url = this.config.apiUrl.replace(/\/$/, '') + '/embeddings';
    const model = this.config.apiModel || 'nomic-embed-text';

    const results: Float32Array[] = [];
    for (const text of texts) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, prompt: text }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => '')}`);
        const json = (await res.json()) as { embedding?: number[]; data?: Array<{ embedding: number[] }> };

        // 兼容两种响应格式：
        //   ollama: { embedding: [...] }
        //   openai: { data: [{ embedding: [...] }] }
        const raw = json.data?.[0]?.embedding || json.embedding;
        if (!raw || !Array.isArray(raw)) {
          throw new Error('API 未返回有效嵌入向量');
        }
        results.push(new Float32Array(raw));
      } catch (err) {
        log.error(`[Embedding] API 调用失败:`, err);
        throw err;
      }
    }
    return results;
  }
}