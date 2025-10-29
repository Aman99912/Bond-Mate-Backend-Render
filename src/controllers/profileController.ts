import { Request, Response } from 'express';
import User from '../models/User';
import notificationService from '../services/notificationService';
import logger from '@/utils/logger';

// Helper function to check if both partners are active today
const areBothPartnersActiveToday = (userLogin: Date, partnerLogin: Date): boolean => {
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  
  const userToday = userLogin >= todayStart;
  const partnerToday = partnerLogin >= todayStart;
  
  return userToday && partnerToday;
};

// Helper function to check if either partner missed login for 24 hours
const hasPartnerMissedLogin = (userLogin: Date, partnerLogin: Date): boolean => {
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  
  return userLogin < twentyFourHoursAgo || partnerLogin < twentyFourHoursAgo;
};

// Helper function to calculate profile completion percentage
const calculateProfileCompletion = (user: any): number => {
  let completion = 0;
  const fields = [
    'name', 'email', 'avatar', 'bio', 'dob', 'gender', 
    'mobileNumber', 'relationshipStatus'
  ];
  
  fields.forEach(field => {
    if (user[field] && user[field] !== '') {
      completion += 100 / fields.length;
    }
  });
  
  return Math.round(completion);
};

// Helper function to generate sample data for realistic response
const generateSampleData = () => {
  const sampleAvatars = [
    'https://images.unsplash.com/photo-1494790108755-2616b612b786?w=150&h=150&fit=crop&crop=face',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face',
    'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&h=150&fit=crop&crop=face',
    'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face',
    'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&h=150&fit=crop&crop=face',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&h=150&fit=crop&crop=face'
  ];

  const sampleBios = [
    "Love exploring new places together 💕",
    "Coffee enthusiast and adventure seeker ☕",
    "Making memories one day at a time ✨",
    "Life is better when we're together 🌟",
    "Dreaming big, loving bigger 💖",
    "Creating our own little world 🏡"
  ];

  const sampleNames = [
    'Amandeep', 'Anjali', 'Rahul', 'Priya', 'Arjun', 'Kavya',
    'Vikram', 'Sneha', 'Rohit', 'Meera', 'Karan', 'Pooja'
  ];

  return {
    avatars: sampleAvatars,
    bios: sampleBios,
    names: sampleNames
  };
};

