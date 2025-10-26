import { Request, Response } from 'express';
import { asyncHandler, AppError } from '@/middleware/errorHandler';
import Chat from '@/models/Chat';
import Message from '@/models/Message';
import User from '@/models/User';
import Notification from '@/models/Notification';
import { getSocketHandler } from '@/socket/socketHandler';

// Get or create chat with current partner
export const getCurrentPartnerChat = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;

  // Get current user with partners info
  const user = await User.findById(userId).select('partners');
  
  if (!user || !user.partners || user.partners.length === 0) {
    throw new AppError('No current partner found', 404);
  }

  // Get the active partner
  const activePartner = user.partners.find(p => p.status === 'active');
  if (!activePartner) {
    throw new AppError('No active partner found', 404);
  }

  const partnerId = activePartner.partnerId;
  console.log('🔍 Looking for chat with participants:', [userId, partnerId]);

  // Find existing chat
  let chat = await Chat.findOne({
    participants: { $all: [userId, partnerId] },
    isActive: true
  }).populate('participants', 'name email avatar');

  // Create new chat if doesn't exist
  if (!chat) {
    chat = await Chat.create({
      participants: [userId, partnerId]
    });
    await chat.populate('participants', 'name email avatar');
  }

  // Prepare partner data for response
  const partnerData = {
    _id: partnerId,
    name: activePartner.partnerName,
    email: activePartner.partnerEmail,
    avatar: activePartner.partnerAvatar
  };

  res.json({
    success: true,
    message: 'Chat retrieved successfully',
    data: { 
      chat,
      partner: partnerData
    }
  });
});

// Get or create chat between two users (legacy endpoint)
export const getOrCreateChat = asyncHandler(async (req: Request, res: Response) => {
  const { partnerId } = req.params;
  const userId = req.user?.userId;

  if (!partnerId) {
    throw new AppError('Partner ID is required', 400);
  }

  // Check if users are partners
  const partner = await User.findOne({
    _id: partnerId,
    'currentPartner.partnerId': userId
  });

  if (!partner) {
    throw new AppError('User is not your partner', 403);
  }

  // Find existing chat
  let chat = await Chat.findOne({
    participants: { $all: [userId, partnerId] },
    isActive: true
  }).populate('participants', 'name email avatar');

  // Create new chat if doesn't exist
  if (!chat) {
    chat = await Chat.create({
      participants: [userId, partnerId]
    });
    await chat.populate('participants', 'name email avatar');
  }

  res.json({
    success: true,
    message: 'Chat retrieved successfully',
    data: { chat }
  });
});

// Get chat messages
export const getChatMessages = asyncHandler(async (req: Request, res: Response) => {
  const { chatId } = req.params;
  const { page = 1, limit = 50 } = req.query;
  const userId = req.user?.userId;

  const chat = await Chat.findById(chatId);
  if (!chat) {
    throw new AppError('Chat not found', 404);
  }

  // Check if user is participant
  if (!userId || !chat.participants.some(p => p.toString() === userId)) {
    throw new AppError('Access denied', 403);
  }

  const skip = (Number(page) - 1) * Number(limit);

  // Filter out messages deleted for this user
  const messages = await Message.find({
    chatId,
    isDeleted: false,
    $or: [
      { deletedFor: { $ne: userId } }, // Not in deletedFor array
      { deletedFor: { $exists: false } } // Or deletedFor doesn't exist
    ]
  })
    .populate('senderId', 'name avatar')
    .populate({
      path: 'replyTo',
      select: 'content type senderId fileUrl',
      populate: {
        path: 'senderId',
        select: 'name avatar'
      }
    })
    .sort({ createdAt: -1 })
    .limit(Number(limit))
    .skip(skip);

  res.json({
    success: true,
    message: 'Messages retrieved successfully',
    data: {
      messages: messages.reverse(),
      hasMore: messages.length === Number(limit)
    }
  });
});

