import mongoose, { Document, Schema } from 'mongoose';

export interface ICalendarNote extends Document {
  partnerId?: string;
  date: Date;
  text: string;
  authorId: string;
  authorName: string;
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: string;
  deletedReason?: string;
  privacy: 'public' | 'private';
  reminderAt?: Date;
  reminderSent: boolean;
  tags: string[];
  auditTrail: Array<{
    action: 'created' | 'updated' | 'deleted' | 'restored';
    userId: string;
    userName: string;
    timestamp: Date;
    changes?: any;
    reason?: string;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const CalendarNoteSchema = new Schema<ICalendarNote>({
  partnerId: {
    type: String,
    ref: 'User',
    required: false
  },
  date: {
    type: Date,
    required: true,
    index: true
  },
  text: {
    type: String,
    required: true,
    maxlength: [600, 'Text cannot exceed 600 characters']
  },
  authorId: {
    type: String,
    ref: 'User',
    required: true,
    index: true
  },
  authorName: {
    type: String,
    required: true,
    trim: true
  },
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  },
  deletedAt: {
    type: Date
  },
  deletedBy: {
    type: String,
    ref: 'User'
  },
  deletedReason: {
    type: String,
    trim: true
  },
  privacy: {
    type: String,
    enum: ['public', 'private'],
    default: 'public'
  },
  reminderAt: {
    type: Date,
    index: true
  },
  reminderSent: {
    type: Boolean,
    default: false
  },
  tags: [{
    type: String,
    trim: true
  }],
  auditTrail: [{
    action: {
      type: String,
      enum: ['created', 'updated', 'deleted', 'restored'],
      required: true
    },
    userId: {
      type: String,
      required: true
    },
    userName: {
      type: String,
      required: true
    },
    timestamp: {
      type: Date,
      required: true
    },
    changes: {
      type: Schema.Types.Mixed
    },
    reason: {
      type: String
    }
  }]
}, {
  timestamps: true
});

// Indexes for efficient queries
CalendarNoteSchema.index({ authorId: 1, isDeleted: 1 });
CalendarNoteSchema.index({ date: 1, isDeleted: 1 });
CalendarNoteSchema.index({ partnerId: 1, isDeleted: 1 });
CalendarNoteSchema.index({ tags: 1, isDeleted: 1 });
CalendarNoteSchema.index({ reminderAt: 1, reminderSent: 1 });

export default mongoose.model<ICalendarNote>('CalendarNote', CalendarNoteSchema);