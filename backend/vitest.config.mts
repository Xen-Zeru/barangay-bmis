import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['./tests/global-setup.ts'],
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 20_000,
    // DATABASE_URL is intentionally not set here: both the global setup and
    // the test workers read the isolated test URL from backend/.env.test.
    env: {
      NODE_ENV: 'test',
      SESSION_SECRET:
        'vitest-only-session-secret-that-is-long-enough-for-validation',
      SESSION_COOKIE_NAME: 'bmis.sid',
      SESSION_TTL_MINUTES: '60',
      COOKIE_SECURE: 'false',
      CORS_ORIGIN: 'http://localhost:5173',
      TRUST_PROXY: 'false',
      BCRYPT_ROUNDS: '4',
      LOGIN_MAX_ATTEMPTS: '3',
      LOGIN_LOCK_MINUTES: '15',
      RATE_LIMIT_DISABLED: 'true',
    },
  },
});
