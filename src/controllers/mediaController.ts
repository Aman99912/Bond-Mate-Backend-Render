import { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import MediaItem from '@/models/MediaItem';
import { asyncHandler, AppError } from '@/middleware/errorHandler';

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/media');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Only allow image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!') as any, false);
    }
  }
});

export const uploadMedia = upload.single('image');

// Get all media items for a user and their partner
export const getMediaItems = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  
  if (!userId) {
    throw new AppError('User not authenticated', 401);
  }

  // Get user's partner
  const User = require('@/models/User').default;
  const user = await User.findById(userId);
  
  if (!user) {
    throw new AppError('User not found', 404);
  }

  // Check for active partner
  const activePartner = user?.partners?.find((partner: any) => partner.status === 'active');
  
  // If no active partner, return empty array instead of error
  if (!activePartner?.partnerId) {
    return res.json({
      success: true,
      data: [],
      count: 0
    });
  }

  const partnerId = activePartner.partnerId;

  // Get media items for both user and partner
  const mediaItems = await MediaItem.find({
    $or: [
      { userId: userId, partnerId: partnerId, isDeleted: false },
      { userId: partnerId, partnerId: userId, isDeleted: false }
    ]
  })
  .populate('userId', 'name email')
  .populate('partnerId', 'name email')
  .sort({ uploadedAt: -1 });

  return res.json({
    success: true,
    data: mediaItems,
    count: mediaItems.length
  });
});

// Upload a new media item
export const createMediaItem = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  
  if (!userId) {
    throw new AppError('User not authenticated', 401);
  }

  if (!req.file) {
    throw new AppError('No file uploaded', 400);
  }

  // Get user's partner
  const User = require('@/models/User').default;
  const user = await User.findById(userId);
  
  if (!user) {
    throw new AppError('User not found', 404);
  }

  // Check for active partner
  const activePartner = user?.partners?.find((partner: any) => partner.status === 'active');
  
  if (!activePartner?.partnerId) {
    throw new AppError('No partner found', 404);
  }

  const partnerId = activePartner.partnerId;

  // Create media item
  const mediaItem = new MediaItem({
    userId: userId,
    partnerId: partnerId,
    fileName: req.file.originalname,
    fileUrl: `/uploads/media/${req.file.filename}`,
    fileSize: req.file.size,
    mimeType: req.file.mimetype
  });

  await mediaItem.save();

  // Populate user details
  await mediaItem.populate('userId', 'name email');
  await mediaItem.populate('partnerId', 'name email');

  res.status(201).json({
    success: true,
    message: 'Media uploaded successfully',
    data: mediaItem
  });
});

// Delete a media item (soft delete)
export const deleteMediaItem = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const mediaId = req.params.mediaId || req.params.id;
  
  if (!userId) {
    throw new AppError('User not authenticated', 401);
  }

  // Find the media item
  const mediaItem = await MediaItem.findById(mediaId);
  
  if (!mediaItem) {
    throw new AppError('Media item not found', 404);
  }

  // Check if user owns this media item
  if (mediaItem.userId.toString() !== userId) {
    throw new AppError('You can only delete your own media items', 403);
  }

  // Soft delete
  mediaItem.isDeleted = true;
  mediaItem.deletedAt = new Date();
  await mediaItem.save();

  res.json({
    success: true,
    message: 'Media deleted successfully'
  });
});

// Get media statistics
export const getMediaStats = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  
  if (!userId) {
    throw new AppError('User not authenticated', 401);
  }

  // Get user's partner
  const User = require('@/models/User').default;
  const user = await User.findById(userId);
  
  if (!user) {
    throw new AppError('User not found', 404);
  }

  // Check for active partner
  const activePartner = user?.partners?.find((partner: any) => partner.status === 'active');
  
  if (!activePartner?.partnerId) {
    throw new AppError('No partner found', 404);
  }

  const partnerId = activePartner.partnerId;

  // Get statistics
  const totalMedia = await MediaItem.countDocuments({
    $or: [
      { userId: userId, partnerId: partnerId, isDeleted: false },
      { userId: partnerId, partnerId: userId, isDeleted: false }
    ]
  });

  const myMedia = await MediaItem.countDocuments({
    userId: userId,
    partnerId: partnerId,
    isDeleted: false
  });

  const partnerMedia = await MediaItem.countDocuments({
    userId: partnerId,
    partnerId: userId,
    isDeleted: false
  });

  // Calculate total storage used
  const storageUsed = await MediaItem.aggregate([
    {
      $match: {
        $or: [
          { userId: new mongoose.Types.ObjectId(userId), partnerId: new mongoose.Types.ObjectId(partnerId), isDeleted: false },
          { userId: new mongoose.Types.ObjectId(partnerId), partnerId: new mongoose.Types.ObjectId(userId), isDeleted: false }
        ]
      }
    },
    {
      $group: {
        _id: null,
        totalSize: { $sum: '$fileSize' }
      }
    }
  ]);

  const totalStorageUsed = storageUsed.length > 0 ? storageUsed[0].totalSize : 0;

  res.json({
    success: true,
    data: {
      totalMedia,
      myMedia,
      partnerMedia,
      totalStorageUsed,
      formattedStorageUsed: formatBytes(totalStorageUsed)
    }
  });
});

// Helper function to format bytes
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
