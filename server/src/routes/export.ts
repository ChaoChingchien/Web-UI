import { Router, Request, Response } from 'express';
import { ConversationModel, MessageModel } from '../database/models';
import { ExportManager } from '../export/ExportManager';

const router = Router();

// GET /api/export/markdown?conversationId=<id>
router.get('/api/export/markdown', (req: Request, res: Response) => {
  const conversationId = req.query.conversationId as string;
  if (!conversationId) {
    res.status(400).json({ error: 'conversationId 参数必填' });
    return;
  }

  const conversation = ConversationModel.findById(conversationId);
  if (!conversation) {
    res.status(404).json({ error: '对话不存在' });
    return;
  }

  const messages = MessageModel.findByConversation(conversationId);
  const output = ExportManager.markdown(conversation, messages);

  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${conversation.title}.md"`);
  res.send(output);
});

// GET /api/export/text?conversationId=<id>
router.get('/api/export/text', (req: Request, res: Response) => {
  const conversationId = req.query.conversationId as string;
  if (!conversationId) {
    res.status(400).json({ error: 'conversationId 参数必填' });
    return;
  }

  const conversation = ConversationModel.findById(conversationId);
  if (!conversation) {
    res.status(404).json({ error: '对话不存在' });
    return;
  }

  const messages = MessageModel.findByConversation(conversationId);
  const output = ExportManager.text(conversation, messages);

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${conversation.title}.txt"`);
  res.send(output);
});

// GET /api/export/json?conversationId=<id>
router.get('/api/export/json', (req: Request, res: Response) => {
  const conversationId = req.query.conversationId as string;
  if (!conversationId) {
    res.status(400).json({ error: 'conversationId 参数必填' });
    return;
  }

  const conversation = ConversationModel.findById(conversationId);
  if (!conversation) {
    res.status(404).json({ error: '对话不存在' });
    return;
  }

  const messages = MessageModel.findByConversation(conversationId);
  const output = ExportManager.json(conversation, messages);

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${conversation.title}.json"`);
  res.send(output);
});

export default router;
