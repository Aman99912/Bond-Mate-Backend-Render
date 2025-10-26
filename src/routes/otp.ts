import { Router } from 'express';
import {
  sendMobileOTP,
  verifyMobileOTP,
  resendMobileOTP,
  sendEmailOTPController,
  verifyEmailOTPController,
  resendEmailOTPController,
  // Legacy support
  sendOTP,
  verifyOTP,
  resendOTP,
} from '@/controllers/otpController';
import { authenticate } from '@/middleware/auth';

const router = Router();

// Mobile OTP routes
router.post('/send-mobile', sendMobileOTP);
router.post('/verify-mobile', verifyMobileOTP);
router.post('/resend-mobile', resendMobileOTP);

// Legacy mobile OTP routes (backward compatibility)
router.post('/send', sendOTP);
router.post('/verify', verifyOTP);
router.post('/resend', resendOTP);

// Email OTP routes
router.post('/send-email', authenticate, sendEmailOTPController);
router.post('/verify-email', authenticate, verifyEmailOTPController);
router.post('/resend-email', authenticate, resendEmailOTPController);

export default router;
