import express from 'express';
import { authenticate } from '../middleware/auth';
import { rateLimit } from 'express-rate-limit';
import {
  getNicknames,
  getNicknameForUser,
  setNickname,
  deleteNickname,
} from '../controllers/nicknameController';
import { body } from 'express-validator';
import { handleValidationErrors } from '../middleware/validation';

const router = express.Router();

// Rate limiting for nickname operations
const nicknameRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requests per 15 minutes
  message: 'Too many nickname requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// All routes require authentication
router.use(authenticate);

// Validation rules for nickname
const validateNickname = [
  body('targetUserId')
    .notEmpty()
    .withMessage('Target user ID is required')
    .isMongoId()
    .withMessage('Invalid user ID format'),
  body('nickname')
    .notEmpty()
    .withMessage('Nickname is required')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Nickname must be between 1 and 50 characters'),
  body('conversationId')
    .optional()
    .isMongoId()
    .withMessage('Invalid conversation ID format'),
  handleValidationErrors,
];

// GET /api/nicknames - Get all nicknames for authenticated user
router.get('/', nicknameRateLimiter, getNicknames);

// GET /api/nicknames/:targetUserId - Get nickname for specific user
router.get('/:targetUserId', nicknameRateLimiter, getNicknameForUser);

// POST /api/nicknames - Set or update nickname
router.post('/', nicknameRateLimiter, validateNickname, setNickname);

// DELETE /api/nicknames/:targetUserId - Delete nickname
router.delete('/:targetUserId', nicknameRateLimiter, deleteNickname);

export default router;

