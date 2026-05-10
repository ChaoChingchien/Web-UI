import { v4 as uuidv4 } from 'uuid';
import type { Project, SubTask, TaskStatus, TaskPriority, TaskAutoDecomposeResult } from '@shared/types';
import { DatabaseManager } from '../database/DatabaseManager';
import { AIRouter } from '../ai/AIRouter';
import { ProviderModel } from '../database/models';
import log from 'electron-log';

/** ============================================
 *  子任务管理器
 *  CRUD + 自动拆解 + 看板操作
 *  ============================================ */

export class TaskManager {
  private router = new AIRouter();

  // ===== 项目 CRUD =====

  listProjects(status?: Project['status']): Project[] {
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

  createProject(data: { name: string; description?: string }): Project {
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

  updateProject(id: string, data: Partial<Project>): void {
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

  deleteProject(id: string): void {
    const db = DatabaseManager.getInstance().getDb();
    // 先删除子任务
    db.run('DELETE FROM sub_tasks WHERE project_id = ?', [id]);
    db.run('DELETE FROM projects WHERE id = ?', [id]);
    DatabaseManager.getInstance().save();
  }

  // ===== 子任务 CRUD =====

  listTasks(projectId: string): SubTask[] {
    const db = DatabaseManager.getInstance().getDb();
    const stmt = db.prepare(
      'SELECT * FROM sub_tasks WHERE project_id = ? ORDER BY task_order ASC, created_at ASC'
    );
    stmt.bind([projectId]);

    const results: SubTask[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, unknown>;
      results.push(this.rowToSubTask(row));
    }
    stmt.free();
    return results;
  }

  createTask(data: {
    projectId: string;
    title: string;
    description?: string;
    priority?: TaskPriority;
    assigneeRoleId?: string;
    assigneeProviderId?: string;
    parentId?: string;
    dueDate?: string;
  }): SubTask {
    const db = DatabaseManager.getInstance().getDb();
    const id = uuidv4();
    const now = new Date().toISOString();

    // 计算 order
    const orderStmt = db.prepare('SELECT COALESCE(MAX(task_order), -1) + 1 as next_order FROM sub_tasks WHERE project_id = ?');
    orderStmt.bind([data.projectId]);
    let nextOrder = 0;
    if (orderStmt.step()) {
      nextOrder = (orderStmt.getAsObject() as { next_order: number }).next_order;
    }
    orderStmt.free();

    db.run(
      `INSERT INTO sub_tasks (id, project_id, parent_id, title, description, status, priority, assignee_role_id, assignee_provider_id, task_order, due_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, data.projectId, data.parentId || null, data.title, data.description || '',
        'todo', data.priority || 'medium', data.assigneeRoleId || null,
        data.assigneeProviderId || null, nextOrder, data.dueDate || null,
        now, now,
      ]
    );

    // 更新项目时间
    db.run("UPDATE projects SET updated_at = datetime('now') WHERE id = ?", [data.projectId]);

    DatabaseManager.getInstance().save();
    return this.getTaskById(id)!;
  }

  updateTask(id: string, data: Partial<SubTask>): void {
    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    if (data.title !== undefined) { fields.push('title = ?'); values.push(data.title); }
    if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description); }
    if (data.status !== undefined) {
      fields.push('status = ?'); values.push(data.status);
      if (data.status === 'done') {
        fields.push('completed_at = ?'); values.push(new Date().toISOString());
      }
    }
    if (data.priority !== undefined) { fields.push('priority = ?'); values.push(data.priority); }
    if (data.assignee_role_id !== undefined) { fields.push('assignee_role_id = ?'); values.push(data.assignee_role_id); }
    if (data.assignee_provider_id !== undefined) { fields.push('assignee_provider_id = ?'); values.push(data.assignee_provider_id); }
    if (data.conversation_id !== undefined) { fields.push('conversation_id = ?'); values.push(data.conversation_id); }
    if (data.due_date !== undefined) { fields.push('due_date = ?'); values.push(data.due_date); }

    fields.push("updated_at = datetime('now')");
    values.push(id);

    const db = DatabaseManager.getInstance().getDb();
    db.run(`UPDATE sub_tasks SET ${fields.join(', ')} WHERE id = ?`, values);
    DatabaseManager.getInstance().save();
  }

  moveTask(id: string, newStatus: TaskStatus, newOrder?: number): void {
    const db = DatabaseManager.getInstance().getDb();
    const now = new Date().toISOString();

    if (newOrder !== undefined) {
      db.run('UPDATE sub_tasks SET status = ?, task_order = ?, updated_at = ? WHERE id = ?', [newStatus, newOrder, now, id]);
    } else {
      db.run('UPDATE sub_tasks SET status = ?, updated_at = ? WHERE id = ?', [newStatus, now, id]);
    }

    if (newStatus === 'done') {
      db.run('UPDATE sub_tasks SET completed_at = ? WHERE id = ?', [now, id]);
    }

    DatabaseManager.getInstance().save();
  }

  deleteTask(id: string): void {
    const db = DatabaseManager.getInstance().getDb();
    // 递归删除子任务
    db.run('DELETE FROM sub_tasks WHERE parent_id = ?', [id]);
    db.run('DELETE FROM sub_tasks WHERE id = ?', [id]);
    DatabaseManager.getInstance().save();
  }

  // ===== AI 自动拆解 =====

  async autoDecompose(projectId: string, goal: string): Promise<TaskAutoDecomposeResult> {
    log.info(`[TaskManager] AI 自动拆解任务: ${goal}`);

    // 使用第一个可用的 AI 提供商
    const providers = ProviderModel.findAll();
    if (providers.length === 0) throw new Error('没有可用的 AI 提供商');

    const provider = providers[0];
    const messages = [
      {
        role: 'system' as const,
        content: `你是一个专业的项目管理专家。请将用户的目标拆解为具体的子任务。
返回 JSON 格式，每个任务包含 title、description、priority (low/medium/high/urgent)。
任务数量控制在 3-8 个，按逻辑顺序排列。
只返回 JSON 数组，不要其他文字。

格式示例：
[
  {"title": "任务标题", "description": "任务详细描述", "priority": "high"},
  {"title": "任务标题2", "description": "任务详细描述2", "priority": "medium"}
]`,
      },
      {
        role: 'user' as const,
        content: `目标：${goal}\n\n请拆解为子任务。`,
      },
    ];

    const output = await this.router.chat(provider, messages);

    // 解析 JSON
    try {
      const jsonMatch = output.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('无法解析 AI 输出');

      const tasks = JSON.parse(jsonMatch[0]) as TaskAutoDecomposeResult['tasks'];

      // 创建子任务
      for (const task of tasks) {
        this.createTask({
          projectId,
          title: task.title,
          description: task.description,
          priority: task.priority,
          assigneeRoleId: task.suggestedRoleId,
          assigneeProviderId: task.suggestedProviderId,
        });
      }

      return { tasks };
    } catch (err) {
      log.error('自动拆解失败:', err);
      throw new Error(`AI 拆解失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ===== 看板数据 =====

  getKanbanData(projectId: string): { columns: { status: TaskStatus; title: string; tasks: SubTask[] }[] } {
    const tasks = this.listTasks(projectId);
    const columns: { status: TaskStatus; title: string; tasks: SubTask[] }[] = [
      { status: 'todo', title: '📋 待办', tasks: [] },
      { status: 'in_progress', title: '🔨 进行中', tasks: [] },
      { status: 'review', title: '👀 审核中', tasks: [] },
      { status: 'done', title: '✅ 已完成', tasks: [] },
      { status: 'cancelled', title: '❌ 已取消', tasks: [] },
    ];

    for (const col of columns) {
      col.tasks = tasks.filter((t) => t.status === col.status);
    }

    return { columns };
  }

  // ===== 辅助方法 =====

  private getTaskById(id: string): SubTask | null {
    const db = DatabaseManager.getInstance().getDb();
    const stmt = db.prepare('SELECT * FROM sub_tasks WHERE id = ?');
    stmt.bind([id]);

    if (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, unknown>;
      stmt.free();
      return this.rowToSubTask(row);
    }
    stmt.free();
    return null;
  }

  private rowToSubTask(row: Record<string, unknown>): SubTask {
    return {
      id: row.id as string,
      project_id: row.project_id as string,
      parent_id: (row.parent_id as string) || undefined,
      title: row.title as string,
      description: (row.description as string) || '',
      status: row.status as SubTask['status'],
      priority: row.priority as SubTask['priority'],
      assignee_role_id: (row.assignee_role_id as string) || undefined,
      assignee_provider_id: (row.assignee_provider_id as string) || undefined,
      conversation_id: (row.conversation_id as string) || undefined,
      task_order: (row.task_order as number) || 0,
      due_date: (row.due_date as string) || undefined,
      completed_at: (row.completed_at as string) || undefined,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    };
  }
}
