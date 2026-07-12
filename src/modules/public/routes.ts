import { Router, Request, Response } from 'express';
import { db } from '@common/database/client';
import { config } from '@config/environment';
import { successResponse } from '@common/utils/response';

const router = Router();

/**
 * Public school branding lookup — resolves a school's name + logo from the
 * request host / subdomain (or an explicit ?slug=). Used by the login page,
 * which runs before authentication, so this route must stay public (no auth).
 *
 *   GET /api/v1/public/school?host=dps.globalschoolmitra.com
 *   GET /api/v1/public/school?slug=dps
 *
 * Returns the school { name, logo, slug } or null when the host maps to no
 * tenant (e.g. localhost, the apex/www domain, or a bare API host).
 */
router.get('/school', async (req: Request, res: Response) => {
  try {
    const rawHost = String(req.query.host || req.get('host') || '');
    const host = rawHost.split(':')[0]; // strip any :port
    let slug = req.query.slug ? String(req.query.slug).trim() : '';

    // Derive the slug from a subdomain of the configured platform domain.
    if (!slug && host) {
      const platformDomain = config.domain.platform; // e.g. globalschoolmitra.com
      const parts = host.split('.');
      if (host.endsWith(`.${platformDomain}`) && parts.length > platformDomain.split('.').length) {
        const s = parts[0];
        if (s !== 'api' && s !== 'www') slug = s;
      }
    }

    let school: { name: string; logo: string | null; slug: string } | null = null;

    if (slug) {
      school = await db.school.findUnique({
        where: { slug },
        select: { name: true, logo: true, slug: true },
      });
    }

    // Fall back to a custom-domain lookup (schools served on their own domain).
    if (!school && host) {
      const domain = await db.schoolDomain.findUnique({
        where: { domain: host },
        include: { school: { select: { name: true, logo: true, slug: true } } },
      });
      if (domain?.isActive) school = domain.school;
    }

    return void successResponse(res, 200, school, school ? 'School found' : 'No school for host');
  } catch {
    // Never block the login page on branding — just return no school.
    return void successResponse(res, 200, null, 'No school');
  }
});

/**
 * Public platform statistics for the marketing landing page — aggregate,
 * non-sensitive counts across all tenants. No auth (shown before login).
 *
 *   GET /api/v1/public/stats
 *   → { schools, students, employees, parents }
 *
 * `schools` excludes the internal "platform" tenant and any soft-deleted rows.
 */
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const [schools, students, employees, parents] = await Promise.all([
      db.school.count({ where: { deletedAt: null, slug: { not: 'platform' } } }),
      db.student.count({ where: { deletedAt: null } }),
      db.employee.count({ where: { deletedAt: null } }),
      db.parent.count({ where: { deletedAt: null } }),
    ]);
    return void successResponse(res, 200, { schools, students, employees, parents }, 'Platform stats');
  } catch {
    // Never block the landing page — return zeros so the UI can fall back.
    return void successResponse(res, 200, { schools: 0, students: 0, employees: 0, parents: 0 }, 'Stats unavailable');
  }
});

export default router;
