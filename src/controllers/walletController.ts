import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { asyncHandler, AppError } from '@/middleware/errorHandler';
import WalletItem from '@/models/WalletItem';
import { IWalletItem } from '@/models/WalletItem';

// Get wallet categories
export const getWalletCategories = asyncHandler(async (req: Request, res: Response) => {
  const categories = [
    { value: 'text', label: 'Text', icon: 'document-text' },
    { value: 'todo', label: 'To-Do', icon: 'checkmark-circle' },
    { value: 'socialmedia', label: 'Social Media', icon: 'people' }
  ];

  res.json({
    success: true,
    data: { categories }
  });
});

// Get social media platforms
export const getSocialMediaPlatforms = asyncHandler(async (req: Request, res: Response) => {
  const platforms = [
    { value: 'instagram', label: 'Instagram', icon: 'logo-instagram', color: '#E4405F' },
    { value: 'snapchat', label: 'Snapchat', icon: 'logo-snapchat', color: '#FFFC00' },
    { value: 'whatsapp', label: 'WhatsApp', icon: 'logo-whatsapp', color: '#25D366' },
    { value: 'telegram', label: 'Telegram', icon: 'logo-telegram', color: '#0088CC' },
    { value: 'discord', label: 'Discord', icon: 'logo-discord', color: '#5865F2' },
  ];

  res.json({
    success: true,
    data: { platforms }
  });
});

// Get all wallet items for a user and their partner
export const getWalletItems = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const { category, page = 1, limit = 20 } = req.query;

  if (!userId) {
    throw new AppError('User not authenticated', 401);
  }

  // Get user's partner
  const User = require('@/models/User').default;
  const user = await User.findById(userId);
  
  console.log('🔍 Wallet: User found:', !!user);
  console.log('🔍 Wallet: User partners:', user?.partners?.length || 0);
  console.log('🔍 Wallet: Partners data:', user?.partners);
  
  // Check for active partner in partners array
  const activePartner = user?.partners?.find((partner: any) => partner.status === 'active');
  
  console.log('🔍 Wallet: Active partner found:', !!activePartner);
  console.log('🔍 Wallet: Active partner ID:', activePartner?.partnerId);
  
  if (!activePartner?.partnerId) {
    throw new AppError('No partner found', 404);
  }

  const partnerId = activePartner.partnerId;

  // Build query
  const query: any = {
    $or: [
      { userId: userId, partnerId: partnerId },
      { userId: partnerId, partnerId: userId }
    ]
  };

  if (category && category !== 'all') {
    query.category = category;
  }

  const skip = (Number(page) - 1) * Number(limit);

  const walletItems = await WalletItem.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit))
    .populate('userId', 'name avatar')
    .populate('partnerId', 'name avatar');

  const total = await WalletItem.countDocuments(query);

  res.json({
    success: true,
    data: {
      walletItems,
      pagination: {
        current: Number(page),
        pages: Math.ceil(total / Number(limit)),
        total
      }
    }
  });
});

// Create wallet item
export const createWalletItem = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const { category, type, ...itemData } = req.body;

  if (!userId) {
    throw new AppError('User not authenticated', 401);
  }

  // Get user's partner
  const User = require('@/models/User').default;
  const user = await User.findById(userId);
  
  console.log('🔍 Wallet: User found:', !!user);
  console.log('🔍 Wallet: User partners:', user?.partners?.length || 0);
  console.log('🔍 Wallet: Partners data:', user?.partners);
  
  // Check for active partner in partners array
  const activePartner = user?.partners?.find((partner: any) => partner.status === 'active');
  
  console.log('🔍 Wallet: Active partner found:', !!activePartner);
  console.log('🔍 Wallet: Active partner ID:', activePartner?.partnerId);
  
  if (!activePartner?.partnerId) {
    throw new AppError('No partner found', 404);
  }

  const partnerId = activePartner.partnerId;

  // Validate required fields based on category
  if (category === 'text') {
    if (!itemData.title || !itemData.content) {
      throw new AppError('Title and content are required for text items', 400);
    }
  } else if (category === 'todo') {
    if (!itemData.todoItems || !Array.isArray(itemData.todoItems)) {
      throw new AppError('Todo items array is required', 400);
    }
  } else if (category === 'socialmedia') {
    if (!itemData.platform || !itemData.username || !itemData.password) {
      throw new AppError('Platform, username, and password are required for social media items', 400);
    }
  }

  const walletItem = await WalletItem.create({
    userId,
    partnerId,
    category,
    type: category,
    ...itemData
  });

  await walletItem.populate('userId', 'name avatar');
  await walletItem.populate('partnerId', 'name avatar');

  res.status(201).json({
    success: true,
    data: { walletItem }
  });
});

