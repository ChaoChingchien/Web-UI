import { Router, Request, Response } from 'express';

const router = Router();

// GET /api/claude/sessions — 列出 Claude Code 会话（暂存根）
router.get('/api/claude/sessions', (_req: Request, res: Response) => {
  res.json([]);
});

// POST /api/claude/sessions — 创建会话（暂存根）
router.post('/api/claude/sessions', (_req: Request, res: Response) => {
  res.json({ success: true, id: 'stub', message: 'Claude Code GUI 将在 Phase 7 实现' });
});

// DELETE /api/claude/sessions/:id — 停止会话（暂存根）
router.delete('/api/claude/sessions/:id', (_req: Request, res: Response) => {
  res.json({ success: true });
});

export default router;
