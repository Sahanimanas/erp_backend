export interface CreateNotificationRequest {
  userId?: string;
  title: string;
  message: string;
  type: 'FEE_DUE' | 'ATTENDANCE_LOW' | 'RESULT_PUBLISHED' | 'ANNOUNCEMENT' | 'SYSTEM';
}

export interface MarkNotificationAsReadRequest {
  notificationId: string;
}

export interface DeleteNotificationRequest {
  notificationId: string;
}

export interface BroadcastNotificationRequest {
  title: string;
  message: string;
  type: string;
  targetRole?: string;
}
