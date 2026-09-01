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
    const { password, deviceId } = data;
    // Emails are stored in whatever case they were entered — school admins are
    // lower-cased at creation, staff/students are not — so the lookup below is
    // case-insensitive and the typed value is only trimmed. Matching exactly is
    // what made "Admin@School.com" fail against a stored "admin@school.com".
    const email = (data.email || '').trim();

    // The same email may legitimately exist in more than one tenant
    // (@@unique([email, schoolId]) is per-school), so match ALL candidates and
    // let the password decide which account is meant — a single findFirst could
    // land on a stale account (e.g. one left behind by a deleted school) and
    // reject a perfectly valid password.
    const candidates = await db.user.findMany({
      where: {
        email: { equals: email, mode: 'insensitive' },
        isActive: true,
        deletedAt: null,
      },
      include: {
        student: true,
        employee: { include: { designation: { select: { permissions: true } } } },
        parent: true,
        school: { select: { id: true, name: true, logo: true, watermark: true, upiQr: true, address: true, phone: true, email: true, deletedAt: true } },
      },
    });

    // Order the tie-break: a live school beats a soft-deleted one, then newest
    // first. Users of a deleted school are ranked last rather than filtered out
    // — the platform's own SUPER_ADMIN tenant is soft-deleted, and excluding
    // them would lock the super admin out.
    candidates.sort((a, b) => {
      const aDead = (a as any).school?.deletedAt ? 1 : 0;
      const bDead = (b as any).school?.deletedAt ? 1 : 0;
      if (aDead !== bDead) return aDead - bDead;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    // Verify password against each candidate.
    let user: (typeof candidates)[number] | null = null;
    for (const candidate of candidates) {
      if (await comparePassword(password, candidate.password)) {
        user = candidate;
        break;
      }
    }

    if (!user) {
      // The credentials may belong to an account that exists but can no longer
      // sign in (deactivated user, or a school that was deleted). Saying so —
      // only to someone who already proved they know the password — turns an
      // otherwise unexplainable "invalid credentials" into something actionable.
      await this.assertNotDisabledAccount(email, password);
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
        email: user.email ?? '',
        role: user.role,
        schoolId: user.schoolId,
        schoolName: (user as any).school?.name,
        schoolLogo: (user as any).school?.logo ?? null,
        // School contact details — used on printed bills / fee receipts.
        schoolWatermark: (user as any).school?.watermark ?? null,
        schoolUpiQr: (user as any).school?.upiQr ?? null,
        schoolAddress: (user as any).school?.address ?? null,
        schoolPhone: (user as any).school?.phone ?? null,
        schoolEmail: (user as any).school?.email ?? null,
        // Module privileges from the employee's designation — drive which
        // sidebar sections/pages the user can access after login. `null` when
        // the user has no designation (→ not restricted by privileges).
        permissions: (user as any).employee?.designation?.permissions ?? null,
      },
    };
  }

  /**
   * Throw a specific error when the supplied credentials DO match an account
   * that is barred from logging in (deactivated user, soft-deleted user, or a
   * user whose school was deleted). Only ever reached after the normal lookup
   * failed, and only speaks up when the password checks out — so it reveals
   * nothing to someone guessing.
   */
  private async assertNotDisabledAccount(email: string, password: string): Promise<void> {
    const disabled = await db.user.findMany({
      where: {
        email: { equals: email, mode: 'insensitive' },
        OR: [{ isActive: false }, { deletedAt: { not: null } }],
      },
      select: { id: true, password: true, deletedAt: true, school: { select: { deletedAt: true } } },
      orderBy: { createdAt: 'desc' },
    });

    for (const account of disabled) {
      if (await comparePassword(password, account.password)) {
        if (account.school?.deletedAt) {
          throw new Error(
            'This account belongs to a school that has been removed. Please use the credentials for your current school.'
          );
        }
        throw new Error('Your account has been deactivated. Please contact your administrator.');
      }
    }
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
  ): Promise<{ email: string | null; role: string }> {
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

    // Verify old password.
    //
    // The account named in the error is the one the ACCESS TOKEN belongs to —
    // not necessarily the one the operator has in mind. A Super Admin who opens
    // Change Password while still in their own session (rather than after
    // "Login as Admin") is changing THEIR OWN password, and used to see a bare
    // "Old password is incorrect" with no hint that they were aimed at the wrong
    // account. Naming it costs nothing: the caller already proved they hold this
    // account's token.
    const isPasswordValid = await comparePassword(oldPassword, user.password);
    if (!isPasswordValid) {
      throw new Error(
        `Old password is incorrect for ${user.email ?? 'this account'}. You are signed in as ${user.email ?? user.id} (${user.role}) — this form only changes THAT account's password.`
      );
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

    // Hand the caller the account that actually changed, so the UI can say
    // WHICH login the new password belongs to instead of a bare "success".
    return { email: user.email, role: user.role };
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
        school: { select: { id: true, name: true, logo: true, watermark: true, upiQr: true, address: true, phone: true, email: true } },
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
            designation: { select: { permissions: true } },
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

    // Surface the employee's designation privileges at the top level so the
    // client can gate sidebar sections/routes consistently with login.
    return { ...user, permissions: (user as any).employee?.designation?.permissions ?? null };
  }
}

export default new AuthService();
