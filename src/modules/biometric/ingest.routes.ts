import { Router } from 'express';
import biometricController from './controller';

/**
 * PUBLIC device-ingest router — mounted BEFORE the JWT/tenant middleware.
 * Biometric terminals cannot present a user token, so each device authenticates
 * with its own API key (header `x-device-key`, `?key=`, or body `key`). The key
 * resolves the device → school, providing tenant isolation without a login.
 *
 *   POST /api/v1/device/attendance
 */
const router = Router();

router.post('/attendance', (req, res) => biometricController.ingest(req, res));

// Some firmwares probe with a GET first — answer so the device marks the host reachable.
router.get('/attendance', (_req, res) => res.status(200).json({ success: true, message: 'ready' }));

export default router;
