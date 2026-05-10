import type { AITeamWithRoles, TeamLogEvent, InputMapping } from '@shared/types';
import { BaseExecutor } from './BaseExecutor';

/** 流水线执行器 — 角色按顺序处理，上一轮输出作为下一轮输入 */
export class PipelineExecutor extends BaseExecutor {
  async run(
    runId: string,
    team: AITeamWithRoles,
    input: string,
    onLog: (event: TeamLogEvent) => void,
    isCancelled: () => boolean,
  ): Promise<string> {
    const sortedRoles = [...team.roles].sort((a, b) => a.role_order - b.role_order);
    let currentInput = input;
    const allOutputs: string[] = [];

    for (const teamRole of sortedRoles) {
      if (isCancelled()) throw new Error('执行已取消');
      const roleInput = this.resolveInput(input, currentInput, allOutputs, teamRole.input_mapping);
      const output = await this.executeRole(runId, teamRole.role, roleInput, onLog, 'Pipeline');
      allOutputs.push(output);
      currentInput = output;
    }

    return currentInput;
  }

  private resolveInput(
    originalInput: string,
    previousOutput: string,
    allOutputs: string[],
    mapping: InputMapping,
  ): string {
    switch (mapping) {
      case 'original':
        return originalInput;
      case 'all_previous':
        if (allOutputs.length === 0) return originalInput;
        return allOutputs.map((o, i) => `=== 第 ${i + 1} 步输出 ===\n${o}`).join('\n\n') + '\n\n---\n请基于以上所有输出继续处理。';
      case 'previous':
      default:
        return previousOutput;
    }
  }
}
