/**
 * common/utils/errors.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Turns any thrown value into something safe to put on the wire.
 *
 * Prisma's errors are written for the developer, not the user: a single failed
 * `update()` prints the whole argument object plus every accepted field of the
 * model — hundreds of characters that leak the schema and are unreadable in a
 * toast. Everything that reaches the client goes through here first, so the UI
 * only ever gets a one-line message plus a short code; the full text is logged
 * server-side where it belongs.
 */

/** Longest message we are willing to send to the browser. */
const MAX_CLIENT_MESSAGE = 180;

export interface SafeError {
  status: number;
  error: string;
  code: string;
}

/** Prisma dumps look like: Invalid `prisma.employee.update()` invocation: … */
const PRISMA_NOISE = /invalid `prisma\.|prismaclient|invocation:|argument `|available options are/i;

/** P2002 & friends carry the offending columns in `meta.target`. */
function targetFields(err: any): string {
  const t = err?.meta?.target;
  if (Array.isArray(t)) return t.join(', ');
  if (typeof t === 'string') return t;
  return '';
}

/** Known Prisma error codes → a sentence a user can act on. */
function fromPrismaCode(err: any): SafeError | null {
  const code: string | undefined = err?.code;
  if (typeof code !== 'string' || !/^P\d{4}$/.test(code)) return null;

  const fields = targetFields(err);
  switch (code) {
    case 'P2000':
      return { status: 400, code, error: `Value too long${fields ? ` for ${fields}` : ''}` };
    case 'P2002':
      return { status: 409, code, error: `A record with this ${fields || 'value'} already exists` };
    case 'P2003':
      return { status: 400, code, error: 'Linked record does not exist' };
    case 'P2011':
      return { status: 400, code, error: `Required field missing${fields ? `: ${fields}` : ''}` };
    case 'P2014':
      return { status: 400, code, error: 'Cannot delete — other records still reference this' };
    case 'P2025':
      return { status: 404, code, error: 'Record not found' };
    default:
      return { status: 400, code, error: 'Database request failed' };
  }
}

/**
 * Normalise any thrown value into `{ status, error, code }`.
 * `fallback` is used when the error carries nothing usable.
 */
export function toSafeError(err: unknown, fallback = 'Request failed'): SafeError {
  const e = err as any;

  // Log the real thing once, here, so no caller has to remember to.
  if (e) console.error('[error]', e?.stack || e?.message || e);

  const prisma = fromPrismaCode(e);
  if (prisma) return prisma;

  const name: string = e?.name ?? '';
  const raw: string = typeof e?.message === 'string' ? e.message : '';

  // PrismaClientValidationError and friends: no code, giant message.
  if (name.startsWith('PrismaClient') || PRISMA_NOISE.test(raw)) {
    return { status: 400, code: 'DB_VALIDATION', error: 'Invalid data for this record' };
  }

  const message = raw.trim() || fallback;
  if (!message || message.length > MAX_CLIENT_MESSAGE) {
    return { status: 400, code: 'BAD_REQUEST', error: fallback };
  }

  const lower = message.toLowerCase();
  if (lower.includes('not found')) return { status: 404, code: 'NOT_FOUND', error: message };
  if (lower.includes('already exists')) return { status: 409, code: 'CONFLICT', error: message };
  if (lower.includes('unauthor') || lower.includes('forbidden') || lower.includes('permission')) {
    return { status: 403, code: 'FORBIDDEN', error: message };
  }

  return { status: 400, code: 'BAD_REQUEST', error: message };
}

/**
 * Same sanitising for the many call sites that already hand `errorResponse` a
 * plain `error.message` string — keeps a raw Prisma dump from reaching the UI
 * even where the controller was not updated to pass the error object.
 */
export function sanitizeMessage(message: string, fallback = 'Request failed'): string {
  const m = (message ?? '').trim();
  if (!m) return fallback;
  if (PRISMA_NOISE.test(m)) return 'Invalid data for this record';
  if (m.length > MAX_CLIENT_MESSAGE) return `${m.slice(0, MAX_CLIENT_MESSAGE - 1).trimEnd()}…`;
  return m;
}
