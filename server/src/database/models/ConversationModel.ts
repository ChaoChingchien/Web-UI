import { v4 as uuidv4 } from 'uuid';
import type { Conversation } from '@shared/types';
import { DatabaseManager } from '../DatabaseManager';

export class ConversationModel {
  static findAll(providerId?: string): Conversation[] {
    const db = DatabaseManager.getInstance().getDb();
    let query = 'SELECT * FROM conversations';
    const params: string[] = [];

    if (providerId) {
      query += ' WHERE provider_id = ?';
      params.push(providerId);
    }
    query += ' ORDER BY updated_at DESC';

    const stmt = db.prepare(query);
    if (params.length > 0) stmt.bind(params);

    const results: Conversation[] = [];
    while (stmt.step()) {
      results.push(this.rowToConversation(stmt.getAsObject()));
    }
    stmt.free();
    return results;
  }

  static findById(id: string): Conversation | null {
    const db = DatabaseManager.getInstance().getDb();
    const stmt = db.prepare('SELECT * FROM conversations WHERE id = ?');
    stmt.bind([id]);

    if (stmt.step()) {
      const row = this.rowToConversation(stmt.getAsObject());
      stmt.free();
      return row;
    }
    stmt.free();
    return null;
  }

  static create(providerId: string, title: string, opts?: { agent?: boolean; agentPrompt?: string }): Conversation {
    const db = DatabaseManager.getInstance().getDb();
    const id = uuidv4();
    const now = new Date().toISOString();

    db.run(
      'INSERT INTO conversations (id, provider_id, title, agent_mode, agent_system_prompt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, providerId, title, opts?.agent ? 1 : 0, opts?.agentPrompt || null, now, now]
    );

    DatabaseManager.getInstance().save();
    return { id, provider_id: providerId, title, agent_mode: opts?.agent, agent_system_prompt: opts?.agentPrompt, created_at: now, updated_at: now };
  }

  static delete(id: string): void {
    const db = DatabaseManager.getInstance().getDb();
    db.run('DELETE FROM messages WHERE conversation_id = ?', [id]);
    db.run('DELETE FROM conversations WHERE id = ?', [id]);
    DatabaseManager.getInstance().save();
  }

  static updateTitle(id: string, title: string): void {
    const db = DatabaseManager.getInstance().getDb();
    db.run("UPDATE conversations SET title = ?, updated_at = datetime('now') WHERE id = ?", [title, id]);
    DatabaseManager.getInstance().save();
  }

  static touch(id: string): void {
    const db = DatabaseManager.getInstance().getDb();
    db.run("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?", [id]);
    DatabaseManager.getInstance().save();
  }

  /** 更新对应的网页端真实对话 URL（web 自动化 provider 专用） */
  static updateWebUrl(id: string, webUrl: string): void {
    const db = DatabaseManager.getInstance().getDb();
    db.run("UPDATE conversations SET web_url = ?, updated_at = datetime('now') WHERE id = ?", [webUrl, id]);
    DatabaseManager.getInstance().save();
  }

  /** 启用/关闭当前对话的自动角色调度 */
  static setAutoDispatch(id: string, enabled: boolean): void {
    const db = DatabaseManager.getInstance().getDb();
    db.run(
      "UPDATE conversations SET auto_dispatch = ?, updated_at = datetime('now') WHERE id = ?",
      [enabled ? 1 : 0, id]
    );
    DatabaseManager.getInstance().save();
  }

  private static rowToConversation(row: Record<string, unknown>): Conversation {
    const webUrl = row.web_url;
    const autoDispatchRaw = row.auto_dispatch;
    const agentModeRaw = row.agent_mode;
    const agentPromptRaw = row.agent_system_prompt;
    return {
      id: row.id as string,
      provider_id: row.provider_id as string,
      title: row.title as string,
      web_url: (webUrl === null || webUrl === undefined) ? undefined : String(webUrl),
      auto_dispatch: autoDispatchRaw === null || autoDispatchRaw === undefined
        ? false
        : Boolean(Number(autoDispatchRaw)),
      agent_mode: agentModeRaw === null || agentModeRaw === undefined
        ? false
        : Boolean(Number(agentModeRaw)),
      agent_system_prompt: (agentPromptRaw === null || agentPromptRaw === undefined)
        ? undefined
        : String(agentPromptRaw),
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    };
  }

  /** 查询所有 Agent 对话 */
  static findAgents(): Conversation[] {
    const db = DatabaseManager.getInstance().getDb();
    const stmt = db.prepare('SELECT * FROM conversations WHERE agent_mode = 1 ORDER BY updated_at DESC');
    const results: Conversation[] = [];
    while (stmt.step()) {
      results.push(this.rowToConversation(stmt.getAsObject()));
    }
    stmt.free();
    return results;
  }

  /** 切换 Agent 模式下的 provider */
  static switchProvider(id: string, newProviderId: string): void {
    const db = DatabaseManager.getInstance().getDb();
    db.run("UPDATE conversations SET provider_id = ?, updated_at = datetime('now') WHERE id = ?", [newProviderId, id]);
    DatabaseManager.getInstance().save();
  }

  /** 设置 Agent 模式 */
  static setAgentMode(id: string, enabled: boolean, systemPrompt?: string): void {
    const db = DatabaseManager.getInstance().getDb();
    if (systemPrompt !== undefined) {
      db.run(
        "UPDATE conversations SET agent_mode = ?, agent_system_prompt = ?, updated_at = datetime('now') WHERE id = ?",
        [enabled ? 1 : 0, systemPrompt, id]
      );
    } else {
      db.run(
        "UPDATE conversations SET agent_mode = ?, updated_at = datetime('now') WHERE id = ?",
        [enabled ? 1 : 0, id]
      );
    }
    DatabaseManager.getInstance().save();
  }
}
