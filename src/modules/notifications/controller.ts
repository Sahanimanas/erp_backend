import { Request, Response } from 'express';
import notificationService from './service';
import { successResponse, errorResponse, createdResponse, paginatedResponse, deletedResponse } from '@common/utils/response';

export class NotificationController {
  async createNotification(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { title, message, type } = req.body;

      if (!schoolId || !title || !message || !type) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const notification = await notificationService.createNotification(schoolId, req.body);
      createdResponse(res, notification, 'Notification created successfully');
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to create notification');
    }
  }

  async getUserNotifications(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const userId = req.user?.id;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      if (!schoolId || !userId) {
        return void errorResponse(res, 400, 'Authentication required');
      }

      const result = await notificationService.getUserNotifications(schoolId, userId, page, limit);
      paginatedResponse(res, result.data, page, limit, result.pagination.total);
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to fetch notifications');
    }
  }

  async getUnreadCount(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const userId = req.user?.id;

      if (!schoolId || !userId) {
        return void errorResponse(res, 400, 'Authentication required');
      }

      const count = await notificationService.getUnreadCount(schoolId, userId);
      successResponse(res, 200, { unreadCount: count });
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to fetch unread count');
    }
  }

  async markAsRead(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { notificationId } = req.params;

      if (!schoolId || !notificationId) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const notification = await notificationService.markAsRead(schoolId, notificationId);
      successResponse(res, 200, notification, 'Notification marked as read');
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to mark as read');
    }
  }

  async markAllAsRead(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const userId = req.user?.id;

      if (!schoolId || !userId) {
        return void errorResponse(res, 400, 'Authentication required');
      }

      await notificationService.markAllAsRead(schoolId, userId);
      successResponse(res, 200, null, 'All notifications marked as read');
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to mark all as read');
    }
  }

  async deleteNotification(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { notificationId } = req.params;

      if (!schoolId || !notificationId) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      await notificationService.deleteNotification(schoolId, notificationId);
      deletedResponse(res, 'Notification deleted successfully');
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to delete notification');
    }
  }

  async broadcastToRole(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { role, title, message, type } = req.body;

      if (!schoolId || !role || !title || !message || !type) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const notifications = await notificationService.broadcastToRole(schoolId, role, {
        title,
        message,
        type,
      });

      createdResponse(res, { count: notifications.length }, 'Notifications sent successfully');
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to broadcast');
    }
  }

  async broadcastToAll(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { title, message, type } = req.body;

      if (!schoolId || !title || !message || !type) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const notification = await notificationService.broadcastToAll(schoolId, {
        title,
        message,
        type,
      });

      createdResponse(res, notification, 'Notification broadcast successfully');
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to broadcast');
    }
  }

  async getNotificationsByType(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { type } = req.query;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      if (!schoolId || !type) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const result = await notificationService.getNotificationsByType(schoolId, type as string, page, limit);
      paginatedResponse(res, result.data, page, limit, result.pagination.total);
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to fetch notifications');
    }
  }
}

export default new NotificationController();
