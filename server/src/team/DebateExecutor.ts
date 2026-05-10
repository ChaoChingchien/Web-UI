import type { AITeamWithRoles, TeamLogEvent, InputMapping } from '@shared/types';
import { BaseExecutor } from './BaseExecutor';

/** 讨论执行器 — 多轮辩论，最后总结 */
export class DebateExecutor extends BaseExecutor {
  private maxRounds = 3;

  async run(
    runId: string,
    team: AITeamWithRoles,
    input: string,
    onLog: (event: TeamLogEvent) => void,
    isCancelled: () => boolean,
  ): Promise<string> {
    const sortedRoles = [...team.roles].sort((a, b) => a.role_order - b.role_order);
    if (sortedRoles.length < 2) throw new Error('讨论模式至少需要 2 个角色');

    const allOutputs: { role: string; content: string }[] = [];

    for (let round = 0; round < this.maxRounds; round++) {
      if (isCancelled()) throw new Error('执行已取消');

      for (const teamRole of sortedRoles) {
        if (isCancelled()) throw new Error('执行已取消');

        const roundInput = this.resolveInput(input, allOutputs, teamRole, round);

        const output = await this.executeRole(runId, teamRole.role, roundInput, onLog, 'Debate');
        allOutputs.push({ role: teamRole.role.name, content: output });
      }
    }

    // 最后一个角色做总结
    const lastRole = sortedRoles[sortedRoles.length - 1].role;
    const summaryInput = `${lastRole.system_prompt}\n\n请总结以下讨论，给出平衡的观点：\n\n${allOutputs.map((o) => `【${o.role}】\n${o.content}`).join('\n\n')}`;
    return this.executeRole(runId, lastRole, summaryInput, onLog, 'Debate');
  }

  private resolveInput(
    topic: string,
    allOutputs: { role: string; content: string }[],
    teamRole: { role: { system_prompt: string }; input_mapping: InputMapping },
    round: number,
  ): string {
    const rolePrompt = teamRole.role.system_prompt;
    const mapping = teamRole.input_mapping;

    if (mapping === 'original') {
      return `${rolePrompt}\n\n讨论主题：${topic}\n\n请发表你的观点。`;
    }

    const discussionLog = allOutputs.length > 0
      ? `\n\n之前的讨论：\n${allOutputs.map((o) => `${o.role}: ${o.content}`).join('\n\n')}`
      : '';

    if (round === 0) {
      return `${rolePrompt}\n\n讨论主题：${topic}\n\n请发表你的观点。`;
    }

    if (mapping === 'all_previous') {
      return `${rolePrompt}\n\n讨论主题：${topic}\n\n所有角色迄今观点：\n${discussionLog}\n\n请综合回应所有人的观点并发表你的看法。`;
    }

    // 'previous' — 只参考上一个发言者
    const lastOutput = allOutputs.length > 0 ? `\n\n上一轮发言：\n${allOutputs[allOutputs.length - 1].role}: ${allOutputs[allOutputs.length - 1].content}` : '';
    return `${rolePrompt}\n\n讨论主题：${topic}${lastOutput}\n\n请回应上一轮发言并发表你的观点。`;
  }
}
