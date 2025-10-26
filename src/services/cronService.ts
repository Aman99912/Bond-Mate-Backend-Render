import cron from 'node-cron';
import { updateDailyStreaks } from '../controllers/profileController';

class CronService {
  private static instance: CronService;

  private constructor() {}

  public static getInstance(): CronService {
    if (!CronService.instance) {
      CronService.instance = new CronService();
    }
    return CronService.instance;
  }

  // Start all cron jobs
  public startCronJobs() {
    console.log('Starting cron jobs...');

    // Daily streak update - runs every day at 12:00 AM
    cron.schedule('0 0 * * *', async () => {
      console.log('Running daily streak update...');
      try {
        await updateDailyStreaks();
        console.log('Daily streak update completed successfully');
      } catch (error) {
        console.error('Error in daily streak update:', error);
      }
    }, {
      timezone: "UTC"
    });

    // Hourly check for missed logins - runs every hour
    cron.schedule('0 * * * *', async () => {
      console.log('Running hourly login check...');
      try {
        await this.checkMissedLogins();
        console.log('Hourly login check completed');
      } catch (error) {
        console.error('Error in hourly login check:', error);
      }
    }, {
      timezone: "UTC"
    });

    // Weekly streak reminder - runs every Sunday at 9:00 AM
    cron.schedule('0 9 * * 0', async () => {
      console.log('Running weekly streak reminder...');
      try {
        await this.sendWeeklyStreakReminders();
        console.log('Weekly streak reminder completed');
      } catch (error) {
        console.error('Error in weekly streak reminder:', error);
      }
    }, {
      timezone: "UTC"
    });

    // Memory reminders - runs daily at 8:00 AM
    cron.schedule('0 8 * * *', async () => {
      console.log('Running memory reminder check...');
      try {
        await this.sendMemoryReminders();
        console.log('Memory reminder check completed');
      } catch (error) {
        console.error('Error in memory reminder check:', error);
      }
    }, {
      timezone: "UTC"
    });

    console.log('All cron jobs started successfully');
  }

  // Check for missed logins and reset streaks if needed
  private async checkMissedLogins() {
    try {
      const User = require('../models/User').default;
      
      // Find all users with partners
      const usersWithPartners = await User.find({
        'currentPartner.partnerId': { $exists: true, $ne: null }
      });

      for (const user of usersWithPartners) {
        const partner = await User.findById(user.currentPartner.partnerId);
        
        if (partner) {
          const userLogin = user.lastLogin || user.updatedAt;
          const partnerLogin = partner.lastLogin || partner.updatedAt;
          
          // Check if either partner missed login for 24 hours
          const now = new Date();
          const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          
          const userMissedLogin = userLogin < twentyFourHoursAgo;
          const partnerMissedLogin = partnerLogin < twentyFourHoursAgo;
          
          if ((userMissedLogin || partnerMissedLogin) && user.streakDays > 0) {
            // Reset streak
            await User.findByIdAndUpdate(user._id, {
              streakDays: 0,
              streakUpdatedAt: new Date()
            });
            
            console.log(`Reset streak for user ${user.name} due to missed login`);
          }
        }
      }
    } catch (error) {
      console.error('Error checking missed logins:', error);
    }
  }

  // Send weekly streak reminders
  private async sendWeeklyStreakReminders() {
    try {
      const User = require('../models/User').default;
      const notificationService = require('./notificationService').default;
      
      // Find all users with partners
      const usersWithPartners = await User.find({
        'currentPartner.partnerId': { $exists: true, $ne: null }
      });

      for (const user of usersWithPartners) {
        const partner = await User.findById(user.currentPartner.partnerId);
        
        if (partner) {
          // Send reminder based on streak status
          if (user.streakDays === 0) {
            // No streak - encourage to start
            await notificationService.createNotification({
              userId: user._id.toString(),
              type: 'partner_invitation',
              title: '💕 Start Your Love Streak!',
              message: 'Begin your journey together by both logging in today!',
              data: { type: 'streak_reminder' }
            });
          } else if (user.streakDays >= 7) {
            // Strong streak - congratulate
            await notificationService.createNotification({
              userId: user._id.toString(),
              type: 'partner_invitation',
              title: '🔥 Amazing Streak!',
              message: `You've maintained a ${user.streakDays}-day streak! Keep it up!`,
              data: { type: 'streak_congratulations' }
            });
          } else {
            // Building streak - encourage
            await notificationService.createNotification({
              userId: user._id.toString(),
              type: 'partner_invitation',
              title: '💪 Keep Building Your Streak!',
              message: `You're on a ${user.streakDays}-day streak! Don't break it now!`,
              data: { type: 'streak_encouragement' }
            });
          }
        }
      }
    } catch (error) {
      console.error('Error sending weekly streak reminders:', error);
    }
  }

