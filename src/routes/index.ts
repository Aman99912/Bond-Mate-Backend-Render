import { Router } from 'express';
import authRoutes from './auth';
import otpRoutes from './otp';
import partnerRoutes from './partner';
import enhancedPartnerRoutes from './enhancedPartner';
import chatRoutes from './chat';
import chatMessagesRoutes from './chatMessages';
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
import nicknameRoutes from './nickname';
import monitoringRoutes from './monitoring';
import adminRoutes from './admin';
import { securityMiddleware, securityHeaders } from '@/middleware/security';

const router = Router();

// Apply security middleware to all routes
router.use(securityMiddleware);
router.use(securityHeaders);

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// API routes
router.use('/auth', authRoutes);
router.use('/otp', otpRoutes);
router.use('/partners', partnerRoutes); // Keep original for backward compatibility
router.use('/enhanced-partners', enhancedPartnerRoutes); // New enhanced routes
router.use('/chat', chatRoutes);
router.use('/chats', chatMessagesRoutes);
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
router.use('/nicknames', nicknameRoutes);
router.use('/monitoring', monitoringRoutes);
router.use('/admin', adminRoutes);

export default router;