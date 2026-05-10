import { Router, Request, Response } from 'express';
import { RoleModel } from '../database/models';
import { validateBody } from '../middleware/validation';

const router = Router();

// GET /api/roles — 列出所有角色
router.get('/api/roles', (_req: Request, res: Response) => {
  const roles = RoleModel.findAll();
  res.json(roles);
});

// POST /api/roles — 创建角色
router.post('/api/roles', validateBody(['name']), (req: Request, res: Response) => {
  const role = RoleModel.create(req.body);
  res.json(role);
});

// PUT /api/roles/:id — 更新角色
router.put('/api/roles/:id', (req: Request, res: Response) => {
  RoleModel.update(req.params.id, req.body);
  res.json({ success: true });
});

// DELETE /api/roles/:id — 删除角色
router.delete('/api/roles/:id', (req: Request, res: Response) => {
  RoleModel.delete(req.params.id);
  res.json({ success: true });
});

export default router;
