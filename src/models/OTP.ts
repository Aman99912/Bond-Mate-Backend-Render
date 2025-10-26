import mongoose, { Document, Schema } from 'mongoose';

export interface IOTP extends Document {
  mobileNumber: string;
  otp: string;
  expiresAt: Date;
  isUsed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const OTPSchema = new Schema<IOTP>({
  mobileNumber: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  otp: {
    type: String,
    required: true,
    trim: true
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

export default mongoose.model<IOTP>('OTP', OTPSchema);
