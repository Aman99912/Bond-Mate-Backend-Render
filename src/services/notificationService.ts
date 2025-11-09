import axios from 'axios';
import admin from 'firebase-admin';
import Notification from '@/models/Notification';
import User from '@/models/User';
import { getFirebaseMessaging } from '@/config/firebaseAdmin';

interface NotificationData {
  userId: string;
  type: 'message' | 'partner_request' | 'partner_accepted' | 'partner_rejected' | 'file_shared' | 'one_view_opened' | 'partner_invitation';
  title: string;
  message: string;
  data?: Record<string, unknown>;
}

interface FirebaseNotificationData {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

interface RegisterDeviceTokenOptions {
  deviceId?: string;
  deviceName?: string;
  platform?: string;
}

class NotificationService {
  private static instance: NotificationService;
  private expoPushUrl = 'https://exp.host/--/api/v2/push/send';

  private constructor() {}

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  // Create notification in database
  public async createNotification(notificationData: NotificationData) {
    try {
      const notification = await Notification.create({
        userId: notificationData.userId,
        type: notificationData.type,
        title: notificationData.title,
        message: notificationData.message,
        data: notificationData.data || {},
        isRead: false
      });

      console.log('Notification created in database:', notification._id);
      return notification;
    } catch (error) {
      console.error('Error creating notification:', error);
      throw error;
    }
  }

  public async registerDeviceToken(
    userId: string,
    token: string,
    options: RegisterDeviceTokenOptions = {}
  ) {
    try {
      const user = await User.findById(userId).select('currentDeviceInfo currentDeviceId');

      if (!user) {
        console.warn(`❌ Unable to register device token. User not found: ${userId}`);
        return { updated: false };
      }

      const rawDeviceInfo =
        user.currentDeviceInfo && typeof (user.currentDeviceInfo as any).toObject === 'function'
          ? (user.currentDeviceInfo as any).toObject()
          : user.currentDeviceInfo || {};

      const updatedDeviceInfo = {
        ...rawDeviceInfo,
        ...(options.deviceId ? { deviceId: options.deviceId } : {}),
        ...(options.deviceName ? { deviceName: options.deviceName } : {}),
        ...(options.platform ? { platform: options.platform } : {}),
        fcmToken: token,
        lastLoginAt: new Date(),
      };

      const updatePayload: Record<string, unknown> = {
        pushToken: token,
        currentDeviceInfo: updatedDeviceInfo,
        updatedAt: new Date(),
      };

      if (options.deviceId) {
        updatePayload.currentDeviceId = options.deviceId;
      } else if (!user.currentDeviceId && updatedDeviceInfo.deviceId) {
        updatePayload.currentDeviceId = updatedDeviceInfo.deviceId;
      }

      await User.findByIdAndUpdate(userId, updatePayload);

      console.log('✅ Device token registered for user:', userId, token.substring(0, 30) + '...');

      return {
        updated: true,
        tokenPreview: token.substring(0, 30) + '...',
        deviceId: updatedDeviceInfo.deviceId,
        platform: updatedDeviceInfo.platform,
      };
    } catch (error) {
      console.error('❌ Error registering device token:', error);
      throw error;
    }
  }

