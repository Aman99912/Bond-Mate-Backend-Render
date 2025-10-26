import express from 'express';
import { getUserProfile, sendPartnerInvitation, updateLastLogin } from '../controllers/profileController';
import { authenticate } from '../middleware/auth';

const router = express.Router();

// Get user profile with partner info and streak data
router.get('/:userId', authenticate, getUserProfile);

// Send partner invitation notification
router.post('/invite-partner', authenticate, sendPartnerInvitation);

// Update user's last login
router.post('/update-login', authenticate, updateLastLogin);

export default router;
