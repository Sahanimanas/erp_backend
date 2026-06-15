import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '@common/middleware/auth';
import { successResponse, errorResponse } from '@common/utils/response';
import { db } from '@common/database/client';

const router = Router();

/**
 * Get the current user's school (resolved from the JWT school context so it
 * works without a tenant subdomain, e.g. on localhost).
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const schoolId = req.user?.schoolId || req.school?.id;
    if (!schoolId) {
      return void successResponse(res, 404, null, 'School not found');
    }
    const school = await db.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true, logo: true, email: true, phone: true, address: true },
    });
    successResponse(res, 200, school);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Update the current user's own school branding (name + logo). School admins /
 * principals only; scoped to their own school via the JWT, not a URL param.
 */
router.put('/', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), async (req: Request, res: Response) => {
  try {
    const schoolId = req.user?.schoolId;
    if (!schoolId) return void errorResponse(res, 400, 'No school context');

    const { name, logo } = req.body ?? {};
    const data: any = {};
    if (name !== undefined) {
      const trimmed = String(name).trim();
      if (!trimmed) return void errorResponse(res, 400, 'School name cannot be empty');
      data.name = trimmed;
    }
    if (logo !== undefined) data.logo = logo || null;
    if (!Object.keys(data).length) return void errorResponse(res, 400, 'Nothing to update');

    const updated = await db.school.update({
      where: { id: schoolId },
      data,
      select: { id: true, name: true, logo: true },
    });
    successResponse(res, 200, updated, 'School updated successfully');
  } catch (error: any) {
    const msg = error?.code === 'P2002' ? 'A school with this name already exists' : (error.message || 'Failed to update school');
    errorResponse(res, 400, msg);
  }
});

export default router;
