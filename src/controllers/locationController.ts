import { Request, Response } from 'express';
import { asyncHandler, AppError } from '@/middleware/errorHandler';
import { getSocketHandler } from '@/socket/socketHandler';

// Update user's current location
export const updateLocation = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  
  if (!userId) {
    throw new AppError('User not authenticated', 401);
  }

  const { latitude, longitude, accuracy } = req.body;

  if (!latitude || !longitude) {
    throw new AppError('Latitude and longitude are required', 400);
  }

  // Validate coordinates
  if (latitude < -90 || latitude > 90) {
    throw new AppError('Invalid latitude. Must be between -90 and 90', 400);
  }

  if (longitude < -180 || longitude > 180) {
    throw new AppError('Invalid longitude. Must be between -180 and 180', 400);
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

  // Update user's last known location
  user.lastLocation = {
    latitude,
    longitude,
    accuracy: accuracy || null,
    updatedAt: new Date()
  };
  await user.save();

  // Send location update to partner via socket
  const socketHandler = getSocketHandler();
  if (socketHandler) {
    socketHandler.emitToUser(partnerId, 'partner_location_update', {
      userId: userId,
      userName: user.name,
      latitude,
      longitude,
      accuracy,
      timestamp: Date.now()
    });
  }

  res.json({
    success: true,
    message: 'Location updated successfully',
    data: {
      latitude,
      longitude,
      accuracy,
      updatedAt: user.lastLocation.updatedAt
    }
  });
});

// Get partner's last known location
export const getPartnerLocation = asyncHandler(async (req: Request, res: Response) => {
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

  // Get partner's information
  const partner = await User.findById(partnerId).select('name lastLocation');
  
  if (!partner) {
    throw new AppError('Partner not found', 404);
  }

  res.json({
    success: true,
    data: {
      partnerId: partner._id,
      partnerName: partner.name,
      location: partner.lastLocation || null,
      isOnline: false // This would be determined by socket connection status
    }
  });
});

// Get both users' locations
export const getBothLocations = asyncHandler(async (req: Request, res: Response) => {
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

  // Get partner's information
  const partner = await User.findById(partnerId).select('name lastLocation');
  
  if (!partner) {
    throw new AppError('Partner not found', 404);
  }

  res.json({
    success: true,
    data: {
      myLocation: user.lastLocation || null,
      partnerLocation: partner.lastLocation || null,
      partnerName: partner.name
    }
  });
});

// Request partner's current location
export const requestPartnerLocation = asyncHandler(async (req: Request, res: Response) => {
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

  // Send location request to partner via socket
  const socketHandler = getSocketHandler();
  if (socketHandler) {
    socketHandler.emitToUser(partnerId, 'location_request', {
      fromUserId: userId,
      fromUserName: user.name,
      timestamp: Date.now()
    });
  }

  res.json({
    success: true,
    message: 'Location request sent to partner'
  });
});
