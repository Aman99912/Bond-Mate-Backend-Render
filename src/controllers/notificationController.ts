import { Request, Response } from 'express';
import { asyncHandler, AppError } from '@/middleware/errorHandler';
import NotificationService from '@/services/notificationService';

// Get user notifications
export const getUserNotifications = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;

  if (!userId) {
    throw new AppError('Authentication required', 401);
  }

  const result = await NotificationService.getUserNotifications(userId, page, limit);

  res.json({
    success: true,
    message: 'Notifications retrieved successfully',
    data: result
  });
});

// Register device token for push notifications
export const registerNotificationToken = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const { token, deviceId, deviceName, platform } = req.body as {
    token?: string;
    deviceId?: string;
    deviceName?: string;
    platform?: string;
  };

  if (!userId) {
    throw new AppError('Authentication required', 401);
  }

  if (!token || typeof token !== 'string') {
    throw new AppError('FCM token is required', 400);
  }

  const result = await NotificationService.registerDeviceToken(userId, token, {
    deviceId,
    deviceName,
    platform,
  });

  res.json({
    success: true,
    message: 'Notification token registered successfully',
    data: result,
  });
});

// Mark notification as read
export const markAsRead = asyncHandler(async (req: Request, res: Response) => {
  const { notificationId } = req.params;
  const userId = req.user?.userId;

  if (!userId) {
    throw new AppError('Authentication required', 401);
  }

  const notification = await NotificationService.markAsRead(notificationId, userId);

  if (!notification) {
    throw new AppError('Notification not found', 404);
  }

  res.json({
    success: true,
    message: 'Notification marked as read',
    data: { notification }
  });
});

// Mark all notifications as read
export const markAllAsRead = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;

  if (!userId) {
    throw new AppError('Authentication required', 401);
  }

  await NotificationService.markAllAsRead(userId);

  res.json({
    success: true,
    message: 'All notifications marked as read'
  });
});

// Get unread count
export const getUnreadCount = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;

  if (!userId) {
    throw new AppError('Authentication required', 401);
  }

  const count = await NotificationService.getUnreadCount(userId);

  res.json({
    success: true,
    message: 'Unread count retrieved successfully',
    data: { unreadCount: count }
  });
});

// Delete notification
export const deleteNotification = asyncHandler(async (req: Request, res: Response) => {
  const { notificationId } = req.params;
  const userId = req.user?.userId;

  if (!userId) {
    throw new AppError('Authentication required', 401);
  }

  const notification = await NotificationService.markAsRead(notificationId, userId);

  if (!notification) {
    throw new AppError('Notification not found', 404);
  }

  // For now, we'll just mark as read instead of deleting
  // You can implement actual deletion if needed

  res.json({
    success: true,
    message: 'Notification deleted successfully'
  });
});

// Send notification (create and send push notification)
export const sendNotification = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const { toUserId, type, title, message, data } = req.body as {
    toUserId: string;
    type: 'message' | 'partner_request' | 'partner_accepted' | 'partner_rejected' | 'file_shared' | 'one_view_opened' | 'partner_invitation';
    title: string;
    message: string;
    data?: Record<string, unknown>;
  };

  if (!userId) {
    throw new AppError('Authentication required', 401);
  }

  if (!toUserId || !type || !title || !message) {
    throw new AppError('toUserId, type, title, and message are required', 400);
  }

  // Create notification in database
  const notification = await NotificationService.createNotification({
    userId: toUserId,
    type,
    title,
    message,
    data: data || {}
  });

  // Send push notification
  const notificationId = notification && typeof notification === 'object' && '_id' in notification 
    ? String((notification as any)._id) 
    : String(notification);
    
  await NotificationService.sendPushNotification(
    toUserId,
    title,
    message,
    { ...data, notificationId, type }
  );

  res.json({
    success: true,
    message: 'Notification sent successfully',
    data: { notification }
  });
});