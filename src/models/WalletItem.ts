import mongoose, { Document, Schema } from 'mongoose';

export interface IWalletItem extends Document {
  userId: mongoose.Types.ObjectId;
  partnerId: mongoose.Types.ObjectId;
  category: 'text' | 'todo' | 'socialmedia';
  type: 'text' | 'todo' | 'socialmedia';
  
  // Text fields
  title?: string;
  content?: string;
  
  // Todo fields
  todoItems?: Array<{
    id: string;
    text: string;
    completed: boolean;
    createdAt: Date;
  }>;
  
  // Social Media fields
  platform?: string;
  username?: string;
  password?: string;
  icon?: string;
  url?: string;
  
  // Common fields
  isEncrypted: boolean;
  tags?: string[];
  isShared: boolean;
  approvalStatus: 'pending' | 'approved' | 'rejected';
  approvalStatusUpdatedAt?: Date;
  approvalStatusUpdatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const WalletItemSchema = new Schema<IWalletItem>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  partnerId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  category: {
    type: String,
    enum: ['text', 'todo', 'socialmedia'],
    required: true
  },
  type: {
    type: String,
    enum: ['text', 'todo', 'socialmedia'],
    required: true
  },
  
  // Text fields
  title: {
    type: String,
    required: function() {
      return this.category === 'text';
    }
  },
  content: {
    type: String,
    required: function() {
      return this.category === 'text';
    }
  },
  
  // Todo fields
  todoItems: [{
    id: {
      type: String,
      required: true
    },
    text: {
      type: String,
      required: true
    },
    completed: {
      type: Boolean,
      default: false
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Social Media fields
  platform: {
    type: String,
    required: function() {
      return this.category === 'socialmedia';
    }
  },
  username: {
    type: String,
    required: function() {
      return this.category === 'socialmedia';
    }
  },
  password: {
    type: String,
    required: function() {
      return this.category === 'socialmedia';
    }
  },
  icon: {
    type: String
  },
  url: {
    type: String
  },
  
  // Common fields
  isEncrypted: {
    type: Boolean,
    default: false
  },
  tags: [{
    type: String
  }],
  isShared: {
    type: Boolean,
    default: true
  },
  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  approvalStatusUpdatedAt: {
    type: Date
  },
  approvalStatusUpdatedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
WalletItemSchema.index({ userId: 1, category: 1 });
WalletItemSchema.index({ partnerId: 1, category: 1 });
WalletItemSchema.index({ userId: 1, partnerId: 1 });

export default mongoose.model<IWalletItem>('WalletItem', WalletItemSchema);
