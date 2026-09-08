import { Response } from 'express';
import { sanitizeMessage, toSafeError } from './errors';

interface ResponseData {
  success: boolean;
  data?: any;
  error?: string;
  code?: string;
  message?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

/**
 * Send success response
 */
export const successResponse = (
  res: Response,
  statusCode: number = 200,
  data?: any,
  message?: string,
  pagination?: any
): Response => {
  const response: ResponseData = {
    success: true,
    ...(data !== undefined && { data }),
    ...(message && { message }),
    ...(pagination && { pagination }),
  };

  return res.status(statusCode).json(response);
};

/**
 * Send error response.
 *
 * The message is always sanitised: a raw Prisma/driver dump would otherwise be
 * rendered verbatim in the UI. Pass `code` so the client can show a short tag
 * next to the message.
 */
export const errorResponse = (
  res: Response,
  statusCode: number = 400,
  error: string | string[],
  message?: string,
  code?: string
): Response => {
  const raw = Array.isArray(error) ? error.join(', ') : error;
  const response: ResponseData = {
    success: false,
    error: sanitizeMessage(raw),
    ...(code && { code }),
    ...(message && { message }),
  };

  return res.status(statusCode).json(response);
};

/**
 * Send a caught error. Derives status, one-line message and short code from the
 * thrown value (Prisma codes included) and logs the full error server-side.
 */
export const failResponse = (
  res: Response,
  err: unknown,
  fallback = 'Request failed',
  statusOverride?: number
): Response => {
  const safe = toSafeError(err, fallback);
  return errorResponse(res, statusOverride ?? safe.status, safe.error, undefined, safe.code);
};

/**
 * Send created response (201)
 */
export const createdResponse = (
  res: Response,
  data?: any,
  message?: string
): Response => {
  return successResponse(res, 201, data, message || 'Created successfully');
};

/**
 * Send updated response
 */
export const updatedResponse = (
  res: Response,
  data?: any,
  message?: string
): Response => {
  return successResponse(res, 200, data, message || 'Updated successfully');
};

/**
 * Send deleted response
 */
export const deletedResponse = (
  res: Response,
  message?: string
): Response => {
  return successResponse(res, 200, null, message || 'Deleted successfully');
};

/**
 * Send paginated response
 */
export const paginatedResponse = (
  res: Response,
  data: any[],
  page: number,
  limit: number,
  total: number,
  statusCode: number = 200,
  message?: string
): Response => {
  const pages = Math.ceil(total / limit);

  const response: ResponseData = {
    success: true,
    data,
    ...(message && { message }),
    pagination: {
      page,
      limit,
      total,
      pages,
    },
  };

  return res.status(statusCode).json(response);
};
