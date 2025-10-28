import { Request, Response } from 'express';
import { asyncHandler, AppError } from '@/middleware/errorHandler';
import { ApiResponse, SendOTPRequest, VerifyOTPRequest, ResendOTPRequest } from '@/types';
import OTP from '@/models/OTP';
import User from '@/models/User';
import nodemailer from 'nodemailer';
import axios from 'axios';

// Generate 4-digit OTP
const generateOTP = (): string => {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

// Create email transporter for Gmail SMTP
const createEmailTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER || process.env.SMTP_EMAIL || 'bondmateauth@gmail.com',
      pass: process.env.SMTP_PASS || process.env.SMTP_PASSWORD || 'your-app-password',
    },
  });
};

// Send email with OTP
const sendEmailWithOTP = async (email: string, otp: string) => {
  try {
    const transporter = createEmailTransporter();
    
    const mailOptions = {
      from: process.env.SMTP_USER || process.env.SMTP_EMAIL || 'bondmateauth@gmail.com',
      to: email,
      subject: 'Bond Mate - OTP Verification',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #FF6B6B;">Bond Mate Verification</h2>
          <p>Your OTP for verification is:</p>
          <div style="background: #f5f5f5; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; color: #FF6B6B; margin: 20px 0;">
            ${otp}
          </div>
          <p>This OTP will expire in 5 minutes.</p>
          <p style="color: #666; font-size: 12px; margin-top: 30px;">
            If you didn't request this OTP, please ignore this email.
          </p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Email OTP sent to ${email}: ${otp}`);
    console.log(`📧 Message ID: ${info.messageId}`);
  } catch (error: any) {
    console.error('❌ Error sending email OTP:', error);
    throw new Error(`Failed to send email: ${error.message}`);
  }
};

// Send SMS OTP using bhashsms.com
const sendSMSOTP = async (mobileNumber: string, otp: string) => {
  try {
    const smsUser = process.env.SMS_USER || 'success';
    const smsPass = process.env.SMS_PASS || 'bulk@1234';
    const smsSender = process.env.SMS_SENDER || 'BHAINF';
    
    // Construct the SMS message
    const message = `Your Bond Mate OTP is ${otp}. This will expire in 5 minutes.`;
    
    // Build the API URL
    const apiUrl = `https://bhashsms.com/api/sendmsg.php?user=${smsUser}&pass=${smsPass}&sender=${smsSender}&phone=${mobileNumber}&text=${encodeURIComponent(message)}&priority=ndnd&stype=normal`;
    
    // Send the SMS using axios
    const response = await axios.get(apiUrl);
    
    console.log(`📱 SMS sent to ${mobileNumber}: ${response.data}`);
    
    if (response.status === 200 && response.data) {
      console.log(`✅ OTP ${otp} sent successfully to ${mobileNumber}`);
      return response.data;
    } else {
      throw new Error(`SMS sending failed: ${response.data}`);
    }
  } catch (error: any) {
    console.error('❌ Error sending SMS OTP:', error.message);
    // Don't throw - let it fail silently to not block the flow
    // The OTP is already stored in database, so verification will still work
    throw error;
  }
};

// ============================
// MOBILE OTP CONTROLLERS
// ============================

// Send Mobile OTP
export const sendMobileOTP = asyncHandler(async (req: Request, res: Response) => {
  const { mobileNumber, purpose = 'verification' } = req.body;

  if (!mobileNumber) {
    throw new AppError('Mobile number is required', 400);
  }

  // Validate mobile number format (10 digits)
  const phoneRegex = /^\d{10}$/;
  if (!phoneRegex.test(mobileNumber)) {
    throw new AppError('Please enter a valid 10-digit mobile number', 400);
  }

  // Generate OTP
  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  // Delete any existing OTP for this mobile number
  await OTP.deleteMany({ mobileNumber, isUsed: false });

  // Create new OTP record
  const otpRecord = new OTP({
    mobileNumber,
    otp,
    type: 'mobile',
    purpose: purpose as any,
    expiresAt,
  });

  await otpRecord.save();

  // Send OTP via SMS (don't wait for result - always succeed)
  sendSMSOTP(mobileNumber, otp).catch(err => {
    console.log('⚠️ SMS sending failed (ignored for dev):', err);
  });

  console.log(`✅ OTP generated for ${mobileNumber}: ${otp}`);

  const response: ApiResponse = {
    success: true,
    message: 'OTP sent successfully',
    data: {
      mobileNumber,
      expiresIn: 300, // 5 minutes in seconds
      message: `OTP sent to ${mobileNumber}`,
    },
  };

  res.status(200).json(response);
});

// Verify Mobile OTP
export const verifyMobileOTP = asyncHandler(async (req: Request, res: Response) => {
  const { mobileNumber, otp, purpose } = req.body;

  if (!mobileNumber || !otp) {
    throw new AppError('Mobile number and OTP are required', 400);
  }

  // Validate OTP format (4 digits)
  const otpRegex = /^\d{4}$/;
  if (!otpRegex.test(otp)) {
    throw new AppError('OTP must be 4 digits', 400);
  }

  // DUMMY OTP CHECK: Accept 1111 as valid OTP for development
  if (otp === '1111') {
    console.log('✅ Dummy OTP 1111 accepted for:', mobileNumber);
    const response: ApiResponse = {
      success: true,
      message: 'OTP verified successfully',
      data: {
        mobileNumber,
        verified: true,
        message: 'Mobile number verified successfully',
      },
    };
    res.status(200).json(response);
    return;
  }

  // Find the OTP record
  const query: any = {
    mobileNumber,
    otp,
    isUsed: false,
    expiresAt: { $gt: new Date() },
  };

  if (purpose) {
    query.purpose = purpose;
  }

  const otpRecord = await OTP.findOne(query);

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
      message: 'Mobile number verified successfully',
    },
  };

  res.status(200).json(response);
});

