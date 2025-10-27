import User from '@/models/User';
import { generateToken } from '@/utils/jwt';

export interface DeviceInfo {
  deviceId: string;
  deviceName?: string;
  platform?: string;
  fcmToken?: string;
}

export interface SessionConflict {
  hasConflict: boolean;
  existingDevice?: {
    deviceId: string;
    deviceName?: string;
    platform?: string;
    lastLoginAt: Date;
  };
}

export class SessionService {
  // Check if user has an active session on another device
  static async checkSessionConflict(userId: string, currentDeviceId: string): Promise<SessionConflict> {
    const user = await User.findById(userId);
    
    if (!user || !user.currentDeviceId) {
      return { hasConflict: false };
    }

    if (user.currentDeviceId === currentDeviceId) {
      return { hasConflict: false };
    }

    // Check if the existing session is actually active (not expired)
    const now = new Date();
    const lastLoginAt = user.currentDeviceInfo?.lastLoginAt;
    
    if (lastLoginAt) {
      const sessionAge = now.getTime() - new Date(lastLoginAt).getTime();
      const sessionTimeout = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
      
      // If session is older than 24 hours, consider it expired
      if (sessionAge > sessionTimeout) {
        // Clear the expired session
        await User.findByIdAndUpdate(userId, {
          currentDeviceId: null,
          currentDeviceInfo: null,
          updatedAt: new Date(),
        });
        return { hasConflict: false };
      }
    }

    return {
      hasConflict: true,
      existingDevice: {
        deviceId: user.currentDeviceId,
        deviceName: user.currentDeviceInfo?.deviceName,
        platform: user.currentDeviceInfo?.platform,
        lastLoginAt: user.currentDeviceInfo?.lastLoginAt || new Date(),
      }
    };
  }

  // Force logout from old device and login on new device
  static async forceLoginNewDevice(
    userId: string, 
    newDeviceInfo: DeviceInfo,
    forceLogout: boolean = false
  ) {
    // Find user
    const user = await User.findById(userId);
    
    if (!user) {
      throw new Error('User not found');
    }
    
    // Log full user object to debug
    console.log('User from DB:', user.toObject());
    console.log('User createdAt:', user.createdAt);
    console.log('User dob:', user.dob);

    // If force logout is true, update the old session's logout time
    if (forceLogout && user.currentDeviceId) {
      await User.updateOne(
        { 
          _id: userId,
          'loginHistory.deviceId': user.currentDeviceId,
          'loginHistory.logoutAt': { $exists: false }
        },
        { 
          $set: { 'loginHistory.$.logoutAt': new Date() }
        }
      );
    }

    // Generate new token
    const token = generateToken({
      userId: user.id,
      email: user.email,
    });

    // Update current device info
    const deviceInfo = {
      deviceId: newDeviceInfo.deviceId,
      deviceName: newDeviceInfo.deviceName || 'Unknown Device',
      platform: newDeviceInfo.platform || 'web', // Default to 'web' instead of 'unknown'
      lastLoginAt: new Date(),
      fcmToken: newDeviceInfo.fcmToken,
    };

    // Add to login history
    const loginHistoryEntry = {
      deviceId: newDeviceInfo.deviceId,
      deviceName: newDeviceInfo.deviceName || 'Unknown Device',
      platform: newDeviceInfo.platform || 'web', // Default to 'web' instead of 'unknown'
      loginAt: new Date(),
      fcmToken: newDeviceInfo.fcmToken,
    };

    await User.findByIdAndUpdate(user._id, {
      currentDeviceId: newDeviceInfo.deviceId,
      currentDeviceInfo: deviceInfo,
      $push: { loginHistory: loginHistoryEntry },
      updatedAt: new Date(),
    });

    // Get createdAt - fallback to updatedAt if createdAt doesn't exist (for older users)
    const createdAt = user.createdAt || user.updatedAt || new Date();

    // Log the user object to verify what fields are available
    console.log('User from database:', {
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
      updatedAt: user.updatedAt,
      finalCreatedAt: createdAt,
    });

    return {
      token,
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
    };
  }

  // Logout from current device
  static async logoutDevice(userId: string, deviceId: string) {
    const user = await User.findById(userId);
    
    if (!user) {
      throw new Error('User not found');
    }

    // Update logout time in login history
    await User.updateOne(
      { 
        _id: userId,
        'loginHistory.deviceId': deviceId,
        'loginHistory.logoutAt': { $exists: false }
      },
      { 
        $set: { 'loginHistory.$.logoutAt': new Date() }
      }
    );

    // Clear current device info if it matches
    if (user.currentDeviceId === deviceId) {
      await User.findByIdAndUpdate(userId, {
        currentDeviceId: null,
        currentDeviceInfo: null,
        updatedAt: new Date(),
      });
    }
  }

  // Get user's active session info
  static async getActiveSession(userId: string) {
    const user = await User.findById(userId);
    
    if (!user || !user.currentDeviceId) {
      return null;
    }

    return {
      deviceId: user.currentDeviceId,
      deviceName: user.currentDeviceInfo?.deviceName,
      platform: user.currentDeviceInfo?.platform,
      lastLoginAt: user.currentDeviceInfo?.lastLoginAt,
      fcmToken: user.currentDeviceInfo?.fcmToken,
    };
  }

  // Force clear all sessions for a user
  static async clearAllSessions(userId: string) {
    try {
      const result = await User.findByIdAndUpdate(userId, {
        currentDeviceId: null,
        currentDeviceInfo: null,
        updatedAt: new Date(),
      });
      
      console.log('All sessions cleared for user:', userId);
      return result;
    } catch (error) {
      console.error('Error clearing sessions:', error);
      throw error;
    }
  }

  // Verify session is cleared
  static async verifySessionCleared(userId: string): Promise<boolean> {
    try {
      const user = await User.findById(userId).select('currentDeviceId currentDeviceInfo');
      const isCleared = !user?.currentDeviceId;
      console.log('Session verification for user:', userId, 'isCleared:', isCleared);
      return isCleared;
    } catch (error) {
      console.error('Error verifying session:', error);
      return false;
    }
  }

  // Clean up expired sessions for all users
  static async cleanupExpiredSessions() {
    try {
      const now = new Date();
      const sessionTimeout = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
      
      const result = await User.updateMany(
        {
          currentDeviceId: { $exists: true, $ne: null },
          'currentDeviceInfo.lastLoginAt': {
            $lt: new Date(now.getTime() - sessionTimeout)
          }
        },
        {
          $set: {
            currentDeviceId: null,
            currentDeviceInfo: null,
            updatedAt: new Date(),
          }
        }
      );
      
      console.log('Cleaned up expired sessions:', result.modifiedCount);
      return result.modifiedCount;
    } catch (error) {
      console.error('Error cleaning up expired sessions:', error);
      return 0;
    }
  }
}
