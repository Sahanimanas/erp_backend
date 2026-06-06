import { Response } from 'express';

interface ResponseData {
  success: boolean;
  data?: any;
  error?: string;
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
 * Send error response
 */
export const errorResponse = (
  res: Response,
  statusCode: number = 400,
  error: string | string[],
  message?: string
): Response => {
  const response: ResponseData = {
    success: false,
    error: Array.isArray(error) ? error.join(', ') : error,
    ...(message && { message }),
  };

  return res.status(statusCode).json(response);
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