  // Send diary/calendar memory reminders
  private async sendMemoryReminders() {
    try {
      const User = require('../models/User').default;
      const DiaryEntry = require('../models/DiaryEntry').default;
      const CalendarNote = require('../models/CalendarNote').default;
      const notificationService = require('./notificationService').default;
      
      // Find all users with partners
      const usersWithPartners = await User.find({
        'partners': { $elemMatch: { status: 'active' } }
      });

      for (const user of usersWithPartners) {
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

        // Check diary entries
        const oldDiaryEntries = await DiaryEntry.find({
          userId: user._id,
          createdAt: { 
            $lte: oneMonthAgo,
            $gte: oneYearAgo
          }
        }).sort({ createdAt: -1 }).limit(1);

        if (oldDiaryEntries.length > 0) {
          const entry = oldDiaryEntries[0];
          const daysOld = Math.floor((Date.now() - new Date(entry.createdAt).getTime()) / (1000 * 60 * 60 * 24));
          
          let title = '📖 Memory from Diary';
          let message = '';
          
          if (daysOld >= 365) {
            title = '📖 One Year Memory!';
            message = `Remember this day from one year ago? Check your diary!`;
          } else if (daysOld >= 180) {
            title = '📖 Six Month Memory!';
            message = `Relive this memory from six months ago in your diary!`;
          } else if (daysOld >= 30) {
            title = '📖 One Month Memory!';
            message = `Take a trip down memory lane - check this entry from a month ago!`;
          }

          await notificationService.createNotification({
            userId: user._id.toString(),
            type: 'partner_invitation',
            title,
            message,
            data: { 
              type: 'memory_reminder',
              diaryId: entry._id.toString(),
              daysOld,
              screen: 'diary'
            }
          });
        }

        // Check calendar notes
        const oldCalendarNotes = await CalendarNote.find({
          userId: user._id,
          createdAt: { 
            $lte: oneMonthAgo,
            $gte: oneYearAgo
          }
        }).sort({ createdAt: -1 }).limit(1);

        if (oldCalendarNotes.length > 0) {
          const note = oldCalendarNotes[0];
          const daysOld = Math.floor((Date.now() - new Date(note.createdAt).getTime()) / (1000 * 60 * 60 * 24));
          
          let title = '📅 Memory from Calendar';
          let message = '';
          
          if (daysOld >= 365) {
            title = '📅 One Year Memory!';
            message = `Remember this day from one year ago? Check your calendar!`;
          } else if (daysOld >= 180) {
            title = '📅 Six Month Memory!';
            message = `Relive this memory from six months ago in your calendar!`;
          } else if (daysOld >= 30) {
            title = '📅 One Month Memory!';
            message = `Take a trip down memory lane - check this note from a month ago!`;
          }

          await notificationService.createNotification({
            userId: user._id.toString(),
            type: 'partner_invitation',
            title,
            message,
            data: { 
              type: 'memory_reminder',
              noteId: note._id.toString(),
              daysOld,
              screen: 'calendar'
            }
          });
        }
      }
    } catch (error) {
      console.error('Error sending memory reminders:', error);
    }
  }

  // Stop all cron jobs
  public stopCronJobs() {
    console.log('Stopping all cron jobs...');
    cron.getTasks().forEach(task => {
      task.destroy();
    });
    console.log('All cron jobs stopped');
  }
}

export default CronService.getInstance();
