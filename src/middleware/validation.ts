import { Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { ApiResponse } from '@/types';

export const handleValidationErrors = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const response: ApiResponse = {
      success: false,
      message: 'Validation failed',
      error: errors.array().map(err => err.msg).join(', '),
    };
    
    res.status(400).json(response);
    return;
  }
  
  next();
};

// User validation rules
export const validateRegister = [
  body('name')
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be 1-100 characters'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  body('mobileNumber')
    .optional()
    .isMobilePhone('any')
    .withMessage('Please provide a valid mobile number'),
  body('subPassword')
    .optional()
    .isLength({ min: 4, max: 4 })
    .isNumeric()
    .withMessage('Sub-password must be exactly 4 digits'),
  body('avatar')
    .optional()
    .isURL()
    .withMessage('Avatar must be a valid URL'),
  body('bio')
    .optional()
    .isLength({ min: 1, max: 500 })
    .withMessage('Bio must be 1-500 characters'),
  body('dob')
    .optional()
    .isISO8601()
    .withMessage('Date of birth must be a valid date'),
  handleValidationErrors,
];

export const validateLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  handleValidationErrors,
];
