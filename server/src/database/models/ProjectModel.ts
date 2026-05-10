import { v4 as uuidv4 } from 'uuid';
import type { Project, ProjectStatus } from '@shared/types';
import { DatabaseManager } from '../DatabaseManager';

export class ProjectModel {
  static findAll(status?: ProjectStatus): Project[] {
    const db = DatabaseManager.getInstance().getDb();
    let query = 'SELECT * FROM projects';
    const params: string[] = [];

    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }
    query += ' ORDER BY updated_at DESC';

    const stmt = db.prepare(query);
    if (params.length > 0) stmt.bind(params);

    const results: Project[] = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject() as unknown as Project);
    }
    stmt.free();
    return results;
  }

  static findById(id: string): Project | null {
    const db = DatabaseManager.getInstance().getDb();
    const stmt = db.prepare('SELECT * FROM projects WHERE id = ?');
    stmt.bind([id]);

    if (stmt.step()) {
      const project = stmt.getAsObject() as unknown as Project;
      stmt.free();
      return project;
    }
    stmt.free();
    return null;
  }

  static create(data: { name: string; description?: string }): Project {
    const db = DatabaseManager.getInstance().getDb();
    const id = uuidv4();
    const now = new Date().toISOString();

    db.run(
      'INSERT INTO projects (id, name, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, data.name, data.description || '', 'active', now, now]
    );

    DatabaseManager.getInstance().save();
    return { id, name: data.name, description: data.description || '', status: 'active', created_at: now, updated_at: now };
  }

  static update(id: string, data: Partial<Project>): void {
    const fields: string[] = [];
    const values: (string | number)[] = [];

    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
    if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description); }
    if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status); }

    fields.push("updated_at = datetime('now')");
    values.push(id);

    const db = DatabaseManager.getInstance().getDb();
    db.run(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`, values);
    DatabaseManager.getInstance().save();
  }

  static delete(id: string): void {
    const db = DatabaseManager.getInstance().getDb();
    db.run('DELETE FROM sub_tasks WHERE project_id = ?', [id]);
    db.run('DELETE FROM projects WHERE id = ?', [id]);
    DatabaseManager.getInstance().save();
  }

  static touch(id: string): void {
    const db = DatabaseManager.getInstance().getDb();
    db.run("UPDATE projects SET updated_at = datetime('now') WHERE id = ?", [id]);
    DatabaseManager.getInstance().save();
  }
}
