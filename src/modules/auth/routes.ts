import { Router } from 'express';
import authController from './controller';
import { authenticate, requireAuth } from '@common/middleware/auth';

const router = Router();

/**
 * Public Routes
 */

// Login
router.post('/login', async (req, res) => {
  await authController.login(req, res);
});

// Refresh token
router.post('/refresh', async (req, res) => {
  await authController.refreshToken(req, res);
});

/**
 * Protected Routes
 */

// Get current user
// NOTE: the auth router is mounted before the global `authenticate` middleware,
// so protected auth routes must run `authenticate` themselves to populate req.user.
router.get('/me', authenticate, requireAuth, async (req, res) => {
  await authController.getCurrentUser(req, res);
});

// Change password
router.post('/change-password', authenticate, requireAuth, async (req, res) => {
  await authController.changePassword(req, res);
});

// Logout
router.post('/logout', authenticate, requireAuth, async (req, res) => {
  await authController.logout(req, res);
});

export default router;
