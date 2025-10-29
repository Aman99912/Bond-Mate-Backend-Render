import admin from 'firebase-admin';
import User from '@/models/User';
import Notification from '@/models/Notification';
import auditService from './auditService';
import logger from '@/utils/logger';

interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  imageUrl?: string;
}

interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

class EnhancedNotificationService {
  private retryConfig: RetryConfig = {
    maxRetries: 3,
    baseDelay: 1000, // 1 second
    maxDelay: 10000, // 10 seconds
    backoffMultiplier: 2
  };

  /**
   * Send notification with retry logic and comprehensive error handling
   */
  async sendNotification(
    userId: string,
    payload: NotificationPayload,
    retryCount: number = 0
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      // Get user's FCM token
      const user = await User.findById(userId).select('pushToken name email');
      if (!user || !user.pushToken) {
        logger.warn('User not found or no FCM token', { userId });
        return { success: false, error: 'No FCM token found' };
      }

      // Validate FCM token format
      if (!this.isValidFCMToken(user.pushToken)) {
        logger.warn('Invalid FCM token format', { userId, token: user.pushToken });
        return { success: false, error: 'Invalid FCM token format' };
      }

      // Prepare notification message
      const message: admin.messaging.Message = {
        token: user.pushToken,
        notification: {
          title: payload.title,
          body: payload.body,
          imageUrl: payload.imageUrl
        },
        data: payload.data || {},
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channelId: 'partner_requests'
          }
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1
            }
          }
        }
      };

      // Send notification
      const response = await admin.messaging().send(message);
      
      logger.info('Notification sent successfully', {
        userId,
        messageId: response,
        title: payload.title
      });

      // Log successful notification
      await auditService.logPartnerActivity({
        userId,
        action: 'partner_request_sent', // This will be overridden by specific methods
        details: `Notification sent: ${payload.title}`,
        metadata: {
          messageId: response,
          title: payload.title,
          body: payload.body
        }
      });

      return { success: true, messageId: response };
    } catch (error: any) {
      logger.error('Notification send failed', {
        userId,
        error: error.message,
        code: error.code,
        retryCount
      });

      // Handle specific Firebase errors
      if (this.isRetryableError(error)) {
        if (retryCount < this.retryConfig.maxRetries) {
          const delay = this.calculateRetryDelay(retryCount);
          logger.info('Retrying notification', { userId, retryCount: retryCount + 1, delay });
          
          await this.delay(delay);
          return this.sendNotification(userId, payload, retryCount + 1);
        }
      }

      // Log failed notification
      await auditService.logSecurityEvent({
        userId,
        action: 'security_violation',
        details: `Notification send failed: ${error.message}`,
        metadata: {
          error: error.message,
          code: error.code,
          retryCount
        }
      });

      return { success: false, error: error.message };
    }
  }

  /**
   * Send partner request notification with enhanced error handling
   */
  async sendPartnerRequestNotification(
    fromUserId: string,
    toUserId: string,
    fromUserName: string
  ): Promise<{ success: boolean; messageId?: string }> {
    const payload: NotificationPayload = {
      title: 'New Partner Request',
      body: `${fromUserName} sent you a partner request!`,
      data: {
        type: 'partner_request',
        fromUserId,
        toUserId,
        fromUserName
      }
    };

    const result = await this.sendNotification(toUserId, payload);
    
    // Also create in-app notification
    await this.createInAppNotification(toUserId, {
      title: payload.title,
      body: payload.body,
      type: 'partner_request',
      data: payload.data
    });

    return result;
  }

  /**
   * Send partner accepted notification
   */
  async sendPartnerAcceptedNotification(
    fromUserId: string,
    toUserId: string,
    toUserName: string
  ): Promise<{ success: boolean; messageId?: string }> {
    const payload: NotificationPayload = {
      title: 'Partner Request Accepted!',
      body: `${toUserName} accepted your partner request`,
      data: {
        type: 'partner_accepted',
        fromUserId,
        toUserId,
        toUserName
      }
    };

    const result = await this.sendNotification(fromUserId, payload);
    
    // Create in-app notification
    await this.createInAppNotification(fromUserId, {
      title: payload.title,
      body: payload.body,
      type: 'partner_accepted',
      data: payload.data
    });

    return result;
  }

  /**
   * Send partner rejected notification
   */
  async sendPartnerRejectedNotification(
    fromUserId: string,
    toUserId: string,
    toUserName: string
  ): Promise<{ success: boolean; messageId?: string }> {
    const payload: NotificationPayload = {
      title: 'Partner Request Rejected',
      body: `${toUserName} rejected your partner request`,
      data: {
        type: 'partner_rejected',
        fromUserId,
        toUserId,
        toUserName
      }
    };

    const result = await this.sendNotification(fromUserId, payload);
    
    // Create in-app notification
    await this.createInAppNotification(fromUserId, {
      title: payload.title,
      body: payload.body,
      type: 'partner_rejected',
      data: payload.data
    });

    return result;
  }

  /**
   * Send breakup request notification
   */
  async sendBreakupRequestNotification(
    fromUserId: string,
    toUserId: string,
    fromUserName: string,
    reason: string,
    requestId: string
  ): Promise<{ success: boolean; messageId?: string }> {
    const payload: NotificationPayload = {
      title: 'Breakup Request',
      body: `${fromUserName} wants to end the relationship`,
      data: {
        type: 'breakup_request',
        fromUserId,
        toUserId,
        fromUserName,
        reason,
        requestId
      }
    };

    const result = await this.sendNotification(toUserId, payload);
    
    // Create in-app notification
    await this.createInAppNotification(toUserId, {
      title: payload.title,
      body: payload.body,
      type: 'breakup_request',
      data: payload.data
    });

    return result;
  }

  /**
   * Send breakup accepted notification
   */
  async sendBreakupAcceptedNotification(
    fromUserId: string,
    toUserId: string,
    toUserName: string
  ): Promise<{ success: boolean; messageId?: string }> {
    const payload: NotificationPayload = {
      title: 'Relationship Ended',
      body: `${toUserName} accepted the breakup request`,
      data: {
        type: 'breakup_accepted',
        fromUserId,
        toUserId,
        toUserName
      }
    };

    const result = await this.sendNotification(fromUserId, payload);
    
    // Create in-app notification
    await this.createInAppNotification(fromUserId, {
      title: payload.title,
      body: payload.body,
      type: 'breakup_accepted',
      data: payload.data
    });

    return result;
  }

  /**
   * Send breakup rejected notification
   */
  async sendBreakupRejectedNotification(
    fromUserId: string,
    toUserId: string,
    toUserName: string
  ): Promise<{ success: boolean; messageId?: string }> {
    const payload: NotificationPayload = {
      title: 'Breakup Request Rejected',
      body: `${toUserName} wants to continue the relationship`,
      data: {
        type: 'breakup_rejected',
        fromUserId,
        toUserId,
        toUserName
      }
    };

    const result = await this.sendNotification(fromUserId, payload);
    
    // Create in-app notification
    await this.createInAppNotification(fromUserId, {
      title: payload.title,
      body: payload.body,
      type: 'breakup_rejected',
      data: payload.data
    });

    return result;
  }

  /**
   * Create in-app notification
   */
  private async createInAppNotification(
    userId: string,
    notificationData: {
      title: string;
      body: string;
      type: string;
      data?: Record<string, any>;
    }
  ): Promise<void> {
    try {
      await Notification.create({
        userId,
        title: notificationData.title,
        body: notificationData.body,
        type: notificationData.type,
        data: notificationData.data || {},
        isRead: false
      });
    } catch (error) {
      logger.error('Failed to create in-app notification', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        notificationData
      });
    }
  }

  /**
   * Validate FCM token format
   */
  private isValidFCMToken(token: string): boolean {
    // FCM tokens are typically 163 characters long and contain alphanumeric characters and some special chars
    const fcmTokenRegex = /^[A-Za-z0-9_-]{140,}$/;
    return fcmTokenRegex.test(token);
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: any): boolean {
    const retryableErrors = [
      'messaging/registration-token-not-registered',
      'messaging/invalid-registration-token',
      'messaging/network-error',
      'messaging/server-unavailable',
      'messaging/internal-error'
    ];

    return retryableErrors.includes(error.code) || 
           error.message?.includes('timeout') ||
           error.message?.includes('network');
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(retryCount: number): number {
    const delay = this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffMultiplier, retryCount);
    return Math.min(delay, this.retryConfig.maxDelay);
  }

  /**
   * Delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Update user's FCM token
   */
  async updateUserFCMToken(userId: string, token: string): Promise<boolean> {
    try {
      if (!this.isValidFCMToken(token)) {
        logger.warn('Invalid FCM token format provided', { userId, token });
        return false;
      }

      await User.findByIdAndUpdate(userId, { pushToken: token });
      
      logger.info('FCM token updated successfully', { userId });
      return true;
    } catch (error) {
      logger.error('Failed to update FCM token', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      });
      return false;
    }
  }

  /**
   * Get notification statistics
   */
  async getNotificationStats(): Promise<{
    totalNotifications: number;
    unreadNotifications: number;
    recentNotifications: number;
  }> {
    try {
      const [totalNotifications, unreadNotifications, recentNotifications] = await Promise.all([
        Notification.countDocuments(),
        Notification.countDocuments({ isRead: false }),
        Notification.countDocuments({
          createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        })
      ]);

      return {
        totalNotifications,
        unreadNotifications,
        recentNotifications
      };
    } catch (error) {
      logger.error('Failed to get notification statistics', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return {
        totalNotifications: 0,
        unreadNotifications: 0,
        recentNotifications: 0
      };
    }
  }
}

export default new EnhancedNotificationService();
