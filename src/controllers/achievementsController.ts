import { Request, Response } from 'express';
import { asyncHandler, AppError } from '@/middleware/errorHandler';
import { ApiResponse } from '@/types';
import User from '@/models/User';
import Chat from '@/models/Chat';
import Message from '@/models/Message';
import { Achievement, Badge } from '@/models/Achievement';
import DiaryEntry from '@/models/DiaryEntry';
import logger from '@/utils/logger';

// Level thresholds (XP required for each level)
const LEVEL_THRESHOLDS = [
  0,      // Level 1: 0-500 XP
  500,    // Level 2: 501-1000 XP
  1000,   // Level 3: 1001-2000 XP
  2000,   // Level 4: 2001-3500 XP
  3500,   // Level 5: 3501-5000 XP
  5000,   // Level 6: 5001-7000 XP
  7000,   // Level 7: 7001-10000 XP
  10000,  // Level 8: 10001-15000 XP
  15000,  // Level 9: 15001-25000 XP
  25000,  // Level 10: 25001+ XP
];

const LEVEL_NAMES = [
  'Newcomer',
  'Connected',
  'Bonded',
  'Close',
  'Soulbound',
  'Eternal',
  'Unbreakable',
  'Legendary',
  'Mythic',
  'Transcendent',
];

// Calculate level from XP
function calculateLevel(totalXP: number): { level: number; levelName: string; currentXP: number; xpToNextLevel: number } {
  let level = 1;
  let currentXP = totalXP;
  let xpToNextLevel = 500;

  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (totalXP >= LEVEL_THRESHOLDS[i]) {
      level = i + 1;
      currentXP = totalXP - LEVEL_THRESHOLDS[i];
      if (i < LEVEL_THRESHOLDS.length - 1) {
        xpToNextLevel = LEVEL_THRESHOLDS[i + 1] - LEVEL_THRESHOLDS[i];
      } else {
        xpToNextLevel = 0; // Max level
      }
      break;
    }
  }

  return {
    level,
    levelName: LEVEL_NAMES[level - 1] || 'Unknown',
    currentXP,
    xpToNextLevel,
  };
}

// Calculate XP from activities
async function calculateXP(userId: string, partnerId?: string): Promise<number> {
  let totalXP = 0;

  // XP from messages (1 XP per message)
  if (partnerId) {
    const chat = await Chat.findOne({
      participants: { $all: [userId, partnerId] }
    });
    if (chat) {
      const messageCount = await Message.countDocuments({
        chatId: chat._id,
        isDeleted: false,
        isDeletedForEveryone: false
      });
      totalXP += messageCount;
    }
  }

  // XP from unlocked achievements
  const achievements = await Achievement.find({
    userId,
    unlocked: true,
    ...(partnerId ? { $or: [{ partnerId: null }, { partnerId }] } : { partnerId: null })
  });
  totalXP += achievements.reduce((sum, ach) => sum + (ach.xpReward || 0), 0);

  // XP from diary entries (5 XP per entry)
  const diaryCount = await DiaryEntry.countDocuments({ authorId: userId, isDeleted: false });
  totalXP += diaryCount * 5;

  return totalXP;
}

