import { Router } from 'express';
import noticeController from './controller';
import { requireAuth } from '@common/middleware/auth';

const router = Router();
router.get('/', requireAuth, (req, res) => noticeController.list(req, res));
router.get('/unread', requireAuth, (req, res) => noticeController.unread(req, res));
router.post('/', requireAuth, (req, res) => noticeController.create(req, res));
router.patch('/:id/read', requireAuth, (req, res) => noticeController.markRead(req, res));
router.delete('/:id', requireAuth, (req, res) => noticeController.remove(req, res));
export default router;
