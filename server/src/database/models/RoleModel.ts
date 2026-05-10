import { v4 as uuidv4 } from 'uuid';
import type { AIRole } from '@shared/types';
import { DatabaseManager } from '../DatabaseManager';

export class RoleModel {
  static findAll(): AIRole[] {
    const db = DatabaseManager.getInstance().getDb();
    const stmt = db.prepare('SELECT * FROM roles ORDER BY created_at ASC');
    const results: AIRole[] = [];

    while (stmt.step()) {
      results.push(this.rowToRole(stmt.getAsObject()));
    }
    stmt.free();
    return results;
  }

  static findById(id: string): AIRole | null {
    const db = DatabaseManager.getInstance().getDb();
    const stmt = db.prepare('SELECT * FROM roles WHERE id = ?');
    stmt.bind([id]);

    if (stmt.step()) {
      const role = this.rowToRole(stmt.getAsObject());
      stmt.free();
      return role;
    }
    stmt.free();
    return null;
  }

  static create(data: { id?: string; name: string; icon?: string; system_prompt?: string; provider_id: string; config?: Record<string, unknown>; is_custom?: boolean }): AIRole {
    const db = DatabaseManager.getInstance().getDb();
    // 允许调用方指定 id（内置角色用静态 id，如 'role_programmer'）；用户自建角色不传则生成 UUID。
    const id = data.id || uuidv4();
    const now = new Date().toISOString();

    // 空字符串 provider_id 写为 NULL（外键允许 NULL，但不允许不存在的非空值）
    const providerIdValue = data.provider_id ? data.provider_id : null;

    db.run(
      'INSERT INTO roles (id, name, icon, system_prompt, provider_id, config, is_custom, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, data.name, data.icon || '🤖', data.system_prompt || '', providerIdValue, JSON.stringify(data.config || {}), data.is_custom ? 1 : 0, now, now]
    );

    DatabaseManager.getInstance().save();
    return { id, name: data.name, icon: data.icon || '🤖', system_prompt: data.system_prompt || '', provider_id: data.provider_id || '', config: (data.config || { temperature: 0.7, max_tokens: 4096 }) as AIRole['config'], is_custom: data.is_custom ?? true, created_at: now, updated_at: now };
  }

  static update(id: string, data: Partial<AIRole>): void {
    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
    if (data.icon !== undefined) { fields.push('icon = ?'); values.push(data.icon); }
    if (data.system_prompt !== undefined) { fields.push('system_prompt = ?'); values.push(data.system_prompt); }
    if (data.provider_id !== undefined) {
      fields.push('provider_id = ?');
      // 空字符串写为 NULL
      values.push(data.provider_id ? data.provider_id : null);
    }
    if (data.config !== undefined) { fields.push('config = ?'); values.push(JSON.stringify(data.config)); }

    fields.push("updated_at = datetime('now')");
    values.push(id);

    const db = DatabaseManager.getInstance().getDb();
    db.run(`UPDATE roles SET ${fields.join(', ')} WHERE id = ?`, values);
    DatabaseManager.getInstance().save();
  }

  static delete(id: string): void {
    const db = DatabaseManager.getInstance().getDb();
    db.run('DELETE FROM roles WHERE id = ?', [id]);
    DatabaseManager.getInstance().save();
  }

  private static rowToRole(row: Record<string, unknown>): AIRole {
    return {
      id: row.id as string,
      name: row.name as string,
      icon: row.icon as string,
      system_prompt: row.system_prompt as string,
      // DB 里 provider_id 为 NULL 时规范成空串，前端按 "未绑定" 处理
      provider_id: (row.provider_id as string | null) ?? '',
      config: row.config ? JSON.parse(row.config as string) : { temperature: 0.7, max_tokens: 4096 },
      is_custom: Boolean(row.is_custom),
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    };
  }
}
