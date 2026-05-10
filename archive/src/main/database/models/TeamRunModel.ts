import type { TeamRun, RoleOutput } from '@shared/types';
import { DatabaseManager } from '../DatabaseManager';

export class TeamRunModel {
  static findById(id: string): TeamRun | null {
    const db = DatabaseManager.getInstance().getDb();
    const stmt = db.prepare('SELECT * FROM team_runs WHERE id = ?');
    stmt.bind([id]);
    if (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, unknown>;
      stmt.free();
      return {
        id: row.id as string,
        team_id: row.team_id as string,
        input: row.input as string,
        status: row.status as TeamRun['status'],
        final_output: (row.final_output as string) || '',
        started_at: row.started_at as string,
        completed_at: (row.completed_at as string) || undefined,
      };
    }
    stmt.free();
    return null;
  }

  static findAll(teamId?: string): TeamRun[] {
    const db = DatabaseManager.getInstance().getDb();
    let query = 'SELECT * FROM team_runs';
    const params: string[] = [];

    if (teamId) {
      query += ' WHERE team_id = ?';
      params.push(teamId);
    }
    query += ' ORDER BY started_at DESC';

    const stmt = db.prepare(query);
    if (params.length > 0) stmt.bind(params);

    const results: TeamRun[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, unknown>;
      results.push({
        id: row.id as string,
        team_id: row.team_id as string,
        input: row.input as string,
        status: row.status as TeamRun['status'],
        final_output: (row.final_output as string) || '',
        started_at: row.started_at as string,
        completed_at: (row.completed_at as string) || undefined,
      });
    }
    stmt.free();
    return results;
  }

  static create(data: { id: string; team_id: string; input: string; status: TeamRun['status'] }): void {
    const db = DatabaseManager.getInstance().getDb();
    db.run(
      'INSERT INTO team_runs (id, team_id, input, status, started_at) VALUES (?, ?, ?, ?, ?)',
      [data.id, data.team_id, data.input, data.status, new Date().toISOString()]
    );
    DatabaseManager.getInstance().save();
  }

  static update(id: string, data: Partial<TeamRun>): void {
    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status); }
    if (data.final_output !== undefined) { fields.push('final_output = ?'); values.push(data.final_output); }
    if (data.status === 'completed' || data.status === 'failed' || data.status === 'stopped') {
      fields.push('completed_at = ?'); values.push(new Date().toISOString());
    }

    if (fields.length > 0) {
      values.push(id);
      const db = DatabaseManager.getInstance().getDb();
      db.run(`UPDATE team_runs SET ${fields.join(', ')} WHERE id = ?`, values);
      DatabaseManager.getInstance().save();
    }
  }
}

export class TeamRunOutputModel {
  static create(data: { id: string; run_id: string; role_id: string; role_name: string; input_text: string; status: RoleOutput['status'] }): void {
    const db = DatabaseManager.getInstance().getDb();
    db.run(
      'INSERT INTO team_run_outputs (id, run_id, role_id, role_name, input_text, output_text, status, error_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [data.id, data.run_id, data.role_id, data.role_name, data.input_text, '', data.status, '']
    );
    DatabaseManager.getInstance().save();
  }

  static update(id: string, data: Partial<RoleOutput>): void {
    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    if (data.output_text !== undefined) { fields.push('output_text = ?'); values.push(data.output_text); }
    if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status); }
    if (data.error_text !== undefined) { fields.push('error_text = ?'); values.push(data.error_text); }
    if (data.completed_at) { fields.push('completed_at = ?'); values.push(data.completed_at); }

    if (fields.length > 0) {
      values.push(id);
      const db = DatabaseManager.getInstance().getDb();
      db.run(`UPDATE team_run_outputs SET ${fields.join(', ')} WHERE id = ?`, values);
      DatabaseManager.getInstance().save();
    }
  }

  static findByRunId(runId: string): RoleOutput[] {
    const db = DatabaseManager.getInstance().getDb();
    const stmt = db.prepare('SELECT * FROM team_run_outputs WHERE run_id = ? ORDER BY rowid ASC');
    stmt.bind([runId]);

    const results: RoleOutput[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, unknown>;
      results.push({
        id: row.id as string,
        run_id: row.run_id as string,
        role_id: row.role_id as string,
        role_name: row.role_name as string,
        input_text: (row.input_text as string) || '',
        output_text: (row.output_text as string) || '',
        status: row.status as RoleOutput['status'],
        error_text: (row.error_text as string) || '',
        started_at: (row.started_at as string) || undefined,
        completed_at: (row.completed_at as string) || undefined,
      });
    }
    stmt.free();
    return results;
  }
}
