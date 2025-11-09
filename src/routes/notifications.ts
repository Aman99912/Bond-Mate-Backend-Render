import express from 'express';
import { 
  getUserNotifications, 
  getUnreadCount,
  markAsRead, 
  markAllAsRead, 
  deleteNotification,
  registerNotificationToken
} from '@/controllers/notificationController';
import { authenticate } from '@/middleware/auth';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

// Notification routes
router.get('/', getUserNotifications);
router.get('/unread-count', getUnreadCount);
router.post('/register-token', registerNotificationToken);
router.put('/:notificationId/read', markAsRead);
router.put('/read-all', markAllAsRead);
router.delete('/:notificationId', deleteNotification);

export default router;
