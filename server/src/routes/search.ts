import { Router, Request, Response } from 'express';
import { MessageModel } from '../database/models';

const router = Router();

// GET /api/search?q=<query> — 搜索消息
router.get('/api/search', (req: Request, res: Response) => {
  const query = (req.query.q as string) || '';
  if (!query.trim()) {
    res.json([]);
    return;
  }

  const results = MessageModel.search(query);
  res.json(results);
});

export default router;
