import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './lib/prisma';
import { sessionStore } from './middleware/session';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.info(
    `BMIS API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`,
  );
});

const PRUNE_INTERVAL_MS = 15 * 60 * 1000;

const pruneTimer = setInterval(() => {
  void sessionStore
    .pruneExpired()
    .then((count) => {
      if (count > 0) {
        console.info(`Pruned ${count} expired session(s).`);
      }
    })
    .catch((error: unknown) => {
      console.error('Failed to prune expired sessions', error);
    });
}, PRUNE_INTERVAL_MS);
pruneTimer.unref();

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  console.info(`Received ${signal}. Shutting down BMIS API...`);
  clearInterval(pruneTimer);

  server.close(() => {
    void prisma.$disconnect().finally(() => {
      process.exit(0);
    });
  });

  setTimeout(() => {
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
