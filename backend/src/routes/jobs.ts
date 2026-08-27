import { Router, type Request, type Response, type NextFunction } from 'express';
import { analysisService } from '../services/analysis.js';
import { isUuid } from '../lib/validate.js';

export const jobsRouter = Router();

// GET /api/jobs/:id — poll analysis progress.
jobsRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ error: { code: 'validation_error', message: 'invalid job id' } });
    }
    const job = await analysisService.getJob(req.params.id);
    if (!job) {
      return res.status(404).json({ error: { code: 'not_found', message: 'job not found' } });
    }
    // Progress is volatile — discourage caching.
    res.setHeader('Cache-Control', 'no-store');
    res.json(job);
  } catch (err) {
    next(err);
  }
});
