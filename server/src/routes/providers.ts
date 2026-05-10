import { Router, Request, Response } from 'express';
import { ProviderModel } from '../database/models';
import { AIRouter } from '../ai/AIRouter';
import { BrowserManager } from '../browser/BrowserManager';
import { log } from '../platform';
import { validateBody } from '../middleware/validation';

const router = Router();
const aiRouter = new AIRouter();

// GET /api/providers — 列出所有提供商
router.get('/api/providers', (_req: Request, res: Response) => {
  const providers = ProviderModel.findAll();
  res.json(providers);
});

// POST /api/providers — 添加提供商
router.post('/api/providers', validateBody(['name']), (req: Request, res: Response) => {
  const provider = ProviderModel.create(req.body);
  res.json(provider);
});

// PUT /api/providers/:id — 更新提供商
router.put('/api/providers/:id', (req: Request, res: Response) => {
  ProviderModel.update(req.params.id, req.body);
  res.json({ success: true });
});

// DELETE /api/providers/:id — 删除提供商
router.delete('/api/providers/:id', (req: Request, res: Response) => {
  ProviderModel.delete(req.params.id);
  res.json({ success: true });
});

// POST /api/providers/:id/test — 测试提供商连接
router.post('/api/providers/:id/test', async (req: Request, res: Response) => {
  const provider = ProviderModel.findById(req.params.id);
  if (!provider) {
    res.status(404).json({ success: false, message: '提供商不存在' });
    return;
  }
  const result = await aiRouter.testProvider(provider);
  res.json(result);
});

// POST /api/providers/:id/login — 在浏览器中打开提供商登录页
router.post('/api/providers/:id/login', async (req: Request, res: Response) => {
  const provider = ProviderModel.findById(req.params.id);
  if (!provider) {
    res.status(404).json({ success: false, message: '提供商不存在' });
    return;
  }
  if (!provider.url) {
    res.status(400).json({ success: false, message: '该提供商没有配置网页 URL' });
    return;
  }
  try {
    const bm = BrowserManager.getInstance();
    const page = await bm.getPage(provider);
    log.info(`[Login] 已打开 ${provider.name} 登录页: ${provider.url}`);
    res.json({ success: true, message: `已打开 ${provider.name} 登录页面` });
  } catch (err) {
    log.error(`[Login] 打开 ${provider.name} 页面失败:`, err);
    res.status(500).json({ success: false, message: `打开登录页失败: ${(err as Error)?.message}` });
  }
});

export default router;
