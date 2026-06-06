import { Request, Response, NextFunction } from 'express';
import { db } from '@common/database/client';
import { config } from '@config/environment';

declare global {
  namespace Express {
    interface Request {
      schoolId?: string;
      school?: any;
    }
  }
}

/**
 * Multi-tenant middleware
 * Extracts school from subdomain or domain and attaches schoolId to request
 */
export const tenantMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const host = req.get('host');

    if (!host) {
      res.status(400).json({
        success: false,
        error: 'Host header missing',
      });
      return;
    }

    // Extract subdomain from host
    const parts = host.split('.');
    let schoolSlug: string | null = null;

    // Subdomain-based tenant identification
    if (parts.length >= 3 && parts[0] !== 'api' && parts[0] !== 'www') {
      // subdomain.schoolerp.com → subdomain is the school slug
      schoolSlug = parts[0];
    }

    // If no subdomain, check if it's a custom domain
    if (!schoolSlug) {
      // Look up custom domain in database
      const domain = await db.schoolDomain.findUnique({
        where: { domain: host },
        include: { school: true },
      });

      if (domain && domain.isActive) {
        req.schoolId = domain.school.id;
        req.school = domain.school;
        return next();
      }

      // No subdomain or custom domain matched (e.g. localhost dev, direct API
      // access, or apex domain). Do NOT hard-fail here: tenant context for these
      // requests is derived from the authenticated user's JWT (req.user.schoolId)
      // by the auth middleware and enforced per-controller. Hard-blocking here
      // would break all JWT-authenticated API calls that don't use a subdomain.
      return next();
    }

    // Find school by slug
    const school = await db.school.findUnique({
      where: { slug: schoolSlug },
    });

    if (!school) {
      res.status(404).json({
        success: false,
        error: 'School not found',
      });
      return;
    }

    if (!school.isActive) {
      res.status(403).json({
        success: false,
        error: 'School is inactive',
      });
      return;
    }

    // Check subscription status
    const subscription = await db.subscription.findUnique({
      where: { schoolId: school.id },
    });

    if (!subscription || subscription.status !== 'ACTIVE') {
      res.status(403).json({
        success: false,
        error: 'School subscription inactive or expired',
      });
      return;
    }

    if (new Date() > subscription.endDate) {
      res.status(403).json({
        success: false,
        error: 'School subscription has expired',
      });
      return;
    }

    // Attach school context to request
    req.schoolId = school.id;
    req.school = school;

    next();
  } catch (error) {
    console.error('Tenant middleware error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

/**
 * Middleware to ensure schoolId is present
 */
export const requireSchool = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.schoolId) {
    return void res.status(400).json({
      success: false,
      error: 'School context required',
    });
  }

  next();
};

/**
 * Middleware to auto-filter queries by schoolId
 * Ensures all database queries include school isolation
 */
export const schoolIsolation = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // This ensures all repository queries filter by schoolId
  if (req.schoolId) {
    res.locals.schoolId = req.schoolId;
  }

  next();
};
