import mongoose, { Document, Schema } from 'mongoose';

export interface IOTP extends Document {
  mobileNumber?: string;
  email?: string;
  otp: string;
  type: 'mobile' | 'email';
  purpose: 'verification' | 'change_email' | 'change_phone' | 'password_reset';
  expiresAt: Date;
  isUsed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const OTPSchema = new Schema<IOTP>({
  mobileNumber: {
    type: String,
    trim: true,
    index: true,
    sparse: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    index: true,
    sparse: true
  },
  otp: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['mobile', 'email'],
    required: true
  },
  purpose: {
    type: String,
    enum: ['verification', 'change_email', 'change_phone', 'password_reset'],
    default: 'verification'
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expireAfterSeconds: 0 } // TTL index for automatic cleanup
  },
  isUsed: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Index for better query performance
OTPSchema.index({ mobileNumber: 1, isUsed: 1 });
OTPSchema.index({ email: 1, isUsed: 1 });
OTPSchema.index({ type: 1, purpose: 1 });

export default mongoose.model<IOTP>('OTP', OTPSchema);
