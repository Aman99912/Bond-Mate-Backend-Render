import { Request, Response } from 'express';
import { asyncHandler, AppError } from '@/middleware/errorHandler';
import { ApiResponse, SendOTPRequest, VerifyOTPRequest, ResendOTPRequest } from '@/types';
import OTP from '@/models/OTP';
import User from '@/models/User';

// Generate 4-digit OTP
const generateOTP = (): string => {
  return '1111';
};

// Send OTP to mobile number
export const sendOTP = asyncHandler(async (req: Request<Record<string, never>, ApiResponse<unknown>, SendOTPRequest>, res: Response) => {
  console.log('=== OTP SEND REQUEST RECEIVED ===');
  console.log('Request body:', req.body);
  console.log('Request headers:', req.headers);
  console.log('Request origin:', req.get('Origin'));
  
  const { mobileNumber } = req.body;
  console.log('Sending OTP to mobile number:', mobileNumber);

  if (!mobileNumber) {
    throw new AppError('Mobile number is required', 400);
  }

  // Validate mobile number format (10 digits)
  const phoneRegex = /^\d{10}$/;
  if (!phoneRegex.test(mobileNumber)) {
    throw new AppError('Please enter a valid 10-digit mobile number', 400);
  }

  // Check if user already exists with this mobile number
  const existingUser = await User.findOne({ mobileNumber });
  if (existingUser) {
    throw new AppError('Mobile number already registered. Please use a different number.', 409);
  }

  // Generate OTP
  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now

  // Delete any existing OTP for this mobile number
  await OTP.deleteMany({ mobileNumber, isUsed: false });

  // Create new OTP record
  const otpRecord = new OTP({
    mobileNumber,
    otp,
    expiresAt
  });

  await otpRecord.save();

  // In production, you would send SMS here
  console.log(`OTP for ${mobileNumber}: ${otp}`);

  const response: ApiResponse = {
    success: true,
    message: 'OTP sent successfully',
    data: {
      mobileNumber,
      expiresIn: 300, // 5 minutes in seconds
      message: `OTP sent to ${mobileNumber}`
    }
  };

  res.status(200).json(response);
});

// Verify OTP
export const verifyOTP = asyncHandler(async (req: Request<Record<string, never>, ApiResponse<unknown>, VerifyOTPRequest>, res: Response) => {
  const { mobileNumber, otp } = req.body;

  if (!mobileNumber || !otp) {
    throw new AppError('Mobile number and OTP are required', 400);
  }

  // Validate OTP format (4 digits)
  const otpRegex = /^\d{4}$/;
  if (!otpRegex.test(otp)) {
    throw new AppError('OTP must be 4 digits', 400);
  }

  // Find the OTP record
  const otpRecord = await OTP.findOne({
    mobileNumber,
    otp,
    isUsed: false,
    expiresAt: { $gt: new Date() }
  });

  if (!otpRecord) {
    throw new AppError('Invalid or expired OTP', 400);
  }

  // Mark OTP as used
  otpRecord.isUsed = true;
  await otpRecord.save();

  const response: ApiResponse = {
    success: true,
    message: 'OTP verified successfully',
    data: {
      mobileNumber,
      verified: true,
      message: 'Mobile number verified successfully'
    }
  };

  res.status(200).json(response);
});

// Resend OTP
export const resendOTP = asyncHandler(async (req: Request<Record<string, never>, ApiResponse<unknown>, ResendOTPRequest>, res: Response) => {
  const { mobileNumber } = req.body;

  if (!mobileNumber) {
    throw new AppError('Mobile number is required', 400);
  }

  // Validate mobile number format (10 digits)
  const phoneRegex = /^\d{10}$/;
  if (!phoneRegex.test(mobileNumber)) {
    throw new AppError('Please enter a valid 10-digit mobile number', 400);
  }

  // Check if user already exists with this mobile number
  const existingUser = await User.findOne({ mobileNumber });
  if (existingUser) {
    throw new AppError('Mobile number already registered. Please use a different number.', 409);
  }

  // Generate new OTP
  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now

  // Delete any existing OTP for this mobile number
  await OTP.deleteMany({ mobileNumber, isUsed: false });

  // Create new OTP record
  const otpRecord = new OTP({
    mobileNumber,
    otp,
    expiresAt
  });

  await otpRecord.save();

  // In production, you would send SMS here
  console.log(`Resent OTP for ${mobileNumber}: ${otp}`);

  const response: ApiResponse = {
    success: true,
    message: 'OTP resent successfully',
    data: {
      mobileNumber,
      expiresIn: 300, // 5 minutes in seconds
      message: `OTP resent to ${mobileNumber}`
    }
  };

  res.status(200).json(response);
});
