import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { analysisService } from '../services/analysis.js';
import { sha256 } from '../lib/hash.js';
import { sniff } from '../lib/filetype.js';
import { validateSampleUrl, isUuid, cleanName, ValidationError } from '../lib/validate.js';
import { rateLimiter } from '../middleware/rateLimit.js';
import type { SampleCard, SampleInput, Level } from '../types.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 1, fields: 4 },
});

// Stricter budget for the expensive submit path.
const submitLimiter = rateLimiter({
  windowMs: config.submitWindowMs,
  max: config.submitMaxRequests,
  name: 'submit',
});

export const samplesRouter = Router();

// GET /api/samples — library listing for the Import screen (newest first).
samplesRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await query<{
      id: string; name: string; seen: string; classification: string;
      sev_label: string; sev_level: Level; severity: number; tagline: string;
    }>(
      `SELECT s.id, s.name, s.seen, s.classification, s.sev_label, s.sev_level, s.severity, s.tagline
         FROM samples s
         JOIN reports r ON r.sample_id = s.id
        ORDER BY s.created_at DESC
        LIMIT 100`,
    );
    const samples: SampleCard[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      seen: r.seen,
      classification: r.classification,
      sevLabel: r.sev_label,
      sevLevel: r.sev_level,
      score: r.severity,
      summary: r.tagline,
    }));
    res.json({ samples });
  } catch (err) {
    next(err);
  }
});

// POST /api/samples — submit a sample. Accepts multipart file, {url}, or {sampleId}.
samplesRouter.post('/', submitLimiter, upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 1) Re-run a prepared/existing sample by id (replay its stored report).
    const sampleId = (req.body?.sampleId ?? '') as string;
    if (sampleId) {
      if (!isUuid(sampleId)) throw new ValidationError('sampleId is not a valid id');
      const { rows } = await query<{ name: string; sha256: string; file_type: string }>(
        `SELECT s.name, s.sha256, s.file_type
           FROM samples s JOIN reports r ON r.sample_id = s.id
          WHERE s.id = $1`,
        [sampleId],
      );
      const s = rows[0];
      if (!s) throw new ValidationError('unknown sampleId');
      const input: SampleInput = { name: s.name, sha256: s.sha256, size: 0, fileType: s.file_type, source: 'seed' };
      const job = await analysisService.createReplayJob(sampleId, input);
      return res.status(202).json(job);
    }

    // 2) File upload.
    if (req.file) {
      const buf = req.file.buffer;
      const name = cleanName(req.file.originalname || 'sample');
      const hash = sha256(buf);
      const { label } = sniff(buf, name);

      // Optionally retain the (untrusted) bytes in quarantine for a real connector.
      // Default off — we never execute, and not storing malware is the safer default.
      if (config.retainBytes) {
        await mkdir(config.quarantineDir, { recursive: true });
        await writeFile(join(config.quarantineDir, `${hash}.bin`), buf, { mode: 0o600 });
      }

      const quarantinePath = config.retainBytes ? join(config.quarantineDir, `${hash}.bin`) : undefined;
      const input: SampleInput = { name, sha256: hash, size: buf.length, fileType: label, source: 'upload', quarantinePath };
      const job = await analysisService.createUploadJob(input);
      return res.status(202).json(job);
    }

    // 3) URL submission.
    if (req.body && typeof req.body.url !== 'undefined') {
      const url = validateSampleUrl(req.body.url);
      const base = cleanName(new URL(url).pathname.split('/').pop() || 'remote-sample');
      const { label } = sniff(Buffer.alloc(0), base);
      const input: SampleInput = {
        name: base,
        sha256: sha256(url),
        size: 0,
        fileType: label === 'Unknown binary' ? 'Remote sample (URL)' : label,
        source: 'url',
        url,
      };
      const job = await analysisService.createUploadJob(input);
      return res.status(202).json(job);
    }

    throw new ValidationError('Provide a file, a url, or a sampleId');
  } catch (err) {
    next(err);
  }
});

// Translate multer's own errors (e.g. file too large) to clean HTTP responses.
samplesRouter.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: { code: 'payload_too_large', message: `File exceeds the ${Math.round(config.maxUploadBytes / 1024 / 1024)} MB limit` } });
    }
    return res.status(400).json({ error: { code: 'upload_error', message: err.message } });
  }
  next(err);
});
