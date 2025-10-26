import { Request, Response, NextFunction } from 'express';
import { config } from '@/config/env';
import { ApiResponse } from '@/types';

export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  error: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Reference next to satisfy unused var rule while keeping 4-arg signature
  void next;
  let statusCode = 500;
  let message = 'Internal Server Error';
  let isOperational = false;

  // Handle known error types
  if (error instanceof AppError) {
    statusCode = error.statusCode;
    message = error.message;
    isOperational = error.isOperational;
  } else if (error.name === 'ValidationError') {
    // Handle Mongoose validation errors
    statusCode = 400;
    message = error.message;
    isOperational = true;
  } else if (error.name === 'CastError') {
    // Handle Mongoose cast errors (invalid ObjectId, etc.)
    statusCode = 400;
    message = 'Invalid data format';
    isOperational = true;
  } else if (error.name === 'MongoError' && (error as any).code === 11000) {
    // Handle MongoDB duplicate key errors
    statusCode = 409;
    message = 'A record with this information already exists';
    isOperational = true;
  } else if (error.name === 'MongoServerError') {
    // Handle other MongoDB server errors
    statusCode = 400;
    message = 'Database operation failed';
    isOperational = true;
  } else if (error.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
    isOperational = true;
  } else if (error.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
    isOperational = true;
  }

  // Log error details
  console.error('Error:', {
    message: error.message,
    stack: error.stack,
    statusCode,
    isOperational,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });

  // Send error response
  const response: ApiResponse = {
    success: false,
    message,
    ...(config.nodeEnv === 'development' && { error: error.message }),
  };

  res.status(statusCode).json(response);
};

export const notFoundHandler = (req: Request, res: Response): void => {
  const response: ApiResponse = {
    success: false,
    message: `Route ${req.originalUrl} not found`,
  };

  res.status(404).json(response);
};

type AsyncRouteHandler = (
  req: Request<any, any, any, any>,
  res: Response<any>,
  next: NextFunction
) => Promise<unknown> | unknown;

export const asyncHandler = (fn: AsyncRouteHandler) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
