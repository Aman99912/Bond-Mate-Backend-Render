import { Router } from 'express';
import { authenticate } from '@/middleware/auth';
import { getDashboardData, getQuickStats } from '@/controllers/dashboardController';

const router = Router();

// Protected routes
router.use(authenticate);

// Dashboard routes
router.get('/data', getDashboardData);
router.get('/stats', getQuickStats);

export default router;
