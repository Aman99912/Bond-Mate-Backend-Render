import mongoose from 'mongoose';
import User from '@/models/User';
import { Partner, PartnerRequest, BreakupRequest } from '@/models/Partner';
import ActivityLog from '@/models/ActivityLog';
import partnerService from './partnerService';
import enhancedNotificationService from './enhancedNotificationService';
import logger from '@/utils/logger';

interface SystemMetrics {
  database: {
    status: string;
    responseTime: number;
    connections: number;
  };
  partners: {
    totalActive: number;
    totalPendingRequests: number;
    totalBreakupRequests: number;
    recentActivity: number;
  };
  notifications: {
    totalSent: number;
    unreadCount: number;
    recentCount: number;
  };
  security: {
    recentViolations: number;
    rateLimitHits: number;
    failedAuths: number;
  };
  performance: {
    memoryUsage: NodeJS.MemoryUsage;
    uptime: number;
    cpuUsage: NodeJS.CpuUsage;
  };
}

class MonitoringService {
  private metrics: SystemMetrics | null = null;
  private lastUpdate: Date | null = null;
  private updateInterval: number = 60000; // 1 minute

  /**
   * Get comprehensive system metrics
   */
  async getSystemMetrics(): Promise<SystemMetrics> {
    const now = new Date();
    
    // Return cached metrics if recently updated
    if (this.metrics && this.lastUpdate && 
        (now.getTime() - this.lastUpdate.getTime()) < this.updateInterval) {
      return this.metrics;
    }

    try {
      const [
        databaseMetrics,
        partnerMetrics,
        notificationMetrics,
        securityMetrics,
        performanceMetrics
      ] = await Promise.all([
        this.getDatabaseMetrics(),
        this.getPartnerMetrics(),
        this.getNotificationMetrics(),
        this.getSecurityMetrics(),
        this.getPerformanceMetrics()
      ]);

      this.metrics = {
        database: databaseMetrics,
        partners: partnerMetrics,
        notifications: notificationMetrics,
        security: securityMetrics,
        performance: performanceMetrics
      };

      this.lastUpdate = now;
      
      logger.debug('System metrics updated', {
        timestamp: now.toISOString(),
        partners: partnerMetrics.totalActive,
        memoryUsage: performanceMetrics.memoryUsage.heapUsed
      });

      return this.metrics;
    } catch (error) {
      logger.error('Failed to get system metrics', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // Return last known metrics or default values
      return this.metrics || this.getDefaultMetrics();
    }
  }

  /**
   * Get database health metrics
   */
  private async getDatabaseMetrics(): Promise<{
    status: string;
    responseTime: number;
    connections: number;
  }> {
    const startTime = Date.now();
    
    try {
      // Test database connection
      await mongoose.connection.db?.admin().ping();
      const responseTime = Date.now() - startTime;
      
      return {
        status: 'healthy',
        responseTime,
        connections: mongoose.connections.length
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        connections: 0
      };
    }
  }

  /**
   * Get partner-related metrics
   */
  private   async getPartnerMetrics(): Promise<{
    totalActive: number;
    totalPendingRequests: number;
    totalBreakupRequests: number;
    recentActivity: number;
  }> {
    try {
      const stats = await partnerService.getPartnerStatistics();
      return {
        totalActive: stats.totalActivePartnerships,
        totalPendingRequests: stats.totalPendingRequests,
        totalBreakupRequests: stats.totalBreakupRequests,
        recentActivity: stats.recentActivity
      };
    } catch (error) {
      logger.error('Failed to get partner metrics', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return {
        totalActive: 0,
        totalPendingRequests: 0,
        totalBreakupRequests: 0,
        recentActivity: 0
      };
    }
  }

  /**
   * Get notification metrics
   */
  private   async getNotificationMetrics(): Promise<{
    totalSent: number;
    unreadCount: number;
    recentCount: number;
  }> {
    try {
      const stats = await enhancedNotificationService.getNotificationStats();
      return {
        totalSent: stats.totalNotifications,
        unreadCount: stats.unreadNotifications,
        recentCount: stats.recentNotifications
      };
    } catch (error) {
      logger.error('Failed to get notification metrics', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return {
        totalSent: 0,
        unreadCount: 0,
        recentCount: 0
      };
    }
  }

  /**
   * Get security metrics
   */
  private async getSecurityMetrics(): Promise<{
    recentViolations: number;
    rateLimitHits: number;
    failedAuths: number;
  }> {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      
      const [recentViolations, rateLimitHits, failedAuths] = await Promise.all([
        ActivityLog.countDocuments({
          action: 'security_violation',
          timestamp: { $gte: oneHourAgo }
        }),
        ActivityLog.countDocuments({
          action: 'rate_limit_exceeded',
          timestamp: { $gte: oneHourAgo }
        }),
        ActivityLog.countDocuments({
          action: 'authentication_failed',
          timestamp: { $gte: oneHourAgo }
        })
      ]);

      return {
        recentViolations,
        rateLimitHits,
        failedAuths
      };
    } catch (error) {
      logger.error('Failed to get security metrics', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return {
        recentViolations: 0,
        rateLimitHits: 0,
        failedAuths: 0
      };
    }
  }

  /**
   * Get performance metrics
   */
  private getPerformanceMetrics(): {
    memoryUsage: NodeJS.MemoryUsage;
    uptime: number;
    cpuUsage: NodeJS.CpuUsage;
  } {
    return {
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime(),
      cpuUsage: process.cpuUsage()
    };
  }

  /**
   * Get default metrics when system is unavailable
   */
  private getDefaultMetrics(): SystemMetrics {
    return {
      database: {
        status: 'unknown',
        responseTime: 0,
        connections: 0
      },
      partners: {
        totalActive: 0,
        totalPendingRequests: 0,
        totalBreakupRequests: 0,
        recentActivity: 0
      },
      notifications: {
        totalSent: 0,
        unreadCount: 0,
        recentCount: 0
      },
      security: {
        recentViolations: 0,
        rateLimitHits: 0,
        failedAuths: 0
      },
      performance: {
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime(),
        cpuUsage: process.cpuUsage()
      }
    };
  }

  /**
   * Check system health and return status
   */
  async getHealthStatus(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    issues: string[];
    metrics: SystemMetrics;
  }> {
    const metrics = await this.getSystemMetrics();
    const issues: string[] = [];

    // Check database health
    if (metrics.database.status !== 'healthy') {
      issues.push('Database connection unhealthy');
    }

    if (metrics.database.responseTime > 1000) {
      issues.push('Database response time too high');
    }

    // Check memory usage
    const memoryUsageMB = metrics.performance.memoryUsage.heapUsed / 1024 / 1024;
    if (memoryUsageMB > 500) { // 500MB threshold
      issues.push('High memory usage detected');
    }

    // Check security violations
    if (metrics.security.recentViolations > 10) {
      issues.push('High number of security violations');
    }

    if (metrics.security.rateLimitHits > 50) {
      issues.push('High number of rate limit hits');
    }

    // Determine overall status
    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (issues.length === 0) {
      status = 'healthy';
    } else if (issues.length <= 2) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    return {
      status,
      issues,
      metrics
    };
  }

  /**
   * Get alerts for critical issues
   */
  async getAlerts(): Promise<Array<{
    level: 'info' | 'warning' | 'error' | 'critical';
    message: string;
    timestamp: Date;
    metadata?: Record<string, any>;
  }>> {
    const alerts: Array<{
      level: 'info' | 'warning' | 'error' | 'critical';
      message: string;
      timestamp: Date;
      metadata?: Record<string, any>;
    }> = [];

    try {
      const metrics = await this.getSystemMetrics();

      // Database alerts
      if (metrics.database.status !== 'healthy') {
        alerts.push({
          level: 'critical',
          message: 'Database connection is unhealthy',
          timestamp: new Date(),
          metadata: { status: metrics.database.status }
        });
      }

      // Memory alerts
      const memoryUsageMB = metrics.performance.memoryUsage.heapUsed / 1024 / 1024;
      if (memoryUsageMB > 1000) {
        alerts.push({
          level: 'critical',
          message: 'Memory usage is critically high',
          timestamp: new Date(),
          metadata: { memoryUsageMB }
        });
      } else if (memoryUsageMB > 500) {
        alerts.push({
          level: 'warning',
          message: 'Memory usage is high',
          timestamp: new Date(),
          metadata: { memoryUsageMB }
        });
      }

      // Security alerts
      if (metrics.security.recentViolations > 20) {
        alerts.push({
          level: 'error',
          message: 'High number of security violations detected',
          timestamp: new Date(),
          metadata: { violations: metrics.security.recentViolations }
        });
      }

      if (metrics.security.rateLimitHits > 100) {
        alerts.push({
          level: 'warning',
          message: 'High number of rate limit hits',
          timestamp: new Date(),
          metadata: { rateLimitHits: metrics.security.rateLimitHits }
        });
      }

      // Partner system alerts
      if (metrics.partners.totalPendingRequests > 1000) {
        alerts.push({
          level: 'warning',
          message: 'High number of pending partner requests',
          timestamp: new Date(),
          metadata: { pendingRequests: metrics.partners.totalPendingRequests }
        });
      }

    } catch (error) {
      logger.error('Failed to get alerts', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    return alerts;
  }

  /**
   * Force refresh metrics
   */
  async refreshMetrics(): Promise<SystemMetrics> {
    this.lastUpdate = null;
    return this.getSystemMetrics();
  }
}

export default new MonitoringService();
