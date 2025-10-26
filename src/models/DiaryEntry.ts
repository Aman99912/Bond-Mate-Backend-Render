import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IDiaryEntry extends Document {
  partnerId: Types.ObjectId; // relationship (Partner)
  title: string;
  description: string;
  images: string[]; // stored file urls like /uploads/...
  authorId: Types.ObjectId;
  authorName: string;
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: Types.ObjectId;
  deletedReason?: string;
  privacy: 'public' | 'private'; // public = both partners see, private = only author
  tags: string[];
  searchKeywords: string[]; // auto-generated for search
  auditTrail: Array<{
    action: 'created' | 'updated' | 'deleted' | 'restored';
    userId: Types.ObjectId;
    userName: string;
    timestamp: Date;
    changes?: any;
    reason?: string;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const DiaryEntrySchema = new Schema<IDiaryEntry>({
  partnerId: {
    type: Schema.Types.ObjectId,
    ref: 'Partner',
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 120
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 4000
  },
  images: [{
    type: String,
    trim: true
  }],
  authorId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  authorName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date
  },
  deletedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  deletedReason: {
    type: String,
    trim: true,
    maxlength: 200
  },
  privacy: {
    type: String,
    enum: ['public', 'private'],
    default: 'public'
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: 50
  }],
  searchKeywords: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  auditTrail: [{
    action: {
      type: String,
      enum: ['created', 'updated', 'deleted', 'restored'],
      required: true
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    userName: {
      type: String,
      required: true,
      trim: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    changes: {
      type: Schema.Types.Mixed
    },
    reason: {
      type: String,
      trim: true,
      maxlength: 200
    }
  }]
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      if (Object.prototype.hasOwnProperty.call(ret, '__v')) delete (ret as any).__v;
      return ret;
    }
  }
});

// Indexes for better performance
DiaryEntrySchema.index({ partnerId: 1, createdAt: -1, isDeleted: 1 });
DiaryEntrySchema.index({ authorId: 1, createdAt: -1, isDeleted: 1 });
DiaryEntrySchema.index({ partnerId: 1, isDeleted: 1, privacy: 1 });
DiaryEntrySchema.index({ tags: 1 });
DiaryEntrySchema.index({ searchKeywords: 1 });
DiaryEntrySchema.index({ 'auditTrail.timestamp': 1 });

// Text index for search functionality
DiaryEntrySchema.index({ 
  title: 'text',
  description: 'text',
  tags: 'text'
}, {
  weights: {
    title: 10,
    description: 5,
    tags: 3
  }
});

// Pre-save middleware to add audit trail and generate search keywords
DiaryEntrySchema.pre('save', function(next) {
  // Generate search keywords from title, description, and tags
  const searchText = `${this.title} ${this.description} ${this.tags.join(' ')}`.toLowerCase();
  this.searchKeywords = [...new Set(searchText.split(/\s+/).filter(word => word.length > 2))];

  if (this.isNew) {
    this.auditTrail.push({
      action: 'created',
      userId: this.authorId as any,
      userName: this.authorName,
      timestamp: new Date()
    });
  } else if (this.isModified()) {
    const changes = this.getChanges();
    this.auditTrail.push({
      action: 'updated',
      userId: this.authorId as any,
      userName: this.authorName,
      timestamp: new Date(),
      changes: changes
    });
  }
  next();
});

export default mongoose.model<IDiaryEntry>('DiaryEntry', DiaryEntrySchema);


