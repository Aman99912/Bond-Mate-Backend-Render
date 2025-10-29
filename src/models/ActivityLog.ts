import mongoose, { Document, Schema } from 'mongoose';

export interface IActivityLog extends Document {
  userId: string;
  action: string;
  targetUserId?: string;
  details: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

const ActivityLogSchema = new Schema<IActivityLog>({
  userId: {
    type: String,
    required: true,
    ref: 'User',
    index: true
  },
  action: {
    type: String,
    required: true,
    enum: [
      'partner_request_sent',
      'partner_request_received',
      'partner_request_accepted',
      'partner_request_rejected',
      'partner_request_cancelled',
      'relationship_started',
      'relationship_ended',
      'breakup_request_sent',
      'breakup_request_accepted',
      'breakup_request_rejected',
      'data_restored',
      'data_archived',
      'security_violation',
      'rate_limit_exceeded',
      'authentication_failed',
      'authorization_failed'
    ],
    index: true
  },
  targetUserId: {
    type: String,
    ref: 'User',
    index: true
  },
  details: {
    type: String,
    required: true,
    maxlength: [1000, 'Details cannot exceed 1000 characters']
  },
  ipAddress: {
    type: String,
    trim: true
  },
  userAgent: {
    type: String,
    trim: true,
    maxlength: [500, 'User agent cannot exceed 500 characters']
  },
  metadata: {
    type: Map,
    of: Schema.Types.Mixed,
    default: {}
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'low',
    index: true
  }
}, {
  timestamps: false // We use custom timestamp field
});

// Compound indexes for efficient queries
ActivityLogSchema.index({ userId: 1, action: 1, timestamp: -1 });
ActivityLogSchema.index({ action: 1, timestamp: -1 });
ActivityLogSchema.index({ severity: 1, timestamp: -1 });
ActivityLogSchema.index({ targetUserId: 1, timestamp: -1 });

// TTL index to automatically delete logs older than 1 year
ActivityLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 31536000 });

export default mongoose.model<IActivityLog>('ActivityLog', ActivityLogSchema);
