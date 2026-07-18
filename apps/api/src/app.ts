import path from 'node:path';
import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { env } from './config/env';
import { logger } from './config/logger';
import { buildApiRouter } from './routes';
import { notFound } from './shared/middleware/notFound';
import { errorHandler } from './shared/middleware/errorHandler';
import { ok } from './shared/utils/apiResponse';

export function createApp(): Express {
  const app = express();

  app.set('trust proxy', 1); // correct req.ip behind a proxy (rate limiting)
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  // Gzip JSON responses — POS tablets on shop Wi-Fi/4G pull product lists and
  // analytics payloads that shrink ~80% compressed.
  app.use(compression());
  app.use(
    cors({
      origin: env.WEB_ORIGIN,
      credentials: true,
    }),
  );
  app.use(
    express.json({
      limit: '1mb',
      // Stash the raw body so the Razorpay webhook can verify its signature.
      verify: (req, _res, buf) => {
        (req as express.Request).rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/health' },
      // Compact one-line request logs (no header dumps).
      serializers: {
        req: (req) => `${req.method} ${req.url}`,
        res: (res) => `${res.statusCode}`,
      },
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
      customErrorMessage: (req, res, err) => `${req.method} ${req.url} ${res.statusCode} - ${err.message}`,
    }),
  );

  // Static file serving for uploaded product photos / generated PDFs.
  // Filenames are random UUIDs (a re-upload gets a new name), so clients can
  // cache aggressively — the POS tablet then loads its ~30 card photos from
  // disk instead of re-requesting them on every terminal load.
  app.use('/uploads', express.static(path.resolve(process.cwd(), env.UPLOAD_DIR), { maxAge: '30d', immutable: true }));

  app.get('/health', (_req, res) => {
    ok(res, { status: 'ok', uptime: process.uptime() }, 'healthy');
  });

  app.use('/api/v1', buildApiRouter());

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
