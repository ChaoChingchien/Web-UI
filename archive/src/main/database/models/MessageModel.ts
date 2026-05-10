import { v4 as uuidv4 } from 'uuid';
import type { Message } from '@shared/types';
import { DatabaseManager } from '../DatabaseManager';

export class MessageModel {
  static findByConversation(conversationId: string): Message[] {
    const db = DatabaseManager.getInstance().getDb();
    const stmt = db.prepare(
      'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC'
    );
    stmt.bind([conversationId]);

    const results: Message[] = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject() as unknown as Message);
    }
    stmt.free();
    return results;
  }

  static create(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string
  ): Message {
    const db = DatabaseManager.getInstance().getDb();
    const id = uuidv4();
    const now = new Date().toISOString();

    db.run(
      'INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)',
      [id, conversationId, role, content, now]
    );

    DatabaseManager.getInstance().save();
    return { id, conversation_id: conversationId, role, content, created_at: now };
  }

  static search(query: string): Message[] {
    const db = DatabaseManager.getInstance().getDb();
    const stmt = db.prepare(
      `SELECT m.*, c.title as conversation_title FROM messages m
       JOIN conversations c ON m.conversation_id = c.id
       WHERE m.content LIKE ?
       ORDER BY m.created_at DESC LIMIT 50`
    );
    stmt.bind([`%${query}%`]);

    const results: Message[] = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject() as unknown as Message);
    }
    stmt.free();
    return results;
  }

  static deleteByConversation(conversationId: string): void {
    const db = DatabaseManager.getInstance().getDb();
    db.run('DELETE FROM messages WHERE conversation_id = ?', [conversationId]);
    DatabaseManager.getInstance().save();
  }
}
