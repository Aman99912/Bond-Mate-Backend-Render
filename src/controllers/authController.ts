import { Request, Response } from 'express';
import { ApiResponse, LoginRequest, RegisterRequest } from '@/types';
import { asyncHandler, AppError } from '@/middleware/errorHandler';
import { generateToken } from '@/utils/jwt';
import { hashPassword, comparePassword } from '@/utils/hash';
import User from '@/models/User';
import { SessionService } from '@/services/sessionService';

export const register = asyncHandler(async (req: Request, res: Response) => {
  const { 
    name, 
    email, 
    password, 
    mobileNumber, 
    subPassword, 
    avatar, 
    bio, 
    dob,
    gender

  }: RegisterRequest = req.body;

  // Check if user already exists
  const existingUser = await User.findOne({
    $or: [
      { email },
      ...(mobileNumber ? [{ mobileNumber }] : [])
    ],
  });

  if (existingUser) {
    throw new AppError('User with this email or mobile number already exists', 409);
  }

  // Hash password
  const hashedPassword = await hashPassword(password);
  const UserSearchId = Math.floor(100000000000 + Math.random() * 900000000000).toString();
  // Hash sub-password if provided
  const hashedSubPassword = subPassword ? await hashPassword(subPassword) : null;

  // Create user
  const user = await User.create({
    name,
    email,
    password: hashedPassword,
    mobileNumber,
    subPassword: hashedSubPassword,
    avatar,
    bio,
    dob: dob ? new Date(dob) : undefined,
    gender,
    UserSearchId,
  });

  // Generate token
  const token = generateToken({
    userId: user.id,
    email: user.email,
  });

  const response: ApiResponse = {
    success: true,
    message: 'User registered successfully',
    data: {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        mobileNumber: user.mobileNumber,
        avatar: user.avatar,
        bio: user.bio,
        dob: user.dob,
        gender: user.gender,
        UserSearchId: user.UserSearchId,
        createdAt: user.createdAt,
      },
      token,
    },
  };

  res.status(201).json(response);
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { 
    email, 
    password, 
    deviceId, 
    deviceName, 
    platform, 
    fcmToken,
    forceLogout = false 
  }: LoginRequest & {
    deviceId?: string;
    deviceName?: string;
    platform?: string;
    fcmToken?: string;
    forceLogout?: boolean;
  } = req.body;

  // Find user
  const user = await User.findOne({ email });

  if (!user || !user.isActive) {
    throw new AppError('Invalid credentials', 401);
  }

  // Check password
  const isPasswordValid = await comparePassword(password, user.password);

  if (!isPasswordValid) {
    throw new AppError('Invalid credentials', 401);
  } 
 
  // Clean up expired sessions first
  await SessionService.cleanupExpiredSessions();

  // Check for session conflict
  const sessionConflict = await SessionService.checkSessionConflict(user.id, deviceId || 'unknown');

  if (sessionConflict.hasConflict && !forceLogout) {
    // Return conflict information instead of throwing error
    const response: ApiResponse = {
      success: false,
      message: 'Session conflict detected',
      data: {
        conflict: true,
        existingDevice: sessionConflict.existingDevice,
        message: 'Your account is already active on another device. Logging in here will log you out from the other device. Do you want to continue?'
      }
    };
    return res.status(409).json(response);
  }

  // Proceed with login (either no conflict or force logout is true)
  const deviceInfo = {
    deviceId: deviceId || 'unknown',
    deviceName: deviceName || 'Unknown Device',
    platform: platform || 'web', // Default to 'web' instead of 'unknown'
    fcmToken: fcmToken,
  };

  // If there's a conflict and forceLogout is true, clear all existing sessions first
  if (sessionConflict.hasConflict && forceLogout) {
    console.log('Clearing existing sessions before login...');
    
    // Send logout notification to old device before clearing sessions
    const { getSocketHandler } = await import('@/socket/socketHandler');
    const socketHandler = getSocketHandler();
    
    if (socketHandler && sessionConflict.existingDevice) {
      socketHandler.emitToUser(user.id, 'forced_logout', {
        message: 'You have been logged out. Login was attempted from another device.',
        reason: 'new_login',
        timestamp: new Date().toISOString()
      });
      console.log('Sent forced logout notification to old device');
    }
    
    await SessionService.clearAllSessions(user.id);
  }

  const loginResult = await SessionService.forceLoginNewDevice(
    user.id, 
    deviceInfo, 
    forceLogout || sessionConflict.hasConflict
  );

  // Log the response to verify data
  console.log('Login response user:', loginResult.user);
  console.log('Login response user.createdAt:', loginResult.user.createdAt);
  console.log('Login response user.dob:', loginResult.user.dob);

  const response: ApiResponse = {
    success: true,
    message: 'Login successful',
    data: {
      user: loginResult.user,
      token: loginResult.token,
      previousDeviceLoggedOut: sessionConflict.hasConflict,
    },
  };

  return res.json(response);
});

