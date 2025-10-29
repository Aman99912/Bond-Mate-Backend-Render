import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import auditService from '@/services/auditService';
import logger from '@/utils/logger';

/**
 * Enhanced rate limiter with audit logging
 */
export const createRateLimiter = (config: {
  windowMs: number;
  max: number;
  message?: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: Request) => string;
}) => {
  return rateLimit({
    windowMs: config.windowMs,
    max: config.max,
    message: config.message || 'Too many requests, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: config.skipSuccessfulRequests || false,
    skipFailedRequests: config.skipFailedRequests || false,
    keyGenerator: config.keyGenerator || ((req: Request) => req.ip || 'unknown'),
    handler: async (req: Request, res: Response) => {
      const userId = (req as any).user?.userId || (req as any).user?.id;
      
      // Log rate limit violation
      await auditService.logSecurityEvent({
        userId: userId || 'anonymous',
        action: 'rate_limit_exceeded',
        details: `Rate limit exceeded for ${req.method} ${req.path}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        metadata: {
          limit: config.max,
          windowMs: config.windowMs,
          path: req.path,
          method: req.method
        }
      });

      logger.warn('Rate limit exceeded', {
        userId: userId || 'anonymous',
        ip: req.ip,
        path: req.path,
        method: req.method,
        userAgent: req.get('User-Agent')
      });

      res.status(429).json({
        success: false,
        message: config.message || 'Too many requests, please try again later',
        retryAfter: Math.ceil(config.windowMs / 1000)
      });
    }
  });
};

// Predefined rate limiters for different endpoints
export const partnerRequestLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 partner requests per 15 minutes
  message: 'Too many partner requests, please try again later'
});

export const partnerActionLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20, // 20 partner actions per 5 minutes
  message: 'Too many partner actions, please try again later'
});

export const searchLimiter = createRateLimiter({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 searches per minute
  message: 'Too many search requests, please try again later'
});

export const generalLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 minutes
  message: 'Too many requests, please try again later'
});

// Strict rate limiter for sensitive operations
export const strictLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5, // 5 requests per 5 minutes
  message: 'Too many sensitive operations, please try again later'
});
