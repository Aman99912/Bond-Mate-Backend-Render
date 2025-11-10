import { Request, Response } from 'express';
import { asyncHandler, AppError } from '@/middleware/errorHandler';
import Chat from '@/models/Chat';
import Message, { IMessage } from '@/models/Message';
import User from '@/models/User';
import Notification from '@/models/Notification';
import { getSocketHandler } from '@/socket/socketHandler';
import { decodeMessageCursor, encodeMessageCursor } from '@/utils/cursor';
import { FilterQuery, Types } from 'mongoose';

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

// Get chat messages (cursor-based pagination)
export const getChatMessages = asyncHandler(async (req: Request, res: Response) => {
  const { chatId } = req.params;
  const { limit: limitQuery, cursor } = req.query as { limit?: string; cursor?: string };
  const userId = req.user?.userId;

  if (!Types.ObjectId.isValid(chatId)) {
    throw new AppError('Invalid chat ID', 400);
  }

  const chat = await Chat.findById(chatId).select('participants');
  if (!chat) {
    throw new AppError('Chat not found', 404);
  }

  // Check if user is participant
  if (!userId || !chat.participants.some((participant) => participant.toString() === userId)) {
    throw new AppError('Access denied', 403);
  }

  const limitNumber = Math.min(Math.max(Number(limitQuery) || 20, 1), 100);

  const filters: FilterQuery<IMessage>[] = [
    { chatId: new Types.ObjectId(chatId) },
    { isDeleted: false },
    {
      $or: [
        { deletedFor: { $ne: new Types.ObjectId(userId) } },
        { deletedFor: { $exists: false } },
      ],
    },
  ];

  if (cursor) {
    const { createdAt, id } = decodeMessageCursor(cursor);
    const cursorDate = new Date(createdAt);

    filters.push({
    $or: [
        { createdAt: { $lt: cursorDate } },
        {
          createdAt: cursorDate,
          _id: { $lt: new Types.ObjectId(id) },
        },
      ],
    });
  }

  const messages = await Message.find({ $and: filters })
    .sort({ createdAt: -1, _id: -1 })
    .limit(limitNumber + 1)
    .populate('senderId', 'name avatar')
    .populate({
      path: 'replyTo',
      select: 'content type senderId fileUrl thumbnailUrl mimeType',
      populate: {
        path: 'senderId',
        select: 'name avatar',
      },
    });

  const hasMore = messages.length > limitNumber;
  const trimmed = hasMore ? messages.slice(0, limitNumber) : messages;
  const ordered = trimmed.reverse();

  const normalizeSender = (sender: any) => {
    if (!sender) {
      return sender;
    }

    if (typeof sender === 'object' && sender._id) {
      return {
        _id: sender._id.toString(),
        name: sender.name,
        avatar: sender.avatar,
      };
    }

    return sender.toString();
  };

  const normalizeReply = (reply: any) => {
    if (!reply) {
      return reply;
    }

    if (typeof reply === 'object' && reply._id) {
      return {
        ...reply,
        _id: reply._id.toString(),
        senderId: normalizeSender(reply.senderId),
      };
    }

    return reply.toString();
  };

  const normalizeObjectIdArray = (values?: Array<Types.ObjectId | string>) =>
    values?.map((value) => value.toString());

  const normalizeReactions = (reactions?: Array<{ userId: any; emoji: string }>) => {
    if (!reactions) {
      return reactions;
    }

    return reactions.map((reaction) => {
      const { userId } = reaction;
      let normalizedUserId: string;

      if (!userId) {
        normalizedUserId = '';
      } else if (typeof userId === 'string') {
        normalizedUserId = userId;
      } else if (typeof userId === 'object' && 'toString' in userId) {
        normalizedUserId = (userId as Types.ObjectId).toString();
      } else if (typeof userId === 'object' && '_id' in userId) {
        normalizedUserId = (userId as { _id: Types.ObjectId })._id.toString();
      } else {
        normalizedUserId = String(userId);
      }

      return {
        emoji: reaction.emoji,
        userId: normalizedUserId,
      };
    });
  };

  const responseMessages = ordered.map((message) => {
    const plain = message.toObject<IMessage>();

    return {
      _id: message.id,
      chatId: message.chatId.toString(),
      senderId: normalizeSender(plain.senderId),
      content: plain.content,
      type: plain.type,
      fileUrl: plain.fileUrl,
      fileName: plain.fileName,
      fileSize: plain.fileSize,
      mimeType: plain.mimeType,
      thumbnailUrl: plain.thumbnailUrl,
      duration: plain.duration,
      isOneView: plain.isOneView,
      viewedBy: normalizeObjectIdArray(plain.viewedBy),
      viewedAt: plain.viewedAt ? plain.viewedAt.toISOString() : undefined,
      viewCount: plain.viewCount,
      replyTo: normalizeReply(plain.replyTo),
      isEdited: plain.isEdited,
      editedAt: plain.editedAt ? plain.editedAt.toISOString() : undefined,
      isDeleted: plain.isDeleted,
      deletedAt: plain.deletedAt ? plain.deletedAt.toISOString() : undefined,
      deletedFor: normalizeObjectIdArray(plain.deletedFor),
      isDeletedForEveryone: plain.isDeletedForEveryone,
      stickerId: plain.stickerId,
      stickerUrl: plain.stickerUrl,
      stickerCategory: plain.stickerCategory,
      voiceDuration: plain.voiceDuration,
      voiceWaveform: plain.voiceWaveform ? [...plain.voiceWaveform] : undefined,
      reactions: normalizeReactions(plain.reactions),
      createdAt: message.createdAt.toISOString(),
      updatedAt: message.updatedAt?.toISOString(),
      encryptionKey: plain.encryptionKey,
      isEncrypted: plain.isEncrypted,
      expiresAt: plain.expiresAt ? plain.expiresAt.toISOString() : undefined,
    };
  });

  const nextCursor =
    hasMore && ordered.length
      ? encodeMessageCursor({
          createdAt: ordered[0].createdAt.toISOString(),
          id: ordered[0].id,
        })
      : null;

  res.json({
    messages: responseMessages,
    nextCursor,
    hasMore,
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

// ============================
// Reactions
// ============================
export const reactToMessage = asyncHandler(async (req: Request, res: Response) => {
  const { messageId } = req.params;
  const { emoji } = req.body as { emoji: string };
  const userId = req.user?.userId as string;

  if (!emoji) {
    throw new AppError('Emoji is required', 400);
  }

  const allowedEmojis = new Set(['❤️', '😂', '👍', '😮', '😢', '🙏']);
  if (!allowedEmojis.has(emoji)) {
    throw new AppError('Emoji not allowed', 400);
  }

  const message = await Message.findById(messageId);
  if (!message) {
    throw new AppError('Message not found', 404);
  }

  // Verify user is participant
  const chat = await Chat.findById(message.chatId);
  if (!chat || !userId || !chat.participants.some(p => p.toString() === userId)) {
    throw new AppError('Access denied', 403);
  }

  message.reactions = message.reactions || [];
  const existingIndex = message.reactions.findIndex(r => r.userId.toString() === userId);
  if (existingIndex >= 0) {
    // Toggle if same emoji, else replace
    if (message.reactions[existingIndex].emoji === emoji) {
      message.reactions.splice(existingIndex, 1);
    } else {
      message.reactions[existingIndex].emoji = emoji;
    }
  } else {
    (message.reactions as any).push({ userId, emoji });
  }

  await message.save();

  // Emit to chat room
  const socketHandler = getSocketHandler();
  if (socketHandler) {
    socketHandler.sendMessageToChat((message.chatId as any).toString(), {
      chatId: (message.chatId as any).toString(),
      reaction_update: {
        messageId: message._id,
        reactions: message.reactions
      }
    });
  }

  res.json({
    success: true,
    message: 'Reaction updated',
    data: {
      reactions: message.reactions
    }
  });
});

// Process and format messages for frontend
export const processMessages = asyncHandler(async (req: Request, res: Response) => {
  const { chatId } = req.params;
  const userId = req.user?.userId;

  // Verify user access to chat
  const chat = await Chat.findById(chatId);
  if (!chat || !chat.participants.some(p => p.toString() === userId)) {
    throw new AppError('Access denied', 403);
  }

  const messages = await Message.find({ chatId })
    .populate('senderId', 'name avatar')
    .populate('replyTo', 'content type senderId')
    .sort({ createdAt: -1 })
    .limit(50);

  // Process messages on backend
  const processedMessages = messages.map(msg => {
    const processed: any = msg.toObject();
    
    // Format file URLs
    if (processed.fileUrl && !processed.fileUrl.startsWith('http')) {
      processed.fileUrl = `${process.env.API_BASE_URL || 'http://localhost:3000'}${processed.fileUrl}`;
    }
    
    if (processed.thumbnailUrl && !processed.thumbnailUrl.startsWith('http')) {
      processed.thumbnailUrl = `${process.env.API_BASE_URL || 'http://localhost:3000'}${processed.thumbnailUrl}`;
    }

    // Format sender info
    if (processed.senderId && typeof processed.senderId === 'object') {
      processed.senderName = (processed.senderId as any).name;
      processed.senderAvatar = (processed.senderId as any).avatar;
    }

    // Format reply info
    if (processed.replyTo && typeof processed.replyTo === 'object') {
      const replyTo = processed.replyTo as any;
      processed.replyContent = replyTo.type === 'image' ? '📷 Image' : 
                              replyTo.type === 'video' ? '🎥 Video' : 
                              replyTo.type === 'audio' ? '🎤 Audio' : 
                              replyTo.content;
    }

    // Format reactions
    if (processed.reactions) {
      processed.reactionSummary = processed.reactions.reduce((acc: any, r: any) => {
        acc[r.emoji] = (acc[r.emoji] || 0) + 1;
        return acc;
      }, {});
    }

    return processed;
  });

  res.json({
    success: true,
    data: { messages: processedMessages }
  });
});

// Validate and process file uploads
export const validateFileUpload = asyncHandler(async (req: Request, res: Response) => {
  const { fileSize, mimeType, fileName } = req.body;
  
  // File size validation (10MB max)
  const MAX_SIZE = 10 * 1024 * 1024;
  if (fileSize > MAX_SIZE) {
    throw new AppError('File too large. Maximum size is 10MB', 400);
  }

  // MIME type validation
  const allowedTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/quicktime', 'video/x-msvideo',
    'audio/mpeg', 'audio/mp4', 'audio/wav',
    'application/pdf', 'text/plain'
  ];

  if (!allowedTypes.includes(mimeType)) {
    throw new AppError('File type not allowed', 400);
  }

  // File name sanitization
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');

  res.json({
    success: true,
    data: {
      isValid: true,
      sanitizedFileName,
      fileSize,
      mimeType
    }
  });
});