// Force logout from old device and login on new device
export const forceLogin = asyncHandler(async (req: Request, res: Response) => {
  const { 
    email, 
    password, 
    deviceId, 
    deviceName, 
    platform, 
    fcmToken 
  }: LoginRequest & {
    deviceId?: string;
    deviceName?: string;
    platform?: string;
    fcmToken?: string;
  } = req.body;

  // Find user
  const user = await User.findOne({ email });

  if (!user || !user.isActive) {
    throw new AppError('Invalid credentials', 401);
  }

  // Check password
  const isPasswordValid = await comparePassword(password, user.password);

  if (!isPasswordValid) {
    throw new AppError('Invalid credentials', 401);
  }

  // Force login on new device (this will logout the old device)
  const deviceInfo = {
    deviceId: deviceId || 'unknown',
    deviceName: deviceName || 'Unknown Device',
    platform: platform || 'web', // Default to 'web' instead of 'unknown'
    fcmToken: fcmToken,
  };

  // Send logout notification to old device before forcing login
  const { getSocketHandler } = await import('@/socket/socketHandler');
  const socketHandler = getSocketHandler();
  
  if (socketHandler) {
    socketHandler.emitToUser(user.id, 'forced_logout', {
      message: 'You have been logged out. Login was attempted from another device.',
      reason: 'new_login',
      timestamp: new Date().toISOString()
    });
    console.log('Sent forced logout notification to old device');
  }

  const loginResult = await SessionService.forceLoginNewDevice(
    user.id, 
    deviceInfo, 
    true // Force logout old device
  );

  const response: ApiResponse = {
    success: true,
    message: 'Login successful - Previous device logged out',
    data: {
      user: loginResult.user,
      token: loginResult.token,
      previousDeviceLoggedOut: true,
    },
  };

  res.json(response);
});

export const getProfile = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;

  const user = await User.findById(userId).select('-password -subPassword');

  if (!user) {
    throw new AppError('User not found', 404);
  }

  const response: ApiResponse = {
    success: true,
    message: 'Profile retrieved successfully',
    data: { user },
  };

  res.json(response);
});

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const updateData = req.body;

  // Remove sensitive fields that shouldn't be updated through this endpoint
  delete updateData.password;
  delete updateData.subPassword;
  delete updateData.email; // Email should be updated through a separate verification process

  const user = await User.findByIdAndUpdate(
    userId,
    updateData,
    { new: true, runValidators: true }
  ).select('-password -subPassword');

  if (!user) {
    throw new AppError('User not found', 404);
  }

  const response: ApiResponse = {
    success: true,
    message: 'Profile updated successfully',
    data: { user },
  };

  res.json(response);
});

export const updateEmailWithOTP = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const { newEmail, currentOtp, newOtp } = req.body;

  if (!userId) {
    throw new AppError('User not authenticated', 401);
  }

  if (!newEmail || !currentOtp || !newOtp) {
    throw new AppError('All fields are required', 400);
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  // Import OTP model
  const OTP = require('@/models/OTP').default;

  // Verify current email OTP
  const currentEmailRecord = await OTP.findOne({
    email: user.email,
    otp: currentOtp,
    isUsed: false,
    expiresAt: { $gt: new Date() },
    type: 'email',
    purpose: 'change_email'
  });

  if (!currentEmailRecord) {
    throw new AppError('Invalid or expired current email OTP', 400);
  }

  // Verify new email OTP
  const newEmailRecord = await OTP.findOne({
    email: newEmail,
    otp: newOtp,
    isUsed: false,
    expiresAt: { $gt: new Date() },
    type: 'email',
    purpose: 'change_email'
  });

  if (!newEmailRecord) {
    throw new AppError('Invalid or expired new email OTP', 400);
  }

  // Mark OTPs as used
  currentEmailRecord.isUsed = true;
  newEmailRecord.isUsed = true;
  await currentEmailRecord.save();
  await newEmailRecord.save();

  // Update user email
  const updatedUser = await User.findByIdAndUpdate(
    userId,
    { email: newEmail },
    { new: true, runValidators: true }
  ).select('-password -subPassword');

  // Notify partner if exists
  if (user.currentPartner?.partnerId) {
    const notificationService = require('@/services/notificationService').default;
    
    await notificationService.createNotification({
      userId: user.currentPartner.partnerId,
      type: 'message' as any,
      title: 'Profile Updated',
      message: `${user.name} has updated their email address`,
      data: { userId: user.id, field: 'email', newValue: newEmail }
    });

    // Send push notification
    const partner = await User.findById(user.currentPartner.partnerId).select('pushToken');
    if (partner?.pushToken) {
      await notificationService.sendPushNotification(
        user.currentPartner.partnerId,
        'Profile Updated',
        `${user.name} has updated their email address`,
        { userId: user.id, field: 'email' }
      );
    }
  }

  const response: ApiResponse = {
    success: true,
    message: 'Email updated successfully',
    data: { user: updatedUser }
  };

  res.json(response);
});

