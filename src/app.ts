import express from 'express';
import helmet from 'helmet';
import type { Config } from './config.js';
import { requestLogger } from './middleware/requestLogger.js';

export function createApp(config: Config) {
  const app = express();

  // Render (and most hosts) sit behind one proxy; needed for correct client IPs.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(requestLogger);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  return app;
}
