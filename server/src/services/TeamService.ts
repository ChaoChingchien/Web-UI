import type { AITeamWithRoles } from '@shared/types';
import { TeamEngine } from '../team/TeamEngine';
import { TeamModel, TeamRunModel } from '../database/models';

export async function executeTeam(
  teamId: string,
  input: string,
  callbacks: {
    onLog: (event: { type: string; roleName?: string; content?: string; error?: string }) => void;
  }
): Promise<string> {
  const team = TeamModel.findById(teamId) as AITeamWithRoles | null;
  if (!team) throw new Error('Team 不存在');

  const engine = new TeamEngine(team);

  const runId = TeamRunModel.create({
    team_id: teamId,
    input,
    status: 'running',
  });

  try {
    const result = await engine.execute(input, (roleId, roleName, status, output) => {
      callbacks.onLog({
        type: status === 'running'
          ? 'role_start'
          : status === 'done'
          ? 'role_complete'
          : 'role_error',
        roleName,
        content: output,
      });
    });

    TeamRunModel.update(runId, {
      status: 'completed',
      final_output: result,
      completed_at: new Date().toISOString(),
    });

    callbacks.onLog({ type: 'team_complete', content: result });
    return result;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    TeamRunModel.update(runId, {
      status: 'failed',
      final_output: '',
      completed_at: new Date().toISOString(),
    });
    callbacks.onLog({ type: 'team_error', error: errorMsg });
    throw err;
  }
}
