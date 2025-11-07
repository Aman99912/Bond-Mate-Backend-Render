import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import Admin from '@/models/Admin';
import { AppError } from '@/middleware/errorHandler';

interface JwtPayload {
  userId: string;
  email: string;
  role?: string;
}

declare global {
  namespace Express {
    interface Request {
      admin?: {
        userId: string;
        email: string;
        role: string;
      };
    }
  }
}

// Authenticate admin - verify JWT token
export const authenticateAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let token: string | undefined;

    // Get token from header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }

    if (!token) {
      throw new AppError('Authentication required', 401);
    }

    // Verify token using config
    const { config } = await import('@/config/env');
    if (!config.jwt.secret) {
      throw new AppError('JWT secret not configured', 500);
    }

    const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;

    // Check if admin exists and is active
    const admin = await Admin.findById(decoded.userId);

    if (!admin) {
      throw new AppError('Admin not found', 404);
    }

    if (!admin.isActive) {
      throw new AppError('Account is deactivated', 403);
    }

    // Attach admin info to request
    req.admin = {
      userId: (admin._id as any).toString(),
      email: admin.email,
      role: admin.role,
    };

    // Also set user for compatibility
    (req as any).user = {
      userId: (admin._id as any).toString(),
      email: admin.email,
      role: 'admin',
    };

    next();
  } catch (error: any) {
    if (error.name === 'JsonWebTokenError') {
      return next(new AppError('Invalid token', 401));
    }
    if (error.name === 'TokenExpiredError') {
      return next(new AppError('Token expired', 401));
    }
    next(error);
  }
};

// Check if admin has required role
export const requireRole = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const adminRole = req.admin?.role;

    if (!adminRole) {
      return next(new AppError('Authentication required', 401));
    }

    if (!roles.includes(adminRole)) {
      return next(new AppError('Insufficient permissions', 403));
    }

    next();
  };
};

// Check if admin has required permission
export const requirePermission = (...permissions: string[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const adminId = req.admin?.userId;

    if (!adminId) {
      return next(new AppError('Authentication required', 401));
    }

    const admin = await Admin.findById(adminId);

    if (!admin) {
      return next(new AppError('Admin not found', 404));
    }

    // Super admin has all permissions
    if (admin.role === 'super_admin') {
      return next();
    }

    // Check if admin has all required permissions
    const hasAllPermissions = permissions.every((permission) =>
      admin.permissions.includes(permission)
    );

    if (!hasAllPermissions) {
      return next(new AppError('Insufficient permissions', 403));
    }

    next();
  };
};

