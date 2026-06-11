import { db } from '@common/database/client';
import {
  hashPassword,
  comparePassword,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  generateRandomPassword,
  validatePasswordStrength,
} from '@common/utils/crypto';
import {
  LoginRequest,
  RefreshTokenRequest,
  ChangePasswordRequest,
  AuthResponse,
  TokenPayload,
} from './types';

export class AuthService {
  /**
   * Login user
   */
  async login(data: LoginRequest): Promise<AuthResponse> {
    const { email, password, deviceId } = data;

    // Find user
    const user = await db.user.findFirst({
      where: {
        email,
        isActive: true,
      },
      include: {
        student: true,
        employee: true,
        parent: true,
        school: { select: { id: true, name: true } },
      },
    });

    if (!user) {
      throw new Error('Invalid email or password');
    }

    // Verify password
    const isPasswordValid = await comparePassword(password, user.password);
    if (!isPasswordValid) {
      throw new Error('Invalid email or password');
    }

    // Get user permissions
    const rolePermissions = await db.rolePermission.findMany({
      where: {
        role: {
          name: user.role as any,
        },
        schoolId: user.schoolId,
      },
      include: {
        permission: true,
      },
    });

    const permissions: string[] = [];
    rolePermissions.forEach((rp) => {
      if (rp.permission && !permissions.includes(rp.permission.name)) {
        permissions.push(rp.permission.name);
      }
    });

    // Generate tokens
    const tokenPayload: TokenPayload = {
      userId: user.id,
      schoolId: user.schoolId,
      role: user.role,
      permissions,
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(user.id);

    // Save refresh token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await db.refreshToken.create({
      data: {
        userId: user.id,
        token: refreshToken,
        expiresAt,
      },
    });

    // Create session if deviceId provided
    if (deviceId) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      await db.userSession.create({
        data: {
          userId: user.id,
          deviceId,
          expiresAt,
        },
      });
    }

    // Update last login
    await db.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        schoolId: user.schoolId,
        schoolName: (user as any).school?.name,
      },
    };
  }

  /**
   * Refresh access token
   */
  async refreshToken(data: RefreshTokenRequest): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const { refreshToken } = data;

    // Verify token
    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded) {
      throw new Error('Invalid or expired refresh token');
    }

    // Find token in database
    const storedToken = await db.refreshToken.findUnique({
      where: { token: refreshToken },
    });

    if (!storedToken || storedToken.revokedAt) {
      throw new Error('Refresh token has been revoked');
    }

    // Find user
    const user = await db.user.findUnique({
      where: { id: decoded.userId },
    });

    if (!user || !user.isActive) {
      throw new Error('User not found or inactive');
    }

    // Get permissions
    const rolePermissions = await db.rolePermission.findMany({
      where: {
        role: {
          name: user.role as any,
        },
        schoolId: user.schoolId,
      },
      include: {
        permission: true,
      },
    });

    const permissions: string[] = [];
    rolePermissions.forEach((rp) => {
      if (rp.permission && !permissions.includes(rp.permission.name)) {
        permissions.push(rp.permission.name);
      }
    });

    // Generate new tokens
    const tokenPayload: TokenPayload = {
      userId: user.id,
      schoolId: user.schoolId,
      role: user.role,
      permissions,
    };

    const newAccessToken = generateAccessToken(tokenPayload);
    const newRefreshToken = generateRefreshToken(user.id);

    // Revoke old refresh token
    await db.refreshToken.update({
      where: { token: refreshToken },
      data: { revokedAt: new Date() },
    });

    // Save new refresh token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await db.refreshToken.create({
      data: {
        userId: user.id,
        token: newRefreshToken,
        expiresAt,
      },
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  /**
   * Logout user
   */
  async logout(userId: string, refreshToken: string): Promise<void> {
    // Revoke refresh token
    await db.refreshToken.updateMany({
      where: {
        userId,
        token: refreshToken,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  /**
   * Change password
   */
  async changePassword(
    userId: string,
    data: ChangePasswordRequest
  ): Promise<void> {
    const { oldPassword, newPassword } = data;

    // Validate new password
    const validation = validatePasswordStrength(newPassword);
    if (!validation.valid) {
      throw new Error(validation.errors.join('. '));
    }

    // Find user
    const user = await db.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Verify old password
    const isPasswordValid = await comparePassword(oldPassword, user.password);
    if (!isPasswordValid) {
      throw new Error('Old password is incorrect');
    }

    // Hash new password
    const hashedPassword = await hashPassword(newPassword);

    // Update password
    await db.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        lastPasswordChange: new Date(),
      },
    });

    // Revoke all refresh tokens
    await db.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  /**
   * Get current user
   */
  async getCurrentUser(userId: string) {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        role: true,
        schoolId: true,
        isActive: true,
        student: {
          select: {
            id: true,
            rollNumber: true,
            photo: true,
          },
        },
        employee: {
          select: {
            id: true,
            employeeCode: true,
            photo: true,
          },
        },
        parent: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    return user;
  }
}

export default new AuthService();
