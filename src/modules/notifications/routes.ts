import { Router } from 'express';
import notificationController from './controller';
import { requireAuth, requireRole } from '@common/middleware/auth';

const router = Router();

/**
 * User Notifications
 */

router.get('/', requireAuth, async (req, res) => {
  await notificationController.getUserNotifications(req, res);
});

router.get('/unread', requireAuth, async (req, res) => {
  await notificationController.getUnreadCount(req, res);
});

router.patch('/:notificationId/read', requireAuth, async (req, res) => {
  await notificationController.markAsRead(req, res);
});

router.patch('/read-all', requireAuth, async (req, res) => {
  await notificationController.markAllAsRead(req, res);
});

router.delete('/:notificationId', requireAuth, async (req, res) => {
  await notificationController.deleteNotification(req, res);
});

/**
 * Admin Notifications
 */

router.post('/', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), async (req, res) => {
  await notificationController.createNotification(req, res);
});

router.post('/broadcast/role', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), async (req, res) => {
  await notificationController.broadcastToRole(req, res);
});

router.post('/broadcast/all', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), async (req, res) => {
  await notificationController.broadcastToAll(req, res);
});

/**
 * Query
 */

router.get('/type/:type', requireAuth, async (req, res) => {
  await notificationController.getNotificationsByType(req, res);
});

export default router;
