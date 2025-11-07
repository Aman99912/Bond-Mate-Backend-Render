import { Router } from 'express';
import {
  adminLogin,
  getAdminProfile,
  refreshAdminToken,
  adminLogout,
  getAllAdmins,
  createAdmin,
  updateAdmin,
  deleteAdmin,
  changeAdminPassword,
} from '@/controllers/adminController';
import { authenticateAdmin, requireRole, requirePermission } from '@/middleware/adminAuth';
import { authenticateAdminRefresh } from '@/middleware/adminAuthRefresh';
import { validateLogin } from '@/middleware/validation';

const router = Router();

// Public routes
router.post('/login', validateLogin, adminLogin);

// Refresh route - allow expired tokens for refresh
router.post('/refresh', authenticateAdminRefresh, refreshAdminToken);

// Protected routes - require authentication
router.use(authenticateAdmin); // All routes below require authentication

// Profile routes
router.get('/profile', getAdminProfile);
router.post('/logout', adminLogout);
router.put('/change-password', changeAdminPassword);

// Admin management routes - require super_admin role
router.get('/admins', requireRole('super_admin'), getAllAdmins);
router.post('/admins', requireRole('super_admin'), createAdmin);
router.put('/admins/:id', requireRole('super_admin'), updateAdmin);
router.delete('/admins/:id', requireRole('super_admin'), deleteAdmin);

export default router;

