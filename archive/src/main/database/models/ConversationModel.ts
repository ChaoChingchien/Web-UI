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
      results.push(stmt.getAsObject() as unknown as Conversation);
    }
    stmt.free();
    return results;
  }

  static findById(id: string): Conversation | null {
    const db = DatabaseManager.getInstance().getDb();
    const stmt = db.prepare('SELECT * FROM conversations WHERE id = ?');
    stmt.bind([id]);

    if (stmt.step()) {
      const row = stmt.getAsObject() as unknown as Conversation;
      stmt.free();
      return row;
    }
    stmt.free();
    return null;
  }

  static create(providerId: string, title: string): Conversation {
    const db = DatabaseManager.getInstance().getDb();
    const id = uuidv4();
    const now = new Date().toISOString();

    db.run(
      'INSERT INTO conversations (id, provider_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [id, providerId, title, now, now]
    );

    DatabaseManager.getInstance().save();
    return { id, provider_id: providerId, title, created_at: now, updated_at: now };
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
}
