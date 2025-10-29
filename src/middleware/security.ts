import { Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import auditService from '@/services/auditService';
import logger from '@/utils/logger';

/**
 * Enhanced security middleware with comprehensive validation
 */
export const securityMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  // Log all requests for security monitoring
  const userId = (req as any).user?.userId || (req as any).user?.id || 'anonymous';
  
  logger.debug('Request received', {
    method: req.method,
    path: req.path,
    userId,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  next();
};

/**
 * Input sanitization middleware
 */
export const sanitizeInput = (req: Request, res: Response, next: NextFunction): void => {
  // Sanitize string inputs
  const sanitizeString = (str: string): string => {
    return str
      .trim()
      .replace(/[<>]/g, '') // Remove potential HTML tags
      .substring(0, 1000); // Limit length
  };

  // Recursively sanitize object
  const sanitizeObject = (obj: any): any => {
    if (typeof obj === 'string') {
      return sanitizeString(obj);
    } else if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    } else if (obj && typeof obj === 'object') {
      const sanitized: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          sanitized[key] = sanitizeObject(obj[key]);
        }
      }
      return sanitized;
    }
    return obj;
  };

  // Sanitize request body
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }

  // Sanitize query parameters
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query);
  }

  next();
};

/**
 * Enhanced validation middleware
 */
export const validatePartnerRequest = [
  body('toUserId')
    .notEmpty()
    .withMessage('Target user ID is required')
    .isMongoId()
    .withMessage('Invalid user ID format')
    .custom((value) => {
      // Additional validation for ObjectId format
      if (!/^[0-9a-fA-F]{24}$/.test(value)) {
        throw new Error('Invalid MongoDB ObjectId format');
      }
      return true;
    }),
  body('message')
    .optional()
    .isLength({ min: 0, max: 500 })
    .withMessage('Message must be between 0 and 500 characters')
    .custom((value) => {
      if (value && typeof value === 'string') {
        // Check for potential XSS attempts
        const xssPattern = /<script|javascript:|on\w+\s*=/i;
        if (xssPattern.test(value)) {
          throw new Error('Message contains potentially malicious content');
        }
      }
      return true;
    }),
  (req: Request, res: Response, next: NextFunction): void => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const userId = (req as any).user?.userId || (req as any).user?.id;
      
      // Log validation failure
      auditService.logSecurityEvent({
        userId: userId || 'anonymous',
        action: 'security_violation',
        details: `Validation failed: ${errors.array().map(e => e.msg).join(', ')}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        metadata: {
          errors: errors.array(),
          path: req.path,
          method: req.method
        }
      });

      res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
      return;
    }
    
    next();
  }
];

/**
 * Role-based access control middleware
 */
export const requireRole = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user;
    
    if (!user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
      return;
    }

    // For now, all authenticated users have 'user' role
    // This can be extended when role system is implemented
    const userRole = 'user';
    
    if (!roles.includes(userRole)) {
      auditService.logSecurityEvent({
        userId: user.userId || user.id,
        action: 'authorization_failed',
        details: `Access denied: required roles ${roles.join(', ')}, user has ${userRole}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        metadata: {
          requiredRoles: roles,
          userRole,
          path: req.path,
          method: req.method
        }
      });

      res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
      return;
    }

    next();
  };
};

/**
 * Request size limiter
 */
export const requestSizeLimiter = (maxSize: number = 1024 * 1024) => { // 1MB default
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = parseInt(req.get('content-length') || '0');
    
    if (contentLength > maxSize) {
      const userId = (req as any).user?.userId || (req as any).user?.id;
      
      auditService.logSecurityEvent({
        userId: userId || 'anonymous',
        action: 'security_violation',
        details: `Request size exceeded limit: ${contentLength} bytes`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        metadata: {
          contentLength,
          maxSize,
          path: req.path,
          method: req.method
        }
      });

      res.status(413).json({
        success: false,
        message: 'Request too large'
      });
      return;
    }

    next();
  };
};

/**
 * IP whitelist middleware (for admin endpoints)
 */
export const ipWhitelist = (allowedIPs: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    
    if (!clientIP || !allowedIPs.includes(clientIP)) {
      const userId = (req as any).user?.userId || (req as any).user?.id;
      
      auditService.logSecurityEvent({
        userId: userId || 'anonymous',
        action: 'security_violation',
        details: `Access denied from IP: ${clientIP}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        metadata: {
          clientIP,
          allowedIPs,
          path: req.path,
          method: req.method
        }
      });

      res.status(403).json({
        success: false,
        message: 'Access denied'
      });
      return;
    }

    next();
  };
};

/**
 * CSRF protection middleware (basic implementation)
 */
export const csrfProtection = (req: Request, res: Response, next: NextFunction): void => {
  // Skip CSRF for GET, HEAD, OPTIONS
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Check for CSRF token in headers
  const csrfToken = req.get('X-CSRF-Token');
  const sessionToken = (req as any).session?.csrfToken;

  if (!csrfToken || !sessionToken || csrfToken !== sessionToken) {
    const userId = (req as any).user?.userId || (req as any).user?.id;
    
    auditService.logSecurityEvent({
      userId: userId || 'anonymous',
      action: 'security_violation',
      details: 'CSRF token validation failed',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      metadata: {
        hasToken: !!csrfToken,
        hasSessionToken: !!sessionToken,
        path: req.path,
        method: req.method
      }
    });

    res.status(403).json({
      success: false,
      message: 'CSRF token validation failed'
    });
    return;
  }

  next();
};

/**
 * Security headers middleware
 */
export const securityHeaders = (req: Request, res: Response, next: NextFunction): void => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Content Security Policy (basic)
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'");
  
  // Remove X-Powered-By header
  res.removeHeader('X-Powered-By');
  
  next();
};