// Calculate chat streak
async function calculateStreak(userId: string, partnerId: string): Promise<{
  currentStreak: number;
  longestStreak: number;
  nextMilestone: number;
  progressToNextMilestone: number;
}> {
  const chat = await Chat.findOne({
    participants: { $all: [userId, partnerId] }
  });

  if (!chat) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      nextMilestone: 7,
      progressToNextMilestone: 0,
    };
  }

  // Get all messages between users
  const messages = await Message.find({
    chatId: chat._id,
    isDeleted: false,
    isDeletedForEveryone: false
  }).sort({ createdAt: 1 }).select('createdAt');

  if (messages.length === 0) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      nextMilestone: 7,
      progressToNextMilestone: 0,
    };
  }

  // Group messages by date
  const messageDates = new Set<string>();
  messages.forEach(msg => {
    const date = new Date(msg.createdAt).toDateString();
    messageDates.add(date);
  });

  const sortedDates = Array.from(messageDates)
    .map(d => new Date(d))
    .sort((a, b) => a.getTime() - b.getTime());

  // Calculate current streak (from today backwards)
  let currentStreak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = sortedDates.length - 1; i >= 0; i--) {
    const date = new Date(sortedDates[i]);
    date.setHours(0, 0, 0, 0);
    const daysDiff = Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (daysDiff === currentStreak) {
      currentStreak++;
    } else {
      break;
    }
  }

  // Calculate longest streak
  let longestStreak = 1;
  let tempStreak = 1;

  for (let i = 1; i < sortedDates.length; i++) {
    const prevDate = new Date(sortedDates[i - 1]);
    const currDate = new Date(sortedDates[i]);
    prevDate.setHours(0, 0, 0, 0);
    currDate.setHours(0, 0, 0, 0);

    const daysDiff = Math.floor((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysDiff === 1) {
      tempStreak++;
      longestStreak = Math.max(longestStreak, tempStreak);
    } else {
      tempStreak = 1;
    }
  }

  // Find next milestone
  const milestones = [7, 30, 100, 365];
  const nextMilestone = milestones.find(m => currentStreak < m) || 365;
  const progressToNextMilestone = currentStreak;

  return {
    currentStreak,
    longestStreak,
    nextMilestone,
    progressToNextMilestone,
  };
}

// Get couple statistics
async function getCoupleStats(userId: string, partnerId: string): Promise<{
  messagesExchanged: number;
  voiceNotesExchanged: number;
  themesUsed: number;
  daysTogether: number;
  relationshipAge: number;
  compatibilityScore: number;
  chatStreak: number;
  goalsCompleted: number;
}> {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  // Find active partner
  const activePartner = user.partners?.find((p: any) => p.status === 'active');
  if (!activePartner) {
    throw new AppError('No active partner found', 404);
  }

  const relationshipStartDate = new Date(activePartner.startedAt);
  const daysTogether = Math.floor((Date.now() - relationshipStartDate.getTime()) / (1000 * 60 * 60 * 24));

  // Get chat
  const chat = await Chat.findOne({
    participants: { $all: [userId, partnerId] }
  });

  let messagesExchanged = 0;
  let voiceNotesExchanged = 0;

  if (chat) {
    messagesExchanged = await Message.countDocuments({
      chatId: chat._id,
      isDeleted: false,
      isDeletedForEveryone: false
    });

    voiceNotesExchanged = await Message.countDocuments({
      chatId: chat._id,
      type: 'voice',
      isDeleted: false,
      isDeletedForEveryone: false
    });
  }

  // Get unique themes used (from user's selectedTheme history)
  const themesUsed = user.selectedTheme ? 1 : 0; // Simplified - could track theme history

  // Calculate compatibility score (simplified)
  const compatibilityScore = Math.min(100, Math.floor(
    (messagesExchanged / 100) * 30 + // Message frequency (30%)
    (daysTogether / 365) * 40 + // Relationship duration (40%)
    (voiceNotesExchanged / 10) * 20 + // Voice notes (20%)
    (themesUsed / 7) * 10 // Theme variety (10%)
  ));

  // Get chat streak
  const streakInfo = await calculateStreak(userId, partnerId);

  // Goals completed (from diary entries or other sources)
  const goalsCompleted = await DiaryEntry.countDocuments({ authorId: userId, isDeleted: false });

  return {
    messagesExchanged,
    voiceNotesExchanged,
    themesUsed,
    daysTogether,
    relationshipAge: daysTogether,
    compatibilityScore: Math.min(100, compatibilityScore),
    chatStreak: streakInfo.currentStreak,
    goalsCompleted,
  };
}

