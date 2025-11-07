import mongoose, { Document, Schema } from 'mongoose';

export interface IPartner extends Document {
  user1Id: string;
  user2Id: string;
  status: 'active' | 'ended';
  startedAt: Date;
  endedAt?: Date;
  endedBy?: string; // userId who ended the relationship
  endedReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IPartnerRequest extends Document {
  fromUserId: string;
  toUserId: string;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  message?: string;
  createdAt: Date;
  updatedAt: Date;
  fromUser?: unknown; // Populated user data
  toUser?: unknown; // Populated user data
}

export interface IPartnerHistory extends Document {
  userId: string;
  partnerId: string;
  action: 'request_sent' | 'request_received' | 'request_accepted' | 'request_rejected' | 'request_cancelled' | 'relationship_started' | 'relationship_ended';
  details?: string;
  createdAt: Date;
}

export interface IBreakupRequest extends Document {
  fromUserId: string;
  toUserId: string;
  status: 'pending' | 'accepted' | 'rejected';
  reason?: string;
  createdAt: Date;
  updatedAt: Date;
  fromUser?: unknown; // Populated user data
  toUser?: unknown; // Populated user data
}

const PartnerSchema = new Schema<IPartner>({
  user1Id: {
    type: String,
    required: true,
    ref: 'User'
  },
  user2Id: {
    type: String,
    required: true,
    ref: 'User'
  },
  status: {
    type: String,
    enum: ['active', 'ended'],
    default: 'active'
  },
  startedAt: {
    type: Date,
    default: Date.now
  },
  endedAt: {
    type: Date
  },
  endedBy: {
    type: String,
    ref: 'User'
  },
  endedReason: {
    type: String,
    trim: true
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      if (Object.prototype.hasOwnProperty.call(ret, '__v')) {
        delete (ret as any).__v;
      }
      return ret;
    }
  }
});

const PartnerRequestSchema = new Schema<IPartnerRequest>({
  fromUserId: {
    type: String,
    required: true,
    ref: 'User'
  },
  toUserId: {
    type: String,
    required: true,
    ref: 'User'
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'cancelled'],
    default: 'pending'
  },
  message: {
    type: String,
    trim: true,
    maxlength: [500, 'Message cannot be more than 500 characters']
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      if (Object.prototype.hasOwnProperty.call(ret, '__v')) {
        delete (ret as any).__v;
      }
      return ret;
    }
  }
});

const PartnerHistorySchema = new Schema<IPartnerHistory>({
  userId: {
    type: String,
    required: true,
    ref: 'User'
  },
  partnerId: {
    type: String,
    required: true,
    ref: 'User'
  },
  action: {
    type: String,
    enum: ['request_sent', 'request_received', 'request_accepted', 'request_rejected', 'request_cancelled', 'relationship_started', 'relationship_ended'],
    required: true
  },
  details: {
    type: String,
    trim: true
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      if (Object.prototype.hasOwnProperty.call(ret, '__v')) {
        delete (ret as any).__v;
      }
      return ret;
    }
  }
});

// Indexes for better performance
PartnerSchema.index({ user1Id: 1, user2Id: 1 });
PartnerSchema.index({ user1Id: 1, status: 1 });
PartnerSchema.index({ user2Id: 1, status: 1 });
PartnerSchema.index({ status: 1 });

PartnerRequestSchema.index({ fromUserId: 1, toUserId: 1 });
PartnerRequestSchema.index({ fromUserId: 1, status: 1 });
PartnerRequestSchema.index({ toUserId: 1, status: 1 });
PartnerRequestSchema.index({ status: 1 });

const BreakupRequestSchema = new Schema<IBreakupRequest>({
  fromUserId: {
    type: String,
    required: true,
    ref: 'User'
  },
  toUserId: {
    type: String,
    required: true,
    ref: 'User'
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending'
  },
  reason: {
    type: String,
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update updatedAt on save
BreakupRequestSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

BreakupRequestSchema.index({ fromUserId: 1, status: 1 });
BreakupRequestSchema.index({ toUserId: 1, status: 1 });
BreakupRequestSchema.index({ status: 1 });

PartnerHistorySchema.index({ userId: 1 });
PartnerHistorySchema.index({ partnerId: 1 });
PartnerHistorySchema.index({ action: 1 });

// Ensure only one active relationship per user
// ⚠️ FIX: Check User.partners array instead of Partner collection
// This allows restoration after breakup within 30 days
PartnerSchema.pre('save', async function(next) {
  try {
    if (this.isNew && this.status === 'active') {
      // Import User model
      const User = this.model('User');
      
      // Check User model partners array, not Partner collection
      // This is the source of truth for active relationships
      const user1: any = await User.findById(this.user1Id).select('partners');
      const user2: any = await User.findById(this.user2Id).select('partners');
      
      // Check if users already have active partners in their partners array
      const user1HasPartner = user1?.partners?.some((p: any) => p.status === 'active') || false;
      const user2HasPartner = user2?.partners?.some((p: any) => p.status === 'active') || false;
      
      if (user1HasPartner) {
        console.log(`❌ User ${this.user1Id} already has an active partner in User.partners array`);
        return next(new Error('User already has an active relationship'));
      }

      if (user2HasPartner) {
        console.log(`❌ User ${this.user2Id} already has an active partner in User.partners array`);
        return next(new Error('Partner already has an active relationship'));
      }
      
      // ✅ Both users have empty partners arrays, allow Partner document creation
      // This fixes the issue where breakup clears User.partners but Partner doc might still exist
      console.log(`✅ Both users have no active partners, allowing Partner document creation`);
    }
    next();
  } catch (error) {
    console.error('Error in Partner pre-save hook:', error);
    next(error instanceof Error ? error : new Error('Unknown error in Partner pre-save hook'));
  }
});

export const Partner = mongoose.model<IPartner>('Partner', PartnerSchema);
export const PartnerRequest = mongoose.model<IPartnerRequest>('PartnerRequest', PartnerRequestSchema);
export const PartnerHistory = mongoose.model<IPartnerHistory>('PartnerHistory', PartnerHistorySchema);
export const BreakupRequest = mongoose.model<IBreakupRequest>('BreakupRequest', BreakupRequestSchema);
