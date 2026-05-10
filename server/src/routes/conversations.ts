import { Router, Request, Response } from 'express';
import { ConversationModel, MessageModel } from '../database/models';

const router = Router();

// GET /api/conversations?providerId=<id> — 列出对话
router.get('/api/conversations', (req: Request, res: Response) => {
  const providerId = req.query.providerId as string | undefined;
  const conversations = ConversationModel.findAll(providerId);
  res.json(conversations);
});

// POST /api/conversations — 创建对话
router.post('/api/conversations', (req: Request, res: Response) => {
  const { providerId, title } = req.body;
  if (!providerId || !title) {
    res.status(400).json({ error: 'providerId 和 title 必填' });
    return;
  }
  const conversation = ConversationModel.create(providerId, title);
  res.json(conversation);
});

// PUT /api/conversations/:id — 更新对话（重命名）
router.put('/api/conversations/:id', (req: Request, res: Response) => {
  const { title } = req.body;
  if (title !== undefined) {
    ConversationModel.updateTitle(req.params.id, title);
  }
  res.json({ success: true });
});

// PUT /api/conversations/:id/auto-dispatch — 切换当前对话的自动角色调度
router.put('/api/conversations/:id/auto-dispatch', (req: Request, res: Response) => {
  const enabled = Boolean(req.body?.enabled);
  ConversationModel.setAutoDispatch(req.params.id, enabled);
  res.json({ success: true });
});

// DELETE /api/conversations/:id — 删除对话
router.delete('/api/conversations/:id', (req: Request, res: Response) => {
  ConversationModel.delete(req.params.id);
  res.json({ success: true });
});

// GET /api/conversations/:id/messages — 获取对话的所有消息
router.get('/api/conversations/:id/messages', (req: Request, res: Response) => {
  const messages = MessageModel.findByConversation(req.params.id);
  res.json(messages);
});

export default router;
