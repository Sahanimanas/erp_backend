/**
 * reservedSubdomains.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Subdomains that must never be handed to a tenant because they collide with
 * platform infrastructure, marketing, or the tenant-resolution middleware
 * (src/common/middleware/tenant.ts treats `api`/`www` specially).
 */

export const RESERVED_SUBDOMAINS = new Set<string>([
  'admin',
  'api',
  'www',
  'app',
  'support',
  'help',
  'dashboard',
  'super',
  'superadmin',
  'super-admin',
  'mail',
  'smtp',
  'ftp',
  'ns',
  'ns1',
  'ns2',
  'dns',
  'cdn',
  'static',
  'assets',
  'files',
  'media',
  'img',
  'images',
  'blog',
  'docs',
  'status',
  'billing',
  'pay',
  'payment',
  'payments',
  'checkout',
  'auth',
  'login',
  'signup',
  'register',
  'account',
  'accounts',
  'portal',
  'console',
  'staging',
  'dev',
  'test',
  'demo',
  'sandbox',
  'internal',
  'system',
  'root',
  'no-reply',
  'noreply',
  'info',
  'contact',
  'about',
  'go',
  'my',
]);

const SUBDOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$/;

export interface SubdomainValidation {
  valid: boolean;
  error?: string;
}

/**
 * Validate a candidate subdomain (the tenant slug). Rules:
 *  - 3–63 characters
 *  - lowercase letters, digits, and hyphens only
 *  - cannot start or end with a hyphen, no consecutive double hyphens
 *  - not in the reserved list
 *
 * Uniqueness is checked separately against the database (it requires I/O).
 */
export const validateSubdomain = (raw: string): SubdomainValidation => {
  if (!raw) return { valid: false, error: 'Subdomain is required' };

  const value = raw.trim();

  if (value !== value.toLowerCase()) {
    return { valid: false, error: 'Subdomain must be lowercase' };
  }
  if (/\s/.test(value)) {
    return { valid: false, error: 'Subdomain cannot contain spaces' };
  }
  if (value.length < 3 || value.length > 63) {
    return { valid: false, error: 'Subdomain must be 3–63 characters' };
  }
  if (!SUBDOMAIN_PATTERN.test(value)) {
    return {
      valid: false,
      error: 'Use only lowercase letters, numbers and hyphens (cannot start/end with a hyphen)',
    };
  }
  if (value.includes('--')) {
    return { valid: false, error: 'Subdomain cannot contain consecutive hyphens' };
  }
  if (RESERVED_SUBDOMAINS.has(value)) {
    return { valid: false, error: `"${value}" is a reserved subdomain` };
  }

  return { valid: true };
};
