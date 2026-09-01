import { Request, Response } from 'express';
import authService from './service';
import { successResponse, errorResponse, createdResponse } from '@common/utils/response';

export class AuthController {
  /**
   * Login
   */
  async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password, deviceId } = req.body;

      // Validate input
      if (!email || !password) {
        return void errorResponse(res, 400, 'Email and password are required');
      }

      const result = await authService.login({
        email,
        password,
        deviceId,
      });

      createdResponse(res, result, 'Login successful');
    } catch (error: any) {
      // Every credential-rejection reason (bad password, deactivated account,
      // deleted school) is a 401 the user can act on — not a server fault.
      if (
        error.message === 'Invalid email or password' ||
        /deactivated|has been removed/i.test(error.message || '')
      ) {
        return void errorResponse(res, 401, error.message);
      }
      errorResponse(res, 500, error.message || 'Login failed');
    }
  }

  /**
   * Refresh token
   */
  async refreshToken(req: Request, res: Response): Promise<void> {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return void errorResponse(res, 400, 'Refresh token is required');
      }

      const result = await authService.refreshToken({ refreshToken });

      successResponse(res, 200, result, 'Token refreshed');
    } catch (error: any) {
      errorResponse(res, 401, error.message || 'Token refresh failed');
    }
  }

  /**
   * Logout
   */
  async logout(req: Request, res: Response): Promise<void> {
    try {
      const { refreshToken } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return void errorResponse(res, 401, 'Authentication required');
      }

      await authService.logout(userId, refreshToken || '');

      successResponse(res, 200, null, 'Logout successful');
    } catch (error: any) {
      errorResponse(res, 500, error.message || 'Logout failed');
    }
  }

  /**
   * Get current user
   */
  async getCurrentUser(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return void errorResponse(res, 401, 'Authentication required');
      }

      const user = await authService.getCurrentUser(userId);

      successResponse(res, 200, user);
    } catch (error: any) {
      errorResponse(res, 500, error.message || 'Failed to fetch user');
    }
  }

  /**
   * Change password
   */
  async changePassword(req: Request, res: Response): Promise<void> {
    try {
      const { oldPassword, newPassword } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return void errorResponse(res, 401, 'Authentication required');
      }

      if (!oldPassword || !newPassword) {
        return void errorResponse(res, 400, 'Old and new passwords are required');
      }

      const changed = await authService.changePassword(userId, {
        oldPassword,
        newPassword,
      });

      // Name the account. The password belongs to whoever the access token
      // identifies — say so, or a Super Admin who meant to change a school's
      // password walks away having silently changed their own.
      successResponse(
        res,
        200,
        { email: changed.email, role: changed.role },
        `Password changed for ${changed.email ?? 'your account'} — sign in with this email and the new password.`
      );
    } catch (error: any) {
      const statusCode = error.message.includes('incorrect')
        ? 400
        : error.message.includes('not found')
        ? 404
        : 500;

      errorResponse(res, statusCode, error.message || 'Password change failed');
    }
  }
}

export default new AuthController();
