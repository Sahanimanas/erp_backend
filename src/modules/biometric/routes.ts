import { Router } from 'express';
import biometricController from './controller';
import { requireAuth, requireRole } from '@common/middleware/auth';

const router = Router();
const adminOnly = requireRole('SCHOOL_ADMIN', 'PRINCIPAL');

/**
 * Device management
 */
router.post('/devices', requireAuth, adminOnly, (req, res) => biometricController.registerDevice(req, res));
router.get('/devices', requireAuth, (req, res) => biometricController.listDevices(req, res));
router.patch('/devices/:id', requireAuth, adminOnly, (req, res) => biometricController.updateDevice(req, res));
router.post('/devices/:id/rotate-key', requireAuth, adminOnly, (req, res) => biometricController.rotateKey(req, res));
router.delete('/devices/:id', requireAuth, adminOnly, (req, res) => biometricController.deleteDevice(req, res));

/**
 * Enrollments (device identity → student)
 */
router.post('/enrollments', requireAuth, adminOnly, (req, res) => biometricController.enrollStudent(req, res));
router.get('/enrollments', requireAuth, (req, res) => biometricController.listEnrollments(req, res));
router.delete('/enrollments/:id', requireAuth, adminOnly, (req, res) => biometricController.deleteEnrollment(req, res));

/**
 * Punch log
 */
router.get('/punches', requireAuth, (req, res) => biometricController.listPunches(req, res));

export default router;