  // Send push notification via Expo
  public async sendPushNotification(userId: string, title: string, body: string, data?: any) {
    try {
      // Get user's push token from currentDeviceInfo (FCM token)
      const user = await User.findById(userId).select('pushToken currentDeviceInfo');
      
      if (!user) {
        console.log(`❌ User not found: ${userId}`);
        return false;
      }
      
      // Try to get token from currentDeviceInfo first (new location, from login)
      let fcmToken = user.currentDeviceInfo?.fcmToken;
      
      // Fallback to pushToken (old location) for backward compatibility
      if (!fcmToken) {
        fcmToken = user.pushToken;
        if (fcmToken) {
          console.log(`📱 Using pushToken (legacy) for user: ${userId}`);
        }
      }
      
      if (!fcmToken) {
        console.log(`❌ No push/FCM token found for user: ${userId}`);
        console.log('Debug info:', {
          hasCurrentDeviceInfo: !!user.currentDeviceInfo,
          hasFcmTokenInDeviceInfo: !!user.currentDeviceInfo?.fcmToken,
          hasPushToken: !!user.pushToken,
          deviceInfoKeys: user.currentDeviceInfo ? Object.keys(user.currentDeviceInfo) : []
        });
        return false;
      }
      
      console.log(`📱 Sending push notification to user ${userId}, token: ${fcmToken.substring(0, 30)}...`);

      const message = {
        to: fcmToken,
        sound: 'default',
        title: title,
        body: body,
        data: data || {},
        priority: 'high',
        channelId: 'default',
        // Add BondMate logo image to notification
        badge: 1,
        image: 'https://raw.githubusercontent.com/govind-2003/Bond_Mate/master/Bond-Mate/assets/BondMate/BONDMATELOGO.png'
      };

      const response = await axios.post(this.expoPushUrl, message, {
        headers: {
          'Accept': 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
      });

      if (response.data.data?.status === 'ok') {
        console.log(`✅ Push notification sent successfully to user: ${userId}`);
        return true;
      } else {
        console.error(`❌ Push notification failed for user ${userId}:`, response.data);
        return false;
      }
    } catch (error: any) {
      console.error(`❌ Error sending push notification to user ${userId}:`, error.message);
      return false;
    }
  }

  // Send Firebase notification
  public async sendFirebaseNotification(fcmToken: string, notificationData: FirebaseNotificationData) {
    try {
      const messaging = getFirebaseMessaging();
      if (!messaging) {
        console.warn('⚠️  Firebase messaging is not configured. Skipping push notification send.');
        return false;
      }

      const message: admin.messaging.Message = {
        token: fcmToken,
        notification: {
          title: notificationData.title,
          body: notificationData.body,
          imageUrl: 'https://raw.githubusercontent.com/govind-2003/Bond_Mate/master/Bond-Mate/assets/BondMate/BONDMATELOGO.png',
        },
        data: {
          ...notificationData.data,
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
        },
        android: {
          notification: {
            sound: 'default',
            priority: 'high' as const,
            channelId: 'default',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
              alert: {
                title: notificationData.title,
                body: notificationData.body,
              },
            },
          },
        },
      };

      const response = await admin.messaging().send(message);
      console.log('Firebase notification sent successfully:', response);
      return true;
    } catch (error) {
      console.error('Error sending Firebase notification:', error);
      return false;
    }
  }

  // Send notification (tries Firebase first, then Expo)
  public async sendNotification(fcmToken: string, notificationData: FirebaseNotificationData) {
    try {
      // Try Firebase first
      const firebaseSuccess = await this.sendFirebaseNotification(fcmToken, notificationData);
      if (firebaseSuccess) {
        return true;
      }

      // Fallback to Expo if Firebase fails
      console.log('Firebase notification failed, trying Expo...');
      const expoSuccess = await this.sendPushNotification(fcmToken, notificationData.title, notificationData.body, notificationData.data);
      return expoSuccess;
    } catch (error) {
      console.error('Error sending notification:', error);
      return false;
    }
  }

  // Send partner request notification
  public async sendPartnerRequestNotification(fromUserId: string, toUserId: string, fromUserName: string) {
    try {
      // Create database notification
      await this.createNotification({
        userId: toUserId,
        type: 'partner_request',
        title: 'New Partner Request',
        message: `${fromUserName} sent you a partner request`,
        data: { fromUserId, type: 'partner_request' }
      });

      // Send push notification
      await this.sendPushNotification(
        toUserId,
        'New Partner Request',
        `${fromUserName} sent you a partner request`,
        { fromUserId, type: 'partner_request', showInBadge: true }
      );

      console.log('Partner request notification sent to user:', toUserId);
    } catch (error) {
      console.error('Error sending partner request notification:', error);
    }
  }

  // Send partner request accepted notification
  public async sendPartnerAcceptedNotification(fromUserId: string, toUserId: string, toUserName: string) {
    try {
      // Create database notification
      await this.createNotification({
        userId: fromUserId,
        type: 'partner_accepted',
        title: 'Partner Request Accepted',
        message: `${toUserName} accepted your partner request`,
        data: { toUserId, type: 'partner_accepted' }
      });

      // Send push notification
      await this.sendPushNotification(
        fromUserId,
        'Partner Request Accepted',
        `${toUserName} accepted your partner request`,
        { toUserId, type: 'partner_accepted', showInBadge: true }
      );

      console.log('Partner accepted notification sent to user:', fromUserId);
    } catch (error) {
      console.error('Error sending partner accepted notification:', error);
    }
  }

