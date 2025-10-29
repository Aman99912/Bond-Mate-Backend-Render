import ActivityLog from '@/models/ActivityLog';
import logger from '@/utils/logger';

export interface AuditLogData {
  userId: string;
  action: string;
  targetUserId?: string;
  details: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
  severity?: 'low' | 'medium' | 'high' | 'critical';
}

class AuditService {
  /**
   * Log an activity with automatic severity detection
   */
  async logActivity(data: AuditLogData): Promise<void> {
    try {
      const severity = this.determineSeverity(data.action, data.metadata);
      
      const activityLog = new ActivityLog({
        ...data,
        severity,
        timestamp: new Date()
      });

      await activityLog.save();
      
      // Log to console for immediate debugging
      logger.info('Activity logged', {
        userId: data.userId,
        action: data.action,
        severity,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to log activity', {
        error: error instanceof Error ? error.message : 'Unknown error',
        data
      });
    }
  }

  /**
   * Log security-related activities
   */
  async logSecurityEvent(data: Omit<AuditLogData, 'action'> & { action: 'security_violation' | 'rate_limit_exceeded' | 'authentication_failed' | 'authorization_failed' }): Promise<void> {
    await this.logActivity({
      ...data,
      severity: 'high'
    });
  }

  /**
   * Log partner relationship activities
   */
  async logPartnerActivity(data: Omit<AuditLogData, 'action'> & { 
    action: 'partner_request_sent' | 'partner_request_received' | 'partner_request_accepted' | 'partner_request_rejected' | 'partner_request_cancelled' | 'relationship_started' | 'relationship_ended' | 'data_restored' | 'data_archived'
  }): Promise<void> {
    await this.logActivity({
      ...data,
      severity: 'medium'
    });
  }

  /**
   * Get activity logs for a user
   */
  async getUserActivityLogs(
    userId: string, 
    limit: number = 50, 
    offset: number = 0,
    action?: string
  ): Promise<{ logs: IActivityLog[]; total: number }> {
    try {
      const query: any = { userId };
      if (action) {
        query.action = action;
      }

      const [logs, total] = await Promise.all([
        ActivityLog.find(query)
          .sort({ timestamp: -1 })
          .limit(limit)
          .skip(offset)
          .lean(),
        ActivityLog.countDocuments(query)
      ]);

      return { logs, total };
    } catch (error) {
      logger.error('Failed to get user activity logs', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      });
      return { logs: [], total: 0 };
    }
  }

  /**
   * Get security events
   */
  async getSecurityEvents(limit: number = 100): Promise<IActivityLog[]> {
    try {
      return await ActivityLog.find({
        severity: { $in: ['high', 'critical'] }
      })
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean();
    } catch (error) {
      logger.error('Failed to get security events', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return [];
    }
  }

  /**
   * Determine severity based on action and metadata
   */
  private determineSeverity(action: string, metadata?: Record<string, any>): 'low' | 'medium' | 'high' | 'critical' {
    // Critical events
    if (['security_violation', 'authentication_failed'].includes(action)) {
      return 'critical';
    }

    // High severity events
    if (['rate_limit_exceeded', 'authorization_failed'].includes(action)) {
      return 'high';
    }

    // Medium severity events
    if (['relationship_started', 'relationship_ended', 'data_restored', 'data_archived'].includes(action)) {
      return 'medium';
    }

    // Low severity events (default)
    return 'low';
  }

  /**
   * Clean up old logs (called by cron job)
   */
  async cleanupOldLogs(daysToKeep: number = 365): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const result = await ActivityLog.deleteMany({
        timestamp: { $lt: cutoffDate },
        severity: { $in: ['low', 'medium'] } // Keep high/critical logs longer
      });

      logger.info('Cleaned up old activity logs', {
        deletedCount: result.deletedCount,
        cutoffDate: cutoffDate.toISOString()
      });

      return result.deletedCount || 0;
    } catch (error) {
      logger.error('Failed to cleanup old logs', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return 0;
    }
  }
}

export default new AuditService();
