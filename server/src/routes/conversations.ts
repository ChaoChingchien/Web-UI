import { Router, Request, Response } from 'express';
import { ConversationModel, MessageModel, ProviderModel } from '../database/models';
import { WebAutomation } from '../ai/WebAutomation';
import { log } from '../platform';

const router = Router();

// GET /api/conversations?providerId=<id> — 列出对话
router.get('/api/conversations', (req: Request, res: Response) => {
  const providerId = req.query.providerId as string | undefined;
  const conversations = ConversationModel.findAll(providerId);
  res.json(conversations);
});

// POST /api/conversations — 创建对话
router.post('/api/conversations', (req: Request, res: Response) => {
  const { providerId, title, agent, agentPrompt } = req.body;
  if (!providerId || !title) {
    res.status(400).json({ error: 'providerId 和 title 必填' });
    return;
  }
  const conversation = ConversationModel.create(providerId, title, {
    agent: Boolean(agent),
    agentPrompt: agentPrompt || undefined,
  });
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

// DELETE /api/conversations/:id — 删除对话（含网页端同步删除）
router.delete('/api/conversations/:id', async (req: Request, res: Response) => {
  const conversation = ConversationModel.findById(req.params.id);
  if (!conversation) {
    res.status(404).json({ error: '对话不存在' });
    return;
  }

  // Web provider: 尝试在网页端删除
  let webDeleted = false;
  if (conversation.web_url) {
    const provider = ProviderModel.findById(conversation.provider_id);
    if (provider?.type === 'web') {
      try {
        const { BrowserManager } = await import('../browser/BrowserManager');
        const { AutomationEngine } = await import('../browser/automation/AutomationEngine');
        const page = await BrowserManager.getInstance().getPage(provider);
        const engine = new AutomationEngine(page, provider);
        await page.goto(conversation.web_url, { waitUntil: 'load', timeout: 30000 });
        webDeleted = await engine.deleteCurrentConversation();
        if (webDeleted) log.info(`[delete] 网页对话已删除: ${conversation.web_url}`);
      } catch (err) {
        log.warn('[delete] 网页端删除失败:', err);
      }
    }
  }

  ConversationModel.delete(req.params.id);
  res.json({ success: true, webDeleted });
});

// GET /api/conversations/:id/messages — 获取对话的所有消息（含自动同步）
router.get('/api/conversations/:id/messages', async (req: Request, res: Response) => {
  const conversation = ConversationModel.findById(req.params.id);
  // Web provider + 有 web_url 时自动同步
  if (conversation?.web_url) {
    const provider = ProviderModel.findById(conversation.provider_id);
    if (provider?.type === 'web') {
      try {
        const wa = new WebAutomation();
        const result = await wa.syncConversation(provider, conversation.id, { MessageModel });
        if (result.imported > 0) log.info(`[sync:auto] ${conversation.id} 导入了 ${result.imported} 条消息`);
      } catch (err) {
        log.warn('[sync:auto] 自动同步失败:', err);
      }
    }
  }
  const messages = MessageModel.findByConversation(req.params.id);
  res.json(messages);
});

// POST /api/conversations/:id/sync — 同步网页对话到本地
router.post('/api/conversations/:id/sync', async (req: Request, res: Response) => {
  const conversation = ConversationModel.findById(req.params.id);
  if (!conversation) {
    res.status(404).json({ error: '对话不存在' });
    return;
  }
  const provider = ProviderModel.findById(conversation.provider_id);
  if (!provider || provider.type !== 'web') {
    res.status(400).json({ error: '仅 web 自动化 providers 支持同步' });
    return;
  }

  try {
    const wa = new WebAutomation();
    const result = await wa.syncConversation(provider, conversation.id, { MessageModel });
    log.info(`[sync] ${conversation.id} 导入了 ${result.imported} 条新消息`);
    res.json(result);
  } catch (err) {
    log.error('[sync] 同步失败:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// PUT /api/conversations/:id/agent-mode — 启用/关闭 Agent 模式
router.put('/api/conversations/:id/agent-mode', (req: Request, res: Response) => {
  const conversation = ConversationModel.findById(req.params.id);
  if (!conversation) {
    res.status(404).json({ error: '对话不存在' });
    return;
  }
  const { enabled, systemPrompt } = req.body;
  ConversationModel.setAgentMode(req.params.id, Boolean(enabled), systemPrompt);
  res.json({ success: true });
});

// PUT /api/conversations/:id/switch-provider — Agent 模式切换 provider
router.put('/api/conversations/:id/switch-provider', (req: Request, res: Response) => {
  const { providerId } = req.body;
  if (!providerId) {
    res.status(400).json({ error: 'providerId 必填' });
    return;
  }
  const conversation = ConversationModel.findById(req.params.id);
  if (!conversation) {
    res.status(404).json({ error: '对话不存在' });
    return;
  }
  ConversationModel.switchProvider(req.params.id, providerId);
  log.info(`[agent] ${conversation.id} 切换到 provider: ${providerId}`);
  res.json({ success: true });
});

// POST /api/providers/:id/sync-conversations — 同步网页对话列表
router.post('/api/providers/:id/sync-conversations', async (req: Request, res: Response) => {
  const provider = ProviderModel.findById(req.params.id);
  if (!provider) {
    res.status(404).json({ error: '提供商不存在' });
    return;
  }
  if (provider.type !== 'web') {
    res.status(400).json({ error: '仅 web 自动化 providers 支持同步' });
    return;
  }
  try {
    const wa = new WebAutomation();
    const result = await wa.syncAllConversations(provider, provider.id, {
      ConversationModel,
      MessageModel: MessageModel as any,
    });
    log.info(`[sync:all] ${provider.id} 导入 ${result.imported} 对话，${result.messages} 消息，清理 ${result.removed} 已删除`);
    res.json(result);
  } catch (err) {
    log.error('[sync:all] 同步对话列表失败:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
