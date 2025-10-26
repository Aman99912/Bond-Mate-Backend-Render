import { Request, Response } from 'express';
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
    { value: 'facebook', label: 'Facebook', icon: 'logo-facebook', color: '#1877F2' },
    { value: 'instagram', label: 'Instagram', icon: 'logo-instagram', color: '#E4405F' },
    { value: 'twitter', label: 'Twitter', icon: 'logo-twitter', color: '#1DA1F2' },
    { value: 'linkedin', label: 'LinkedIn', icon: 'logo-linkedin', color: '#0077B5' },
    { value: 'youtube', label: 'YouTube', icon: 'logo-youtube', color: '#FF0000' },
    { value: 'tiktok', label: 'TikTok', icon: 'logo-tiktok', color: '#000000' },
    { value: 'snapchat', label: 'Snapchat', icon: 'logo-snapchat', color: '#FFFC00' },
    { value: 'whatsapp', label: 'WhatsApp', icon: 'logo-whatsapp', color: '#25D366' },
    { value: 'telegram', label: 'Telegram', icon: 'logo-telegram', color: '#0088CC' },
    { value: 'discord', label: 'Discord', icon: 'logo-discord', color: '#5865F2' },
    { value: 'reddit', label: 'Reddit', icon: 'logo-reddit', color: '#FF4500' },
    { value: 'pinterest', label: 'Pinterest', icon: 'logo-pinterest', color: '#BD081C' },
    { value: 'github', label: 'GitHub', icon: 'logo-github', color: '#181717' },
    { value: 'google', label: 'Google', icon: 'logo-google', color: '#4285F4' },
    { value: 'apple', label: 'Apple', icon: 'logo-apple', color: '#000000' },
    { value: 'microsoft', label: 'Microsoft', icon: 'logo-microsoft', color: '#00BCF2' },
    { value: 'amazon', label: 'Amazon', icon: 'logo-amazon', color: '#FF9900' },
    { value: 'netflix', label: 'Netflix', icon: 'logo-netflix', color: '#E50914' },
    { value: 'spotify', label: 'Spotify', icon: 'logo-spotify', color: '#1DB954' },
    { value: 'other', label: 'Other', icon: 'globe', color: '#6B7280' }
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
  const updateData = req.body;

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

  // Update the item
  const updatedItem = await WalletItem.findByIdAndUpdate(
    id,
    updateData,
    { new: true, runValidators: true }
  ).populate('userId', 'name avatar')
   .populate('partnerId', 'name avatar');

  res.json({
    success: true,
    data: { walletItem: updatedItem }
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
