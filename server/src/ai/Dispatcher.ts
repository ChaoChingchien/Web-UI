import type { AIRole, AIProvider } from '@shared/types';
import { AIRouter } from './AIRouter';
import { ProviderModel } from '../database/models';
import { log } from '../platform';

interface DispatchDecision {
  roleId: string;
  reason: string;
}

/** ============================================
 *  自动调度器
 *  用一个便宜的 LLM 分类器从可用角色中挑出最合适的一个。
 *  对外部调用者不抛异常；解析失败就返回 null，调用方兜底到"不调度"。
 *  ============================================ */
export class Dispatcher {
  private router = new AIRouter();

  /** 挑选一个便宜且可用的 provider 作为分类器。返回 null 表示没有可用。 */
  private pickClassifierProvider(): AIProvider | null {
    const all = ProviderModel.findAll().filter((p) => p.is_enabled);
    return (
      all.find((p) => p.type === 'api' && !!p.api_config?.apiKey) ||
      all.find((p) => p.type === 'local') ||
      all.find((p) => p.type === 'web') ||
      null
    );
  }

  /**
   * 让分类器挑一个角色。用户消息 + 最近 2-3 轮上下文 + 角色短描述 → 返回 {roleId, reason}，或 null。
   */
  async dispatch(
    message: string,
    roles: AIRole[],
    recentTurns: { role: string; content: string }[] = []
  ): Promise<DispatchDecision | null> {
    const provider = this.pickClassifierProvider();
    if (!provider || roles.length === 0) return null;

    const roleBriefs = roles
      .map((r) => {
        const summary = (r.system_prompt || '').replace(/\s+/g, ' ').slice(0, 60);
        return `- ${r.id}: ${r.icon} ${r.name} — ${summary}`;
      })
      .join('\n');

    const contextBlock = recentTurns.length
      ? `最近对话:\n${recentTurns.map((t) => `${t.role}: ${t.content.slice(0, 200)}`).join('\n')}\n\n`
      : '';

    const system = `你是一个请求分类器。根据用户消息从下列角色列表选出最合适的一个。
只返回严格的 JSON，不要解释、不要代码块。格式: {"role_id": "role_xxx", "reason": "一句 ≤30 字中文说明"}
role_id 必须在列表中。若任何一个都不合适，返回 {"role_id": null, "reason": "..."}。

可用角色:
${roleBriefs}`;

    const userContent = `${contextBlock}用户消息: ${message}`;

    try {
      const raw = await this.router.chat(provider, [
        { role: 'system', content: system },
        { role: 'user', content: userContent },
      ]);
      const match = raw.match(/\{[\s\S]*?\}/);
      if (!match) return null;
      const parsed = JSON.parse(match[0]) as { role_id?: string | null; reason?: string };
      const roleId = parsed.role_id;
      if (!roleId) return null;
      if (!roles.some((r) => r.id === roleId)) {
        log.warn(`[Dispatcher] 分类器返回未知 role_id: ${roleId}`);
        return null;
      }
      return { roleId, reason: parsed.reason?.slice(0, 80) || '' };
    } catch (err) {
      log.warn(`[Dispatcher] 分类失败:`, err);
      return null;
    }
  }
}