// Get or create achievements
async function getAchievements(userId: string, partnerId: string, stats: any, streakInfo: any): Promise<any[]> {
  const achievements = [];

  // Define all possible achievements
  const achievementDefinitions = [
    // Milestone achievements
    {
      id: 'strong_bond_3m',
      title: 'Strong Bond',
      description: 'Celebrated 3 months together',
      icon: '💝',
      category: 'milestone' as const,
      maxProgress: 90,
      xpReward: 100,
      rarity: 'common' as const,
      check: (s: any) => s.daysTogether >= 90,
    },
    {
      id: 'unbreakable_duo_6m',
      title: 'Unbreakable Duo',
      description: 'Celebrated 6 months together',
      icon: '💑',
      category: 'milestone' as const,
      maxProgress: 180,
      xpReward: 250,
      rarity: 'rare' as const,
      check: (s: any) => s.daysTogether >= 180,
    },
    {
      id: 'soulmates_1y',
      title: 'Soulmates',
      description: 'Celebrated 1 year together',
      icon: '💕',
      category: 'milestone' as const,
      maxProgress: 365,
      xpReward: 500,
      rarity: 'epic' as const,
      check: (s: any) => s.daysTogether >= 365,
    },
    {
      id: 'forever_together_2y',
      title: 'Forever Together',
      description: 'Celebrated 2 years together',
      icon: '💍',
      category: 'milestone' as const,
      maxProgress: 730,
      xpReward: 1000,
      rarity: 'legendary' as const,
      check: (s: any) => s.daysTogether >= 730,
    },
    // Streak achievements
    {
      id: 'streak_7d',
      title: '7 Day Streak',
      description: 'Maintained a 7-day chat streak',
      icon: '🔥',
      category: 'streak' as const,
      maxProgress: 7,
      xpReward: 50,
      rarity: 'common' as const,
      check: (s: any, st: any) => st.currentStreak >= 7,
    },
    {
      id: 'streak_30d',
      title: '30 Day Streak',
      description: 'Maintained a 30-day chat streak',
      icon: '🔥',
      category: 'streak' as const,
      maxProgress: 30,
      xpReward: 150,
      rarity: 'rare' as const,
      check: (s: any, st: any) => st.currentStreak >= 30,
    },
    {
      id: 'streak_100d',
      title: '100 Day Streak',
      description: 'Maintained a 100-day chat streak',
      icon: '🔥',
      category: 'streak' as const,
      maxProgress: 100,
      xpReward: 400,
      rarity: 'epic' as const,
      check: (s: any, st: any) => st.currentStreak >= 100,
    },
    {
      id: 'eternal_flame_100d',
      title: 'Eternal Flame',
      description: 'Reached 100-day streak milestone',
      icon: '💖',
      category: 'streak' as const,
      maxProgress: 100,
      xpReward: 500,
      rarity: 'legendary' as const,
      check: (s: any, st: any) => st.currentStreak >= 100,
    },
    // Activity achievements
    {
      id: 'perfect_match',
      title: 'Perfect Match',
      description: 'Completed all relationship goals',
      icon: '✨',
      category: 'activity' as const,
      maxProgress: 10,
      xpReward: 300,
      rarity: 'rare' as const,
      check: (s: any) => s.goalsCompleted >= 10,
    },
  ];

  for (const def of achievementDefinitions) {
    let achievement = await Achievement.findOne({
      userId,
      partnerId,
      achievementId: def.id,
    });

    const isUnlocked = def.check(stats, streakInfo);

    if (!achievement) {
      achievement = await Achievement.create({
        userId,
        partnerId,
        achievementId: def.id,
        title: def.title,
        description: def.description,
        icon: def.icon,
        category: def.category,
        unlocked: isUnlocked,
        unlockedDate: isUnlocked ? new Date() : undefined,
        progress: isUnlocked ? def.maxProgress : (def.category === 'milestone' ? stats.daysTogether : (def.category === 'streak' ? streakInfo.currentStreak : stats.goalsCompleted)),
        maxProgress: def.maxProgress,
        xpReward: def.xpReward,
        rarity: def.rarity,
      });
    } else {
      // Update if newly unlocked
      if (!achievement.unlocked && isUnlocked) {
        achievement.unlocked = true;
        achievement.unlockedDate = new Date();
        achievement.progress = def.maxProgress;
        await achievement.save();
      } else if (!achievement.unlocked) {
        // Update progress
        achievement.progress = def.category === 'milestone' 
          ? stats.daysTogether 
          : def.category === 'streak' 
            ? streakInfo.currentStreak 
            : stats.goalsCompleted;
        await achievement.save();
      }
    }

    achievements.push({
      id: achievement.achievementId,
      title: achievement.title,
      description: achievement.description,
      icon: achievement.icon,
      category: achievement.category,
      unlocked: achievement.unlocked,
      unlockedDate: achievement.unlockedDate?.toISOString() || null,
      progress: achievement.unlocked ? null : achievement.progress,
      maxProgress: achievement.unlocked ? null : achievement.maxProgress,
      xpReward: achievement.xpReward,
      rarity: achievement.rarity,
    });
  }

  return achievements;
}

