import { v4 as uuidv4 } from 'uuid';
import type { AITeam, AITeamWithRoles, AIRole, TeamRole } from '@shared/types';
import { DatabaseManager } from '../DatabaseManager';
import { RoleModel } from './RoleModel';

export class TeamModel {
  static findAll(): AITeamWithRoles[] {
    const db = DatabaseManager.getInstance().getDb();
    const stmt = db.prepare('SELECT * FROM teams ORDER BY created_at DESC');
    const results: AITeamWithRoles[] = [];

    while (stmt.step()) {
      const row = stmt.getAsObject();
      const team = this.rowToTeam(row);
      team.roles = this.getTeamRoles(team.id);
      results.push(team);
    }
    stmt.free();
    return results;
  }

  static findById(id: string): AITeamWithRoles | null {
    const db = DatabaseManager.getInstance().getDb();
    const stmt = db.prepare('SELECT * FROM teams WHERE id = ?');
    stmt.bind([id]);

    if (stmt.step()) {
      const team = this.rowToTeam(stmt.getAsObject());
      team.roles = this.getTeamRoles(team.id);
      stmt.free();
      return team;
    }
    stmt.free();
    return null;
  }

  static create(data: { name: string; description?: string; mode: AITeam['mode']; roleIds: { roleId: string; order: number; parallelGroup: number; inputMapping: TeamRole['input_mapping'] }[] }): AITeam {
    const db = DatabaseManager.getInstance().getDb();
    const id = uuidv4();
    const now = new Date().toISOString();

    db.run(
      'INSERT INTO teams (id, name, description, mode, config, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, data.name, data.description || '', data.mode, '{}', now, now]
    );

    for (const r of data.roleIds) {
      db.run(
        'INSERT INTO team_roles (id, team_id, role_id, role_order, parallel_group, input_mapping) VALUES (?, ?, ?, ?, ?, ?)',
        [uuidv4(), id, r.roleId, r.order, r.parallelGroup, r.inputMapping]
      );
    }

    DatabaseManager.getInstance().save();
    return { id, name: data.name, description: data.description || '', mode: data.mode, config: {}, created_at: now, updated_at: now, roles: [] } as AITeamWithRoles;
  }

  static update(id: string, data: Partial<AITeam> & { roleIds?: { roleId: string; order: number; parallelGroup: number; inputMapping: TeamRole['input_mapping'] }[] }): void {
    const fields: string[] = [];
    const values: (string | number)[] = [];

    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
    if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description); }
    if (data.mode !== undefined) { fields.push('mode = ?'); values.push(data.mode); }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')");
      values.push(id);
      const db = DatabaseManager.getInstance().getDb();
      db.run(`UPDATE teams SET ${fields.join(', ')} WHERE id = ?`, values);
    }

    if (data.roleIds) {
      const db = DatabaseManager.getInstance().getDb();
      db.run('DELETE FROM team_roles WHERE team_id = ?', [id]);
      for (const r of data.roleIds) {
        db.run(
          'INSERT INTO team_roles (id, team_id, role_id, role_order, parallel_group, input_mapping) VALUES (?, ?, ?, ?, ?, ?)',
          [uuidv4(), id, r.roleId, r.order, r.parallelGroup, r.inputMapping]
        );
      }
    }

    DatabaseManager.getInstance().save();
  }

  static delete(id: string): void {
    const db = DatabaseManager.getInstance().getDb();
    db.run('DELETE FROM team_roles WHERE team_id = ?', [id]);
    db.run('DELETE FROM teams WHERE id = ?', [id]);
    DatabaseManager.getInstance().save();
  }

  private static getTeamRoles(teamId: string): (TeamRole & { role: AIRole })[] {
    const db = DatabaseManager.getInstance().getDb();
    const stmt = db.prepare('SELECT * FROM team_roles WHERE team_id = ? ORDER BY role_order ASC');
    stmt.bind([teamId]);

    const results: (TeamRole & { role: AIRole })[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, unknown>;
      const role = RoleModel.findById(row.role_id as string);
      if (role) {
        results.push({
          id: row.id as string,
          team_id: row.team_id as string,
          role_id: row.role_id as string,
          role_order: row.role_order as number,
          parallel_group: row.parallel_group as number,
          input_mapping: row.input_mapping as TeamRole['input_mapping'],
          role,
        });
      }
    }
    stmt.free();
    return results;
  }

  private static rowToTeam(row: Record<string, unknown>): AITeamWithRoles {
    return {
      id: row.id as string,
      name: row.name as string,
      description: (row.description as string) || '',
      mode: row.mode as AITeam['mode'],
      config: {},
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
      roles: [],
    };
  }
}
