import express from 'express';
import { getStickers, getStickerCategories, sendSticker, createSticker } from '@/controllers/stickerController';
import { authenticate } from '@/middleware/auth';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

// Get all stickers
router.get('/', getStickers);

// Get sticker categories
router.get('/categories', getStickerCategories);

// Send sticker message
router.post('/send', sendSticker);

// Create sticker (admin only)
router.post('/create', createSticker);

export default router;