// Get or create badges
async function getBadges(userId: string, partnerId: string, stats: any): Promise<any[]> {
  const badges = [];

  const badgeDefinitions = [
    {
      id: 'first_message',
      name: 'First Message',
      description: 'Sent your first message',
      icon: '💬',
      rarity: 'common' as const,
      check: async (s: any) => Promise.resolve(s.messagesExchanged > 0),
    },
    {
      id: 'photo_lovers',
      name: 'Photo Lovers',
      description: 'Shared 100 photos',
      icon: '📸',
      rarity: 'common' as const,
      check: async (s: any) => {
        const chat = await Chat.findOne({ participants: { $all: [userId, partnerId] } });
        if (!chat) return false;
        const photoCount = await Message.countDocuments({
          chatId: chat._id,
          type: 'image',
          isDeleted: false,
        });
        return photoCount >= 100;
      },
    },
    {
      id: 'voice_notes',
      name: 'Voice Notes',
      description: 'Exchanged 50 voice notes',
      icon: '🎤',
      rarity: 'rare' as const,
      check: async (s: any) => Promise.resolve(s.voiceNotesExchanged >= 50),
    },
    {
      id: 'theme_master',
      name: 'Theme Master',
      description: 'Tried all chat themes',
      icon: '🎨',
      rarity: 'epic' as const,
      check: async (s: any) => Promise.resolve(s.themesUsed >= 7),
    },
    {
      id: 'perfect_sync',
      name: 'Perfect Sync',
      description: '100% compatibility score',
      icon: '💯',
      rarity: 'legendary' as const,
      check: async (s: any) => Promise.resolve(s.compatibilityScore >= 100),
    },
    {
      id: 'memory_keeper',
      name: 'Memory Keeper',
      description: 'Created 50 diary entries',
      icon: '📔',
      rarity: 'rare' as const,
      check: async (s: any) => Promise.resolve(s.goalsCompleted >= 50),
    },
  ];

  for (const def of badgeDefinitions) {
    let badge = await Badge.findOne({
      userId,
      partnerId,
      badgeId: def.id,
    });

    const isUnlocked = await def.check(stats);

    if (!badge) {
      badge = await Badge.create({
        userId,
        partnerId,
        badgeId: def.id,
        name: def.name,
        description: def.description,
        icon: def.icon,
        unlocked: isUnlocked,
        unlockedDate: isUnlocked ? new Date() : undefined,
        rarity: def.rarity,
      });
    } else if (!badge.unlocked && isUnlocked) {
      badge.unlocked = true;
      badge.unlockedDate = new Date();
      await badge.save();
    }

    badges.push({
      id: badge.badgeId,
      name: badge.name,
      description: badge.description,
      icon: badge.icon,
      unlocked: badge.unlocked,
      unlockedDate: badge.unlockedDate?.toISOString() || null,
      rarity: badge.rarity,
    });
  }

  return badges;
}