  // Send partner request rejected notification
  public async sendPartnerRejectedNotification(fromUserId: string, toUserId: string, toUserName: string) {
    try {
      // Create database notification
      await this.createNotification({
        userId: fromUserId,
        type: 'partner_rejected',
        title: 'Partner Request Rejected',
        message: `${toUserName} rejected your partner request`,
        data: { toUserId, type: 'partner_rejected' }
      });

      // Send push notification
      await this.sendPushNotification(
        fromUserId,
        'Partner Request Rejected',
        `${toUserName} rejected your partner request`,
        { toUserId, type: 'partner_rejected' }
      );

      console.log('Partner rejected notification sent to user:', fromUserId);
    } catch (error) {
      console.error('Error sending partner rejected notification:', error);
    }
  }

  // Send partner invitation notification with Firebase
  public async sendPartnerInvitationNotification(fromUserId: string, toUserId: string, fromUserName: string, fromUserAvatar?: string) {
    try {
      // Create database notification
      await this.createNotification({
        userId: toUserId,
        type: 'partner_invitation',
        title: '💕 Partner Invitation',
        message: `${fromUserName} wants to connect with you on Bond Mate!`,
        data: { 
          fromUserId, 
          fromUserName, 
          fromUserAvatar,
          type: 'partner_invitation' 
        }
      });

      // Get partner's FCM token
      const partner = await User.findById(toUserId).select('pushToken currentDeviceInfo');
      const fcmToken = partner?.pushToken || partner?.currentDeviceInfo?.fcmToken;

      if (fcmToken) {
        // Send Firebase notification with vibration
        const notificationData = {
          title: '💕 Partner Invitation',
          body: `${fromUserName} wants to connect with you on Bond Mate!`,
          data: {
            fromUserId,
            fromUserName,
            fromUserAvatar,
            type: 'partner_invitation',
            vibrate: 'true'
          }
        };

        await this.sendNotification(fcmToken, notificationData);
        console.log('Partner invitation notification sent with Firebase to user:', toUserId);
      } else {
        // Fallback to regular push notification
        await this.sendPushNotification(
          toUserId,
          '💕 Partner Invitation',
          `${fromUserName} wants to connect with you on Bond Mate!`,
          { fromUserId, type: 'partner_invitation' }
        );
        console.log('Partner invitation notification sent via Expo to user:', toUserId);
      }
    } catch (error) {
      console.error('Error sending partner invitation notification:', error);
    }
  }

