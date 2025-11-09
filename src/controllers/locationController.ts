import { Request, Response } from 'express';
import { asyncHandler, AppError } from '@/middleware/errorHandler';
import { getSocketHandler } from '@/socket/socketHandler';
import LocationModel from '@/models/Location';

// Update user's current location
export const updateLocation = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  
  if (!userId) {
    throw new AppError('User not authenticated', 401);
  }

  const { latitude, longitude, accuracy } = req.body;

  const numericLatitude = Number(latitude);
  const numericLongitude = Number(longitude);
  const numericAccuracy = accuracy !== undefined && accuracy !== null ? Number(accuracy) : undefined;

  if (!Number.isFinite(numericLatitude) || !Number.isFinite(numericLongitude)) {
    throw new AppError('Latitude and longitude are required and must be valid numbers', 400);
  }

  if (numericLatitude < -90 || numericLatitude > 90) {
    throw new AppError('Invalid latitude. Must be between -90 and 90', 400);
  }

  if (numericLongitude < -180 || numericLongitude > 180) {
    throw new AppError('Invalid longitude. Must be between -180 and 180', 400);
  }

  if (numericAccuracy !== undefined && (!Number.isFinite(numericAccuracy) || numericAccuracy < 0)) {
    throw new AppError('Accuracy must be a positive number', 400);
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
  const updatedAt = new Date();

  user.lastLocation = {
    latitude: numericLatitude,
    longitude: numericLongitude,
    accuracy: numericAccuracy,
    updatedAt,
  };
  await user.save();

  await LocationModel.findOneAndUpdate(
    { userId: userId },
    {
      latitude: numericLatitude,
      longitude: numericLongitude,
      accuracy: numericAccuracy,
      updatedAt,
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );

  // Send location update to partner via socket
  const socketHandler = getSocketHandler();
  if (socketHandler) {
    socketHandler.emitToUser(partnerId, 'partner_location_update', {
      userId: userId,
      userName: user.name,
      latitude: numericLatitude,
      longitude: numericLongitude,
      accuracy: numericAccuracy,
      timestamp: updatedAt.getTime()
    });
  }

  res.json({
    success: true,
    message: 'Location updated successfully',
    data: {
      latitude: numericLatitude,
      longitude: numericLongitude,
      accuracy: numericAccuracy,
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
  const [partner, partnerLocation] = await Promise.all([
    User.findById(partnerId).select('name'),
    LocationModel.findOne({ userId: partnerId }),
  ]);

  if (!partner) {
    throw new AppError('Partner not found', 404);
  }

  const partnerLastLocation = partnerLocation
    ? {
        latitude: partnerLocation.latitude,
        longitude: partnerLocation.longitude,
        accuracy: partnerLocation.accuracy,
        updatedAt: partnerLocation.updatedAt,
      }
    : null;

  res.json({
    success: true,
    data: {
      partnerId: partner._id,
      partnerName: partner.name,
      location: partnerLastLocation,
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
  const [partner, myLocation, partnerLocation] = await Promise.all([
    User.findById(partnerId).select('name'),
    LocationModel.findOne({ userId: userId }),
    LocationModel.findOne({ userId: partnerId }),
  ]);

  if (!partner) {
    throw new AppError('Partner not found', 404);
  }

  const formattedMyLocation = myLocation
    ? {
        latitude: myLocation.latitude,
        longitude: myLocation.longitude,
        accuracy: myLocation.accuracy,
        updatedAt: myLocation.updatedAt,
      }
    : user.lastLocation || null;

  const formattedPartnerLocation = partnerLocation
    ? {
        latitude: partnerLocation.latitude,
        longitude: partnerLocation.longitude,
        accuracy: partnerLocation.accuracy,
        updatedAt: partnerLocation.updatedAt,
      }
    : partner.lastLocation || null;

  res.json({
    success: true,
    data: {
      myLocation: formattedMyLocation,
      partnerLocation: formattedPartnerLocation,
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