// Get timeline events
async function getTimelineEvents(userId: string, partnerId: string): Promise<any[]> {
  const events = [];

  // Get first message
  const chat = await Chat.findOne({
    participants: { $all: [userId, partnerId] }
  });

  if (chat) {
    const firstMessage = await Message.findOne({
      chatId: chat._id,
      isDeleted: false,
    }).sort({ createdAt: 1 });

    if (firstMessage) {
      events.push({
        id: 'first_message',
        type: 'message',
        title: 'First Message',
        description: 'You sent your first message',
        date: firstMessage.createdAt.toISOString(),
        icon: '💬',
      });
    }

    // Get first photo
    const firstPhoto = await Message.findOne({
      chatId: chat._id,
      type: 'image',
      isDeleted: false,
    }).sort({ createdAt: 1 });

    if (firstPhoto) {
      events.push({
        id: 'first_photo',
        type: 'photo',
        title: 'First Photo Shared',
        description: 'You shared your first photo together',
        date: firstPhoto.createdAt.toISOString(),
        icon: '📸',
      });
    }
  }

  // Get unlocked achievements
  const achievements = await Achievement.find({
    userId,
    partnerId,
    unlocked: true,
  }).sort({ unlockedDate: 1 }).limit(10);

  achievements.forEach(ach => {
    events.push({
      id: `achievement_${ach.achievementId}`,
      type: 'achievement',
      title: `${ach.title} Unlocked`,
      description: ach.description,
      date: ach.unlockedDate?.toISOString() || ach.createdAt.toISOString(),
      icon: ach.icon,
    });
  });

  // Get streak milestones
  const streakInfo = await calculateStreak(userId, partnerId);
  if (streakInfo.currentStreak >= 7) {
    events.push({
      id: 'streak_7d',
      type: 'streak',
      title: '7 Day Streak',
      description: 'Maintained your first 7-day streak',
      date: new Date().toISOString(),
      icon: '🔥',
    });
  }

  // Sort by date and return most recent 50
  return events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(0, 50);
}

export const getAchievementsData = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req.user as any)?.userId;
  if (!userId) {
    throw new AppError('Unauthorized', 401);
  }

  // Get user
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  // Get active partner
  const activePartner = user.partners?.find((p: any) => p.status === 'active');
  if (!activePartner) {
    const response: ApiResponse = {
      success: false,
      message: 'No partner found',
      error: 'NO_PARTNER',
    };
    return res.status(404).json(response);
  }

  const partnerId = activePartner.partnerId;
  const partner = await User.findById(partnerId);
  if (!partner) {
    throw new AppError('Partner not found', 404);
  }

  // Calculate statistics
  const coupleStats = await getCoupleStats(userId, partnerId);
  const streakInfo = await calculateStreak(userId, partnerId);

  // Calculate XP for both users
  const userXP = await calculateXP(userId, partnerId);
  const partnerXP = await calculateXP(partnerId, userId);

  // Calculate levels
  const userLevel = calculateLevel(userXP);
  const partnerLevel = calculateLevel(partnerXP);

  // Get achievements and badges
  const achievements = await getAchievements(userId, partnerId, coupleStats, streakInfo);
  const badges = await getBadges(userId, partnerId, coupleStats);

  // Get timeline events
  const timelineEvents = await getTimelineEvents(userId, partnerId);

  // Calculate couple level (combined XP)
  const coupleXP = userXP + partnerXP;
  const coupleLevel = calculateLevel(coupleXP);

  const response: ApiResponse = {
    success: true,
    message: 'Achievements data retrieved successfully',
    data: {
      user1: {
        id: (user._id as any).toString(),
        name: user.name,
        avatar: user.avatar || null,
        currentXP: userLevel.currentXP,
        level: userLevel.level,
        levelName: userLevel.levelName,
        totalXP: userXP,
      },
      user2: {
        id: (partner._id as any).toString(),
        name: partner.name,
        avatar: partner.avatar || null,
        currentXP: partnerLevel.currentXP,
        level: partnerLevel.level,
        levelName: partnerLevel.levelName,
        totalXP: partnerXP,
      },
      coupleStats,
      levelInfo: {
        level: coupleLevel.level,
        levelName: coupleLevel.levelName,
        currentXP: coupleLevel.currentXP,
        xpToNextLevel: coupleLevel.xpToNextLevel,
        totalXP: coupleXP,
      },
      streakInfo,
      achievements,
      badges,
      timelineEvents,
    },
  };

  return res.json(response);
});

