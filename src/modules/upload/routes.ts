import { Router } from 'express';
import uploadController from './controller';
import { requireAuth } from '@common/middleware/auth';

const router = Router();

/**
 * Image upload (Cloudinary-backed). Used by the student & employee admission
 * forms to host profile photos and return a hosted URL.
 */
router.post('/image', requireAuth, async (req, res) => {
  await uploadController.uploadImage(req, res);
});

router.post('/file', requireAuth, async (req, res) => {
  await uploadController.uploadFile(req, res);
});

export default router;
