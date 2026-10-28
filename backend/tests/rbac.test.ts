import { UserRole, UserStatus } from '@prisma/client';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../src/middleware/error-handler';
import { requirePermission } from '../src/middleware/auth';
import {
  hasPermission,
  PERMISSIONS,
  permissionsForRole,
} from '../src/security/permissions';

function buildProtectedApp(role?: UserRole) {
  const app = express();

  app.get(
    '/protected',
    (req, _res, next) => {
      if (role) {
        req.user = {
          id: 'test-user',
          username: 'test-user',
          email: 'test@bmis.test',
          firstName: 'Test',
          middleName: null,
          lastName: 'User',
          fullName: 'Test User',
          role,
          status: UserStatus.ACTIVE,
          lastLoginAt: null,
        };
      }
      next();
    },
    requirePermission(PERMISSIONS.USERS_MANAGE),
    (_req, res) => {
      res.json({ ok: true });
    },
  );

  app.use(errorHandler);
  return app;
}

describe('permission matrix', () => {
  it('limits account administration to the system administrator', () => {
    expect(hasPermission(UserRole.SYSTEM_ADMIN, PERMISSIONS.USERS_MANAGE)).toBe(
      true,
    );
    expect(
      hasPermission(UserRole.BARANGAY_SECRETARY, PERMISSIONS.USERS_MANAGE),
    ).toBe(false);
    expect(
      hasPermission(UserRole.BARANGAY_ENCODER, PERMISSIONS.USERS_MANAGE),
    ).toBe(false);
    expect(
      hasPermission(UserRole.BARANGAY_CAPTAIN, PERMISSIONS.USERS_MANAGE),
    ).toBe(false);
  });

  it('separates certificate approval from issuance', () => {
    expect(
      hasPermission(UserRole.BARANGAY_CAPTAIN, PERMISSIONS.CERTIFICATES_APPROVE),
    ).toBe(true);
    expect(
      hasPermission(UserRole.BARANGAY_CAPTAIN, PERMISSIONS.CERTIFICATES_ISSUE),
    ).toBe(false);
    expect(
      hasPermission(
        UserRole.BARANGAY_SECRETARY,
        PERMISSIONS.CERTIFICATES_ISSUE,
      ),
    ).toBe(true);
    expect(
      hasPermission(
        UserRole.BARANGAY_SECRETARY,
        PERMISSIONS.CERTIFICATES_APPROVE,
      ),
    ).toBe(false);
  });

  it('keeps controlled import away from encoders', () => {
    expect(
      hasPermission(UserRole.BARANGAY_ENCODER, PERMISSIONS.IMPORT_EXECUTE),
    ).toBe(false);
    expect(
      hasPermission(UserRole.BARANGAY_SECRETARY, PERMISSIONS.IMPORT_EXECUTE),
    ).toBe(true);
    expect(
      hasPermission(UserRole.SYSTEM_ADMIN, PERMISSIONS.IMPORT_EXECUTE),
    ).toBe(true);
  });

  it('keeps full resident access away from administrators and the captain', () => {
    for (const role of [
      UserRole.SYSTEM_ADMIN,
      UserRole.BARANGAY_CAPTAIN,
    ]) {
      expect(hasPermission(role, PERMISSIONS.RESIDENTS_READ)).toBe(false);
      expect(hasPermission(role, PERMISSIONS.RESIDENTS_WRITE)).toBe(false);
      expect(hasPermission(role, PERMISSIONS.RESIDENTS_VERIFY)).toBe(false);
    }

    expect(
      hasPermission(UserRole.BARANGAY_CAPTAIN, PERMISSIONS.RESIDENTS_LOOKUP),
    ).toBe(true);
    expect(
      hasPermission(UserRole.BARANGAY_SECRETARY, PERMISSIONS.RESIDENTS_READ),
    ).toBe(true);
    expect(
      hasPermission(UserRole.BARANGAY_ENCODER, PERMISSIONS.RESIDENTS_WRITE),
    ).toBe(true);
  });

  it('separates duplicate approval from correction approval', () => {
    expect(
      hasPermission(
        UserRole.BARANGAY_SECRETARY,
        PERMISSIONS.RESIDENTS_DUPLICATES_APPROVE,
      ),
    ).toBe(true);
    expect(
      hasPermission(
        UserRole.BARANGAY_CAPTAIN,
        PERMISSIONS.RESIDENTS_DUPLICATES_APPROVE,
      ),
    ).toBe(false);
    expect(
      hasPermission(
        UserRole.BARANGAY_CAPTAIN,
        PERMISSIONS.RESIDENTS_CORRECTIONS_APPROVE,
      ),
    ).toBe(true);
    expect(
      hasPermission(
        UserRole.BARANGAY_SECRETARY,
        PERMISSIONS.RESIDENTS_CORRECTIONS_APPROVE,
      ),
    ).toBe(false);
    expect(
      hasPermission(
        UserRole.BARANGAY_SECRETARY,
        PERMISSIONS.RESIDENTS_CORRECTIONS_REQUEST,
      ),
    ).toBe(true);
  });

  it('gives every role dashboard access', () => {
    for (const role of Object.values(UserRole)) {
      expect(hasPermission(role, PERMISSIONS.DASHBOARD_VIEW)).toBe(true);
      expect(permissionsForRole(role).length).toBeGreaterThan(0);
    }
  });
});

describe('requirePermission middleware', () => {
  it('allows an authorised role', async () => {
    const response = await request(
      buildProtectedApp(UserRole.SYSTEM_ADMIN),
    )
      .get('/protected')
      .expect(200);
    expect(response.body).toEqual({ ok: true });
  });

  it.each([
    UserRole.BARANGAY_SECRETARY,
    UserRole.BARANGAY_ENCODER,
    UserRole.BARANGAY_CAPTAIN,
  ])('forbids %s', async (role) => {
    const response = await request(buildProtectedApp(role))
      .get('/protected')
      .expect(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('rejects an unauthenticated request', async () => {
    const response = await request(buildProtectedApp()).get('/protected').expect(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });
});
