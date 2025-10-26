import mongoose, { Document, Schema } from 'mongoose';

export interface IMediaItem extends Document {
  userId: mongoose.Types.ObjectId;
  partnerId: mongoose.Types.ObjectId;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: Date;
  isDeleted: boolean;
  deletedAt?: Date;
}

const MediaItemSchema = new Schema<IMediaItem>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  partnerId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  fileName: {
    type: String,
    required: true,
    trim: true
  },
  fileUrl: {
    type: String,
    required: true,
    trim: true
  },
  fileSize: {
    type: Number,
    required: true,
    min: 0
  },
  mimeType: {
    type: String,
    required: true,
    trim: true
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  },
  deletedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
MediaItemSchema.index({ userId: 1, isDeleted: 1, uploadedAt: -1 });
MediaItemSchema.index({ partnerId: 1, isDeleted: 1, uploadedAt: -1 });
MediaItemSchema.index({ userId: 1, partnerId: 1, isDeleted: 1 });

// Virtual for file extension
MediaItemSchema.virtual('fileExtension').get(function() {
  return this.fileName.split('.').pop()?.toLowerCase() || '';
});

// Virtual for formatted file size
MediaItemSchema.virtual('formattedFileSize').get(function() {
  const bytes = this.fileSize;
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
});

export default mongoose.model<IMediaItem>('MediaItem', MediaItemSchema);