// Resend Mobile OTP
export const resendMobileOTP = asyncHandler(async (req: Request, res: Response) => {
  const { mobileNumber, purpose = 'verification' } = req.body;

  if (!mobileNumber) {
    throw new AppError('Mobile number is required', 400);
  }

  // Validate mobile number format
  const phoneRegex = /^\d{10}$/;
  if (!phoneRegex.test(mobileNumber)) {
    throw new AppError('Please enter a valid 10-digit mobile number', 400);
  }

  // Generate new OTP
  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  // Delete any existing OTP
  await OTP.deleteMany({ mobileNumber, isUsed: false });

  // Create new OTP record
  const otpRecord = new OTP({
    mobileNumber,
    otp,
    type: 'mobile',
    purpose: purpose as any,
    expiresAt,
  });

  await otpRecord.save();

  // Send OTP via SMS (don't wait for result - always succeed)
  sendSMSOTP(mobileNumber, otp).catch(err => {
    console.log('⚠️ SMS sending failed (ignored for dev):', err);
  });

  console.log(`✅ OTP regenerated for ${mobileNumber}: ${otp}`);

  const response: ApiResponse = {
    success: true,
    message: 'OTP resent successfully',
    data: {
      mobileNumber,
      expiresIn: 300,
      message: `OTP resent to ${mobileNumber}`,
    },
  };

  res.status(200).json(response);
});

// ============================
// EMAIL OTP CONTROLLERS
// ============================

// Send Email OTP
export const sendEmailOTPController = asyncHandler(async (req: Request, res: Response) => {
  const { email, purpose = 'verification' } = req.body;

  if (!email) {
    throw new AppError('Email is required', 400);
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new AppError('Please enter a valid email address', 400);
  }

  // Generate OTP
  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  // Delete any existing OTP for this email
  await OTP.deleteMany({ email, isUsed: false });

  // Create new OTP record
  const otpRecord = new OTP({
    email,
    otp,
    type: 'email',
    purpose: purpose as any,
    expiresAt,
  });

  await otpRecord.save();

  // Send OTP via email
  await sendEmailWithOTP(email, otp);
  
  console.log(`✅ OTP generated for ${email}: ${otp}`);

  const response: ApiResponse = {
    success: true,
    message: 'OTP sent successfully',
    data: {
      email,
      expiresIn: 300,
      message: `OTP sent to ${email}`,
    },
  };

  res.status(200).json(response);
});

// Verify Email OTP
export const verifyEmailOTPController = asyncHandler(async (req: Request, res: Response) => {
  const { email, otp, purpose } = req.body;

  if (!email || !otp) {
    throw new AppError('Email and OTP are required', 400);
  }

  // Validate OTP format
  const otpRegex = /^\d{4}$/;
  if (!otpRegex.test(otp)) {
    throw new AppError('OTP must be 4 digits', 400);
  }

  // Find the OTP record
  const query: any = {
    email,
    otp,
    isUsed: false,
    expiresAt: { $gt: new Date() },
  };

  if (purpose) {
    query.purpose = purpose;
  }

  const otpRecord = await OTP.findOne(query);

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
      email,
      verified: true,
      message: 'Email verified successfully',
    },
  };

  res.status(200).json(response);
});

// Resend Email OTP
export const resendEmailOTPController = asyncHandler(async (req: Request, res: Response) => {
  const { email, purpose = 'verification' } = req.body;

  if (!email) {
    throw new AppError('Email is required', 400);
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new AppError('Please enter a valid email address', 400);
  }

  // Generate new OTP
  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  // Delete any existing OTP
  await OTP.deleteMany({ email, isUsed: false });

  // Create new OTP record
  const otpRecord = new OTP({
    email,
    otp,
    type: 'email',
    purpose: purpose as any,
    expiresAt,
  });

  await otpRecord.save();

  // Send OTP via email
  await sendEmailWithOTP(email, otp);
  
  console.log(`✅ OTP regenerated for ${email}: ${otp}`);

  const response: ApiResponse = {
    success: true,
    message: 'OTP resent successfully',
    data: {
      email,
      expiresIn: 300,
      message: `OTP resent to ${email}`,
    },
  };

  res.status(200).json(response);
});

// ============================
// LEGACY SUPPORT (for backward compatibility)
// ============================

// Legacy exports for backward compatibility
export const sendOTP = sendMobileOTP;
export const verifyOTP = verifyMobileOTP;
export const resendOTP = resendMobileOTP;