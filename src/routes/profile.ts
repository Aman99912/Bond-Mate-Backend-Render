import express from 'express';
import { 
  getUserProfile, 
  sendPartnerInvitation, 
  updateLastLogin,
  updateTheme,
  getChatPreferences,
} from '../controllers/profileController';
import { authenticate } from '../middleware/auth';
import { rateLimit } from 'express-rate-limit';
import { body } from 'express-validator';
import { handleValidationErrors } from '../middleware/validation';

const router = express.Router();

// Rate limiting for theme updates
const themeRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 requests per 15 minutes
  message: 'Too many theme requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// Validation for theme
const validateTheme = [
  body('theme')
    .notEmpty()
    .withMessage('Theme is required')
    .isIn(['light', 'dark', 'water', 'love', 'sky', 'forest', 'custom'])
    .withMessage('Invalid theme value'),
  handleValidationErrors,
];

// Get user profile with partner info and streak data
router.get('/:userId', authenticate, getUserProfile);

// Send partner invitation notification
router.post('/invite-partner', authenticate, sendPartnerInvitation);

// Update user's last login
router.post('/update-login', authenticate, updateLastLogin);

// Update theme preference
router.post('/:userId/theme', authenticate, themeRateLimiter, validateTheme, updateTheme);

// Get chat preferences (theme + user info)
router.get('/:userId/chat-preferences', authenticate, getChatPreferences);

export default router;
