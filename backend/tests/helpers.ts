import { UserRole, UserStatus } from '@prisma/client';
import type { User } from '@prisma/client';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { env } from '../src/config/env';
import { prisma } from '../src/lib/prisma';

export const TEST_PASSWORD = 'TestPassword!2026';

export type Agent = ReturnType<typeof request.agent>;

interface CreateUserOptions {
  username?: string;
  email?: string;
  role?: UserRole;
  status?: UserStatus;
  password?: string;
  firstName?: string;
  lastName?: string;
}

let userSequence = 0;

export async function resetDatabase(): Promise<void> {
  await prisma.auditLog.deleteMany();
  await prisma.session.deleteMany();
  await prisma.householdChange.deleteMany();
  await prisma.householdMembership.deleteMany();
  await prisma.household.deleteMany();
  await prisma.householdNumberSequence.deleteMany();
  await prisma.purok.deleteMany();
  await prisma.residentDuplicateReview.deleteMany();
  await prisma.residentCorrection.deleteMany();
  await prisma.residentChange.deleteMany();
  await prisma.resident.deleteMany();
  await prisma.residentIdentityGuard.deleteMany();
  await prisma.residentNumberSequence.deleteMany();
  await prisma.user.deleteMany();
  userSequence = 0;
}

export async function createTestUser(
  options: CreateUserOptions = {},
): Promise<User> {
  userSequence += 1;
  const username = options.username ?? `test.user.${userSequence}`;
  const password = options.password ?? TEST_PASSWORD;

  return prisma.user.create({
    data: {
      username,
      email: options.email ?? `${username}@bmis.test`,
      passwordHash: await bcrypt.hash(password, env.BCRYPT_ROUNDS),
      firstName: options.firstName ?? 'Test',
      lastName: options.lastName ?? 'User',
      role: options.role ?? UserRole.SYSTEM_ADMIN,
      status: options.status ?? UserStatus.ACTIVE,
    },
  });
}

export async function fetchCsrfToken(agent: Agent): Promise<string> {
  const response = await agent.get('/api/auth/csrf').expect(200);
  return response.body.csrfToken as string;
}

export interface TestApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface LoginResponseBody {
  user?: Record<string, unknown>;
  csrfToken?: string;
  error?: TestApiError;
}

export interface LoginResult {
  status: number;
  body: LoginResponseBody;
  csrfToken: string;
}

export async function loginAgent(
  agent: Agent,
  username: string,
  password: string = TEST_PASSWORD,
): Promise<LoginResult> {
  const csrfToken = await fetchCsrfToken(agent);
  const response = await agent
    .post('/api/auth/login')
    .set('X-CSRF-Token', csrfToken)
    .send({ username, password });

  return {
    status: response.status,
    body: response.body as LoginResponseBody,
    csrfToken: (response.body?.csrfToken as string | undefined) ?? csrfToken,
  };
}
