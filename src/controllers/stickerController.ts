import { Request, Response } from 'express';
import { asyncHandler, AppError } from '@/middleware/errorHandler';
import Sticker from '@/models/Sticker';
import Message from '@/models/Message';
import Chat from '@/models/Chat';
import Notification from '@/models/Notification';

// Get all stickers by category
export const getStickers = asyncHandler(async (req: Request, res: Response) => {
  const { category } = req.query;
  
  const filter: any = { isActive: true };
  if (category && category !== 'all') {
    filter.category = category;
  }

  const stickers = await Sticker.find(filter).sort({ category: 1, name: 1 });

  res.json({
    success: true,
    data: { stickers }
  });
});

// Get sticker categories
export const getStickerCategories = asyncHandler(async (req: Request, res: Response) => {
  const categories = await Sticker.distinct('category', { isActive: true });
  
  res.json({
    success: true,
    data: { categories }
  });
});

// Send sticker message
export const sendSticker = asyncHandler(async (req: Request, res: Response) => {
  const { chatId, stickerId, isOneView = false } = req.body;
  const userId = req.user?.userId;

  if (!stickerId) {
    throw new AppError('Sticker ID is required', 400);
  }

  const chat = await Chat.findById(chatId);
  if (!chat) {
    throw new AppError('Chat not found', 404);
  }

  // Check if user is participant
  if (!userId || !chat.participants.some(p => p.toString() === userId)) {
    throw new AppError('Access denied', 403);
  }

  // Get sticker details
  const sticker = await Sticker.findOne({ stickerId, isActive: true });
  if (!sticker) {
    throw new AppError('Sticker not found', 404);
  }

  const message = await Message.create({
    chatId,
    senderId: userId,
    content: sticker.name,
    type: 'sticker',
    stickerId: sticker.stickerId,
    stickerUrl: sticker.url,
    stickerCategory: sticker.category,
    isOneView: isOneView === 'true'
  });

  await message.populate('senderId', 'name avatar');

  // Update chat last message
  chat.lastMessage = message._id as any;
  chat.lastMessageAt = new Date();
  await chat.save();

  // Get other participant
  const otherParticipant = chat.participants.find(p => p.toString() !== userId);

  // Create notification for other participant
  await Notification.create({
    userId: otherParticipant,
    type: 'sticker',
    title: 'Sticker',
    message: `Sent a ${sticker.category} sticker`,
    data: { chatId, messageId: message._id, stickerId: sticker.stickerId }
  });

  res.json({
    success: true,
    message: 'Sticker sent successfully',
    data: { message }
  });
});

// Create custom sticker (admin only)
export const createSticker = asyncHandler(async (req: Request, res: Response) => {
  const { stickerId, name, category, url, thumbnailUrl, isAnimated, tags } = req.body;

  if (!stickerId || !name || !category || !url) {
    throw new AppError('Missing required fields', 400);
  }

  // Check if sticker ID already exists
  const existingSticker = await Sticker.findOne({ stickerId });
  if (existingSticker) {
    throw new AppError('Sticker ID already exists', 400);
  }

  const sticker = await Sticker.create({
    stickerId,
    name,
    category,
    url,
    thumbnailUrl,
    isAnimated: isAnimated || false,
    tags: tags || []
  });

  res.json({
    success: true,
    message: 'Sticker created successfully',
    data: { sticker }
  });
});
