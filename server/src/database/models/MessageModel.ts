import { v4 as uuidv4 } from 'uuid';
import type { Message } from '@shared/types';
import { DatabaseManager } from '../DatabaseManager';

/** ============================================
 *  MessageModel — 带有内存反向索引的全文搜索
 *
 *  FTS5 在 sql.js/WASM 中通常不可用，因此我们在内存中维护
 *  一个反向索引 (normalized word → Set of message IDs)。
 *  索引在首次搜索时惰性构建，并在创建/删除消息时增量更新。
 *  ============================================ */

export class MessageModel {
  // ---- In-Memory Inverted Index ----
  private static invertedIndex: Map<string, Set<string>> = new Map();       // word → Set<messageId>
  private static titleIndex: Map<string, Set<string>> = new Map();           // word → Set<conversationId>
  private static indexBuilt = false;

  /** 标准化并分词：小写、去标点、按空白分割 */
  private static tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s一-鿿]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 0);
  }

  /** 惰性构建索引：从 messages 表中读取所有消息 + 对话标题 */
  static buildIndex(): void {
    if (MessageModel.indexBuilt) return;

    const db = DatabaseManager.getInstance().getDb();
    const index = new Map<string, Set<string>>();
    const titleIdx = new Map<string, Set<string>>();

    const stmt = db.prepare('SELECT id, content FROM messages');
    while (stmt.step()) {
      const row = stmt.getAsObject() as { id: string; content: string };
      const words = MessageModel.tokenize(row.content);
      for (const word of words) {
        if (!index.has(word)) {
          index.set(word, new Set());
        }
        index.get(word)!.add(row.id);
      }
    }
    stmt.free();

    // 同时索引对话标题
    const titleStmt = db.prepare('SELECT id, title FROM conversations');
    while (titleStmt.step()) {
      const row = titleStmt.getAsObject() as { id: string; title: string };
      const words = MessageModel.tokenize(row.title);
      for (const word of words) {
        if (!titleIdx.has(word)) {
          titleIdx.set(word, new Set());
        }
        titleIdx.get(word)!.add(row.id);
      }
    }
    titleStmt.free();

    MessageModel.invertedIndex = index;
    MessageModel.titleIndex = titleIdx;
    MessageModel.indexBuilt = true;
  }

  /** 向索引中添加一条消息 */
  private static indexMessage(id: string, content: string): void {
    if (!MessageModel.indexBuilt) return; // 未构建则不更新
    const words = MessageModel.tokenize(content);
    for (const word of words) {
      if (!MessageModel.invertedIndex.has(word)) {
        MessageModel.invertedIndex.set(word, new Set());
      }
      MessageModel.invertedIndex.get(word)!.add(id);
    }
  }

  /** 从索引中移除一条消息 */
  private static removeFromIndex(id: string): void {
    if (!MessageModel.indexBuilt) return;
    for (const [, ids] of MessageModel.invertedIndex) {
      ids.delete(id);
    }
  }

  /** 使索引失效（如从磁盘重新加载 DB 后调用） */
  static invalidateIndex(): void {
    MessageModel.invertedIndex = new Map();
    MessageModel.titleIndex = new Map();
    MessageModel.indexBuilt = false;
  }

  static findByConversation(conversationId: string): Message[] {
    const db = DatabaseManager.getInstance().getDb();
    const stmt = db.prepare(
      'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC'
    );
    stmt.bind([conversationId]);

    const results: Message[] = [];
    while (stmt.step()) {
      results.push(MessageModel.rowToMessage(stmt.getAsObject()));
    }
    stmt.free();
    return results;
  }

  static create(
    conversationId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    extras?: { dispatchedRoleId?: string; dispatchReason?: string }
  ): Message {
    const db = DatabaseManager.getInstance().getDb();
    const id = uuidv4();
    const now = new Date().toISOString();

    const dispatchedRoleId = extras?.dispatchedRoleId ?? null;
    const dispatchReason = extras?.dispatchReason ?? null;

    db.run(
      'INSERT INTO messages (id, conversation_id, role, content, created_at, dispatched_role_id, dispatch_reason) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, conversationId, role, content, now, dispatchedRoleId, dispatchReason]
    );

    MessageModel.indexMessage(id, content);
    DatabaseManager.getInstance().save();
    return {
      id,
      conversation_id: conversationId,
      role,
      content,
      created_at: now,
      ...(extras?.dispatchedRoleId ? { dispatched_role_id: extras.dispatchedRoleId } : {}),
      ...(extras?.dispatchReason ? { dispatch_reason: extras.dispatchReason } : {}),
    };
  }

  /** 把 DB 行映射为 Message 对象，规范化可选字段 */
  private static rowToMessage(row: Record<string, unknown>): Message {
    const dispatchedRoleId = row.dispatched_role_id;
    const dispatchReason = row.dispatch_reason;
    return {
      id: row.id as string,
      conversation_id: row.conversation_id as string,
      role: row.role as 'user' | 'assistant' | 'system',
      content: (row.content as string) ?? '',
      created_at: row.created_at as string,
      ...(dispatchedRoleId ? { dispatched_role_id: String(dispatchedRoleId) } : {}),
      ...(dispatchReason ? { dispatch_reason: String(dispatchReason) } : {}),
    };
  }

  /** FTS5 + 内存反向索引双保险搜索 */
  static search(query: string): Message[] {
    const db = DatabaseManager.getInstance().getDb();

    // 1. 尝试 FTS5（如果迁移成功）
    const canUseFts = MessageModel.tryFtsSearch(db, query);
    if (canUseFts !== null) {
      return canUseFts;
    }

    // 2. 回退到内存反向索引
    MessageModel.buildIndex();

    const queryWords = MessageModel.tokenize(query);
    if (queryWords.length === 0) return [];

    // 对内容索引中的所有查询词求交集（AND 语义）
    let candidateIds: Set<string> | null = null;
    for (const word of queryWords) {
      const ids = MessageModel.invertedIndex.get(word);
      if (!ids || ids.size === 0) {
        // 内容索引无命中，不返回空——标题索引可能还有匹配
        candidateIds = new Set();
        break;
      }
      if (candidateIds === null) {
        candidateIds = new Set(ids);
      } else {
        candidateIds = new Set([...candidateIds].filter((id: string) => ids.has(id)));
      }
    }

    // 同时检查标题索引：将标题匹配的对话中的所有消息也加入结果
    let titleConvIds: Set<string> | null = null;
    for (const word of queryWords) {
      const convIds = MessageModel.titleIndex.get(word);
      if (!convIds || convIds.size === 0) {
        titleConvIds = null;
        break;
      }
      if (titleConvIds === null) {
        titleConvIds = new Set(convIds);
      } else {
        titleConvIds = new Set([...titleConvIds].filter((id: string) => convIds.has(id)));
      }
    }

    // 如果标题索引有命中，将对应对话中的所有消息加入候选
    if (titleConvIds && titleConvIds.size > 0) {
      if (!candidateIds) candidateIds = new Set();
      const db2 = DatabaseManager.getInstance().getDb();
      for (const convId of titleConvIds) {
        const mStmt = db2.prepare('SELECT id FROM messages WHERE conversation_id = ?');
        mStmt.bind([convId]);
        while (mStmt.step()) {
          candidateIds.add((mStmt.getAsObject() as { id: string }).id);
        }
        mStmt.free();
      }
    }

    if (!candidateIds || candidateIds.size === 0) return [];

    // 按匹配单词数排序（内容索引匹配 + 标题索引匹配）
    const scoredIds = [...candidateIds].map((id: string) => {
      let score = 0;
      for (const word of queryWords) {
        if (MessageModel.invertedIndex.get(word)?.has(id)) {
          score++;
        }
      }
      return { id, score };
    });
    scoredIds.sort((a, b) => b.score - a.score);

    // 取前 50 个，获取完整消息行
    const topIds = scoredIds.slice(0, 50).map((s) => s.id);
    const results: Message[] = [];
    for (const msgId of topIds) {
      const msg = MessageModel.fetchMessageWithTitle(db, msgId);
      if (msg) results.push(msg);
    }

    return results;
  }

  /** 尝试通过 FTS5 搜索；若失败则返回 null */
  private static tryFtsSearch(db: ReturnType<typeof DatabaseManager.prototype.getDb>, query: string): Message[] | null {
    try {
      const ftsQuery = query
        .split(/\s+/)
        .filter((w) => w.length > 0)
        .map((w) => `"${w.replace(/"/g, '""')}"`)
        .join(' AND ');

      if (!ftsQuery) return [];

      // 内容 FTS5 + 标题 LIKE 联合搜索
      const stmt = db.prepare(
        `SELECT * FROM (
           SELECT m.*, c.title as conversation_title, rank FROM messages_fts f
           JOIN messages m ON f.rowid = m.rowid
           JOIN conversations c ON m.conversation_id = c.id
           WHERE messages_fts MATCH ?
           UNION ALL
           SELECT m.*, c.title as conversation_title, NULL as rank FROM conversations c
           JOIN messages m ON m.conversation_id = c.id
           WHERE c.title LIKE ?
         )
         ORDER BY rank IS NULL, rank LIMIT 50`
      );
      stmt.bind([ftsQuery, `%${query}%`]);

      const results: Message[] = [];
      while (stmt.step()) {
        results.push(MessageModel.rowToMessage(stmt.getAsObject()));
      }
      stmt.free();
      return results;
    } catch {
      return null;
    }
  }

  /** 获取单条消息及其会话标题 */
  private static fetchMessageWithTitle(db: ReturnType<typeof DatabaseManager.prototype.getDb>, id: string): Message | null {
    const stmt = db.prepare(
      `SELECT m.*, c.title as conversation_title FROM messages m
       JOIN conversations c ON m.conversation_id = c.id
       WHERE m.id = ?`
    );
    stmt.bind([id]);
    if (stmt.step()) {
      const row = MessageModel.rowToMessage(stmt.getAsObject());
      stmt.free();
      return row;
    }
    stmt.free();
    return null;
  }

  /** 更新消息内容（用于流式更新 assistant 回复） */
  static updateContent(id: string, content: string): void {
    const db = DatabaseManager.getInstance().getDb();

    // 先读旧内容，从索引移除
    const oldStmt = db.prepare('SELECT content FROM messages WHERE id = ?');
    oldStmt.bind([id]);
    if (oldStmt.step()) {
      const oldContent = (oldStmt.getAsObject() as { content: string }).content;
      MessageModel.removeFromIndex(id);
      // 更新内容
      db.run('UPDATE messages SET content = ? WHERE id = ?', [content, id]);
      // 重新索引
      MessageModel.indexMessage(id, content);
    }
    oldStmt.free();

    DatabaseManager.getInstance().save();
  }

  static deleteByConversation(conversationId: string): void {
    const db = DatabaseManager.getInstance().getDb();

    // 先收集要删除的 ID，再从索引中移除
    const idsToRemove: string[] = [];
    const stmt = db.prepare('SELECT id FROM messages WHERE conversation_id = ?');
    stmt.bind([conversationId]);
    while (stmt.step()) {
      idsToRemove.push((stmt.getAsObject() as { id: string }).id);
    }
    stmt.free();

    db.run('DELETE FROM messages WHERE conversation_id = ?', [conversationId]);

    for (const id of idsToRemove) {
      MessageModel.removeFromIndex(id);
    }

    DatabaseManager.getInstance().save();
  }
}
