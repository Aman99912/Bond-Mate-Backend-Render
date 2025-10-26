import mongoose, { Document, Schema } from 'mongoose';

export interface ISticker extends Document {
  stickerId: string;
  name: string;
  category: string;
  url: string;
  thumbnailUrl?: string;
  isAnimated: boolean;
  tags: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const StickerSchema = new Schema<ISticker>({
  stickerId: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true,
    enum: ['emotions', 'animals', 'objects', 'celebration', 'love', 'funny', 'custom']
  },
  url: {
    type: String,
    required: true
  },
  thumbnailUrl: {
    type: String
  },
  isAnimated: {
    type: Boolean,
    default: false
  },
  tags: [{
    type: String
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes
StickerSchema.index({ category: 1, isActive: 1 });
StickerSchema.index({ tags: 1 });
StickerSchema.index({ stickerId: 1 });

export default mongoose.model<ISticker>('Sticker', StickerSchema);
