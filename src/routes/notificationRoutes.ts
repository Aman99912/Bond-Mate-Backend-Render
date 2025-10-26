import { Router } from 'express';
import { authenticate } from '@/middleware/auth';
import {
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  deleteNotification
} from '@/controllers/notificationController';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get user notifications
router.get('/', getUserNotifications);

// Get unread count
router.get('/unread-count', getUnreadCount);

// Mark notification as read
router.patch('/:notificationId/read', markAsRead);

// Mark all notifications as read
router.patch('/mark-all-read', markAllAsRead);

// Delete notification
router.delete('/:notificationId', deleteNotification);

export default router;
