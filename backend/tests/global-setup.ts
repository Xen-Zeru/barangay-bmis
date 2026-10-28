import { execFileSync } from 'node:child_process';
import path from 'node:path';
import dotenv from 'dotenv';

/**
 * Applies committed Prisma migrations to the dedicated test database before
 * the suite runs. Tests never touch the development database.
 */
export default function globalSetup(): void {
  const backendRoot = path.resolve(__dirname, '..');

  dotenv.config({
    path: path.join(backendRoot, '.env.test'),
    quiet: true,
    override: true,
  });

  const databaseUrl =
    process.env.DATABASE_URL ?? 'mysql://xenn@127.0.0.1:3306/test_bmis_test';

  if (!/_test(\?|$)/.test(databaseUrl)) {
    throw new Error(
      'Refusing to run tests: DATABASE_URL must point to a *_test database.',
    );
  }

  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

  execFileSync(npx, ['prisma', 'migrate', 'deploy'], {
    cwd: backendRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      CHECKPOINT_DISABLE: '1',
    },
  });
}