  // Get user notifications
  public async getUserNotifications(userId: string, page: number = 1, limit: number = 20) {
    try {
      const skip = (page - 1) * limit;
      
      const notifications = await Notification.find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await Notification.countDocuments({ userId });

      return {
        notifications,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      console.error('Error getting user notifications:', error);
      throw error;
    }
  }

  // Mark notification as read
  public async markAsRead(notificationId: string, userId: string) {
    try {
      const notification = await Notification.findOneAndUpdate(
        { _id: notificationId, userId },
        { isRead: true, readAt: new Date() },
        { new: true }
      );

      return notification;
    } catch (error) {
      console.error('Error marking notification as read:', error);
      throw error;
    }
  }

  // Mark all notifications as read
  public async markAllAsRead(userId: string) {
    try {
      await Notification.updateMany(
        { userId, isRead: false },
        { isRead: true, readAt: new Date() }
      );

      console.log('All notifications marked as read for user:', userId);
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      throw error;
    }
  }

  // Get unread count
  public async getUnreadCount(userId: string) {
    try {
      const count = await Notification.countDocuments({ userId, isRead: false });
      return count;
    } catch (error) {
      console.error('Error getting unread count:', error);
      throw error;
    }
  }

  // Send breakup request notification
  public async sendBreakupRequestNotification(
    fromUserId: string,
    toUserId: string,
    fromUserName: string,
    reason: string,
    requestId: string
  ) {
    try {
      // ⚠️ FIX: Check both currentDeviceInfo.fcmToken and pushToken
      const user = await User.findById(toUserId).select('pushToken currentDeviceInfo');
      
      // Try to get token from currentDeviceInfo first (new location)
      let fcmToken = user?.currentDeviceInfo?.fcmToken;
      
      // Fallback to pushToken (old location) for backward compatibility
      if (!fcmToken) {
        fcmToken = user?.pushToken;
      }
      
      if (!fcmToken) {
        console.log('No push/FCM token found for user:', toUserId);
        console.log('Debug info:', {
          hasCurrentDeviceInfo: !!user?.currentDeviceInfo,
          hasFcmTokenInDeviceInfo: !!user?.currentDeviceInfo?.fcmToken,
          hasPushToken: !!user?.pushToken
        });
        // Still create notification in database even if no push token
      }

      // Create notification in database with showInBadge flag
      await this.createNotification({
        userId: toUserId,
        type: 'partner_request',
        title: 'Breakup Request',
        message: `Your friend wants to remove`,
        data: {
          type: 'breakup_request',
          requestId,
          fromUserId,
          fromUserName,
          reason,
          deepLink: `bondmate://notifications?type=breakup&requestId=${requestId}`,
          showInBadge: true // This will show in notification badge
        }
      });

      // Send push notification only if token exists
      if (fcmToken) {
        await this.sendPushNotification(
          toUserId,
          'Breakup Request',
          'Your friend wants to remove',
          {
            type: 'breakup_request',
            requestId,
            fromUserId,
            reason,
            deepLink: `bondmate://notifications?type=breakup&requestId=${requestId}`
          }
        );
      }

      console.log('Breakup request notification sent to user:', toUserId);
    } catch (error) {
      console.error('Error sending breakup request notification:', error);
    }
  }

  // Send breakup accepted notification
  public async sendBreakupAcceptedNotification(
    fromUserId: string,
    toUserId: string,
    acceptedBy: string
  ) {
    try {
      // ⚠️ FIX: Check both currentDeviceInfo.fcmToken and pushToken
      const user = await User.findById(toUserId).select('pushToken currentDeviceInfo');
      
      // Try to get token from currentDeviceInfo first (new location)
      let fcmToken = user?.currentDeviceInfo?.fcmToken;
      
      // Fallback to pushToken (old location) for backward compatibility
      if (!fcmToken) {
        fcmToken = user?.pushToken;
      }
      
      if (!fcmToken) {
        console.log('No push/FCM token found for user:', toUserId);
        // Still create notification in database even if no push token
      }

      // Create notification in database
      await this.createNotification({
        userId: toUserId,
        type: 'partner_rejected',
        title: 'Breakup Accepted',
        message: `${acceptedBy} has accepted the breakup request`,
        data: {
          type: 'breakup_accepted',
          fromUserId,
          acceptedBy
        }
      });

      // Send push notification only if token exists
      if (fcmToken) {
        await this.sendPushNotification(
          toUserId,
          'Breakup Accepted',
          `${acceptedBy} has accepted the breakup request`,
          {
            type: 'breakup_accepted',
            fromUserId,
            acceptedBy
          }
        );
      }

      console.log('Breakup accepted notification sent to user:', toUserId);
    } catch (error) {
      console.error('Error sending breakup accepted notification:', error);
    }
  }

  // Send breakup rejected notification
  public async sendBreakupRejectedNotification(
    fromUserId: string,
    toUserId: string,
    rejectedBy: string
  ) {
    try {
      // ⚠️ FIX: Check both currentDeviceInfo.fcmToken and pushToken
      const user = await User.findById(toUserId).select('pushToken currentDeviceInfo');
      
      // Try to get token from currentDeviceInfo first (new location)
      let fcmToken = user?.currentDeviceInfo?.fcmToken;
      
      // Fallback to pushToken (old location) for backward compatibility
      if (!fcmToken) {
        fcmToken = user?.pushToken;
      }
      
      if (!fcmToken) {
        console.log('No push/FCM token found for user:', toUserId);
        // Still create notification in database even if no push token
      }

      // Create notification in database
      await this.createNotification({
        userId: toUserId,
        type: 'partner_accepted',
        title: 'Breakup Request Rejected',
        message: `${rejectedBy} has rejected your breakup request. Relationship continues.`,
        data: {
          type: 'breakup_rejected',
          fromUserId,
          rejectedBy
        }
      });

      // Send push notification only if token exists
      if (fcmToken) {
        await this.sendPushNotification(
          toUserId,
          'Breakup Request Rejected',
          `${rejectedBy} has rejected your breakup request. Relationship continues.`,
          {
            type: 'breakup_rejected',
            fromUserId,
            rejectedBy
          }
        );
      }

      console.log('Breakup rejected notification sent to user:', toUserId);
    } catch (error) {
      console.error('Error sending breakup rejected notification:', error);
    }
  }
}

export default NotificationService.getInstance();
