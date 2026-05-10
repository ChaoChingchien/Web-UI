import type { AITeamWithRoles, TeamLogEvent, InputMapping } from '@shared/types';
import { BaseExecutor } from './BaseExecutor';

/** 并行执行器 — 多个角色同时处理同一任务的不同方面，最后汇总 */
export class ParallelExecutor extends BaseExecutor {
  async run(
    runId: string,
    team: AITeamWithRoles,
    input: string,
    onLog: (event: TeamLogEvent) => void,
    isCancelled: () => boolean,
  ): Promise<string> {
    const sortedRoles = [...team.roles].sort((a, b) => a.role_order - b.role_order);

    const promises = sortedRoles.map((teamRole) => {
      const roleInput = this.resolveInput(input, teamRole.input_mapping);
      return this.executeRole(runId, teamRole.role, roleInput, onLog, 'Parallel');
    });

    const results = await Promise.all(promises);

    // 用最后一个角色汇总
    const summaryRole = sortedRoles[sortedRoles.length - 1]?.role;
    if (summaryRole && sortedRoles.length > 1) {
      if (isCancelled()) throw new Error('执行已取消');
      const summaryInput = `请汇总以下多个 AI 的分析结果，给出综合结论：\n\n${results.map((r, i) => `=== 分析 ${i + 1} ===\n${r}`).join('\n\n')}`;
      return this.executeRole(runId, summaryRole, summaryInput, onLog, 'Parallel');
    }

    return results.join('\n\n---\n\n');
  }

  private resolveInput(originalInput: string, mapping: InputMapping): string {
    switch (mapping) {
      case 'original':
      default:
        return originalInput;
    }
  }
}
