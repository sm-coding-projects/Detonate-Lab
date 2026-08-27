import { Router, type Request, type Response, type NextFunction } from 'express';
import { query } from '../db/pool.js';
import { isUuid } from '../lib/validate.js';
import type { Report } from '../types.js';

export const reportsRouter = Router();

// GET /api/reports/:id — full report for a completed sample (id == sampleId).
reportsRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ error: { code: 'validation_error', message: 'invalid report id' } });
    }
    const { rows } = await query<{ data: Report }>(
      `SELECT data FROM reports WHERE sample_id = $1`,
      [req.params.id],
    );
    const data = rows[0]?.data;
    if (!data) {
      return res.status(404).json({ error: { code: 'not_found', message: 'report not ready' } });
    }
    res.json({ report: data });
  } catch (err) {
    next(err);
  }
});
