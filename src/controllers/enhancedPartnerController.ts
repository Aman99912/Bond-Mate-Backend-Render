import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { asyncHandler, AppError } from '@/middleware/errorHandler';
import { Partner, PartnerRequest, PartnerHistory, BreakupRequest } from '@/models/Partner';
import User from '@/models/User';
import partnerService from '@/services/partnerService';
import auditService from '@/services/auditService';
import enhancedNotificationService from '@/services/enhancedNotificationService';
import { getSocketHandler } from '@/socket/socketHandler';
import logger from '@/utils/logger';
import { body, validationResult } from 'express-validator';

/**
 * Enhanced partner request sending with comprehensive validation and security
 */
export const sendPartnerRequest = asyncHandler(async (req: Request, res: Response) => {
  const { toUserId, message } = req.body;
  const fromUserId = req.user?.userId || req.user?.id;

  // Validate input
  const validation = partnerService.validatePartnerRequest({ toUserId, message, fromUserId });
  if (!validation.isValid) {
    throw new AppError(`Validation failed: ${validation.errors.join(', ')}`, 400);
  }

  // Check if target user exists
  const targetUser = await User.findById(toUserId).select('name email pushToken partners');
  if (!targetUser) {
    throw new AppError('User not found', 404);
  }

  // Check partner assignment availability
  const assignmentCheck = await partnerService.checkPartnerAssignment(fromUserId, toUserId);
  if (!assignmentCheck.canAssign) {
    throw new AppError(assignmentCheck.reason, 400);
  }

  // Start transaction for atomic operations
  const session = await mongoose.startSession();
  
  try {
    await session.startTransaction();

    // Clean up any old requests between these users
    await partnerService.cleanupOldRequests(fromUserId, toUserId);

    // Create partner request
    const partnerRequest = await PartnerRequest.create([{
      fromUserId,
      toUserId,
      status: 'pending',
      message: message?.trim()
    }], { session });

    // Add to pendingRequests array of target user
    const fromUser = await User.findById(fromUserId).select('name email avatar dob gender').session(session);
    if (!fromUser) {
      throw new AppError('From user not found', 404);
    }

    const fromUserAge = fromUser.dob ? Math.floor((Date.now() - new Date(fromUser.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : undefined;
    
    await User.findByIdAndUpdate(toUserId, {
      $push: {
        pendingRequests: {
          requestId: (partnerRequest[0]._id as any).toString(),
          fromUserId: fromUserId,
          fromUserName: fromUser.name,
          fromUserEmail: fromUser.email,
          fromUserAvatar: fromUser.avatar,
          fromUserAge: fromUserAge,
          fromUserGender: fromUser.gender,
          status: 'pending',
          createdAt: new Date()
        }
      }
    }, { session });

    // Create history entries
    await PartnerHistory.create([{
      userId: fromUserId,
      partnerId: toUserId,
      action: 'request_sent',
      details: `Sent partner request to ${targetUser.name}`
    }, {
      userId: toUserId,
      partnerId: fromUserId,
      action: 'request_received',
      details: `Received partner request from ${fromUser.name}`
    }], { session });

    // Commit transaction
    await session.commitTransaction();

    // Send notification (outside transaction)
    const notificationResult = await enhancedNotificationService.sendPartnerRequestNotification(
      fromUserId,
      toUserId,
      fromUser.name
    );

    // Emit socket event
    const socketHandler = getSocketHandler();
    if (socketHandler) {
      socketHandler.emitToUser(toUserId, 'partner_request_received', {
        requestId: partnerRequest[0]._id,
        fromUserId,
        toUserId,
        fromUser: {
          _id: fromUserId,
          name: fromUser.name,
          email: fromUser.email,
          avatar: fromUser.avatar
        },
        toUser: {
          _id: toUserId,
          name: targetUser.name,
          email: targetUser.email
        },
        status: 'pending',
        createdAt: partnerRequest[0].createdAt,
        message: `${fromUser.name} sent you a partner request`
      });
    }

    // Log activity
    await auditService.logPartnerActivity({
      userId: fromUserId,
      targetUserId: toUserId,
      action: 'partner_request_sent',
      details: `Sent partner request to ${targetUser.name}`,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      metadata: {
        requestId: partnerRequest[0]._id,
        notificationSent: notificationResult.success
      }
    });

    res.status(201).json({
      success: true,
      message: 'Partner request sent successfully',
      data: {
        request: {
          id: partnerRequest[0]._id,
          fromUserId,
          toUserId,
          status: 'pending',
          message: message?.trim(),
          createdAt: partnerRequest[0].createdAt
        },
        notificationSent: notificationResult.success
      }
    });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
});

/**
 * Enhanced partner request acceptance with 30-day restoration logic
 */
export const acceptPartnerRequest = asyncHandler(async (req: Request, res: Response) => {
  const { requestId } = req.params;
  const userId = req.user?.userId || req.user?.id;

  // Start transaction for atomic operations
  const session = await mongoose.startSession();
  
  try {
    await session.startTransaction();

    // Handle both MongoDB ObjectId and custom ID formats
    let partnerRequest;
    let fromUserId;
    let toUserId = userId;

    if (mongoose.Types.ObjectId.isValid(requestId)) {
      // MongoDB ObjectId format
      partnerRequest = await PartnerRequest.findById(requestId).session(session);
      if (!partnerRequest) {
        throw new AppError('Request not found', 404);
      }
      fromUserId = partnerRequest.fromUserId;
    } else {
      // Custom ID format from pendingRequests array
      const user = await User.findById(userId).select('pendingRequests').session(session);
      if (!user) {
        throw new AppError('User not found', 404);
      }
      
      const pendingRequest = user.pendingRequests?.find(
        (req: any) => req.requestId === requestId
      );
      
      if (!pendingRequest) {
        throw new AppError('Request not found', 404);
      }
      
      if (pendingRequest.status !== 'pending') {
        throw new AppError('Request is not pending', 400);
      }
      
      fromUserId = pendingRequest.fromUserId;
    }

    // Check partner assignment availability
    const assignmentCheck = await partnerService.checkPartnerAssignment(fromUserId, toUserId);
    if (!assignmentCheck.canAssign) {
      throw new AppError(assignmentCheck.reason, 400);
    }

    // Check for 30-day restoration logic
    const restorationResult = await partnerService.checkPartnerRestoration(fromUserId, toUserId);
    
    const startedAt = restorationResult.shouldRestore && restorationResult.restoredFromDate 
      ? restorationResult.restoredFromDate 
      : new Date();

    // Create partner relationship
    const { partner, fromUser, toUser } = await partnerService.createPartnerRelationship(
      fromUserId,
      toUserId,
      startedAt,
      session
    );

    // Update request status if it's a MongoDB ObjectId
    if (partnerRequest) {
      partnerRequest.status = 'accepted';
      await partnerRequest.save({ session });
    }

    // Remove from pendingRequests arrays
    await Promise.all([
      User.findByIdAndUpdate(fromUserId, {
        $pull: { pendingRequests: { requestId: requestId } }
      }, { session }),
      User.findByIdAndUpdate(toUserId, {
        $pull: { pendingRequests: { requestId: requestId } }
      }, { session })
    ]);

    // Commit transaction
    await session.commitTransaction();

    // Send notifications (outside transaction)
    const notificationResult = await enhancedNotificationService.sendPartnerAcceptedNotification(
      fromUserId,
      toUserId,
      toUser.name
    );

    // Emit socket events
    const socketHandler = getSocketHandler();
    if (socketHandler) {
      // Notify sender about acceptance
      socketHandler.emitToUser(fromUserId, 'partner_request_accepted', {
        requestId: requestId,
        fromUserId,
        toUserId,
        fromUser: {
          _id: fromUserId,
          name: fromUser.name,
          email: fromUser.email,
          avatar: fromUser.avatar
        },
        toUser: {
          _id: toUserId,
          name: toUser.name,
          email: toUser.email,
          avatar: toUser.avatar
        },
        status: 'accepted',
        message: `${toUser.name} accepted your partner request`
      });
      
      // Emit partner_added events to trigger UI refresh
      socketHandler.emitToUser(fromUserId, 'partner_added', {
        userId: toUserId,
        partnerName: toUser.name,
        partnerAvatar: toUser.avatar,
        timestamp: startedAt,
        restored: restorationResult.shouldRestore
      });
      
      socketHandler.emitToUser(toUserId, 'partner_added', {
        userId: fromUserId,
        partnerName: fromUser.name,
        partnerAvatar: fromUser.avatar,
        timestamp: startedAt,
        restored: restorationResult.shouldRestore
      });
    }

    // Log activity
    await auditService.logPartnerActivity({
      userId: toUserId,
      targetUserId: fromUserId,
      action: 'partner_request_accepted',
      details: `Accepted partner request from ${fromUser.name}. ${restorationResult.reason}`,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      metadata: {
        requestId,
        startedAt,
        restored: restorationResult.shouldRestore,
        notificationSent: notificationResult.success
      }
    });

    res.json({
      success: true,
      message: 'Partner request accepted successfully',
      data: {
        requestId,
        partner: {
          id: partner._id,
          startedAt,
          restored: restorationResult.shouldRestore
        },
        notificationSent: notificationResult.success
      }
    });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
});

/**
 * Enhanced partner request rejection
 */
export const rejectPartnerRequest = asyncHandler(async (req: Request, res: Response) => {
  const { requestId } = req.params;
  const userId = req.user?.userId || req.user?.id;

  // Start transaction for atomic operations
  const session = await mongoose.startSession();
  
  try {
    await session.startTransaction();

    let fromUserId;
    let toUserId = userId;

    // Handle both MongoDB ObjectId and custom ID formats
    if (mongoose.Types.ObjectId.isValid(requestId)) {
      // MongoDB ObjectId format
      const partnerRequest = await PartnerRequest.findById(requestId).session(session);
      if (!partnerRequest) {
        throw new AppError('Request not found', 404);
      }
      
      if (partnerRequest.toUserId !== userId) {
        throw new AppError('You can only reject requests sent to you', 403);
      }
      
      if (partnerRequest.status !== 'pending') {
        throw new AppError('Request is not pending', 400);
      }
      
      fromUserId = partnerRequest.fromUserId;
      
      // Update request status
      partnerRequest.status = 'rejected';
      await partnerRequest.save({ session });
    } else {
      // Custom ID format from pendingRequests array
      const user = await User.findById(userId).select('pendingRequests').session(session);
      if (!user) {
        throw new AppError('User not found', 404);
      }
      
      const pendingRequest = user.pendingRequests?.find(
        (req: any) => req.requestId === requestId
      );
      
      if (!pendingRequest) {
        throw new AppError('Request not found', 404);
      }
      
      if (pendingRequest.status !== 'pending') {
        throw new AppError('Request is not pending', 400);
      }
      
      fromUserId = pendingRequest.fromUserId;
      
      // Update the request status in user's pendingRequests array
      await User.findByIdAndUpdate(userId, {
        $set: {
          'pendingRequests.$[elem].status': 'rejected'
        }
      }, {
        arrayFilters: [{ 'elem.requestId': requestId }],
        session
      });
    }

    // Remove from pendingRequests arrays
    await Promise.all([
      User.findByIdAndUpdate(fromUserId, {
        $pull: { pendingRequests: { requestId: requestId } }
      }, { session }),
      User.findByIdAndUpdate(toUserId, {
        $pull: { pendingRequests: { requestId: requestId } }
      }, { session })
    ]);

    // Create history entries
    await PartnerHistory.create([{
      userId: fromUserId,
      partnerId: toUserId,
      action: 'request_rejected',
      details: `Partner request rejected by ${userId}`
    }, {
      userId: toUserId,
      partnerId: fromUserId,
      action: 'request_rejected',
      details: `Rejected partner request from ${fromUserId}`
    }], { session });

    // Commit transaction
    await session.commitTransaction();

    // Get user details for notification
    const currentUser = await User.findById(userId).select('name email');
    const fromUser = await User.findById(fromUserId).select('name email');

    // Send notification
    const notificationResult = await enhancedNotificationService.sendPartnerRejectedNotification(
      fromUserId,
      toUserId,
      currentUser?.name || 'Someone'
    );

    // Emit socket event
    const socketHandler = getSocketHandler();
    if (socketHandler) {
      socketHandler.emitToUser(fromUserId, 'partner_request_rejected', {
        requestId: requestId,
        fromUserId,
        toUserId,
        fromUser: {
          _id: fromUserId,
          name: fromUser?.name,
          email: fromUser?.email
        },
        toUser: {
          _id: toUserId,
          name: currentUser?.name,
          email: currentUser?.email
        },
        status: 'rejected',
        message: `${currentUser?.name || 'Someone'} rejected your partner request`
      });
    }

    // Log activity
    await auditService.logPartnerActivity({
      userId: toUserId,
      targetUserId: fromUserId,
      action: 'partner_request_rejected',
      details: `Rejected partner request from ${fromUser?.name || fromUserId}`,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      metadata: {
        requestId,
        notificationSent: notificationResult.success
      }
    });

    res.json({
      success: true,
      message: 'Partner request rejected successfully',
      data: {
        requestId,
        notificationSent: notificationResult.success
      }
    });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
});

/**
 * Get partner requests with enhanced error handling
 */
export const getPartnerRequests = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId || req.user?.id;

  const user = await User.findById(userId).select('pendingRequests');
  if (!user) {
    throw new AppError('User not found', 404);
  }

  // Transform pendingRequests to match expected format
  const transformedRequests = (user.pendingRequests || []).map(request => ({
    id: request.requestId,
    fromUserId: request.fromUserId,
    toUserId: userId,
    status: request.status,
    createdAt: request.createdAt,
    fromUser: {
      _id: request.fromUserId,
      name: request.fromUserName,
      email: request.fromUserEmail,
      avatar: request.fromUserAvatar,
      dob: request.fromUserAge ? new Date(Date.now() - (request.fromUserAge * 365.25 * 24 * 60 * 60 * 1000)) : undefined,
      gender: request.fromUserGender
    },
    toUser: {
      _id: userId,
      name: user.name,
      email: user.email
    }
  }));

  res.json({
    success: true,
    message: 'Partner requests retrieved successfully',
    data: {
      requests: transformedRequests,
      total: transformedRequests.length
    }
  });
});

/**
 * Get current partner with enhanced error handling
 */
export const getCurrentPartner = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId || req.user?.id;

  const user = await User.findById(userId).select('partners');
  if (!user || !user.partners || user.partners.length === 0) {
    return res.json({
      success: true,
      message: 'No active partner found',
      data: {
        partner: null
      }
    });
  }

  // Find active partner
  const activePartner = user.partners.find(p => p.status === 'active');
  if (!activePartner) {
    return res.json({
      success: true,
      message: 'No active partner found',
      data: {
        partner: null
      }
    });
  }

  // Get full partner details
  const partner = await User.findById(activePartner.partnerId)
    .select('name email avatar dob gender bio UserSearchId');

  if (!partner) {
    return res.json({
      success: true,
      message: 'No active partner found',
      data: {
        partner: null
      }
    });
  }

  // Transform partner to include id field
  const transformedPartner = {
    ...partner.toObject(),
    id: (partner._id as any).toString()
  };

  res.json({
    success: true,
    message: 'Current partner retrieved successfully',
    data: {
      partner: transformedPartner,
      relationshipStartedAt: activePartner.startedAt
    }
  });
});

/**
 * Search users with enhanced security and rate limiting
 */
export const searchUsers = asyncHandler(async (req: Request, res: Response) => {
  const { searchId } = req.query;
  const currentUserId = req.user?.userId || req.user?.id;

  if (!searchId || typeof searchId !== 'string') {
    throw new AppError('Search ID is required', 400);
  }

  if (searchId.length < 3) {
    throw new AppError('Search ID must be at least 3 characters', 400);
  }

  // Search users by UserSearchId (partial match)
  const users = await User.find({
    UserSearchId: { $regex: searchId, $options: 'i' },
    _id: { $ne: currentUserId },
    isActive: true
  }).select('name email avatar dob gender UserSearchId bio createdAt');

  // Transform users to include relationship status
  const transformedUsers = await Promise.all(users.map(async (user) => {
    const userId = (user._id as any).toString();
    
    // Check if current user already has a partner
    const currentUser = await User.findById(currentUserId).select('partners');
    const hasCurrentUserPartner = currentUser?.partners?.filter(p => p.status === 'active').length > 0;
    
    // Check if target user already has a partner
    const targetUser = await User.findById(userId).select('partners');
    const hasTargetUserPartner = targetUser?.partners?.filter(p => p.status === 'active').length > 0;

    // Check for pending request
    const existingRequest = await PartnerRequest.findOne({
      $or: [
        { fromUserId: currentUserId, toUserId: userId },
        { fromUserId: userId, toUserId: currentUserId }
      ],
      status: 'pending'
    });

    let relationshipStatus = 'none';
    let buttonText = 'Send Request';
    let buttonDisabled = false;

    if (hasCurrentUserPartner) {
      relationshipStatus = 'has_partner';
      buttonText = 'Already Have Partner';
      buttonDisabled = true;
    } else if (hasTargetUserPartner) {
      relationshipStatus = 'target_has_partner';
      buttonText = 'User Has Partner';
      buttonDisabled = true;
    } else if (existingRequest) {
      if (existingRequest.fromUserId.toString() === currentUserId) {
        relationshipStatus = 'request_sent';
        buttonText = 'Request Sent';
        buttonDisabled = true;
      } else {
        relationshipStatus = 'request_received';
        buttonText = 'Respond to Request';
        buttonDisabled = false;
      }
    }

    return {
      ...user.toObject(),
      id: userId,
      relationshipStatus,
      buttonText,
      buttonDisabled
    };
  }));

  res.json({
    success: true,
    message: 'Users found successfully',
    data: {
      users: transformedUsers,
      total: transformedUsers.length
    }
  });
});

/**
 * Validation middleware for partner requests
 */
export const validatePartnerRequest = [
  body('toUserId')
    .notEmpty()
    .withMessage('Target user ID is required')
    .isMongoId()
    .withMessage('Invalid user ID format'),
  body('message')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Message cannot exceed 500 characters'),
  (req: Request, res: Response, next: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    next();
  }
];