// Send message
export const sendMessage = asyncHandler(async (req: Request, res: Response) => {
  const { chatId, content, type = 'text', replyTo, isOneView = false } = req.body;
  const userId = req.user?.userId;

  const chat = await Chat.findById(chatId);
  if (!chat) {
    throw new AppError('Chat not found', 404);
  }

  // Check if user is participant
  if (!userId || !chat.participants.some(p => p.toString() === userId)) {
    throw new AppError('Access denied', 403);
  }

  const message = await Message.create({
    chatId,
    senderId: userId,
    content,
    type,
    replyTo,
    isOneView
  });

  // Populate all fields including replyTo
  await message.populate('senderId', 'name avatar');
  
  // Populate replyTo if it exists
  if (replyTo) {
    await message.populate({
      path: 'replyTo',
      select: 'content type senderId fileUrl',
      populate: {
        path: 'senderId',
        select: 'name avatar'
      }
    });
  }

  // Update chat last message
  chat.lastMessage = message._id as any;
  chat.lastMessageAt = new Date();
  await chat.save();

  // Get other participant
  const otherParticipant = chat.participants.find(p => p.toString() !== userId);

  // Create notification for other participant
  await Notification.create({
    userId: otherParticipant,
    type: 'message',
    title: 'New Message',
    message: type === 'text' ? content : `Sent a ${type}`,
    data: { chatId, messageId: message._id }
  });

  // Emit socket event to chat participants
  const socketHandler = getSocketHandler();
  console.log('🔌 Socket handler available:', !!socketHandler);
  
  if (socketHandler) {
    console.log('📡 Broadcasting message via socket to chat:', chatId);
    console.log('📡 Message data:', {
      _id: message._id,
      content: message.content,
      senderId: message.senderId,
      createdAt: message.createdAt,
      type: message.type
    });
    
    // Send to chat room only (participants will receive via room membership)
    socketHandler.sendMessageToChat(chatId, {
      chatId,
      message: {
        _id: message._id,
        content: message.content,
        senderId: message.senderId,
        createdAt: message.createdAt,
        type: message.type,
        fileUrl: message.fileUrl,
        thumbnailUrl: message.thumbnailUrl,
        isOneView: message.isOneView,
        viewedBy: message.viewedBy,
        viewCount: message.viewCount,
        replyTo: message.replyTo
      }
    });
    
    console.log('✅ Socket message broadcast completed');
  } else {
    console.log('❌ Socket handler not available - message sent via API only');
  }

  res.json({
    success: true,
    message: 'Message sent successfully',
    data: { message }
  });
});

// Mark message as viewed (for once-view messages)
export const markMessageAsViewed = asyncHandler(async (req: Request, res: Response) => {
  const { messageId } = req.params;
  const userId = req.user?.userId;

  const message = await Message.findById(messageId);
  if (!message) {
    throw new AppError('Message not found', 404);
  }

  // Check if user is participant in the chat
  const chat = await Chat.findById(message.chatId);
  if (!chat || !userId || !chat.participants.some(p => p.toString() === userId)) {
    throw new AppError('Access denied', 403);
  }

  // Check if message is one-view and not already viewed by this user
  if (message.isOneView && !message.viewedBy?.some(id => id.toString() === userId)) {
    // Add user to viewedBy array
    if (!message.viewedBy) {
      message.viewedBy = [];
    }
    message.viewedBy.push(userId as any);
    message.viewCount = (message.viewCount || 0) + 1;
    
    // If this is the first view, set viewedAt
    if (message.viewCount === 1) {
      message.viewedAt = new Date();
    }
    
    await message.save();
  }

  res.json({
    success: true,
    message: 'Message marked as viewed',
    data: { 
      viewCount: message.viewCount || 0,
      viewedBy: message.viewedBy?.length || 0
    }
  });
});

