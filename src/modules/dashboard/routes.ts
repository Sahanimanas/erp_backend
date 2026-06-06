import { Router } from 'express';
import dashboardController from './controller';
import { requireAuth } from '@common/middleware/auth';

const router = Router();

/**
 * Dashboard Statistics
 */

router.get('/stats', requireAuth, async (req, res) => {
  await dashboardController.getStats(req, res);
});

export default router;
