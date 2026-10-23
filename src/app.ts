import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import type { Config } from './config.js';
import { requireApiKey } from './middleware/auth.js';
import { ApiError, errorHandler, notFound } from './middleware/errors.js';
import { requestLogger } from './middleware/requestLogger.js';
import { createProvider } from './providers/index.js';
import type { LLMProvider } from './providers/types.js';
import { generateRouter } from './routes/generate.js';

export function createApp(config: Config, provider: LLMProvider = createProvider(config)) {
  const app = express();

  // Render (and most hosts) sit behind one proxy; needed for correct client IPs.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(requestLogger);
  app.use(express.json({ limit: '10kb' }));

  app.get('/', (_req, res) => {
    res.json({
      name: 'llm-text-api',
      status: 'ok',
      endpoints: ['GET /health', 'POST /api/generate'],
      docs: 'https://github.com/Jawadkhera/llm-text-api',
    });
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Rate limit runs before auth so it also slows down key guessing.
  const limiter = rateLimit({
    windowMs: 60_000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(new ApiError(429, 'RATE_LIMITED', 'Too many requests. Limit is 20 per minute'));
    },
  });

  app.use('/api', limiter, requireApiKey(config.serviceApiKey), generateRouter(provider, config.upstreamTimeoutMs));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
