import { Router } from 'express';
import authRoutes from './auth';
import otpRoutes from './otp';
import partnerRoutes from './partner';
import chatRoutes from './chat';
import stickerRoutes from './sticker';
import notificationRoutes from './notifications';
import dashboardRoutes from './dashboard';
import memoryRoutes from './memory';
import calendarRoutes from './calendar';
import diaryRoutes from './diary';
import walletRoutes from './wallet';
import mediaRoutes from './media';
import locationRoutes from './location';
import profileRoutes from './profile';

const router = Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
  });
});

// API routes
router.use('/auth', authRoutes);
router.use('/otp', otpRoutes);
router.use('/partners', partnerRoutes);
router.use('/chat', chatRoutes);
router.use('/stickers', stickerRoutes);
router.use('/notifications', notificationRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/memories', memoryRoutes);
router.use('/calendar', calendarRoutes);
router.use('/diary', diaryRoutes);
router.use('/wallet', walletRoutes);
router.use('/media', mediaRoutes);
router.use('/location', locationRoutes);
router.use('/profile', profileRoutes);

export default router;
