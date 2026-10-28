import cors from 'cors';
import type { CorsOptions } from 'cors';
import express from 'express';
import type { Express } from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { AppError, ERROR_CODES } from './lib/errors';
import { loadCurrentUser } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { apiRateLimiter } from './middleware/rate-limit';
import { sessionMiddleware } from './middleware/session';
import { apiRouter } from './routes';
import { csrfProtection } from './security/csrf';

const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (!origin || env.allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(
      new AppError(
        403,
        ERROR_CODES.CORS_ORIGIN_DENIED,
        'This origin is not allowed to call the BMIS API.',
      ),
    );
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
  maxAge: 600,
};

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');

  if (env.TRUST_PROXY) {
    app.set('trust proxy', 1);
  }

  app.use(helmet());
  app.use(cors(corsOptions));
  app.use(express.json({ limit: '100kb' }));
  app.use(sessionMiddleware);
  app.use(loadCurrentUser);

  app.use('/api', apiRateLimiter);
  app.use('/api', csrfProtection);
  app.use('/api', apiRouter);
  app.use('/api', notFoundHandler);
  app.use(errorHandler);

  return app;
}
