import { v4 as uuidv4 } from 'uuid';
import type { AITeam, AITeamWithRoles, AIRole, TeamRole } from '@shared/types';
import { DatabaseManager } from '../DatabaseManager';
import { ConversationModel } from './ConversationModel';
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

  static create(data: { name: string; description?: string; mode: AITeam['mode']; roleIds: { roleId: string; order: number; parallelGroup: number; inputMapping: TeamRole['input_mapping']; providerIds?: string[] }[] }): AITeam {
    const db = DatabaseManager.getInstance().getDb();
    const id = uuidv4();
    const now = new Date().toISOString();

    db.run(
      'INSERT INTO teams (id, name, description, mode, config, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, data.name, data.description || '', data.mode, '{}', now, now]
    );

    for (const r of data.roleIds) {
      const providerIdsJson = JSON.stringify(r.providerIds || []);
      const firstProviderId = (r.providerIds && r.providerIds.length > 0) ? r.providerIds[0] : null;

      // 自动为每个角色创建固定对话（仅在确实绑定了 provider 时）
      const roleObj = RoleModel.findById(r.roleId);
      const conversationProviderId = firstProviderId || roleObj?.provider_id || '';
      let conversationId: string | null = null;
      if (conversationProviderId) {
        const roleName = roleObj?.name || '角色';
        const conversation = ConversationModel.create(conversationProviderId, `${roleName} - ${data.name}`);
        conversationId = conversation.id;
      }

      db.run(
        'INSERT INTO team_roles (id, team_id, role_id, role_order, parallel_group, input_mapping, provider_override, provider_overrides, conversation_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [uuidv4(), id, r.roleId, r.order, r.parallelGroup, r.inputMapping, firstProviderId, providerIdsJson, conversationId]
      );
    }

    DatabaseManager.getInstance().save();
    return { id, name: data.name, description: data.description || '', mode: data.mode, config: {}, created_at: now, updated_at: now, roles: [] } as AITeamWithRoles;
  }

  static update(id: string, data: Partial<AITeam> & { roleIds?: { roleId: string; order: number; parallelGroup: number; inputMapping: TeamRole['input_mapping']; providerIds?: string[] }[] }): void {
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
      // 清理旧对话
      this.deleteRoleConversations(id);
      db.run('DELETE FROM team_roles WHERE team_id = ?', [id]);
      for (const r of data.roleIds) {
        const providerIdsJson = JSON.stringify(r.providerIds || []);
        const firstProviderId = (r.providerIds && r.providerIds.length > 0) ? r.providerIds[0] : null;

        // 自动为每个角色创建固定对话（仅在确实绑定了 provider 时）
        const roleObj = RoleModel.findById(r.roleId);
        const conversationProviderId = firstProviderId || roleObj?.provider_id || '';
        let conversationId: string | null = null;
        if (conversationProviderId) {
          const roleName = roleObj?.name || '角色';
          const conversation = ConversationModel.create(conversationProviderId, `${roleName} - ${data.name || ''}`);
          conversationId = conversation.id;
        }

        db.run(
          'INSERT INTO team_roles (id, team_id, role_id, role_order, parallel_group, input_mapping, provider_override, provider_overrides, conversation_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [uuidv4(), id, r.roleId, r.order, r.parallelGroup, r.inputMapping, firstProviderId, providerIdsJson, conversationId]
        );
      }
    }

    DatabaseManager.getInstance().save();
  }

  static delete(id: string): void {
    const db = DatabaseManager.getInstance().getDb();
    this.deleteRoleConversations(id);
    db.run('DELETE FROM team_roles WHERE team_id = ?', [id]);
    db.run('DELETE FROM teams WHERE id = ?', [id]);
    DatabaseManager.getInstance().save();
  }

  private static getTeamRoles(teamId: string): (TeamRole & { role: AIRole })[] {
    const db = DatabaseManager.getInstance().getDb();
    const stmt = db.prepare(
      `SELECT tr.id, tr.team_id, tr.role_id, tr.role_order, tr.parallel_group,
              tr.input_mapping, tr.provider_override, tr.provider_overrides, tr.conversation_id,
              r.name, r.icon, r.system_prompt, r.provider_id, r.config,
              r.is_custom, r.created_at as role_created_at, r.updated_at as role_updated_at
       FROM team_roles tr
       JOIN roles r ON tr.role_id = r.id
       WHERE tr.team_id = ?
       ORDER BY tr.role_order ASC`
    );
    stmt.bind([teamId]);

    const results: (TeamRole & { role: AIRole })[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, unknown>;
      const role: AIRole = {
        id: row.role_id as string,
        name: row.name as string,
        icon: (row.icon as string) || '🤖',
        system_prompt: (row.system_prompt as string) || '',
        provider_id: (row.provider_id as string) || '',
        config: {
          temperature: 0.7,
          max_tokens: 4096,
        },
        is_custom: Boolean(row.is_custom),
        created_at: row.role_created_at as string,
        updated_at: row.role_updated_at as string,
      };
      results.push({
        id: row.id as string,
        team_id: row.team_id as string,
        role_id: row.role_id as string,
        role_order: row.role_order as number,
        parallel_group: row.parallel_group as number,
        input_mapping: row.input_mapping as TeamRole['input_mapping'],
        provider_overrides: this.parseProviderOverrides(row.provider_overrides as string | undefined, row.provider_override as string | undefined),
        conversation_id: row.conversation_id as string | undefined,
        role,
      });
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

  /** 解析 provider_overrides，兼容旧版 provider_override */
  private static parseProviderOverrides(jsonVal: string | undefined, legacyVal: string | undefined): string[] {
    if (jsonVal) {
      try {
        const parsed = JSON.parse(jsonVal);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch { /* fall through */ }
    }
    if (legacyVal) return [legacyVal];
    return [];
  }

  /** 清理 Team 下所有角色的固定对话 */
  private static deleteRoleConversations(teamId: string): void {
    const db = DatabaseManager.getInstance().getDb();
    const stmt = db.prepare('SELECT conversation_id FROM team_roles WHERE team_id = ? AND conversation_id IS NOT NULL');
    stmt.bind([teamId]);
    const ids: string[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as { conversation_id: string };
      ids.push(row.conversation_id);
    }
    stmt.free();
    for (const id of ids) {
      ConversationModel.delete(id);
    }
  }
}