export const updatePhoneWithOTP = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const { newPhone, currentOtp, newOtp } = req.body;

  if (!userId) {
    throw new AppError('User not authenticated', 401);
  }

  if (!newPhone || !currentOtp || !newOtp) {
    throw new AppError('All fields are required', 400);
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  // Import OTP model
  const OTP = require('@/models/OTP').default;

  // Verify current phone OTP
  const currentPhoneRecord = await OTP.findOne({
    mobileNumber: user.mobileNumber,
    otp: currentOtp,
    isUsed: false,
    expiresAt: { $gt: new Date() },
    type: 'mobile',
    purpose: 'change_phone'
  });

  if (!currentPhoneRecord) {
    throw new AppError('Invalid or expired current phone OTP', 400);
  }

  // Verify new phone OTP
  const newPhoneRecord = await OTP.findOne({
    mobileNumber: newPhone,
    otp: newOtp,
    isUsed: false,
    expiresAt: { $gt: new Date() },
    type: 'mobile',
    purpose: 'change_phone'
  });

  if (!newPhoneRecord) {
    throw new AppError('Invalid or expired new phone OTP', 400);
  }

  // Mark OTPs as used
  currentPhoneRecord.isUsed = true;
  newPhoneRecord.isUsed = true;
  await currentPhoneRecord.save();
  await newPhoneRecord.save();

  // Update user phone
  const updatedUser = await User.findByIdAndUpdate(
    userId,
    { mobileNumber: newPhone },
    { new: true, runValidators: true }
  ).select('-password -subPassword');

  // Notify partner if exists
  if (user.currentPartner?.partnerId) {
    const notificationService = require('@/services/notificationService').default;
    
    await notificationService.createNotification({
      userId: user.currentPartner.partnerId,
      type: 'message' as any,
      title: 'Profile Updated',
      message: `${user.name} has updated their phone number`,
      data: { userId: user.id, field: 'phone', newValue: newPhone }
    });

    // Send push notification
    const partner = await User.findById(user.currentPartner.partnerId).select('pushToken');
    if (partner?.pushToken) {
      await notificationService.sendPushNotification(
        user.currentPartner.partnerId,
        'Profile Updated',
        `${user.name} has updated their phone number`,
        { userId: user.id, field: 'phone' }
      );
    }
  }

  const response: ApiResponse = {
    success: true,
    message: 'Phone number updated successfully',
    data: { user: updatedUser }
  };

  res.json(response);
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(userId);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  // Verify current password
  const isCurrentPasswordValid = await comparePassword(currentPassword, user.password);
  if (!isCurrentPasswordValid) {
    throw new AppError('Current password is incorrect', 400);
  }

  // Hash new password
  const hashedNewPassword = await hashPassword(newPassword);

  // Update password
  user.password = hashedNewPassword;
  await user.save();

  const response: ApiResponse = {
    success: true,
    message: 'Password changed successfully',
  };

  res.json(response);
});

export const changeSubPassword = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const { currentSubPassword, newSubPassword } = req.body;

  const user = await User.findById(userId);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  // Verify current sub-password
  if (user.subPassword) {
    const isCurrentSubPasswordValid = await comparePassword(currentSubPassword, user.subPassword);
    if (!isCurrentSubPasswordValid) {
      throw new AppError('Current sub-password is incorrect', 400);
    }
  }

  // Hash new sub-password
  const hashedNewSubPassword = await hashPassword(newSubPassword);

  // Update sub-password
  user.subPassword = hashedNewSubPassword;
  await user.save();

  const response: ApiResponse = {
    success: true,
    message: 'Sub-password changed successfully',
  };

  res.json(response);
});

