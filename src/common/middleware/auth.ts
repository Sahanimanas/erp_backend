import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '@config/environment';
import { db } from '@common/database/client';

interface JWTPayload {
  userId: string;
  schoolId: string;
  role: string;
  permissions: string[];
}

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload & { id: string };
    }
  }
}

/**
 * Verify JWT and attach user to request
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.get('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return void res.status(401).json({
        success: false,
        error: 'No token provided',
      });
    }

    const token = authHeader.substring(7);

    let decoded: any;
    try {
      decoded = jwt.verify(token, config.jwt.accessSecret) as JWTPayload;
    } catch (error) {
      return void res.status(401).json({
        success: false,
        error: 'Invalid or expired token',
      });
    }

    // Verify user exists and is active
    const user = await db.user.findUnique({
      where: { id: decoded.userId },
    });

    if (!user || !user.isActive) {
      return void res.status(401).json({
        success: false,
        error: 'User not found or inactive',
      });
    }

    // Check if school matches
    if (user.schoolId !== decoded.schoolId && user.role !== 'SUPER_ADMIN') {
      return void res.status(401).json({
        success: false,
        error: 'School mismatch',
      });
    }

    // Attach user to request
    req.user = {
      id: decoded.userId,
      userId: decoded.userId,
      schoolId: decoded.schoolId,
      role: decoded.role,
      permissions: decoded.permissions || [],
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

/**
 * Ensure user is authenticated
 */
export const requireAuth = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    return void res.status(401).json({
      success: false,
      error: 'Authentication required',
    });
  }

  next();
};

/**
 * Check if user has specific role
 */
export const requireRole = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return void res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    if (!roles.includes(req.user.role)) {
      return void res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
      });
    }

    next();
  };
};

/**
 * Check if user has specific permission
 */
export const requirePermission = (...permissions: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return void res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const hasPermission = permissions.some((perm) =>
      req.user!.permissions.includes(perm)
    );

    if (!hasPermission) {
      return void res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
      });
    }

    next();
  };
};

/**
 * Ensure user belongs to the school they're accessing
 */
export const requireSchoolAccess = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user || !req.schoolId) {
    return void res.status(401).json({
      success: false,
      error: 'Authentication and school context required',
    });
  }

  // SUPER_ADMIN can access any school
  if (req.user.role === 'SUPER_ADMIN') {
    return void next();
  }

  // Regular users must access their own school
  if (req.user.schoolId !== req.schoolId) {
    return void res.status(403).json({
      success: false,
      error: 'You do not have access to this school',
    });
  }

  next();
};
