import { Router, Request, Response } from 'express';
import { TeamModel, TeamRunModel, TeamRunOutputModel, TeamChatModel } from '../database/models';
import { TeamEngine } from '../team/TeamEngine';
import { validateBody } from '../middleware/validation';

const router = Router();
const teamEngine = new TeamEngine();

// GET /api/teams — 列出所有 Team
router.get('/api/teams', (_req: Request, res: Response) => {
  const teams = TeamModel.findAll();
  res.json(teams);
});

// POST /api/teams — 创建 Team
router.post('/api/teams', validateBody(['name']), (req: Request, res: Response) => {
  const team = TeamModel.create(req.body);
  res.json(team);
});

// PUT /api/teams/:id — 更新 Team
router.put('/api/teams/:id', (req: Request, res: Response) => {
  TeamModel.update(req.params.id, req.body);
  res.json({ success: true });
});

// DELETE /api/teams/:id — 删除 Team
router.delete('/api/teams/:id', (req: Request, res: Response) => {
  TeamModel.delete(req.params.id);
  res.json({ success: true });
});

// POST /api/teams/:id/run — 执行 Team
router.post('/api/teams/:id/run', async (req: Request, res: Response) => {
  const team = TeamModel.findById(req.params.id);
  if (!team) {
    res.status(404).json({ success: false, message: 'Team 不存在' });
    return;
  }

  try {
    const result = await teamEngine.run(team, req.body.input, () => {});
    res.json({ success: true, result });
  } catch (err) {
    res.json({ success: false, result: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/teams/stop — 停止执行
router.post('/api/teams/stop', (req: Request, res: Response) => {
  teamEngine.stop(req.body.runId);
  res.json({ success: true });
});

// GET /api/team-runs?teamId=<id> — 运行历史
router.get('/api/team-runs', (req: Request, res: Response) => {
  const teamId = req.query.teamId as string | undefined;
  const runs = TeamRunModel.findAll(teamId);
  res.json(runs);
});

// GET /api/team-runs/:id — 运行详情
router.get('/api/team-runs/:id', (req: Request, res: Response) => {
  const run = TeamRunModel.findById(req.params.id);
  if (!run) {
    res.status(404).json({ error: '运行记录不存在' });
    return;
  }
  const outputs = TeamRunOutputModel.findByRunId(req.params.id);
  res.json({ ...run, outputs });
});

// GET /api/teams/:id/chat — Team 聊天消息历史
router.get('/api/teams/:id/chat', (req: Request, res: Response) => {
  const messages = TeamChatModel.findByTeam(req.params.id);
  res.json(messages);
});

export default router;
