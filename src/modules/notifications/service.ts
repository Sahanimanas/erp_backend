import { db } from '@common/database/client';
import { CreateNotificationRequest, BroadcastNotificationRequest } from './types';

export class NotificationService {
  /**
   * Create notification
   */
  async createNotification(schoolId: string, data: CreateNotificationRequest) {
    const notification = await db.notification.create({
      data: {
        schoolId,
        userId: data.userId,
        title: data.title,
        message: data.message,
        type: data.type,
      },
    });

    return notification;
  }

  /**
   * Create notification for multiple users
   */
  async createBulkNotifications(schoolId: string, userIds: string[], data: Omit<CreateNotificationRequest, 'userId'>) {
    const notifications = await Promise.all(
      userIds.map(userId =>
        this.createNotification(schoolId, {
          ...data,
          userId,
        })
      )
    );

    return notifications;
  }

  /**
   * Get user notifications
   */
  async getUserNotifications(schoolId: string, userId: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [notifications, total] = await Promise.all([
      db.notification.findMany({
        where: {
          schoolId,
          OR: [
            { userId },
            { userId: null }, // System-wide notifications
          ],
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      db.notification.count({
        where: {
          schoolId,
          OR: [
            { userId },
            { userId: null },
          ],
        },
      }),
    ]);

    return {
      data: notifications,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get unread notifications count
   */
  async getUnreadCount(schoolId: string, userId: string) {
    const count = await db.notification.count({
      where: {
        schoolId,
        isRead: false,
        OR: [
          { userId },
          { userId: null },
        ],
      },
    });

    return count;
  }

  /**
   * Mark notification as read
   */
  async markAsRead(schoolId: string, notificationId: string) {
    const notification = await db.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification || notification.schoolId !== schoolId) {
      throw new Error('Notification not found');
    }

    const updated = await db.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });

    return updated;
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(schoolId: string, userId: string) {
    const result = await db.notification.updateMany({
      where: {
        schoolId,
        isRead: false,
        userId,
      },
      data: { isRead: true },
    });

    return result;
  }

  /**
   * Delete notification
   */
  async deleteNotification(schoolId: string, notificationId: string) {
    const notification = await db.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification || notification.schoolId !== schoolId) {
      throw new Error('Notification not found');
    }

    await db.notification.delete({
      where: { id: notificationId },
    });

    return { message: 'Notification deleted' };
  }

  /**
   * Broadcast notification to role
   */
  async broadcastToRole(schoolId: string, role: string, data: Omit<CreateNotificationRequest, 'userId'>) {
    const users = await db.user.findMany({
      where: {
        schoolId,
        role: role as any,
        isActive: true,
      },
      select: { id: true },
    });

    const userIds = users.map(u => u.id);

    const notifications = await this.createBulkNotifications(schoolId, userIds, data);

    return notifications;
  }

  /**
   * Broadcast to all users
   */
  async broadcastToAll(schoolId: string, data: Omit<CreateNotificationRequest, 'userId'>) {
    const notification = await db.notification.create({
      data: {
        schoolId,
        title: data.title,
        message: data.message,
        type: data.type,
      },
    });

    return notification;
  }

  /**
   * Send fee due notification
   */
  async sendFeeDueNotification(schoolId: string, studentId: string, dueAmount: number) {
    return this.createNotification(schoolId, {
      userId: studentId,
      title: 'Fee Due',
      message: `You have a pending fee of ${dueAmount}. Please pay before due date.`,
      type: 'FEE_DUE',
    });
  }

  /**
   * Send low attendance notification
   */
  async sendLowAttendanceNotification(schoolId: string, studentId: string, percentage: number) {
    return this.createNotification(schoolId, {
      userId: studentId,
      title: 'Low Attendance Alert',
      message: `Your attendance is ${percentage}%. Maintain minimum 75% attendance.`,
      type: 'ATTENDANCE_LOW',
    });
  }

  /**
   * Send result published notification
   */
  async sendResultPublishedNotification(schoolId: string, studentId: string, examName: string) {
    return this.createNotification(schoolId, {
      userId: studentId,
      title: 'Results Published',
      message: `Results for ${examName} have been published. Check your portal.`,
      type: 'RESULT_PUBLISHED',
    });
  }

  /**
   * Get notification by type
   */
  async getNotificationsByType(schoolId: string, type: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [notifications, total] = await Promise.all([
      db.notification.findMany({
        where: { schoolId, type },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      db.notification.count({ where: { schoolId, type } }),
    ]);

    return {
      data: notifications,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }
}

export default new NotificationService();
