import mongoose, { Document, Schema } from 'mongoose';

export interface IAchievement extends Document {
  userId: string;
  partnerId?: string; // For couple achievements
  achievementId: string; // Predefined achievement ID (e.g., 'strong_bond_3m')
  title: string;
  description: string;
  icon: string;
  category: 'milestone' | 'streak' | 'activity' | 'special';
  unlocked: boolean;
  unlockedDate?: Date;
  progress?: number;
  maxProgress?: number;
  xpReward: number;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  createdAt: Date;
  updatedAt: Date;
}

export interface IBadge extends Document {
  userId: string;
  partnerId?: string; // For couple badges
  badgeId: string; // Predefined badge ID (e.g., 'first_message')
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlockedDate?: Date;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  createdAt: Date;
  updatedAt: Date;
}

const AchievementSchema = new Schema<IAchievement>({
  userId: {
    type: String,
    required: true,
    ref: 'User',
    index: true
  },
  partnerId: {
    type: String,
    ref: 'User',
    index: true
  },
  achievementId: {
    type: String,
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  icon: {
    type: String,
    required: true
  },
  category: {
    type: String,
    enum: ['milestone', 'streak', 'activity', 'special'],
    required: true
  },
  unlocked: {
    type: Boolean,
    default: false,
    index: true
  },
  unlockedDate: {
    type: Date
  },
  progress: {
    type: Number,
    default: 0
  },
  maxProgress: {
    type: Number
  },
  xpReward: {
    type: Number,
    required: true,
    default: 0
  },
  rarity: {
    type: String,
    enum: ['common', 'rare', 'epic', 'legendary'],
    default: 'common'
  }
}, {
  timestamps: true
});

const BadgeSchema = new Schema<IBadge>({
  userId: {
    type: String,
    required: true,
    ref: 'User',
    index: true
  },
  partnerId: {
    type: String,
    ref: 'User',
    index: true
  },
  badgeId: {
    type: String,
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  icon: {
    type: String,
    required: true
  },
  unlocked: {
    type: Boolean,
    default: false,
    index: true
  },
  unlockedDate: {
    type: Date
  },
  rarity: {
    type: String,
    enum: ['common', 'rare', 'epic', 'legendary'],
    default: 'common'
  }
}, {
  timestamps: true
});

// Compound indexes
AchievementSchema.index({ userId: 1, partnerId: 1, achievementId: 1 }, { unique: true });
AchievementSchema.index({ userId: 1, unlocked: 1 });
BadgeSchema.index({ userId: 1, partnerId: 1, badgeId: 1 }, { unique: true });
BadgeSchema.index({ userId: 1, unlocked: 1 });

export const Achievement = mongoose.model<IAchievement>('Achievement', AchievementSchema);
export const Badge = mongoose.model<IBadge>('Badge', BadgeSchema);

