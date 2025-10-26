import { Request, Response } from 'express';
import { asyncHandler, AppError } from '@/middleware/errorHandler';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import Message from '@/models/Message';
import Chat from '@/models/Chat';
import Notification from '@/models/Notification';
import { getSocketHandler } from '@/socket/socketHandler';

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Allow images, videos, audio, documents, and voice files
  const allowedMimes = [
    // Images
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/svg+xml',
    // Videos
    'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/avi', 'video/mov', 'video/wmv', 'video/flv', 'video/webm',
    // Audio
    'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp3', 'audio/aac', 'audio/flac', 'audio/m4a',
    // Documents
    'application/pdf', 'text/plain', 'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed'
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} not allowed`));
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

// Upload file and create message
export const uploadFile = asyncHandler(async (req: Request, res: Response) => {
  const { chatId, isOneView } = req.body;
  const userId = req.user?.userId;
  
  console.log('📤 File upload request:', { chatId, isOneView, isOneViewType: typeof isOneView, userId });

  if (!req.file) {
    throw new AppError('No file uploaded', 400);
  }

  const chat = await Chat.findById(chatId);
  if (!chat) {
    throw new AppError('Chat not found', 404);
  }

  // Check if user is participant
  if (!userId || !chat.participants.some(p => p.toString() === userId)) {
    throw new AppError('Access denied', 403);
  }

  // Determine file type based on mime type
  let messageType = 'file';
  if (req.file.mimetype.startsWith('image/')) {
    messageType = 'image';
  } else if (req.file.mimetype.startsWith('video/')) {
    messageType = 'video';
  } else if (req.file.mimetype.startsWith('audio/')) {
    messageType = 'audio';
  } else if (req.file.mimetype === 'application/pdf') {
    messageType = 'pdf';
  }

  // Parse isOneView correctly (can be string or boolean)
  const isOneViewBool = isOneView === 'true' || isOneView === true || (typeof isOneView === 'string' && isOneView.toLowerCase() === 'true');
  
  console.log('📤 Creating message with isOneView:', isOneViewBool);

  const message = await Message.create({
    chatId,
    senderId: userId,
    content: req.file.originalname,
    type: messageType as any,
    fileUrl: `/uploads/${req.file.filename}`,
    fileName: req.file.originalname,
    fileSize: req.file.size,
    mimeType: req.file.mimetype,
    isOneView: isOneViewBool
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
    type: 'file_shared',
    title: 'File Shared',
    message: `${messageType.charAt(0).toUpperCase() + messageType.slice(1)} shared`,
    data: { chatId, messageId: message._id, fileType: messageType }
  });

  // Emit socket event to chat participants
  const socketHandler = getSocketHandler();
  console.log('🔌 Socket handler available for file upload:', !!socketHandler);
  
  if (socketHandler) {
    console.log('📡 Emitting new_message for file upload to chat:', chatId);
    socketHandler.sendMessageToChat(chatId, {
      chatId,
      message: {
        _id: message._id,
        content: message.content,
        senderId: message.senderId,
        createdAt: message.createdAt,
        type: message.type,
        fileUrl: message.fileUrl,
        fileName: message.fileName,
        fileSize: message.fileSize,
        mimeType: message.mimeType,
        thumbnailUrl: message.thumbnailUrl,
        isOneView: message.isOneView,
        viewedBy: message.viewedBy,
        viewCount: message.viewCount,
        duration: message.duration
      }
    });
  } else {
    console.log('⚠️ Socket handler not available for file upload');
  }

  res.json({
    success: true,
    message: 'File uploaded successfully',
    data: { message }
  });
});

// Get file
export const getFile = asyncHandler(async (req: Request, res: Response) => {
  const { filename } = req.params;
  const filePath = path.join('uploads', filename);

  if (!fs.existsSync(filePath)) {
    throw new AppError('File not found', 404);
  }

  res.sendFile(path.resolve(filePath));
});

// Delete file
export const deleteFile = asyncHandler(async (req: Request, res: Response) => {
  const { messageId } = req.params;
  const userId = req.user?.userId;

  const message = await Message.findById(messageId);
  if (!message) {
    throw new AppError('Message not found', 404);
  }

  // Check if user is sender
  if (message.senderId.toString() !== userId) {
    throw new AppError('You can only delete your own files', 403);
  }

  // Soft delete only - do not delete physical files
  // Mark message as deleted
  message.isDeleted = true;
  message.deletedAt = new Date();
  await message.save();

  res.json({
    success: true,
    message: 'File deleted successfully'
  });
});

// Upload voice message
export const uploadVoiceMessage = asyncHandler(async (req: Request, res: Response) => {
  const { chatId, duration, waveform, isOneView = false } = req.body;
  const userId = req.user?.userId;

  if (!req.file) {
    throw new AppError('No voice file uploaded', 400);
  }

  const chat = await Chat.findById(chatId);
  if (!chat) {
    throw new AppError('Chat not found', 404);
  }

  // Check if user is participant
  if (!userId || !chat.participants.some(p => p.toString() === userId)) {
    throw new AppError('Access denied', 403);
  }

  // Parse waveform if provided
  let voiceWaveform: number[] = [];
  if (waveform) {
    try {
      voiceWaveform = JSON.parse(waveform);
    } catch (error) {
      console.error('Error parsing waveform:', error);
    }
  }

  const message = await Message.create({
    chatId,
    senderId: userId,
    content: 'Voice message',
    type: 'voice',
    fileUrl: `/uploads/${req.file.filename}`,
    fileName: req.file.originalname,
    fileSize: req.file.size,
    mimeType: req.file.mimetype,
    voiceDuration: duration ? parseInt(duration) : 0,
    voiceWaveform,
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
    type: 'voice_message',
    title: 'Voice Message',
    message: 'Sent a voice message',
    data: { chatId, messageId: message._id }
  });

  res.json({
    success: true,
    message: 'Voice message uploaded successfully',
    data: { message }
  });
});
