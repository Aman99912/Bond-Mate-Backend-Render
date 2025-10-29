import mongoose, { Document, Schema } from 'mongoose';

export interface INickname extends Document {
  ownerId: mongoose.Types.ObjectId;        // Who set this nickname (local user)
  targetUserId: mongoose.Types.ObjectId;   // The remote user being nicknamed
  nickname: string;
  conversationId?: mongoose.Types.ObjectId; // Optional: link to specific conversation
  createdAt: Date;
  updatedAt: Date;
}

const NicknameSchema = new Schema<INickname>(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    targetUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    nickname: {
      type: String,
      required: true,
      trim: true,
      maxlength: [50, 'Nickname cannot be more than 50 characters'],
      minlength: [1, 'Nickname cannot be empty'],
    },
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: 'Chat',
      required: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Composite unique index: one nickname per owner-target pair
NicknameSchema.index({ ownerId: 1, targetUserId: 1 }, { unique: true });

// Index for querying all nicknames by owner (for loading all at once)
NicknameSchema.index({ ownerId: 1, createdAt: -1 });

// Index for conversation-based queries
NicknameSchema.index({ ownerId: 1, conversationId: 1 });

export default mongoose.model<INickname>('Nickname', NicknameSchema);