// Reset password using OTP (for forgot password)
export const resetPasswordWithOTP = asyncHandler(async (req: Request, res: Response) => {
  const { mobileNumber, otp, newPassword } = req.body;

  if (!mobileNumber || !otp || !newPassword) {
    throw new AppError('Mobile number, OTP, and new password are required', 400);
  }

  // Validate new password
  if (newPassword.length < 6) {
    throw new AppError('Password must be at least 6 characters long', 400);
  }

  // Find user by mobile number
  const user = await User.findOne({ mobileNumber });
  if (!user) {
    throw new AppError('User not found with this mobile number', 404);
  }

  // Verify OTP
  const OTP = require('@/models/OTP').default;
  const otpRecord = await OTP.findOne({
    mobileNumber,
    otp,
    isUsed: false,
    expiresAt: { $gt: new Date() },
    purpose: 'password_reset',
    type: 'mobile',
  });

  if (!otpRecord) {
    throw new AppError('Invalid or expired OTP', 400);
  }

  // Mark OTP as used
  otpRecord.isUsed = true;
  await otpRecord.save();

  // Hash and update password
  const hashedNewPassword = await hashPassword(newPassword);
  user.password = hashedNewPassword;
  await user.save();

  const response: ApiResponse = {
    success: true,
    message: 'Password reset successfully',
  };

  res.json(response);
});

// Reset sub-password using OTP (for forgot sub password)
export const resetSubPasswordWithOTP = asyncHandler(async (req: Request, res: Response) => {
  const { mobileNumber, otp, newSubPassword } = req.body;

  if (!mobileNumber || !otp || !newSubPassword) {
    throw new AppError('Mobile number, OTP, and new sub-password are required', 400);
  }

  // Validate new sub-password
  if (newSubPassword.length < 4) {
    throw new AppError('Sub-password must be at least 4 characters long', 400);
  }

  // Find user by mobile number
  const user = await User.findOne({ mobileNumber });
  if (!user) {
    throw new AppError('User not found with this mobile number', 404);
  }

  // Verify OTP
  const OTP = require('@/models/OTP').default;
  const otpRecord = await OTP.findOne({
    mobileNumber,
    otp,
    isUsed: false,
    expiresAt: { $gt: new Date() },
    purpose: 'password_reset',
    type: 'mobile',
  });

  if (!otpRecord) {
    throw new AppError('Invalid or expired OTP', 400);
  }

  // Mark OTP as used
  otpRecord.isUsed = true;
  await otpRecord.save();

  // Hash and update sub-password
  const hashedNewSubPassword = await hashPassword(newSubPassword);
  user.subPassword = hashedNewSubPassword;
  await user.save();

  const response: ApiResponse = {
    success: true,
    message: 'Sub-password reset successfully',
  };

  res.json(response);
});

export const deleteAccount = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;

  const user = await User.findByIdAndDelete(userId);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  const response: ApiResponse = {
    success: true,
    message: 'Account deleted successfully',
  };

  res.json(response);
});

export const refreshToken = asyncHandler(async (req: Request, res: Response) => {
  // This is a placeholder - implement token refresh logic as needed
  // For now, we'll return an error since JWT tokens are stateless
  const response: ApiResponse = {
    success: false,
    message: 'Token refresh not implemented. Please login again.',
  };

  res.status(400).json(response);
});

export const checkActiveSession = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email) {
    throw new AppError('Email is required', 400);
  }

  const user = await User.findOne({ email });
  
  if (!user) {
    throw new AppError('User not found', 404);
  }

  // Check if user has an active session
  const hasActiveSession = user.currentDeviceId && user.currentDeviceInfo;
  
  if (hasActiveSession) {
    // Check if session is not expired (24 hours)
    const now = new Date();
    const lastLoginAt = user.currentDeviceInfo?.lastLoginAt;
    
    if (lastLoginAt) {
      const sessionAge = now.getTime() - new Date(lastLoginAt).getTime();
      const sessionTimeout = 24 * 60 * 60 * 1000; // 24 hours
      
      if (sessionAge > sessionTimeout) {
        // Session expired, clear it
        await User.findByIdAndUpdate(user.id, {
          currentDeviceId: null,
          currentDeviceInfo: null,
          updatedAt: new Date(),
        });
        
        const response: ApiResponse = {
          success: true,
          message: 'No active session found',
          data: { hasActiveSession: false }
        };
        return res.json(response);
      }
    }

    const response: ApiResponse = {
      success: true,
      message: 'Active session found',
      data: { 
        hasActiveSession: true,
        existingDevice: {
          deviceId: user.currentDeviceId,
          deviceName: user.currentDeviceInfo?.deviceName,
          platform: user.currentDeviceInfo?.platform,
          lastLoginAt: user.currentDeviceInfo?.lastLoginAt,
        }
      }
    };
    return res.json(response);
  }

  const response: ApiResponse = {
    success: true,
    message: 'No active session found',
    data: { hasActiveSession: false }
  };

  return res.json(response);
});

