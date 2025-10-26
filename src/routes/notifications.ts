import express from 'express';
import { 
  getUserNotifications, 
  markAsRead, 
  markAllAsRead, 
  deleteNotification
} from '@/controllers/notificationController';
import { authenticate } from '@/middleware/auth';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

// Notification routes
router.get('/', getUserNotifications);
router.put('/:notificationId/read', markAsRead);
router.put('/read-all', markAllAsRead);
router.delete('/:notificationId', deleteNotification);

export default router;
