import type { AITeamWithRoles, TeamLogEvent } from '@shared/types';
import { TeamRunModel } from '../database/models';
import { PipelineExecutor } from './PipelineExecutor';
import { ParallelExecutor } from './ParallelExecutor';
import { DebateExecutor } from './DebateExecutor';
import { log } from '../platform';

/** ============================================
 *  AI Team 执行引擎
 *  支持流水线 / 并行 / 讨论 / 混合模式
 *  ============================================ */

export class TeamEngine {
  private pipelineExecutor = new PipelineExecutor();
  private parallelExecutor = new ParallelExecutor();
  private debateExecutor = new DebateExecutor();
  private runningRuns: Map<string, { cancelled: boolean }> = new Map();

  /** 执行 Team 任务 */
  async run(
    team: AITeamWithRoles,
    input: string,
    onLog: (event: TeamLogEvent) => void
  ): Promise<string> {
    const runId = crypto.randomUUID();
    this.runningRuns.set(runId, { cancelled: false });

    log.info(`[Team] 开始执行 ${team.name}, 模式: ${team.mode}, 角色数: ${team.roles.length}`);

    TeamRunModel.create({
      id: runId,
      team_id: team.id,
      input,
      status: 'running',
    });

    try {
      let finalOutput: string;

      switch (team.mode) {
        case 'pipeline':
          finalOutput = await this.pipelineExecutor.run(runId, team, input, onLog, () => this.isCancelled(runId));
          break;
        case 'parallel':
          finalOutput = await this.parallelExecutor.run(runId, team, input, onLog, () => this.isCancelled(runId));
          break;
        case 'debate':
          finalOutput = await this.debateExecutor.run(runId, team, input, onLog, () => this.isCancelled(runId));
          break;
        case 'mixed':
          finalOutput = await this.runMixed(runId, team, input, onLog);
          break;
        default:
          throw new Error(`未知的 Team 模式: ${team.mode}`);
      }

      TeamRunModel.update(runId, { status: 'completed', final_output: finalOutput });
      onLog({ runId, type: 'team_complete', content: finalOutput });
      return finalOutput;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      TeamRunModel.update(runId, { status: 'failed', final_output: errMsg });
      onLog({ runId, type: 'team_error', error: errMsg });
      throw err;
    } finally {
      this.runningRuns.delete(runId);
    }
  }

  /** 停止执行 */
  stop(runId: string): void {
    const run = this.runningRuns.get(runId);
    if (run) run.cancelled = true;
    this.runningRuns.delete(runId);
    TeamRunModel.update(runId, { status: 'stopped' });
  }

  /** 检查是否被取消 */
  private isCancelled(runId: string): boolean {
    return this.runningRuns.get(runId)?.cancelled ?? true;
  }

  // ===== 混合模式 =====

  private async runMixed(
    runId: string,
    team: AITeamWithRoles,
    input: string,
    onLog: (event: TeamLogEvent) => void
  ): Promise<string> {
    const groups = new Map<number, typeof team.roles>();
    for (const tr of team.roles) {
      const g = tr.parallel_group;
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(tr);
    }

    const sortedGroups = [...groups.entries()].sort(([a], [b]) => a - b);
    let currentInput = input;

    for (const [, groupRoles] of sortedGroups) {
      if (this.isCancelled(runId)) throw new Error('执行已取消');

      const groupTeam: AITeamWithRoles = { ...team, roles: groupRoles };
      if (groupRoles.length === 1) {
        currentInput = await this.pipelineExecutor.run(runId, groupTeam, currentInput, onLog, () => this.isCancelled(runId));
      } else {
        currentInput = await this.parallelExecutor.run(runId, groupTeam, currentInput, onLog, () => this.isCancelled(runId));
      }
    }

    return currentInput;
  }
}
