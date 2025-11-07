import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import Admin from '@/models/Admin';
import { AppError } from '@/middleware/errorHandler';

interface JwtPayload {
  userId: string;
  email: string;
  role?: string;
}

// Special middleware for refresh endpoint - allows expired tokens
export const authenticateAdminRefresh = async (
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

    // Verify token - allow expired tokens
    const { config } = await import('@/config/env');
    if (!config.jwt.secret) {
      throw new AppError('JWT secret not configured', 500);
    }

    let decoded: JwtPayload;
    try {
      decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;
    } catch (error: any) {
      // If token is expired, still allow refresh but decode with ignoreExpiration
      if (error.name === 'TokenExpiredError') {
        decoded = jwt.decode(token) as JwtPayload;
        if (!decoded || !decoded.userId) {
          throw new AppError('Invalid token', 401);
        }
      } else {
        throw error;
      }
    }

    // Check if admin exists and is active
    const admin = await Admin.findById(decoded.userId);

    if (!admin) {
      throw new AppError('Admin not found', 404);
    }

    if (!admin.isActive) {
      throw new AppError('Account is deactivated', 403);
    }

    // Attach admin info to request
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
    next(error);
  }
};

