import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { pool } from './db/pool.js';
import { analysisService } from './services/analysis.js';
import { getConnector } from './services/connectors/index.js';
import { rateLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { healthRouter } from './routes/health.js';
import { samplesRouter } from './routes/samples.js';
import { jobsRouter } from './routes/jobs.js';
import { reportsRouter } from './routes/reports.js';
import { logger } from './lib/log.js';

async function main(): Promise<void> {
  const app = express();

  if (config.trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // Security headers (defense in depth — nginx also sets headers for the HTML app).
  app.use(helmet({
    contentSecurityPolicy: false, // API serves JSON only; CSP is applied at the web tier
    crossOriginResourcePolicy: { policy: 'same-site' },
  }));

  // Same-origin by default (nginx proxies /api). Optional explicit allow-list.
  if (config.corsOrigins.length > 0) {
    app.use(cors({ origin: config.corsOrigins, methods: ['GET', 'POST'] }));
  }

  app.use(express.json({ limit: '16kb' }));

  // General per-IP rate limit across the API surface.
  app.use('/api', rateLimiter({ windowMs: config.rateWindowMs, max: config.rateMaxRequests, name: 'api' }));

  app.use('/api/health', healthRouter);
  app.use('/api/samples', samplesRouter);
  app.use('/api/jobs', jobsRouter);
  app.use('/api/reports', reportsRouter);

  app.use(notFound);
  app.use(errorHandler);

  // Initialize: schema + seed, pick connector, resume any orphaned jobs.
  await migrate();
  const connector = getConnector();

  // The static engine reads the retained bytes. Without them every upload would
  // be scanned against an empty string and come back with nothing matched, so
  // fail loudly here rather than let reports quietly claim "no signatures".
  if (connector.name === 'static' && !config.retainBytes) {
    logger.warn('api', 'SANDBOX_CONNECTOR=static requires RETAIN_BYTES=true — uploaded bytes are not being retained, so file submissions cannot be scanned and will be reported as inconclusive');
  }
  await analysisService.resumeOrphans();

  const server = app.listen(config.port, () => {
    logger.info('api', `Detonate Lab API listening on :${config.port}`, { env: config.env });
  });

  const shutdown = (sig: string) => {
    logger.info('api', `${sig} received, shutting down`);
    server.close(() => {
      pool.end().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('api', 'fatal startup error', { err: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