// Get message view status
export const getMessageViewStatus = asyncHandler(async (req: Request, res: Response) => {
  const { messageId } = req.params;
  const userId = req.user?.userId;

  const message = await Message.findById(messageId).populate('viewedBy', 'name avatar');
  if (!message) {
    throw new AppError('Message not found', 404);
  }

  // Check if user is participant in the chat
  const chat = await Chat.findById(message.chatId);
  if (!chat || !userId || !chat.participants.some(p => p.toString() === userId)) {
    throw new AppError('Access denied', 403);
  }

  res.json({
    success: true,
    data: {
      isOneView: message.isOneView,
      viewCount: message.viewCount || 0,
      viewedBy: message.viewedBy || [],
      viewedAt: message.viewedAt
    }
  });
});

// Get user's chats
export const getUserChats = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;

  const chats = await Chat.find({
    participants: userId,
    isActive: true
  })
    .populate('participants', 'name email avatar')
    .populate('lastMessage')
    .sort({ lastMessageAt: -1 });

  res.json({
    success: true,
    message: 'Chats retrieved successfully',
    data: { chats }
  });
});

// Delete message for me only
export const deleteMessageForMe = asyncHandler(async (req: Request, res: Response) => {
  const { messageId } = req.params;
  const userId = req.user?.userId;

  const message = await Message.findById(messageId).populate('chatId', 'participants');
  if (!message) {
    throw new AppError('Message not found', 404);
  }

  // Get chat participants
  const chat = await Chat.findById(message.chatId);
  if (!chat) {
    throw new AppError('Chat not found', 404);
  }

  // Check if user is participant
  const isParticipant = chat.participants.some(p => p.toString() === userId);

  if (!isParticipant) {
    throw new AppError('Access denied', 403);
  }

  // Add user to deletedFor array
  if (!message.deletedFor) {
    message.deletedFor = [];
  }

  if (!message.deletedFor.includes(userId as any)) {
    message.deletedFor.push(userId as any);
    await message.save();
  }

  res.json({
    success: true,
    message: 'Message deleted for you'
  });
});

// Delete message for everyone (sender only)
export const deleteMessageForEveryone = asyncHandler(async (req: Request, res: Response) => {
  const { chatId, messageId } = req.params;
  const userId = req.user?.userId;

  const message = await Message.findById(messageId).populate('chatId', 'participants');
  if (!message) {
    throw new AppError('Message not found', 404);
  }

  // Check if user is the sender
  if (message.senderId.toString() !== userId) {
    throw new AppError('Only the sender can delete this message for everyone', 403);
  }

  // Get chat participants
  const chat = await Chat.findById(message.chatId);
  if (!chat) {
    throw new AppError('Chat not found', 404);
  }

  // Soft delete the message for everyone
  message.isDeletedForEveryone = true;
  message.content = 'This message was deleted.';
  message.deletedAt = new Date();
  await message.save();

  // Emit socket event to all chat participants
  const socketHandler = getSocketHandler();
  if (socketHandler) {
    console.log('📡 Emitting message_deleted_for_everyone event for message:', messageId);
    
    // Emit to chat participants
    chat.participants.forEach(participant => {
      socketHandler.emitToUser(participant.toString(), 'message_deleted_for_everyone', {
        messageId: message._id,
        chatId: message.chatId,
        deletedBy: userId,
        deletedAt: message.deletedAt
      });
    });
    
    console.log('✅ Socket event emitted to participants');
  }

  res.json({
    success: true,
    message: 'Message deleted for everyone'
  });
});

// Edit message
export const editMessage = asyncHandler(async (req: Request, res: Response) => {
  const { messageId } = req.params;
  const { content } = req.body;
  const userId = req.user?.userId;

  const message = await Message.findById(messageId);
  if (!message) {
    throw new AppError('Message not found', 404);
  }

  // Check if user is sender
  if (message.senderId.toString() !== userId) {
    throw new AppError('You can only edit your own messages', 403);
  }

  // Only text messages can be edited
  if (message.type !== 'text') {
    throw new AppError('Only text messages can be edited', 400);
  }

  message.content = content;
  message.isEdited = true;
  message.editedAt = new Date();
  await message.save();

  res.json({
    success: true,
    message: 'Message edited successfully',
    data: { message }
  });
});
