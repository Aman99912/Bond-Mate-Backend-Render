import { Schema, model, Types } from 'mongoose';

const memorySchema = new Schema({
  imageUrl: { type: String, required: true },
  uploadedBy: { type: Types.ObjectId, ref: 'User', required: true },
  uploadedAt: { type: Date, default: Date.now },
  coupleId: { type: Types.ObjectId, ref: 'Couple', required: true },
});

export default model('Memory', memorySchema);
