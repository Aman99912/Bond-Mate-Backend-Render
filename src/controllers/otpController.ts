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

// Generate OTP token (random string for session verification)
const generateOTPToken = (): string => {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
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
const sendEmailWithOTP = async (email: string, name: string, otp: string) => {
  try {
    const transporter = createEmailTransporter();
    
    const mailOptions = {
      from: process.env.SMTP_USER || process.env.SMTP_EMAIL || 'bondmateauth@gmail.com',
      to: email,
      subject: '💕 Bond Mate - Your Love Code',
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
          <table role="presentation" style="width: 100%; border-collapse: collapse; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px;">
            <tr>
              <td align="center">
                <table role="presentation" style="max-width: 600px; width: 100%; background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.1);">
                  <!-- Header with gradient -->
                  <tr>
                    <td style="background: linear-gradient(135deg, #FF6B9D 0%, #C44569 50%, #FF6B9D 100%); padding: 40px 30px; text-align: center;">
                      <div style="font-size: 48px; margin-bottom: 10px;">💕</div>
                      <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600; text-shadow: 0 2px 4px rgba(0,0,0,0.2);">
                        Bond Mate
                      </h1>
                      <p style="color: #ffffff; margin: 10px 0 0 0; font-size: 16px; opacity: 0.95;">
                        Your Love Verification Code
                      </p>
                    </td>
                  </tr>
                  
                  <!-- Main Content -->
                  <tr>
                    <td style="padding: 50px 30px; text-align: center;">
                      <p style="color: #333333; font-size: 18px; margin: 0 0 20px 0; line-height: 1.6;">
                        Hello ${name}! 💖
                      </p>
                      <p style="color: #666666; font-size: 16px; margin: 0 0 30px 0; line-height: 1.6;">
                        We're excited to have you join our community of loving couples!<br/>
                        Here's your special verification code:
                      </p>
                      
                      <!-- OTP Box with Love Theme -->
                      <div style="background: linear-gradient(135deg, #FFE5F1 0%, #FFD6E8 100%); border: 3px solid #FF6B9D; border-radius: 15px; padding: 30px; margin: 30px 0; box-shadow: 0 5px 15px rgba(255, 107, 157, 0.2);">
                        <div style="font-size: 42px; font-weight: bold; color: #C44569; letter-spacing: 8px; text-shadow: 0 2px 4px rgba(196, 69, 105, 0.2); font-family: 'Courier New', monospace;">
                          ${otp}
                        </div>
                      </div>
                      
                      <p style="color: #999999; font-size: 14px; margin: 25px 0 0 0;">
                        ⏰ This code will expire in <strong style="color: #C44569;">5 minutes</strong>
                      </p>
                      
                      <div style="margin-top: 40px; padding-top: 30px; border-top: 2px dashed #FFE5F1;">
                        <p style="color: #666666; font-size: 14px; margin: 0; line-height: 1.6;">
                          💝 Enter this code to complete your registration and start your beautiful journey with your partner!
                        </p>
                      </div>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="background: #F8F9FA; padding: 30px; text-align: center; border-top: 1px solid #EEEEEE;">
                      <p style="color: #999999; font-size: 12px; margin: 0 0 10px 0;">
                        Made with ❤️ for couples in love
                      </p>
                      <p style="color: #CCCCCC; font-size: 11px; margin: 15px 0 0 0; line-height: 1.5;">
                        If you didn't request this code, please ignore this email.<br/>
                        Your account security is important to us.
                      </p>
                      <div style="margin-top: 20px;">
                        <p style="color: #C44569; font-size: 12px; margin: 0;">
                          💌 Bond Mate Team
                        </p>
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
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

  // Generate OTP and token
  const otp = generateOTP();
  const token = generateOTPToken();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  // Delete any existing OTP for this mobile number
  await OTP.deleteMany({ mobileNumber, isUsed: false });

  // Create new OTP record
  const otpRecord = new OTP({
    mobileNumber,
    otp,
    token,
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
      token,
      expiresIn: 300, // 5 minutes in seconds
      message: `OTP sent to ${mobileNumber}`,
    },
  };

  res.status(200).json(response);
});

// Verify Mobile OTP
export const verifyMobileOTP = asyncHandler(async (req: Request, res: Response) => {
  const { mobileNumber, otp, token, purpose } = req.body;

  if (!mobileNumber || !otp || !token) {
    throw new AppError('Mobile number, OTP, and token are required', 400);
  }

  // Validate OTP format (4 digits)
  const otpRegex = /^\d{4}$/;
  if (!otpRegex.test(otp)) {
    throw new AppError('OTP must be 4 digits', 400);
  }

  // DUMMY OTP CHECK: Accept 1111 as valid OTP for development (skip token check)
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
    return res.status(200).json(response);
  }

  // Find the OTP record with token verification
  const query: any = {
    mobileNumber,
    otp,
    token,
    isUsed: false,
    expiresAt: { $gt: new Date() },
  };

  if (purpose) {
    query.purpose = purpose;
  }

  const otpRecord = await OTP.findOne(query);

  if (!otpRecord) {
    throw new AppError('Invalid or expired OTP or token mismatch', 400);
  }

  // Mark OTP as used
  otpRecord.isUsed = true;
  await otpRecord.save();

  const response: ApiResponse = {
    success: true,
    message: 'OTP verified successfully',
    data: {
      mobileNumber,
      token,
      verified: true,
      message: 'Mobile number verified successfully',
    },
  };

  return res.status(200).json(response);
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

  // Generate new OTP and token
  const otp = generateOTP();
  const token = generateOTPToken();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  // Delete any existing OTP
  await OTP.deleteMany({ mobileNumber, isUsed: false });

  // Create new OTP record
  const otpRecord = new OTP({
    mobileNumber,
    otp,
    token,
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
      token,
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
  const { email, name, purpose = 'verification' } = req.body;
  const userId = (req as any).user?.userId;

  if (!email) {
    throw new AppError('Email is required', 400);
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new AppError('Please enter a valid email address', 400);
  }

  // Get user name if authenticated and name not provided
  let userName = name;
  if (!userName && userId) {
    const user = await User.findById(userId).select('name');
    if (user) {
      userName = user.name;
    }
  }

  // Generate OTP and token
  const otp = generateOTP();
  const token = generateOTPToken();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  // Delete any existing OTP for this email
  await OTP.deleteMany({ email, isUsed: false });

  // Create new OTP record
  const otpRecord = new OTP({
    email,
    otp,
    token,
    type: 'email',
    purpose: purpose as any,
    expiresAt,
  });

  await otpRecord.save();

  // Send OTP via email (use name if provided, otherwise use "Beautiful" as default)
  await sendEmailWithOTP(email, userName || 'Beautiful', otp);
  
  console.log(`✅ OTP generated for ${email}: ${otp}`);

  const response: ApiResponse = {
    success: true,
    message: 'OTP sent successfully',
    data: {
      email,
      token,
      expiresIn: 300,
      message: `OTP sent to ${email}`,
    },
  };

  res.status(200).json(response);
});

// Verify Email OTP
export const verifyEmailOTPController = asyncHandler(async (req: Request, res: Response) => {
  const { email, otp, token, purpose } = req.body;
  const userId = (req as any).user?.userId;

  if (!email || !otp || !token) {
    throw new AppError('Email, OTP, and token are required', 400);
  }

  // Validate OTP format
  const otpRegex = /^\d{4}$/;
  if (!otpRegex.test(otp)) {
    throw new AppError('OTP must be 4 digits', 400);
  }

  // Find the OTP record with token verification
  const query: any = {
    email,
    otp,
    token,
    isUsed: false,
    expiresAt: { $gt: new Date() },
  };

  if (purpose) {
    query.purpose = purpose;
  }

  const otpRecord = await OTP.findOne(query);

  if (!otpRecord) {
    throw new AppError('Invalid or expired OTP or token mismatch', 400);
  }

  // Mark OTP as used
  otpRecord.isUsed = true;
  await otpRecord.save();

  // If purpose is change_email and user is authenticated, update the email
  if (purpose === 'change_email' && userId) {
    const user = await User.findById(userId);
    
    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Check if email is different from current email
    if (user.email !== email) {
      // Check if new email is already taken
      const existingUser = await User.findOne({ email });
      if (existingUser && (existingUser._id as any).toString() !== userId) {
        throw new AppError('Email is already in use by another account', 409);
      }

      // Update user email
      user.email = email;
      await user.save();

      // Notify partner if exists
      if (user.currentPartner?.partnerId) {
        const notificationService = require('@/services/notificationService').default;
        
        await notificationService.createNotification({
          userId: user.currentPartner.partnerId,
          type: 'message' as any,
          title: 'Profile Updated',
          message: `${user.name} has updated their email address`,
          data: { userId: user.id, field: 'email', newValue: email }
        });

        // Send push notification
        const partner = await User.findById(user.currentPartner.partnerId).select('pushToken');
        if (partner?.pushToken) {
          await notificationService.sendPushNotification(
            user.currentPartner.partnerId,
            'Profile Updated',
            `${user.name} has updated their email address`,
            { userId: user.id, field: 'email' }
          );
        }
      }

      const response: ApiResponse = {
        success: true,
        message: 'Email updated successfully',
        data: {
          email,
          token,
          verified: true,
          updated: true,
          message: 'Email verified and updated successfully',
        },
      };

      return res.status(200).json(response);
    }
  }

  const response: ApiResponse = {
    success: true,
    message: 'OTP verified successfully',
    data: {
      email,
      token,
      verified: true,
      message: 'Email verified successfully',
    },
  };

  return res.status(200).json(response);
});

// Resend Email OTP
export const resendEmailOTPController = asyncHandler(async (req: Request, res: Response) => {
  const { email, name, purpose = 'verification' } = req.body;

  if (!email) {
    throw new AppError('Email is required', 400);
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new AppError('Please enter a valid email address', 400);
  }

  // Generate new OTP and token
  const otp = generateOTP();
  const token = generateOTPToken();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  // Delete any existing OTP
  await OTP.deleteMany({ email, isUsed: false });

  // Create new OTP record
  const otpRecord = new OTP({
    email,
    otp,
    token,
    type: 'email',
    purpose: purpose as any,
    expiresAt,
  });

  await otpRecord.save();

  // Send OTP via email (use name if provided, otherwise use "Beautiful" as default)
  await sendEmailWithOTP(email, name || 'Beautiful', otp);
  
  console.log(`✅ OTP regenerated for ${email}: ${otp}`);

  const response: ApiResponse = {
    success: true,
    message: 'OTP resent successfully',
    data: {
      email,
      token,
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