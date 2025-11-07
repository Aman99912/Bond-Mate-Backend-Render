import express from 'express';
import {
  getWalletCategories,
  getSocialMediaPlatforms,
  getWalletItems,
  createWalletItem,
  updateWalletItem,
  deleteWalletItem,
  toggleTodoItem,
  updateWalletItemApproval
} from '@/controllers/walletController';
import { authenticate } from '@/middleware/auth';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

// Get wallet categories
router.get('/categories', getWalletCategories);

// Get social media platforms
router.get('/platforms', getSocialMediaPlatforms);

// Get all wallet items
router.get('/items', getWalletItems);

// Create wallet item
router.post('/items', createWalletItem);

// Update wallet item
router.put('/items/:id', updateWalletItem);

// Delete wallet item
router.delete('/items/:id', deleteWalletItem);

// Toggle todo item completion
router.patch('/items/:id/todo/:todoItemId', toggleTodoItem);

// Update approval status for a wallet item
router.post('/items/:id/approval', updateWalletItemApproval);

export default router;
