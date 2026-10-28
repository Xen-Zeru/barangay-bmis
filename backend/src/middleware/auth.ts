import { UserStatus } from '@prisma/client';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ERROR_CODES, AppError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { toUserDto } from '../modules/auth/auth.types';
import type { AuthUser } from '../modules/auth/auth.types';
import { hasPermission } from '../security/permissions';
import type { Permission } from '../security/permissions';

/**
 * Loads the authenticated user from the database on every request, so role
 * changes, lockouts, and deactivations take effect immediately instead of
 * waiting for the session to expire.
 */
export const loadCurrentUser: RequestHandler = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  if (!req.session.userId) {
    next();
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.session.userId },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      req.session.userId = undefined;
      next();
      return;
    }

    req.user = toUserDto(user);
    next();
  } catch (error) {
    next(error);
  }
};

export const requireAuth: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  if (!req.user) {
    next(
      new AppError(
        401,
        ERROR_CODES.UNAUTHENTICATED,
        'You must sign in to continue.',
      ),
    );
    return;
  }
  next();
};

export function requirePermission(permission: Permission): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(
        new AppError(
          401,
          ERROR_CODES.UNAUTHENTICATED,
          'You must sign in to continue.',
        ),
      );
      return;
    }

    if (!hasPermission(req.user.role, permission)) {
      next(
        new AppError(
          403,
          ERROR_CODES.FORBIDDEN,
          'You do not have permission to perform this action.',
        ),
      );
      return;
    }

    next();
  };
}

export function requireUser(req: Request): AuthUser {
  if (!req.user) {
    throw new AppError(
      401,
      ERROR_CODES.UNAUTHENTICATED,
      'You must sign in to continue.',
    );
  }
  return req.user;
}
