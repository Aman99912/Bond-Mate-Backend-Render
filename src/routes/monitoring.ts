import { Router } from 'express';
import { authenticateAdmin, requireRole } from '@/middleware/adminAuth';
import monitoringService from '@/services/monitoringService';
import auditService from '@/services/auditService';
import logger from '@/utils/logger';

const router = Router();

// All monitoring routes require admin authentication
router.use(authenticateAdmin);

// Health check endpoint (public)
router.get('/health', async (req, res) => {
  try {
    const healthStatus = await monitoringService.getHealthStatus();
    
    res.status(healthStatus.status === 'healthy' ? 200 : 503).json({
      success: healthStatus.status === 'healthy',
      status: healthStatus.status,
      issues: healthStatus.issues,
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  } catch (error) {
    logger.error('Health check failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      message: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

// System metrics (admin only)
router.get('/metrics', requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const metrics = await monitoringService.getSystemMetrics();
    
    res.json({
      success: true,
      data: metrics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get metrics', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to get system metrics'
    });
  }
});

// System alerts (admin only)
router.get('/alerts', requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const alerts = await monitoringService.getAlerts();
    
    res.json({
      success: true,
      data: {
        alerts,
        count: alerts.length,
        critical: alerts.filter(a => a.level === 'critical').length,
        error: alerts.filter(a => a.level === 'error').length,
        warning: alerts.filter(a => a.level === 'warning').length,
        info: alerts.filter(a => a.level === 'info').length
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get alerts', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to get system alerts'
    });
  }
});

// Activity logs (admin only)
router.get('/activity-logs', requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const { userId, action, limit = 50, offset = 0 } = req.query;
    
    const logs = await auditService.getUserActivityLogs(
      userId as string || 'all',
      parseInt(limit as string),
      parseInt(offset as string),
      action as string
    );
    
    res.json({
      success: true,
      data: logs,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get activity logs', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to get activity logs'
    });
  }
});

// Security events (admin only)
router.get('/security-events', requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    
    const events = await auditService.getSecurityEvents(parseInt(limit as string));
    
    res.json({
      success: true,
      data: {
        events,
        count: events.length,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Failed to get security events', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to get security events'
    });
  }
});

// Refresh metrics (admin only)
router.post('/refresh', requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const metrics = await monitoringService.refreshMetrics();
    
    res.json({
      success: true,
      message: 'Metrics refreshed successfully',
      data: metrics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to refresh metrics', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to refresh metrics'
    });
  }
});

export default router;
