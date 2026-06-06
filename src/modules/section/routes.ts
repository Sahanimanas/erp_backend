import { Router } from 'express';
import sectionController from './controller';
import { requireAuth } from '@common/middleware/auth';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  await sectionController.listSections(req, res);
});

export default router;
