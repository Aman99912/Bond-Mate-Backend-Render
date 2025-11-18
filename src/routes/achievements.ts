import { Router } from 'express';
import { getAchievementsData } from '@/controllers/achievementsController';
import { authenticate } from '@/middleware/auth';

const router = Router();

// All routes require authentication
router.get('/', authenticate, getAchievementsData);

export default router;

