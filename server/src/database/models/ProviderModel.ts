import { v4 as uuidv4 } from 'uuid';
import type { AIProvider, ProviderType, WebAutomationConfig, ApiConfig, ProviderCapabilities } from '@shared/types';
import { DatabaseManager } from '../DatabaseManager';

export class ProviderModel {
  static findAll(): AIProvider[] {
    const db = DatabaseManager.getInstance().getDb();
    const stmt = db.prepare('SELECT * FROM providers WHERE is_enabled = 1 ORDER BY id');
    const results: AIProvider[] = [];

    while (stmt.step()) {
      results.push(this.rowToProvider(stmt.getAsObject()));
    }
    stmt.free();
    return results;
  }

  static findById(id: string): AIProvider | null {
    const db = DatabaseManager.getInstance().getDb();
    const stmt = db.prepare('SELECT * FROM providers WHERE id = ?');
    stmt.bind([id]);

    if (stmt.step()) {
      const provider = this.rowToProvider(stmt.getAsObject());
      stmt.free();
      return provider;
    }
    stmt.free();
    return null;
  }

  static create(data: Partial<AIProvider>): AIProvider {
    const db = DatabaseManager.getInstance().getDb();
    const id = data.id || uuidv4();
    const now = new Date().toISOString();

    const provider: AIProvider = {
      id,
      name: data.name || '',
      icon: data.icon || '🤖',
      type: data.type || 'web',
      is_custom: data.is_custom ?? true,
      is_enabled: data.is_enabled ?? true,
      url: data.url,
      web_config: data.web_config,
      api_config: data.api_config,
      local_config: data.local_config,
      capabilities: data.capabilities,
      created_at: now,
      updated_at: now,
    };

    db.run(
      `INSERT INTO providers (id, name, icon, type, is_custom, is_enabled, url, web_config, api_config, local_config, capabilities, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        provider.id, provider.name, provider.icon, provider.type,
        provider.is_custom ? 1 : 0, provider.is_enabled ? 1 : 0,
        provider.url || null,
        JSON.stringify(provider.web_config || {}),
        JSON.stringify(provider.api_config || {}),
        JSON.stringify(provider.local_config || {}),
        JSON.stringify(provider.capabilities ?? {}),
        provider.created_at, provider.updated_at,
      ]
    );

    DatabaseManager.getInstance().save();
    return provider;
  }

  static delete(id: string): void {
    const db = DatabaseManager.getInstance().getDb();
    db.run('DELETE FROM providers WHERE id = ? AND is_custom = 1', [id]);
    DatabaseManager.getInstance().save();
  }

  static update(id: string, data: Partial<AIProvider>): void {
    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
    if (data.icon !== undefined) { fields.push('icon = ?'); values.push(data.icon); }
    if (data.type !== undefined) { fields.push('type = ?'); values.push(data.type); }
    if (data.url !== undefined) { fields.push('url = ?'); values.push(data.url); }
    if (data.web_config !== undefined) { fields.push('web_config = ?'); values.push(JSON.stringify(data.web_config)); }
    if (data.api_config !== undefined) { fields.push('api_config = ?'); values.push(JSON.stringify(data.api_config)); }
    if (data.local_config !== undefined) { fields.push('local_config = ?'); values.push(JSON.stringify(data.local_config)); }
    if (data.is_enabled !== undefined) { fields.push('is_enabled = ?'); values.push(data.is_enabled ? 1 : 0); }
    if (data.capabilities !== undefined) {
      fields.push('capabilities = ?');
      values.push(JSON.stringify(data.capabilities));
    }

    fields.push("updated_at = datetime('now')");
    values.push(id);

    const db = DatabaseManager.getInstance().getDb();
    db.run(`UPDATE providers SET ${fields.join(', ')} WHERE id = ?`, values);
    DatabaseManager.getInstance().save();
  }

  static count(): number {
    const db = DatabaseManager.getInstance().getDb();
    const stmt = db.prepare('SELECT COUNT(*) as cnt FROM providers');
    stmt.step();
    const result = stmt.getAsObject() as { cnt: number };
    stmt.free();
    return result.cnt;
  }

  private static rowToProvider(row: Record<string, unknown>): AIProvider {
    const capRaw = row.capabilities;
    let capabilities: ProviderCapabilities | undefined;
    if (capRaw) {
      try {
        const parsed = JSON.parse(String(capRaw));
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
          capabilities = parsed as ProviderCapabilities;
        }
      } catch { /* ignore malformed */ }
    }
    return {
      id: row.id as string,
      name: row.name as string,
      icon: row.icon as string,
      type: (row.type as ProviderType) || 'web',
      is_custom: Boolean(row.is_custom),
      is_enabled: Boolean(row.is_enabled),
      url: (row.url as string) || undefined,
      web_config: row.web_config ? JSON.parse(row.web_config as string) : undefined,
      api_config: row.api_config ? JSON.parse(row.api_config as string) : undefined,
      local_config: row.local_config ? JSON.parse(row.local_config as string) : undefined,
      capabilities,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    };
  }
}
