import { Router } from 'express';
import { register, login, forceLogin, getProfile, updateProfile, updateEmailWithOTP, updatePhoneWithOTP, changePassword, changeSubPassword, resetPasswordWithOTP, resetSubPasswordWithOTP, verifySecretCode, checkActiveSession, deleteAccount, refreshToken, logout, logoutFromAllDevices } from '@/controllers/authController';
import { validateRegister, validateLogin } from '@/middleware/validation';
import { authenticate } from '@/middleware/auth';

const router = Router();

// Public routes
router.post('/register', validateRegister, register);
router.post('/login', validateLogin, login);
router.post('/force-login', validateLogin, forceLogin);
router.post('/refresh', refreshToken);
router.post('/verify-secret-code', verifySecretCode);
router.post('/check-active-session', checkActiveSession);
router.post('/reset-password', resetPasswordWithOTP);
router.post('/reset-sub-password', resetSubPasswordWithOTP);

// Protected routes (require authentication)
router.get('/profile', authenticate, getProfile);
router.put('/profile', authenticate, updateProfile);
router.put('/update-email', authenticate, updateEmailWithOTP);
router.put('/update-phone', authenticate, updatePhoneWithOTP);
router.put('/change-password', authenticate, changePassword);
router.put('/change-sub-password', authenticate, changeSubPassword);
router.post('/verify-secret-code', authenticate, verifySecretCode);
router.delete('/account', authenticate, deleteAccount);
router.post('/logout', authenticate, logout);
router.post('/logout-all-devices', authenticate, logoutFromAllDevices);

export default router;
