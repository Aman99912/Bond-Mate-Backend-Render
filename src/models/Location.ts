import { Schema, model, Document } from 'mongoose';

export interface ILocation extends Document {
  userId: Schema.Types.ObjectId;
  latitude: number;
  longitude: number;
  accuracy?: number;
  updatedAt: Date;
}

const LocationSchema = new Schema<ILocation>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    latitude: {
      type: Number,
      required: true,
      min: -90,
      max: 90,
    },
    longitude: {
      type: Number,
      required: true,
      min: -180,
      max: 180,
    },
    accuracy: {
      type: Number,
      min: 0,
    },
  },
  {
    timestamps: { createdAt: false, updatedAt: true },
  }
);

LocationSchema.index({ userId: 1 });

export default model<ILocation>('Location', LocationSchema);

