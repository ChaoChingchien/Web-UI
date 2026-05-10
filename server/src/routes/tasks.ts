import { Router, Request, Response } from 'express';
import { ProjectModel } from '../database/models';
import { TaskManager } from '../task/TaskManager';
import { validateBody } from '../middleware/validation';

const router = Router();
const taskManager = new TaskManager();

// ===== 项目 =====

// GET /api/projects?status=<status> — 列出项目
router.get('/api/projects', (req: Request, res: Response) => {
  const status = req.query.status as string | undefined;
  const projects = ProjectModel.findAll(status as any);
  res.json(projects);
});

// POST /api/projects — 创建项目
router.post('/api/projects', validateBody(['name']), (req: Request, res: Response) => {
  const project = ProjectModel.create(req.body);
  res.json(project);
});

// PUT /api/projects/:id — 更新项目
router.put('/api/projects/:id', (req: Request, res: Response) => {
  ProjectModel.update(req.params.id, req.body);
  res.json({ success: true });
});

// DELETE /api/projects/:id — 删除项目
router.delete('/api/projects/:id', (req: Request, res: Response) => {
  ProjectModel.delete(req.params.id);
  res.json({ success: true });
});

// POST /api/projects/:id/auto-decompose — AI 拆解（只生成候选，不落库）
router.post('/api/projects/:id/auto-decompose', async (req: Request, res: Response) => {
  try {
    const result = await taskManager.autoDecompose(req.params.id, req.body.goal);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/projects/:id/commit-decomposition — 把用户确认过的候选任务批量入库
router.post('/api/projects/:id/commit-decomposition', (req: Request, res: Response) => {
  try {
    const tasks = Array.isArray(req.body.tasks) ? req.body.tasks : [];
    if (tasks.length === 0) {
      res.status(400).json({ error: '没有要创建的任务' });
      return;
    }
    const created = taskManager.commitDecomposition(req.params.id, tasks);
    res.json({ tasks: created });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ===== 子任务 =====

// GET /api/projects/:id/tasks — 列出项目的子任务
router.get('/api/projects/:id/tasks', (req: Request, res: Response) => {
  const tasks = taskManager.listTasks(req.params.id);
  res.json(tasks);
});

// POST /api/tasks — 创建子任务
router.post('/api/tasks', validateBody(['projectId', 'title']), (req: Request, res: Response) => {
  const task = taskManager.createTask(req.body);
  res.json(task);
});

// PUT /api/tasks/:id — 更新子任务
router.put('/api/tasks/:id', (req: Request, res: Response) => {
  taskManager.updateTask(req.params.id, req.body);
  res.json({ success: true });
});

// DELETE /api/tasks/:id — 删除子任务
router.delete('/api/tasks/:id', (req: Request, res: Response) => {
  taskManager.deleteTask(req.params.id);
  res.json({ success: true });
});

// POST /api/tasks/:id/move — 移动子任务状态
router.post('/api/tasks/:id/move', (req: Request, res: Response) => {
  taskManager.moveTask(req.params.id, req.body.status, req.body.order);
  res.json({ success: true });
});

// POST /api/tasks/:id/start — 开工：为 assignee 建对话、注入 system/user 消息
router.post('/api/tasks/:id/start', (req: Request, res: Response) => {
  try {
    const result = taskManager.startTask(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
