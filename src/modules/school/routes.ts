import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '@common/middleware/auth';
import { successResponse } from '@common/utils/response';

const router = Router();

/**
 * Get school details
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.school) {
      return void successResponse(res, 404, null, 'School not found');
    }

    successResponse(res, 200, req.school);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
