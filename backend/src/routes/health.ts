import { Router, type Request, type Response } from 'express';
import { query } from '../db/pool.js';

export const healthRouter = Router();

healthRouter.get('/', async (_req: Request, res: Response) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'ok', time: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'degraded', time: new Date().toISOString() });
  }
});
