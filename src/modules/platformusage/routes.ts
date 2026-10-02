/**
 * Platform usage routes — mounted at /api/v1/platform-usage.
 *
 * SUPER_ADMIN only, without exception: every figure here is summed across
 * tenants, so there is no version of these numbers a single school may see.
 */
import { Router } from 'express';
import { requireAuth, requireRole } from '@common/middleware/auth';
import controller from './controller';

const router = Router();

router.get('/whatsapp', requireAuth, requireRole('SUPER_ADMIN'), (req, res) =>
  controller.whatsappUsage(req, res)
);
router.get('/whatsapp/daily', requireAuth, requireRole('SUPER_ADMIN'), (req, res) =>
  controller.whatsappDaily(req, res)
);

export default router;
