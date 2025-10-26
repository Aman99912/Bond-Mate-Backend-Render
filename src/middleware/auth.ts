import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '@/config/env';
import { AppError } from './errorHandler';

interface JwtPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}

// Augment Express.Request in a central declaration file instead of here

export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Access denied. No token provided.', 401);
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    if (!token) {
      throw new AppError('Access denied. No token provided.', 401);
    }

    try {
      const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;
      req.user = decoded;
      next();
    } catch (jwtError) {
      if (jwtError instanceof jwt.TokenExpiredError) {
        throw new AppError('Token expired. Please login again.', 401);
      } else if (jwtError instanceof jwt.JsonWebTokenError) {
        throw new AppError('Invalid token. Please login again.', 401);
      } else {
        throw new AppError('Token verification failed.', 401);
      }
    }
  } catch (error) {
    next(error);
  }
};
