import { Request, Response } from 'express';
import { asyncHandler, AppError } from '@/middleware/errorHandler';
import User from '@/models/User';
import { Partner } from '@/models/Partner';
import { PartnerRequest } from '@/models/Partner';
import Notification from '@/models/Notification';
import { PartnerHistory } from '@/models/Partner';

// Get dashboard data
export const getDashboardData = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;

  if (!userId) {
    throw new AppError('Authentication required', 401);
  }

  // Get user data
  const user = await User.findById(userId).select('name email avatar dob gender bio UserSearchId createdAt partners pendingRequests');
  
  if (!user) {
    throw new AppError('User not found', 404);
  }

  // Get current partner
  let currentPartner = null;
  let relationshipStartedAt = null;
  
  if (user.partners && user.partners.length > 0) {
    const activePartner = user.partners.find(p => p.status === 'active');
    if (activePartner) {
      const partnerUser = await User.findById(activePartner.partnerId)
        .select('name email avatar dob gender bio UserSearchId createdAt');
      
      if (partnerUser) {
        currentPartner = {
          ...partnerUser.toObject(),
          id: (partnerUser._id as any).toString(),
          createdAt: partnerUser.createdAt.toISOString()
        };
        relationshipStartedAt = activePartner.startedAt;
      }
    }
  }

  // Get partner requests (notifications)
  const partnerRequests = await PartnerRequest.find({
    $or: [
      { fromUserId: userId, status: 'pending' },
      { toUserId: userId, status: 'pending' }
    ]
  })
    .populate('fromUserId', 'name email avatar')
    .populate('toUserId', 'name email avatar')
    .sort({ createdAt: -1 });

  // Get recent notifications
  const notifications = await Notification.find({
    userId: userId
  })
    .sort({ createdAt: -1 })
    .limit(10);

  // Get relationship statistics
  const totalPartners = await Partner.countDocuments({
    $or: [
      { user1Id: userId },
      { user2Id: userId }
    ]
  });

  const activePartners = await Partner.countDocuments({
    $or: [
      { user1Id: userId, status: 'active' },
      { user2Id: userId, status: 'active' }
    ]
  });

  // Get recent activity (partner history)
  const recentActivity = await PartnerHistory.find({
    userId: userId
  })
    .populate('partnerId', 'name email avatar')
    .sort({ createdAt: -1 })
    .limit(5);

  // Calculate account age
  const accountAge = Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24));

  // Calculate user age
  const userAge = user.dob ? Math.floor((Date.now() - new Date(user.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : null;

  // Transform user data
  const transformedUser = {
    ...user.toObject(),
    id: (user._id as any).toString(),
    accountAge,
    userAge
  };

  // Transform partner requests
  const transformedRequests = partnerRequests.map(request => ({
    ...request.toObject(),
    id: (request._id as any).toString()
  }));

  // Transform notifications
  const transformedNotifications = notifications.map((notification) => ({
    ...notification.toObject(),
    id: (notification._id as any).toString()
  }));

  // Transform recent activity
  const transformedActivity = recentActivity.map(activity => ({
    ...activity.toObject(),
    id: (activity._id as any).toString()
  }));

  const dashboardData = {
    user: transformedUser,
    currentPartner,
    relationshipStartedAt,
    partnerRequests: transformedRequests,
    notifications: transformedNotifications,
    recentActivity: transformedActivity,
    statistics: {
      totalPartners,
      activePartners,
      accountAge,
      userAge,
      pendingRequests: user.pendingRequests?.length || 0
    }
  };

  res.json({
    success: true,
    message: 'Dashboard data retrieved successfully',
    data: dashboardData
  });
});

// Get quick stats for dashboard
export const getQuickStats = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;

  if (!userId) {
    throw new AppError('Authentication required', 401);
  }

  // Get user data
  const user = await User.findById(userId).select('partners pendingRequests createdAt');
  
  if (!user) {
    throw new AppError('User not found', 404);
  }

  // Get current partner status
  const hasPartner = user.partners && user.partners.length > 0 && 
    user.partners.some(p => p.status === 'active');

  // Get pending requests count
  const pendingRequestsCount = user.pendingRequests?.length || 0;

  // Get unread notifications count
  const unreadNotificationsCount = await Notification.countDocuments({
    userId: userId,
    read: false
  });

  // Calculate account age
  const accountAge = Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24));

  const quickStats = {
    hasPartner,
    pendingRequestsCount,
    unreadNotificationsCount,
    accountAge
  };

  res.json({
    success: true,
    message: 'Quick stats retrieved successfully',
    data: quickStats
  });
});