// Update wallet item
export const updateWalletItem = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const { id } = req.params;
  const updateData = req.body as Partial<IWalletItem>;

  if (!userId) {
    throw new AppError('User not authenticated', 401);
  }

  const walletItem = await WalletItem.findOne({
    _id: id,
    userId: userId,
  });

  if (!walletItem) {
    throw new AppError('Wallet item not found or access denied', 404);
  }

  const allowedFields: Array<keyof Partial<IWalletItem>> = [
    'title',
    'content',
    'todoItems',
    'platform',
    'username',
    'password',
    'icon',
    'url',
    'tags',
    'category',
    'type',
  ];

  allowedFields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(updateData, field)) {
      (walletItem as any)[field] = updateData[field as keyof typeof updateData];
    }
  });

  if (Object.prototype.hasOwnProperty.call(updateData, 'todoItems')) {
    walletItem.markModified('todoItems');
  }

  if (Object.prototype.hasOwnProperty.call(updateData, 'tags')) {
    walletItem.markModified('tags');
  }

  walletItem.type = walletItem.category;
  walletItem.approvalStatus = 'pending';
  walletItem.approvalStatusUpdatedAt = new Date();
  walletItem.approvalStatusUpdatedBy = new mongoose.Types.ObjectId(userId);

  await walletItem.save();

  await walletItem.populate('userId', 'name avatar');
  await walletItem.populate('partnerId', 'name avatar');

  res.json({
    success: true,
    data: { walletItem }
  });
});

// Delete wallet item
export const deleteWalletItem = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const { id } = req.params;

  if (!userId) {
    throw new AppError('User not authenticated', 401);
  }

  // Check if user has access to this item
  const walletItem = await WalletItem.findOne({
    _id: id,
    $or: [
      { userId: userId },
      { partnerId: userId }
    ]
  });

  if (!walletItem) {
    throw new AppError('Wallet item not found or access denied', 404);
  }

  await WalletItem.findByIdAndDelete(id);

  res.json({
    success: true,
    message: 'Wallet item deleted successfully'
  });
});

// Toggle todo item completion
export const toggleTodoItem = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const { id, todoItemId } = req.params;

  if (!userId) {
    throw new AppError('User not authenticated', 401);
  }

  // Check if user has access to this item
  const walletItem = await WalletItem.findOne({
    _id: id,
    $or: [
      { userId: userId },
      { partnerId: userId }
    ]
  });

  if (!walletItem || walletItem.category !== 'todo') {
    throw new AppError('Todo item not found or access denied', 404);
  }

  // Find and toggle the specific todo item
  const todoItem = walletItem.todoItems?.find(item => item.id === todoItemId);
  if (!todoItem) {
    throw new AppError('Todo item not found', 404);
  }

  todoItem.completed = !todoItem.completed;
  await walletItem.save();

  await walletItem.populate('userId', 'name avatar');
  await walletItem.populate('partnerId', 'name avatar');

  res.json({
    success: true,
    data: { walletItem }
  });
});

// Update approval status for wallet item
export const updateWalletItemApproval = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const { id } = req.params;
  const { action } = req.body as { action?: 'approve' | 'reject' | 'pending' };

  if (!userId) {
    throw new AppError('User not authenticated', 401);
  }

  if (!action || !['approve', 'reject'].includes(action)) {
    throw new AppError('Invalid approval action', 400);
  }

  const walletItem = await WalletItem.findById(id)
    .populate('userId', 'name avatar')
    .populate('partnerId', 'name avatar');

  if (!walletItem) {
    throw new AppError('Wallet item not found', 404);
  }

  // Only the partner (not the owner) can approve or reject
  const partnerId = walletItem.partnerId instanceof mongoose.Types.ObjectId
    ? walletItem.partnerId.toString()
    : (walletItem.partnerId as any)?._id?.toString();

  if (!partnerId) {
    throw new AppError('Wallet item is not linked to a partner', 400);
  }

  if (partnerId !== userId) {
    throw new AppError('Only the partner can update approval status', 403);
  }

  walletItem.approvalStatus = action === 'approve' ? 'approved' : 'rejected';
  walletItem.approvalStatusUpdatedAt = new Date();
  walletItem.approvalStatusUpdatedBy = new mongoose.Types.ObjectId(userId);

  await walletItem.save();
  await walletItem.populate('userId', 'name avatar');
  await walletItem.populate('partnerId', 'name avatar');

  res.json({
    success: true,
    message: `Wallet item ${action === 'approve' ? 'approved' : 'rejected'} successfully`,
    data: { walletItem }
  });
});