// Get user profile with partner info and streak data
export const getUserProfile = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    // Find user
    const user = await User.findById(userId).select('-password -subPassword');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Calculate profile completion
    const profileCompletion = calculateProfileCompletion(user);
    
    // Update profile completion if changed
    if (user.profileCompletionPercentage !== profileCompletion) {
      await User.findByIdAndUpdate(userId, { 
        profileCompletionPercentage: profileCompletion 
      });
    }

    // Prepare user profile data
    const userProfile = {
      id: user._id,
      name: user.name,
      avatar: user.avatar || 'https://images.unsplash.com/photo-1494790108755-2616b612b786?w=150&h=150&fit=crop&crop=face',
      bio: user.bio || "Love exploring new places together 💕",
      partnerId: user.currentPartner?.partnerId || null,
      profileCompletionPercentage: profileCompletion
    };

    let partnerProfile = null;
    let streakInfo = {
      days: user.streakDays,
      activeToday: false
    };
    let lastInteractionDate = user.lastInteractionDate;
    let notifications = user.notifications || [];

    // Check if user has a partner
    if (user.currentPartner?.partnerId) {
      const partner = await User.findById(user.currentPartner.partnerId).select('-password -subPassword');
      
      if (partner) {
        // Generate sample data for partner if needed
        const sampleData = generateSampleData();
        
        partnerProfile = {
          id: partner._id,
          name: partner.name || sampleData.names[Math.floor(Math.random() * sampleData.names.length)],
          avatar: partner.avatar || sampleData.avatars[Math.floor(Math.random() * sampleData.avatars.length)]
        };

        // Calculate streak logic
        const userLogin = user.lastLogin || user.updatedAt;
        const partnerLogin = partner.lastLogin || partner.updatedAt;
        
        // Check if both partners are active today
        const bothActiveToday = areBothPartnersActiveToday(userLogin, partnerLogin);
        
        // Check if either partner missed login for 24 hours
        const missedLogin = hasPartnerMissedLogin(userLogin, partnerLogin);
        
        // Update streak based on rules
        let newStreakDays = user.streakDays;
        let streakUpdated = false;
        
        if (bothActiveToday && !missedLogin) {
          // Both active today and no missed login - increment streak
          const today = new Date();
          const lastStreakUpdate = user.streakUpdatedAt || new Date(0);
          const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
          
          // Only increment if we haven't already updated today
          if (lastStreakUpdate < todayStart) {
            newStreakDays = user.streakDays + 1;
            streakUpdated = true;
          }
        } else if (missedLogin) {
          // Either partner missed login - reset streak
          newStreakDays = 0;
          streakUpdated = true;
        }
        
        // Update streak in database if changed
        if (streakUpdated) {
          await User.findByIdAndUpdate(userId, {
            streakDays: newStreakDays,
            streakUpdatedAt: new Date()
          });
          streakInfo.days = newStreakDays;
        }
        
        streakInfo.activeToday = bothActiveToday;
        
        // Set last interaction date if not set
        if (!lastInteractionDate) {
          lastInteractionDate = new Date();
          await User.findByIdAndUpdate(userId, { lastInteractionDate });
        }
        
        // Add streak-related notifications
        if (streakInfo.days > 0 && streakInfo.activeToday) {
          notifications.push(`🔥 Amazing! You've maintained your ${streakInfo.days}-day streak!`);
        } else if (streakInfo.days === 0 && !streakInfo.activeToday) {
          notifications.push("💔 Your streak was broken. Start a new one by both logging in today!");
        } else if (streakInfo.days > 0 && !streakInfo.activeToday) {
          notifications.push("⚠️ Don't break your streak! Both of you need to log in today.");
        }
      }
    } else {
      // No partner - add invitation notification
      notifications.push("💕 Ready to find your perfect match? Add a partner to start building memories together!");
    }

    // Prepare response
    const response = {
      success: true,
      data: {
        user: userProfile,
        partner: partnerProfile,
        streak: streakInfo,
        lastInteractionDate,
        notifications,
        invitePartnerButton: !user.currentPartner?.partnerId
      }
    };

    return res.json(response);

  } catch (error) {
    console.error('Error fetching user profile:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Send partner invitation notification
export const sendPartnerInvitation = async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;
    const { partnerEmail } = req.body;

    if (!userId || !partnerEmail) {
      return res.status(400).json({
        success: false,
        message: 'User ID and partner email are required'
      });
    }

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Find partner by email
    const partner = await User.findOne({ email: partnerEmail });
    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Partner not found with this email'
      });
    }

    // Check if partner already has a current partner
    if (partner.currentPartner?.partnerId) {
      return res.status(400).json({
        success: false,
        message: 'This user is already in a relationship'
      });
    }

    // Send partner invitation notification with Firebase
    await notificationService.sendPartnerInvitationNotification(
      userId,
      (partner._id as any).toString(),
      user.name,
      user.avatar
    );

    // Add to partner's pending requests
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await User.findByIdAndUpdate(partner._id, {
      $push: {
        pendingRequests: {
          requestId,
          fromUserId: userId,
          fromUserName: user.name,
          fromUserEmail: user.email,
          fromUserAvatar: user.avatar,
          status: 'pending',
          createdAt: new Date()
        }
      }
    });

    return res.json({
      success: true,
      message: 'Partner invitation sent successfully',
      data: {
        requestId,
        partnerName: partner.name
      }
    });

  } catch (error) {
    console.error('Error sending partner invitation:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Update user's last login
export const updateLastLogin = async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    await User.findByIdAndUpdate(userId, {
      lastLogin: new Date()
    });

    return res.json({
      success: true,
      message: 'Last login updated successfully'
    });

  } catch (error) {
    console.error('Error updating last login:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Update theme preference
export const updateTheme = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { theme } = req.body;
    const authenticatedUserId = req.user?.userId;

    // Security: Ensure user can only update their own theme
    if (userId !== authenticatedUserId) {
      res.status(403).json({
        success: false,
        message: 'Forbidden: You can only update your own theme'
      });
      return;
    }

    if (!theme) {
      res.status(400).json({
        success: false,
        message: 'Theme is required'
      });
      return;
    }

    // Validate theme values
    const validThemes = ['light', 'dark', 'water', 'love', 'sky', 'forest', 'custom'];
    if (!validThemes.includes(theme)) {
      res.status(400).json({
        success: false,
        message: `Invalid theme. Must be one of: ${validThemes.join(', ')}`
      });
      return;
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { selectedTheme: theme },
      { new: true, runValidators: true }
    ).select('-password -subPassword');

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
      return;
    }

    // Audit log
    logger.info('Theme updated', {
      userId: userId,
      theme: theme,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Theme updated successfully',
      data: {
        selectedTheme: user.selectedTheme
      }
    });
  } catch (error) {
    logger.error('Error updating theme:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get chat preferences (nickname + theme)
export const getChatPreferences = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const authenticatedUserId = req.user?.userId;

    // Security: User can only view their own preferences
    if (userId !== authenticatedUserId) {
      res.status(403).json({
        success: false,
        message: 'Forbidden: You can only view your own preferences'
      });
      return;
    }

    const user = await User.findById(userId).select('name avatar selectedTheme');
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
      return;
    }

    // Note: Nickname is fetched separately via nickname API
    res.json({
      success: true,
      data: {
        name: user.name,
        avatar: user.avatar,
        selectedTheme: user.selectedTheme || 'light'
      }
    });
  } catch (error) {
    logger.error('Error fetching chat preferences:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Daily streak update function (to be called by cron job)
export const updateDailyStreaks = async () => {
  try {
    console.log('Starting daily streak update...');
    
    // Find all users with partners
    const usersWithPartners = await User.find({
      'currentPartner.partnerId': { $exists: true, $ne: null }
    });

    for (const user of usersWithPartners) {
      const partner = await User.findById(user.currentPartner?.partnerId);
      
      if (partner) {
        const userLogin = user.lastLogin || user.updatedAt;
        const partnerLogin = partner.lastLogin || partner.updatedAt;
        
        // Check if both partners were active yesterday
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStart = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
        const yesterdayEnd = new Date(yesterdayStart.getTime() + 24 * 60 * 60 * 1000);
        
        const userActiveYesterday = userLogin >= yesterdayStart && userLogin < yesterdayEnd;
        const partnerActiveYesterday = partnerLogin >= yesterdayStart && partnerLogin < yesterdayEnd;
        
        if (userActiveYesterday && partnerActiveYesterday) {
          // Both were active yesterday - increment streak
          const lastStreakUpdate = user.streakUpdatedAt || new Date(0);
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          
          if (lastStreakUpdate < todayStart) {
            await User.findByIdAndUpdate(user._id, {
              streakDays: user.streakDays + 1,
              streakUpdatedAt: new Date()
            });
            
            console.log(`Updated streak for user ${user.name}: ${user.streakDays + 1} days`);
          }
        } else {
          // Either partner missed yesterday - reset streak
          if (user.streakDays > 0) {
            await User.findByIdAndUpdate(user._id, {
              streakDays: 0,
              streakUpdatedAt: new Date()
            });
            
            console.log(`Reset streak for user ${user.name} due to missed login`);
          }
        }
      }
    }
    
    console.log('Daily streak update completed');
  } catch (error) {
    console.error('Error in daily streak update:', error);
  }
};
