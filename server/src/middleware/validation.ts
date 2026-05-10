import type { Request, Response, NextFunction } from 'express';

export function validateBody(requiredFields: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const missing = requiredFields.filter((f) => !req.body || req.body[f] === undefined);
    if (missing.length > 0) {
      return res.status(400).json({ error: `缺少必要字段: ${missing.join(', ')}` });
    }
    next();
  };
}
