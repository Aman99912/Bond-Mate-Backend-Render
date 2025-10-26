import express from 'express';
import { 
  getMediaItems, 
  createMediaItem, 
  deleteMediaItem, 
  getMediaStats,
  uploadMedia 
} from '@/controllers/mediaController';
import { authenticate } from '@/middleware/auth';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

// GET /api/media - Get all media items for user and partner
router.get('/', getMediaItems);

// POST /api/media/upload - Upload a new media item
router.post('/upload', uploadMedia, createMediaItem);

// DELETE /api/media/:mediaId - Delete a media item
router.delete('/:mediaId', deleteMediaItem);

// GET /api/media/stats - Get media statistics
router.get('/stats', getMediaStats);

export default router;
