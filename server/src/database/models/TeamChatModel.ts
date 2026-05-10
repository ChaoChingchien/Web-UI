import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../DatabaseManager';

export interface TeamChatMessage {
  id: string;
  team_id: string;
  role_id: string | null;
  role_name: string | null;
  role_icon: string;
  role: 'user' | 'assistant';
  content: string;
  status: 'streaming' | 'done' | 'error';
  created_at: string;
}

export const TeamChatModel = {
  findByTeam(teamId: string): TeamChatMessage[] {
    const db = DatabaseManager.getInstance().getDb();
    const stmt = db.prepare(
      'SELECT * FROM team_chat_messages WHERE team_id = ? ORDER BY created_at ASC'
    );
    stmt.bind([teamId]);
    const results: TeamChatMessage[] = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject() as unknown as TeamChatMessage);
    }
    stmt.free();
    return results;
  },

  create(data: {
    team_id: string;
    role_id?: string;
    role_name?: string;
    role_icon?: string;
    role: 'user' | 'assistant';
    content?: string;
    status?: 'streaming' | 'done' | 'error';
  }): TeamChatMessage {
    const db = DatabaseManager.getInstance().getDb();
    const id = uuidv4();
    const now = new Date().toISOString();

    db.run(
      `INSERT INTO team_chat_messages (id, team_id, role_id, role_name, role_icon, role, content, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.team_id,
        data.role_id || null,
        data.role_name || null,
        data.role_icon || '🤖',
        data.role,
        data.content || '',
        data.status || 'streaming',
        now,
      ]
    );

    DatabaseManager.getInstance().save();
    return { id, team_id: data.team_id, role_id: data.role_id || null, role_name: data.role_name || null, role_icon: data.role_icon || '🤖', role: data.role, content: data.content || '', status: data.status || 'streaming', created_at: now };
  },

  update(id: string, data: { content?: string; status?: 'streaming' | 'done' | 'error' }): void {
    const fields: string[] = [];
    const values: (string | number)[] = [];

    if (data.content !== undefined) { fields.push('content = ?'); values.push(data.content); }
    if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status); }

    if (fields.length === 0) return;

    values.push(id);
    const db = DatabaseManager.getInstance().getDb();
    db.run(`UPDATE team_chat_messages SET ${fields.join(', ')} WHERE id = ?`, values);
    DatabaseManager.getInstance().save();
  },

  deleteByTeam(teamId: string): void {
    const db = DatabaseManager.getInstance().getDb();
    db.run('DELETE FROM team_chat_messages WHERE team_id = ?', [teamId]);
    DatabaseManager.getInstance().save();
  },
};
