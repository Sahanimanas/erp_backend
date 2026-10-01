import { Router } from 'express';
import parentController from './controller';
import { requireAuth, requireRole } from '@common/middleware/auth';

const router = Router();

// Parent-facing: the logged-in parent's own children. MUST stay above `/:parentId`.
router.get('/me/children', requireAuth, async (req, res) => {
  await parentController.getMyChildren(req, res);
});

router.post('/', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), async (req, res) => {
  await parentController.createParent(req, res);
});

router.get('/', requireAuth, async (req, res) => {
  await parentController.listParents(req, res);
});

router.get('/:parentId', requireAuth, async (req, res) => {
  await parentController.getParentById(req, res);
});

router.put('/:parentId', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), async (req, res) => {
  await parentController.updateParent(req, res);
});

router.patch('/:parentId/deactivate', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), async (req, res) => {
  await parentController.deactivateParent(req, res);
});

router.patch('/:parentId/activate', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), async (req, res) => {
  await parentController.activateParent(req, res);
});

router.delete('/:parentId', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), async (req, res) => {
  await parentController.deleteParent(req, res);
});

export default router;
