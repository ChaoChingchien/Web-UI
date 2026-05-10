import type { AIRole, TeamLogEvent } from '@shared/types';
import { ProviderModel, TeamRunOutputModel } from '../database/models';
import { AIRouter } from '../ai/AIRouter';
import { log } from '../platform';

/** 执行器基类 — 提供共享的角色执行逻辑 */
export abstract class BaseExecutor {
  protected router = new AIRouter();

  protected async executeRole(
    runId: string,
    role: AIRole,
    input: string,
    onLog: (event: TeamLogEvent) => void,
    label: string,
  ): Promise<string> {
    log.info(`[${label}] 执行角色: ${role.name}`);

    const outputId = crypto.randomUUID();
    TeamRunOutputModel.create({
      id: outputId,
      run_id: runId,
      role_id: role.id,
      role_name: role.name,
      input_text: input.substring(0, 500),
      status: 'running',
    });

    onLog({ runId, type: 'role_start', roleId: role.id, roleName: role.name });

    try {
      const provider = ProviderModel.findById(role.provider_id);
      if (!provider) throw new Error(`角色 ${role.name} 的提供商不存在`);

      const messages = [
        { role: 'system' as const, content: role.system_prompt },
        { role: 'user' as const, content: input },
      ];

      const output = await this.router.chat(provider, messages);

      TeamRunOutputModel.update(outputId, {
        output_text: output,
        status: 'done',
        completed_at: new Date().toISOString(),
      });

      onLog({ runId, type: 'role_complete', roleId: role.id, roleName: role.name, content: output });
      return output;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      TeamRunOutputModel.update(outputId, {
        status: 'error',
        error_text: errMsg,
        completed_at: new Date().toISOString(),
      });
      onLog({ runId, type: 'role_error', roleId: role.id, roleName: role.name, error: errMsg });
      throw err;
    }
  }
}
