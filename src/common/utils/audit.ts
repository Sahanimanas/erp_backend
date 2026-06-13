/**
 * audit.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Enterprise audit trail. Records privileged actions (especially Super Admin
 * platform operations) to the AuditLog table.
 *
 * Design notes:
 *  - Audit writes are best-effort: a logging failure must NEVER break the action
 *    being audited, so every write is wrapped and errors are swallowed (logged
 *    to the process logger only).
 *  - AuditLog.schoolId is required by the schema. Super-Admin actions are scoped
 *    to the school they affect; for genuinely platform-wide actions the affected
 *    school's id is used as the anchor.
 */
import { Request } from 'express';
import { db } from '@common/database/client';

export const AuditActions = {
  SCHOOL_CREATED: 'SCHOOL_CREATED',
  SCHOOL_UPDATED: 'SCHOOL_UPDATED',
  SCHOOL_ACTIVATED: 'SCHOOL_ACTIVATED',
  SCHOOL_SUSPENDED: 'SCHOOL_SUSPENDED',
  SCHOOL_DELETED: 'SCHOOL_DELETED',
  PLAN_CREATED: 'PLAN_CREATED',
  PLAN_UPDATED: 'PLAN_UPDATED',
  SUBSCRIPTION_ASSIGNED: 'SUBSCRIPTION_ASSIGNED',
  SUBSCRIPTION_CHANGED: 'SUBSCRIPTION_CHANGED',
  MODULES_UPDATED: 'MODULES_UPDATED',
  DOMAIN_ADDED: 'DOMAIN_ADDED',
  DOMAIN_VERIFIED: 'DOMAIN_VERIFIED',
  DOMAIN_REMOVED: 'DOMAIN_REMOVED',
  IMPERSONATE_SCHOOL_ADMIN: 'IMPERSONATE_SCHOOL_ADMIN',
  RESET_SCHOOL_ADMIN_PASSWORD: 'RESET_SCHOOL_ADMIN_PASSWORD',
  USER_DISABLED: 'USER_DISABLED',
} as const;

export type AuditAction = (typeof AuditActions)[keyof typeof AuditActions];

interface AuditInput {
  schoolId: string;
  userId: string;
  action: AuditAction | string;
  entity: string;
  entityId: string;
  oldValues?: unknown;
  newValues?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Extract the caller's IP + user agent from an Express request. Honours
 * X-Forwarded-For so the real client IP survives a proxy / load balancer.
 */
export const getRequestMeta = (req: Request) => {
  const forwarded = req.headers['x-forwarded-for'];
  const ipAddress =
    (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]?.trim()) ||
    req.ip ||
    req.socket?.remoteAddress ||
    null;
  const userAgent = req.get('user-agent') || null;
  return { ipAddress, userAgent };
};

const safeStringify = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return undefined;
  try {
    return JSON.stringify(value, (_k, v) =>
      typeof v === 'bigint' ? Number(v) : v
    );
  } catch {
    return undefined;
  }
};

/**
 * Write an audit record. Never throws.
 */
export const recordAudit = async (input: AuditInput): Promise<void> => {
  try {
    await db.auditLog.create({
      data: {
        schoolId: input.schoolId,
        userId: input.userId,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        oldValues: safeStringify(input.oldValues),
        newValues: safeStringify(input.newValues),
        ipAddress: input.ipAddress ?? undefined,
        userAgent: input.userAgent ?? undefined,
      },
    });
  } catch (error) {
    // Audit must not break the primary operation.
    console.error('[audit] failed to record action', input.action, error);
  }
};

/**
 * Convenience helper that pulls the actor + request metadata straight off the
 * Express request.
 */
export const auditFromRequest = async (
  req: Request,
  params: Omit<AuditInput, 'userId' | 'ipAddress' | 'userAgent'>
): Promise<void> => {
  const meta = getRequestMeta(req);
  await recordAudit({
    ...params,
    userId: req.user?.id || 'system',
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
};
