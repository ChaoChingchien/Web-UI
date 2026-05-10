import { v4 as uuidv4 } from 'uuid';
import type { Project, SubTask, TaskStatus, TaskPriority, TaskAutoDecomposeResult } from '@shared/types';
import { DatabaseManager } from '../database/DatabaseManager';
import { AIRouter } from '../ai/AIRouter';
import { ProviderModel, RoleModel, ConversationModel, MessageModel } from '../database/models';
import { log } from '../platform';

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

  /**
   * 让 AI 把一个大目标拆解成候选子任务。
   * 注意：本方法**只生成候选结果，不落库**——调用方应将结果展示给用户确认后再调用 commitDecomposition()。
   */
  async autoDecompose(_projectId: string, goal: string): Promise<TaskAutoDecomposeResult> {
    log.info(`[TaskManager] AI 自动拆解任务: ${goal}`);

    // 1. 选一个能真正产出回复的 provider
    const allProviders = ProviderModel.findAll().filter(p => p.is_enabled);
    // 优先 api（最稳定、最快），其次 local（同样走结构化回复），最后 web（不稳定，作为兜底）
    const apiProvider = allProviders.find(p => p.type === 'api' && p.api_config?.apiKey);
    const localProvider = allProviders.find(p => p.type === 'local');
    const webProvider = allProviders.find(p => p.type === 'web');
    const provider = apiProvider || localProvider || webProvider;
    if (!provider) {
      throw new Error('没有可用的 AI 提供商，请先在"提供商管理"中启用至少一个。');
    }

    // 2. 告诉 AI 都有哪些角色可选（给 suggestedRoleId 提供合法取值）
    const roles = RoleModel.findAll();
    const roleList = roles.map(r => ({
      id: r.id,
      name: r.name,
      icon: r.icon,
      // 提示词前 100 字作为能力说明，避免 prompt 体积失控
      capability: (r.system_prompt || '').replace(/\s+/g, ' ').slice(0, 100),
    }));

    const messages = [
      {
        role: 'system' as const,
        content: `你是一名项目经理。请把用户的目标拆解成 3-8 个可执行子任务。

要求：
1. 按逻辑顺序排列（先依赖、后依赖）
2. 每个任务指派给下面列表中**最合适的一个角色**（使用角色的 id）
3. 只返回 JSON 数组，外面不要套任何文字或 markdown

可用角色列表（必须从中选择 suggestedRoleId）：
${JSON.stringify(roleList, null, 2)}

输出格式严格遵守：
[
  {
    "title": "简短动词开头的任务名",
    "description": "一段话说明要做什么、产出是什么",
    "priority": "low|medium|high|urgent",
    "suggestedRoleId": "role_xxx"
  }
]`,
      },
      {
        role: 'user' as const,
        content: `项目目标：${goal}\n\n请拆解为子任务。`,
      },
    ];

    const output = await this.router.chat(provider, messages);

    // 3. 解析 JSON 数组
    try {
      const jsonMatch = output.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('AI 输出中未发现 JSON 数组');

      const validRoleIds = new Set(roles.map(r => r.id));
      const parsed = JSON.parse(jsonMatch[0]) as unknown[];
      if (!Array.isArray(parsed)) throw new Error('AI 输出不是数组');

      const tasks: TaskAutoDecomposeResult['tasks'] = [];
      for (const item of parsed) {
        if (!item || typeof item !== 'object') continue;
        const t = item as Record<string, unknown>;
        const title = typeof t.title === 'string' ? t.title.trim() : '';
        if (!title) continue;
        const priority = (['low', 'medium', 'high', 'urgent'] as const).includes(t.priority as TaskPriority)
          ? (t.priority as TaskPriority)
          : 'medium';
        const suggestedRoleId = typeof t.suggestedRoleId === 'string' && validRoleIds.has(t.suggestedRoleId)
          ? t.suggestedRoleId
          : undefined;
        tasks.push({
          title,
          description: typeof t.description === 'string' ? t.description : '',
          priority,
          suggestedRoleId,
          // suggestedProviderId 交给前端根据 role 默认 provider 推导（避免 AI 随意发明 id）
        });
      }

      if (tasks.length === 0) throw new Error('AI 未返回有效任务');
      return { tasks };
    } catch (err) {
      log.error('自动拆解失败:', err, '原始输出:', output);
      throw new Error(`AI 拆解失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** 把用户确认过的候选任务批量落库 */
  commitDecomposition(projectId: string, tasks: Array<{
    title: string;
    description?: string;
    priority?: TaskPriority;
    suggestedRoleId?: string;
    suggestedProviderId?: string;
  }>): SubTask[] {
    const created: SubTask[] = [];
    for (const t of tasks) {
      const task = this.createTask({
        projectId,
        title: t.title,
        description: t.description,
        priority: t.priority,
        assigneeRoleId: t.suggestedRoleId,
        assigneeProviderId: t.suggestedProviderId,
      });
      created.push(task);
    }
    return created;
  }

  /**
   * 启动一个任务：为 assignee 创建一条新对话、注入 system prompt 和任务描述，把 conversation_id 写回 task。
   * 返回新建对话的 id，前端可据此跳转到对话 tab。
   */
  startTask(taskId: string): { conversationId: string } {
    const task = this.getTaskById(taskId);
    if (!task) throw new Error('任务不存在');
    if (task.conversation_id) {
      // 已经开工过，直接返回已有对话
      return { conversationId: task.conversation_id };
    }

    const roleId = task.assignee_role_id;
    if (!roleId) throw new Error('任务未分派角色，无法开工');
    const role = RoleModel.findById(roleId);
    if (!role) throw new Error('分派的角色已被删除');

    const providerId = task.assignee_provider_id || role.provider_id;
    if (!providerId) throw new Error('任务未指定 AI 提供商，请在角色或任务上绑定一个');
    const provider = ProviderModel.findById(providerId);
    if (!provider) throw new Error('指定的 AI 提供商不存在');

    // 建对话 + 写入 system / user 首条消息
    const conversation = ConversationModel.create(providerId, `[任务] ${task.title}`);
    if (role.system_prompt) {
      MessageModel.create(conversation.id, 'system', role.system_prompt);
    }
    const firstUserMsg = `请完成以下任务：\n\n## 任务：${task.title}\n\n${task.description || '(无详细描述)'}`;
    MessageModel.create(conversation.id, 'user', firstUserMsg);

    // 写回任务，状态切到进行中
    this.updateTask(taskId, {
      conversation_id: conversation.id,
      status: 'in_progress',
    });

    log.info(`[TaskManager] 任务 ${taskId} 已启动，conversation=${conversation.id}`);
    return { conversationId: conversation.id };
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
