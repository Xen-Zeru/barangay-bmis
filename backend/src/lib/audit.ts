import type { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { prisma } from './prisma';

export const AUDIT_ACTIONS = {
  LOGIN_SUCCESS: 'AUTH_LOGIN_SUCCESS',
  LOGIN_FAILED: 'AUTH_LOGIN_FAILED',
  LOGIN_BLOCKED_LOCKED: 'AUTH_LOGIN_BLOCKED_LOCKED',
  LOGIN_BLOCKED_INACTIVE: 'AUTH_LOGIN_BLOCKED_INACTIVE',
  LOGOUT: 'AUTH_LOGOUT',
  RESIDENT_CREATED: 'RESIDENT_CREATED',
  RESIDENT_UPDATED: 'RESIDENT_UPDATED',
  RESIDENT_STATUS_CHANGED: 'RESIDENT_STATUS_CHANGED',
  RESIDENT_VERIFIED: 'RESIDENT_VERIFIED',
  RESIDENT_PROFILE_VIEWED: 'RESIDENT_PROFILE_VIEWED',
  RESIDENT_HISTORY_VIEWED: 'RESIDENT_HISTORY_VIEWED',
  DUPLICATE_REVIEW_REQUESTED: 'RESIDENT_DUPLICATE_REVIEW_REQUESTED',
  DUPLICATE_REVIEW_APPROVED: 'RESIDENT_DUPLICATE_REVIEW_APPROVED',
  DUPLICATE_REVIEW_REJECTED: 'RESIDENT_DUPLICATE_REVIEW_REJECTED',
  DUPLICATE_REVIEW_CANCELLED: 'RESIDENT_DUPLICATE_REVIEW_CANCELLED',
  DUPLICATE_REVIEW_VIEWED: 'RESIDENT_DUPLICATE_REVIEW_VIEWED',
  CORRECTION_REQUESTED: 'RESIDENT_CORRECTION_REQUESTED',
  CORRECTION_APPROVED: 'RESIDENT_CORRECTION_APPROVED',
  CORRECTION_REJECTED: 'RESIDENT_CORRECTION_REJECTED',
  CORRECTION_CANCELLED: 'RESIDENT_CORRECTION_CANCELLED',
  CORRECTION_VIEWED: 'RESIDENT_CORRECTION_VIEWED',
  STATUS_CORRECTED: 'RESIDENT_STATUS_CORRECTED',
  RESIDENT_EXPORTED: 'RESIDENT_EXPORTED',
  PUROK_CREATED: 'PUROK_CREATED',
  PUROK_UPDATED: 'PUROK_UPDATED',
  PUROK_STATUS_CHANGED: 'PUROK_STATUS_CHANGED',
  HOUSEHOLD_CREATED: 'HOUSEHOLD_CREATED',
  HOUSEHOLD_UPDATED: 'HOUSEHOLD_UPDATED',
  HOUSEHOLD_STATUS_CHANGED: 'HOUSEHOLD_STATUS_CHANGED',
  HOUSEHOLD_VERIFIED: 'HOUSEHOLD_VERIFIED',
  HOUSEHOLD_HEAD_CHANGED: 'HOUSEHOLD_HEAD_CHANGED',
  HOUSEHOLD_PROFILE_VIEWED: 'HOUSEHOLD_PROFILE_VIEWED',
  HOUSEHOLD_HISTORY_VIEWED: 'HOUSEHOLD_HISTORY_VIEWED',
  HOUSEHOLD_MEMBER_ADDED: 'HOUSEHOLD_MEMBER_ADDED',
  HOUSEHOLD_MEMBER_ENDED: 'HOUSEHOLD_MEMBER_ENDED',
  HOUSEHOLD_MEMBER_TRANSFERRED: 'HOUSEHOLD_MEMBER_TRANSFERRED',
  HOUSEHOLD_REVIEW_REQUIRED: 'HOUSEHOLD_REVIEW_REQUIRED',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export interface AuditContext {
  ipAddress: string | null;
  userAgent: string | null;
}

export interface AuditInput extends Partial<AuditContext> {
  action: AuditAction;
  actorUserId?: string | null;
  targetUserId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

export function auditContext(req: Request): AuditContext {
  return {
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent')?.slice(0, 255) ?? null,
  };
}

function auditData(input: AuditInput) {
  return {
    action: input.action,
    actorUserId: input.actorUserId ?? null,
    targetUserId: input.targetUserId ?? null,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
  };
}

/**
 * Writes an audit entry inside a caller-managed transaction. Resident
 * mutations use this so the business change and its audit record succeed or
 * fail together.
 */
export async function writeAudit(
  client: Prisma.TransactionClient,
  input: AuditInput,
): Promise<void> {
  await client.auditLog.create({ data: auditData(input) });
}

/**
 * Writes an audit entry without ever surfacing an audit failure to the caller.
 * Authentication audit logging must not break sign-in. Resident mutations use
 * writeAudit instead.
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({ data: auditData(input) });
  } catch (error) {
    console.error('Failed to write audit log entry', {
      action: input.action,
      error,
    });
  }
}

/**
 * Fail-closed audit write for sensitive resident reads. If this fails, the
 * caller must not return the sensitive payload.
 */
export async function recordSensitiveReadAudit(
  input: AuditInput,
): Promise<void> {
  await prisma.auditLog.create({ data: auditData(input) });
}
