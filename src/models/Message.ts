import mongoose, { Document, Schema } from 'mongoose';

export interface IMessage extends Document {
  chatId: mongoose.Types.ObjectId;
  senderId: mongoose.Types.ObjectId;
  content: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'file' | 'emoji' | 'sticker' | 'voice' | 'pdf';
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  thumbnailUrl?: string; // For videos and images
  duration?: number; // For audio and video files
  isOneView?: boolean;
  viewedBy?: mongoose.Types.ObjectId[];
  viewedAt?: Date;
  viewCount?: number; // Track how many times viewed
  replyTo?: mongoose.Types.ObjectId;
  isEdited: boolean;
  editedAt?: Date;
  isDeleted: boolean;
  deletedAt?: Date;
  deletedFor?: mongoose.Types.ObjectId[]; // Array of user IDs who deleted this message for themselves
  isDeletedForEveryone?: boolean; // Whether message was deleted for everyone by sender
  // Sticker specific fields
  stickerId?: string;
  stickerUrl?: string;
  stickerCategory?: string;
  // Voice specific fields
  voiceDuration?: number;
  voiceWaveform?: number[]; // For voice visualization
  // Reactions
  reactions?: { userId: mongoose.Types.ObjectId; emoji: string }[];
  // Privacy and security
  isEncrypted?: boolean;
  encryptionKey?: string;
  expiresAt?: Date; // For self-destructing messages
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>({
  chatId: {
    type: Schema.Types.ObjectId,
    ref: 'Chat',
    required: true
  },
  senderId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: function() {
      return this.type === 'text' || this.type === 'emoji';
    }
  },
  type: {
    type: String,
    enum: ['text', 'image', 'video', 'audio', 'file', 'emoji', 'sticker', 'voice', 'pdf'],
    required: true
  },
  fileUrl: {
    type: String
  },
  fileName: {
    type: String
  },
  fileSize: {
    type: Number
  },
  mimeType: {
    type: String
  },
  thumbnailUrl: {
    type: String
  },
  duration: {
    type: Number
  },
  isOneView: {
    type: Boolean,
    default: false
  },
  viewedBy: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  viewedAt: {
    type: Date
  },
  viewCount: {
    type: Number,
    default: 0
  },
  replyTo: {
    type: Schema.Types.ObjectId,
    ref: 'Message'
  },
  isEdited: {
    type: Boolean,
    default: false
  },
  editedAt: {
    type: Date
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date
  },
  deletedFor: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  isDeletedForEveryone: {
    type: Boolean,
    default: false
  },
  // Sticker specific fields
  stickerId: {
    type: String
  },
  stickerUrl: {
    type: String
  },
  stickerCategory: {
    type: String
  },
  // Voice specific fields
  voiceDuration: {
    type: Number
  },
  voiceWaveform: [{
    type: Number
  }],
  // Reactions
  reactions: [{
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    emoji: { type: String, required: true }
  }],
  // Privacy and security
  isEncrypted: {
    type: Boolean,
    default: false
  },
  encryptionKey: {
    type: String
  },
  expiresAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Index for efficient queries (supports cursor pagination on createdAt + _id)
MessageSchema.index({ chatId: 1, createdAt: -1, _id: -1 });
MessageSchema.index({ senderId: 1 });
MessageSchema.index({ isOneView: 1, viewedBy: 1 });
MessageSchema.index({ 'reactions.userId': 1 });

export default mongoose.model<IMessage>('Message', MessageSchema);