export const verifySecretCode = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const { secretCode, email } = req.body;

  let user;
  
  // If user is authenticated, use their ID
  if (userId) {
    user = await User.findById(userId);
  } else if (email) {
    // If not authenticated but email provided, find user by email
    user = await User.findOne({ email });
  } else {
    throw new AppError('User identification required', 400);
  }

  if (!user) {
    throw new AppError('User not found', 404);
  }

  // Check if user has a sub-password set
  if (!user.subPassword) {
    throw new AppError('No secret code set for this user', 400);
  }

  // Verify the secret code
  const isSecretCodeValid = await comparePassword(secretCode, user.subPassword);

  if (!isSecretCodeValid) {
    throw new AppError('Invalid secret code', 401);
  }

  // Get createdAt - fallback to updatedAt if createdAt doesn't exist (for older users)
  const createdAt = user.createdAt || user.updatedAt || new Date();

  // Log user data for debugging
  console.log('verifySecretCode - User data:', {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    finalCreatedAt: createdAt,
  });

  const response: ApiResponse = {
    success: true,
    message: 'Secret code verified successfully',
    data: {
      verified: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        mobileNumber: user.mobileNumber,
        avatar: user.avatar,
        bio: user.bio,
        dob: user.dob,
        gender: user.gender,
        UserSearchId: user.UserSearchId,
        createdAt: createdAt,
      }
    }
  };

  res.json(response);
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const { deviceId } = req.body;

  console.log('Logout request for userId:', userId, 'deviceId:', deviceId);

  if (!userId) {
    throw new AppError('User not authenticated', 401);
  }

  try {
    // Get user's current device info before clearing
    const user = await User.findById(userId).select('currentDeviceInfo loginHistory');
    const otherDevices: string[] = [];
    
    if (user && user.loginHistory) {
      // Find all other active device sessions (excluding current device)
      user.loginHistory.forEach((entry: any) => {
        if (entry.deviceId !== deviceId && !entry.logoutAt) {
          otherDevices.push(entry.deviceId);
        }
      });
    }

    console.log('Other active devices:', otherDevices);

    // If there are other devices logged in, send them logout notifications
    if (otherDevices.length > 0) {
      const { getSocketHandler } = await import('@/socket/socketHandler');
      const socketHandler = getSocketHandler();
      
      if (socketHandler) {
        // Send logout notification to all other devices
        socketHandler.emitToUser(userId, 'forced_logout', {
          message: 'You have been logged out from another device',
          reason: 'logout_triggered',
          timestamp: new Date().toISOString()
        });
        console.log('Sent logout notification to other devices');
      }
    }

    // Use SessionService to clear all sessions
    await SessionService.clearAllSessions(userId);
    console.log('All sessions cleared for user:', userId);

    // If deviceId is provided, also update the login history
    if (deviceId) {
      const historyUpdateResult = await User.updateOne(
        { 
          _id: userId,
          'loginHistory.deviceId': deviceId,
          'loginHistory.logoutAt': { $exists: false }
        },
        {
          $set: {
            'loginHistory.$.logoutAt': new Date(),
          }
        }
      );
      console.log('Login history update result:', historyUpdateResult);
    }

    // Verify the session was cleared
    const isSessionCleared = await SessionService.verifySessionCleared(userId);
    console.log('Session verification result:', isSessionCleared);

    const response: ApiResponse = {
      success: true,
      message: 'Logged out successfully',
      data: {
        loggedOut: true,
        sessionCleared: isSessionCleared
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Logout error:', error);
    throw new AppError('Failed to logout', 500);
  }
});

export const logoutFromAllDevices = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;

  if (userId) {
    // Clear all device information and update all login history entries
    await User.findByIdAndUpdate(userId, {
      currentDeviceId: null,
      currentDeviceInfo: null,
      $set: {
        'loginHistory.$[].logoutAt': new Date(),
      },
      updatedAt: new Date(),
    });
  }

  const response: ApiResponse = {
    success: true,
    message: 'Logged out from all devices successfully',
  };

  res.json(response);
});
