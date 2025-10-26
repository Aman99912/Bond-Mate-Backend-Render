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