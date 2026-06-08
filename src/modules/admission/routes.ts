import { Router } from 'express';
import admissionController from './controller';
import { requireAuth, requireRole } from '@common/middleware/auth';

const router = Router();

const STAFF = ['SCHOOL_ADMIN', 'PRINCIPAL', 'TEACHER', 'ACCOUNTANT'] as const;

router.get('/enquiries/stats', requireAuth, (req, res) => admissionController.getStats(req, res));

router.get('/enquiries', requireAuth, (req, res) => admissionController.listEnquiries(req, res));
router.post('/enquiries', requireAuth, requireRole(...STAFF), (req, res) => admissionController.createEnquiry(req, res));
router.get('/enquiries/:id', requireAuth, (req, res) => admissionController.getEnquiry(req, res));
router.patch('/enquiries/:id', requireAuth, requireRole(...STAFF), (req, res) => admissionController.updateEnquiry(req, res));
router.put('/enquiries/:id', requireAuth, requireRole(...STAFF), (req, res) => admissionController.updateEnquiry(req, res));
router.post('/enquiries/:id/admit', requireAuth, requireRole(...STAFF), (req, res) => admissionController.admitEnquiry(req, res));
router.delete('/enquiries/:id', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), (req, res) => admissionController.deleteEnquiry(req, res));

export default router;
