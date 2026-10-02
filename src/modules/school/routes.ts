import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '@common/middleware/auth';
import { successResponse, errorResponse } from '@common/utils/response';
import { db } from '@common/database/client';

const router = Router();

/** Everything the settings screen reads back about the school itself. */
const SCHOOL_SELECT = {
  id: true, name: true, slug: true, email: true, phone: true,
  address: true, city: true, state: true, pincode: true, country: true,
  logo: true, watermark: true, upiQr: true, website: true, foundedYear: true,
  principalName: true, principalEmail: true, schoolCode: true, registrationNumber: true,
  isActive: true,
} as const;

/**
 * Columns a school admin may edit about their own school. `email` and `slug`
 * are left out on purpose: they identify the tenant and are what logins and
 * subdomains resolve against, so changing them belongs to the platform admin,
 * not to the school.
 */
const EDITABLE_TEXT = [
  'name', 'phone', 'address', 'city', 'state', 'pincode', 'country',
  'website', 'principalName', 'principalEmail', 'schoolCode', 'registrationNumber',
  'logo', 'watermark', 'upiQr',
] as const;

/** Settings sections the screen may read or write. */
const SECTIONS = [
  'general', 'panel', 'mobile', 'slider', 'live',
  'payment', 'sms', 'email', 'accounting', 'whatsapp', 'attendance',
];

const schoolIdOf = (req: Request) => req.user?.schoolId || req.school?.id;

/**
 * The current user's school, resolved from the JWT school context so it works
 * without a tenant subdomain (e.g. on localhost).
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const schoolId = schoolIdOf(req);
    if (!schoolId) return void successResponse(res, 404, null, 'School not found');
    const school = await db.school.findUnique({ where: { id: schoolId }, select: SCHOOL_SELECT });
    successResponse(res, 200, school);
  } catch (error: any) {
    errorResponse(res, 500, error.message || 'Failed to load the school');
  }
});

/**
 * Update the school's own details. Scoped to the caller's school via the JWT,
 * never a URL param, so one school can never edit another.
 */
router.put('/', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), async (req: Request, res: Response) => {
  try {
    const schoolId = req.user?.schoolId;
    if (!schoolId) return void errorResponse(res, 400, 'No school context');

    const body = req.body ?? {};
    const data: any = {};

    for (const key of EDITABLE_TEXT) {
      if (body[key] === undefined) continue;
      const v = body[key] === null ? null : String(body[key]).trim();
      if (key === 'name' && !v) return void errorResponse(res, 400, 'School name cannot be empty');
      data[key] = v || null;
    }

    if (body.foundedYear !== undefined) {
      if (body.foundedYear === null || body.foundedYear === '') {
        data.foundedYear = null;
      } else {
        const y = Number(body.foundedYear);
        if (!Number.isInteger(y) || y < 1800 || y > new Date().getFullYear()) {
          return void errorResponse(res, 400, 'Founded year looks wrong');
        }
        data.foundedYear = y;
      }
    }

    if (!Object.keys(data).length) return void errorResponse(res, 400, 'Nothing to update');

    const updated = await db.school.update({ where: { id: schoolId }, data, select: SCHOOL_SELECT });
    successResponse(res, 200, updated, 'School details saved');
  } catch (error: any) {
    // name / schoolCode / registrationNumber are unique platform-wide, so a
    // clash is a real possibility worth naming rather than a generic failure.
    const msg = error?.code === 'P2002'
      ? `Another school already uses that ${(error.meta?.target ?? ['value']).join(', ')}`
      : (error.message || 'Failed to save the school details');
    errorResponse(res, 400, msg);
  }
});

/* ── Settings sections ───────────────────────────────────────────────────── */

/**
 * One section's saved form. Returns {} when it has never been saved, so the
 * client merges it over its own defaults without branching on null.
 */
router.get('/settings/:section', requireAuth, async (req: Request, res: Response) => {
  try {
    const schoolId = schoolIdOf(req);
    if (!schoolId) return void errorResponse(res, 400, 'No school context');
    const section = String(req.params.section);
    if (!SECTIONS.includes(section)) return void errorResponse(res, 400, 'Unknown settings section');

    const row = await db.schoolSetting.findUnique({
      where: { schoolId_section: { schoolId, section } },
    });
    successResponse(res, 200, row?.value ?? {});
  } catch (error: any) {
    errorResponse(res, 400, error.message || 'Failed to load the settings');
  }
});

router.put('/settings/:section', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), async (req: Request, res: Response) => {
  try {
    const schoolId = req.user?.schoolId;
    if (!schoolId) return void errorResponse(res, 400, 'No school context');
    const section = String(req.params.section);
    if (!SECTIONS.includes(section)) return void errorResponse(res, 400, 'Unknown settings section');

    const value = req.body ?? {};
    if (typeof value !== 'object' || Array.isArray(value)) {
      return void errorResponse(res, 400, 'Settings must be an object');
    }

    const row = await db.schoolSetting.upsert({
      where: { schoolId_section: { schoolId, section } },
      update: { value, updatedBy: req.user?.id ?? null },
      create: { schoolId, section, value, updatedBy: req.user?.id ?? null },
    });
    successResponse(res, 200, row.value, 'Settings saved');
  } catch (error: any) {
    errorResponse(res, 400, error.message || 'Failed to save the settings');
  }
});

export default router;
