import cron from 'node-cron';
import mongoose from 'mongoose';
import User from '@/models/User';
import { PartnerRequest, PartnerHistory } from '@/models/Partner';
import auditService from './auditService';
import enhancedNotificationService from './enhancedNotificationService';
import logger from '@/utils/logger';

class BackgroundWorker {
  private isRunning = false;

  /**
   * Start all background workers
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('Background workers already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting background workers...');

    // Clean up expired partner requests (every 6 hours)
    cron.schedule('0 */6 * * *', () => {
      this.cleanupExpiredRequests();
    });

    // Clean up old activity logs (daily at 2 AM)
    cron.schedule('0 2 * * *', () => {
      this.cleanupOldLogs();
    });

    // Archive old relationship data (daily at 3 AM)
    cron.schedule('0 3 * * *', () => {
      this.archiveOldRelationships();
    });

    // Send notification retry for failed notifications (every 30 minutes)
    cron.schedule('*/30 * * * *', () => {
      this.retryFailedNotifications();
    });

    // Health check (every 5 minutes)
    cron.schedule('*/5 * * * *', () => {
      this.healthCheck();
    });

    logger.info('Background workers started successfully');
  }

  /**
   * Stop all background workers
   */
  stop(): void {
    if (!this.isRunning) {
      logger.warn('Background workers not running');
      return;
    }

    this.isRunning = false;
    cron.getTasks().forEach(task => task.destroy());
    logger.info('Background workers stopped');
  }

  /**
   * Clean up expired partner requests (older than 7 days)
   */
  private async cleanupExpiredRequests(): Promise<void> {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      
      // Find expired requests
      const expiredRequests = await PartnerRequest.find({
        status: 'pending',
        createdAt: { $lt: sevenDaysAgo }
      });

      if (expiredRequests.length === 0) {
        return;
      }

      // Remove from users' pendingRequests arrays
      const requestIds = expiredRequests.map((req: any) => req._id.toString());
      
      await User.updateMany(
        { 'pendingRequests.requestId': { $in: requestIds } },
        { $pull: { pendingRequests: { requestId: { $in: requestIds } } } }
      );

      // Delete expired requests
      const deletedCount = await PartnerRequest.deleteMany({
        _id: { $in: expiredRequests.map(req => req._id) }
      });

      // Log cleanup activity
      await auditService.logPartnerActivity({
        userId: 'system',
        action: 'partner_request_cancelled',
        details: `Cleaned up ${deletedCount} expired partner requests`,
        metadata: {
          deletedCount,
          cutoffDate: sevenDaysAgo.toISOString()
        }
      });

      logger.info('Cleaned up expired partner requests', {
        deletedCount,
        cutoffDate: sevenDaysAgo.toISOString()
      });
    } catch (error) {
      logger.error('Failed to cleanup expired requests', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Clean up old activity logs
   */
  private async cleanupOldLogs(): Promise<void> {
    try {
      const deletedCount = await auditService.cleanupOldLogs(365); // Keep logs for 1 year
      
      logger.info('Cleaned up old activity logs', {
        deletedCount
      });
    } catch (error) {
      logger.error('Failed to cleanup old logs', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Archive old relationship data (over 30 days)
   */
  private async archiveOldRelationships(): Promise<void> {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      // Find users with old exPartners that haven't been archived
      const usersWithOldExPartners = await User.find({
        'exPartners.breakupDate': { $lt: thirtyDaysAgo },
        'exPartners.dataArchived': { $ne: true }
      });

      let archivedCount = 0;

      for (const user of usersWithOldExPartners) {
        if (user.exPartners) {
          for (const exPartner of user.exPartners) {
            if (exPartner.breakupDate && 
                new Date(exPartner.breakupDate) < thirtyDaysAgo && 
                !exPartner.dataArchived) {
              
              await User.findByIdAndUpdate(user._id, {
                $set: { 'exPartners.$[elem].dataArchived': true }
              }, {
                arrayFilters: [{ 'elem.partnerId': exPartner.partnerId }]
              });
              
              archivedCount++;
            }
          }
        }
      }

      if (archivedCount > 0) {
        await auditService.logPartnerActivity({
          userId: 'system',
          action: 'data_archived',
          details: `Archived ${archivedCount} old relationship records`,
          metadata: {
            archivedCount,
            cutoffDate: thirtyDaysAgo.toISOString()
          }
        });

        logger.info('Archived old relationship data', {
          archivedCount,
          cutoffDate: thirtyDaysAgo.toISOString()
        });
      }
    } catch (error) {
      logger.error('Failed to archive old relationships', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Retry failed notifications (placeholder for future implementation)
   */
  private async retryFailedNotifications(): Promise<void> {
    try {
      // This would implement retry logic for failed notifications
      // For now, just log that the check ran
      logger.debug('Notification retry check completed');
    } catch (error) {
      logger.error('Failed to retry notifications', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Health check for background workers
   */
  private async healthCheck(): Promise<void> {
    try {
      // Check database connection
      const dbState = mongoose.connection.readyState;
      if (dbState !== 1) {
        logger.error('Database connection unhealthy', { state: dbState });
        return;
      }

      // Check system resources
      const memUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();

      // Log health status
      logger.debug('Background worker health check', {
        memoryUsage: {
          rss: Math.round(memUsage.rss / 1024 / 1024), // MB
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) // MB
        },
        cpuUsage: {
          user: cpuUsage.user,
          system: cpuUsage.system
        },
        uptime: process.uptime()
      });
    } catch (error) {
      logger.error('Health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get worker status
   */
  getStatus(): {
    isRunning: boolean;
    tasks: string[];
    uptime: number;
  } {
    return {
      isRunning: this.isRunning,
      tasks: Array.from(cron.getTasks().values()).map((task: any) => task.name || 'unnamed'),
      uptime: process.uptime()
    };
  }

  /**
   * Manually trigger cleanup (for testing)
   */
  async triggerCleanup(): Promise<void> {
    logger.info('Manually triggering cleanup...');
    await this.cleanupExpiredRequests();
    await this.cleanupOldLogs();
    await this.archiveOldRelationships();
    logger.info('Manual cleanup completed');
  }
}

export default new BackgroundWorker();
