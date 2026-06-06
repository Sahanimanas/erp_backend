import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '@config/environment';
import { v4 as uuidv4 } from 'uuid';

/**
 * Hash password
 */
export const hashPassword = async (password: string): Promise<string> => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

/**
 * Compare password with hash
 */
export const comparePassword = async (
  password: string,
  hash: string
): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

/**
 * Generate access token
 */
export const generateAccessToken = (payload: {
  userId: string;
  schoolId: string;
  role: string;
  permissions?: string[];
}): string => {
  return jwt.sign(payload, config.jwt.accessSecret as any, {
    expiresIn: config.jwt.accessExpiresIn,
  } as any);
};

/**
 * Generate refresh token
 *
 * Includes a random `jti` (JWT ID) so that two tokens minted for the same user
 * within the same second are still unique. Without it, the JWT (payload {userId}
 * + identical `iat`) is byte-for-byte identical, which collides on the unique
 * RefreshToken.token column during rotation.
 */
export const generateRefreshToken = (userId: string): string => {
  return jwt.sign({ userId, jti: uuidv4() }, config.jwt.refreshSecret as any, {
    expiresIn: config.jwt.refreshExpiresIn,
  } as any);
};

/**
 * Verify access token
 */
export const verifyAccessToken = (token: string): any => {
  try {
    return jwt.verify(token, config.jwt.accessSecret);
  } catch (error) {
    return null;
  }
};

/**
 * Verify refresh token
 */
export const verifyRefreshToken = (token: string): any => {
  try {
    return jwt.verify(token, config.jwt.refreshSecret);
  } catch (error) {
    return null;
  }
};

/**
 * Generate school slug from name
 */
export const generateSchoolSlug = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

/**
 * Generate random password
 */
export const generateRandomPassword = (length: number = 12): string => {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

/**
 * Generate UUID
 */
export const generateId = (): string => {
  return uuidv4();
};

/**
 * Generate device ID
 */
export const generateDeviceId = (): string => {
  return `device_${uuidv4()}`;
};

/**
 * Validate email format
 */
export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate phone number (simple check)
 */
export const validatePhone = (phone: string): boolean => {
  const phoneRegex = /^\d{10,}$/;
  return phoneRegex.test(phone.replace(/\D/g, ''));
};

/**
 * Validate password strength
 */
export const validatePasswordStrength = (
  password: string
): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain uppercase letter');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain lowercase letter');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain number');
  }

  if (!/[!@#$%^&*]/.test(password)) {
    errors.push('Password must contain special character (!@#$%^&*)');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};
