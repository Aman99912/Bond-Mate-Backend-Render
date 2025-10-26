import { Request, Response } from 'express';
import { asyncHandler, AppError } from '@/middleware/errorHandler';
import { Partner, PartnerRequest, PartnerHistory, BreakupRequest } from '@/models/Partner';
import User from '@/models/User';
import Notification from '@/models/Notification';
import mongoose from 'mongoose';
import { getSocketHandler } from '@/socket/socketHandler';
import NotificationService from '@/services/notificationService';

// Search users by UserSearchId
export const searchUsers = asyncHandler(async (req: Request, res: Response) => {
  const { searchId } = req.query;
  const currentUserId = req.user?.userId;

  console.log('Backend: searchUsers called with searchId:', searchId);
  console.log('Backend: req.headers.authorization:', req.headers.authorization ? 'Present' : 'Missing');
  console.log('Backend: req.user:', req.user);
  console.log('Backend: currentUserId:', currentUserId);

  if (!searchId || typeof searchId !== 'string') {
    throw new AppError('Search ID is required', 400);
  }

  if (!currentUserId) {
    throw new AppError('Authentication required', 401);
  }

  if (searchId.length < 3) {
    throw new AppError('Search ID must be at least 3 characters', 400);
  }

  // Search users by UserSearchId (partial match)
  const users = await User.find({
    UserSearchId: { $regex: searchId, $options: 'i' },
    _id: { $ne: currentUserId }, // Exclude current user
    isActive: true
  }).select('name email avatar dob gender UserSearchId bio createdAt');

  // Transform users to include id field and relationship status
  const transformedUsers = await Promise.all(users.map(async (user) => {
    const userId = (user._id as any).toString();
    
    console.log(`Checking relationship for user ${userId} (${user.name}) with current user ${currentUserId}`);
    
    // Check if current user already has a partner (using new partners array)
    const currentUser = await User.findById(currentUserId).select('partners');
    const hasCurrentUserPartner = currentUser?.partners && currentUser.partners.length > 0;
    
    // Check if target user already has a partner (using new partners array)
    const targetUser = await User.findById(userId).select('partners');
    const hasTargetUserPartner = targetUser?.partners && targetUser.partners.length > 0;

    console.log(`Current user has partner: ${hasCurrentUserPartner}, Target user has partner: ${hasTargetUserPartner}`);

    // Check if there's a pending request
    const existingRequest = await PartnerRequest.findOne({
      $or: [
        { fromUserId: currentUserId, toUserId: userId },
        { fromUserId: userId, toUserId: currentUserId }
      ],
      status: 'pending'
    });

    console.log(`Existing pending request for ${userId}:`, existingRequest ? {
      fromUserId: existingRequest.fromUserId,
      toUserId: existingRequest.toUserId,
      status: existingRequest.status,
      _id: existingRequest._id
    } : 'None');

    // Check if there's any request (accepted/rejected)
    const anyRequest = await PartnerRequest.findOne({
      $or: [
        { fromUserId: currentUserId, toUserId: userId },
        { fromUserId: userId, toUserId: currentUserId }
      ]
    }).sort({ createdAt: -1 });

    console.log(`Any request for ${userId}:`, anyRequest ? {
      fromUserId: anyRequest.fromUserId,
      toUserId: anyRequest.toUserId,
      status: anyRequest.status,
      _id: anyRequest._id
    } : 'None');

    // Debug: Check all requests between these users
    const allRequests = await PartnerRequest.find({
      $or: [
        { fromUserId: currentUserId, toUserId: userId },
        { fromUserId: userId, toUserId: currentUserId }
      ]
    }).sort({ createdAt: -1 });

    console.log(`All requests between ${currentUserId} and ${userId}:`, allRequests.map(req => ({
      fromUserId: req.fromUserId,
      toUserId: req.toUserId,
      status: req.status,
      _id: req._id,
      createdAt: req.createdAt
    })));

    let relationshipStatus = 'none';
    let buttonText = 'Send Request';
    let buttonDisabled = false;

    // Priority 1: Check if current user already has a partner
    if (hasCurrentUserPartner) {
      relationshipStatus = 'has_partner';
      buttonText = 'Already Have Partner';
      buttonDisabled = true;
      console.log('Current user already has partner');
    }
    // Priority 2: Check if target user already has a partner
    else if (hasTargetUserPartner) {
      relationshipStatus = 'target_has_partner';
      buttonText = 'User Has Partner';
      buttonDisabled = true;
      console.log('Target user already has partner');
    }
    // Priority 3: Check for pending request
    else if (existingRequest) {
      if (existingRequest.fromUserId.toString() === currentUserId) {
        relationshipStatus = 'request_sent';
        buttonText = 'Request Sent';
        buttonDisabled = true;
        console.log(`Setting ${userId} as request_sent (pending request found)`);
      } else {
        relationshipStatus = 'request_received';
        buttonText = 'Respond to Request';
        buttonDisabled = false;
        console.log(`Setting ${userId} as request_received (pending request found)`);
      }
    }
    // Priority 4: Check for any other request (accepted/rejected)
    else if (anyRequest) {
      if (anyRequest.status === 'rejected') {
        relationshipStatus = 'rejected';
        buttonText = 'Request Rejected';
        buttonDisabled = true;
        console.log(`Setting ${userId} as rejected`);
      } else if (anyRequest.status === 'accepted') {
        relationshipStatus = 'accepted';
        buttonText = 'Already Partners';
        buttonDisabled = true;
        console.log(`Setting ${userId} as accepted`);
      }
    }
    // Priority 5: No relationship found
    else {
      console.log(`Setting ${userId} as none - no relationship found`);
    }

    const result = {
      ...user.toObject(),
      id: userId,
      relationshipStatus,
      buttonText,
      buttonDisabled
    };

    console.log(`Final result for ${userId}:`, {
      relationshipStatus,
      buttonText,
      buttonDisabled
    });

    return result;
  }));

  console.log('Backend: Search results with relationship status:', transformedUsers);

  res.json({
    success: true,
    message: 'Users found successfully',
    data: {
      users: transformedUsers,
      total: transformedUsers.length
    }
  });
});

// Send partner request
export const sendPartnerRequest = asyncHandler(async (req: Request, res: Response) => {
  const { toUserId } = req.body;
  const fromUserId = req.user?.userId;

  console.log('Backend: sendPartnerRequest called with:', { toUserId, fromUserId });
  console.log('Backend: Request body:', req.body);
  console.log('Backend: User from token:', req.user);

  if (!toUserId) {
    console.error('Backend: toUserId is missing from request body');
    throw new AppError('Partner user ID is required', 400);
  }

  if (fromUserId === toUserId) {
    throw new AppError('Cannot send request to yourself', 400);
  }

  // Check if target user exists
  const targetUser = await User.findById(toUserId);
  if (!targetUser) {
    throw new AppError('User not found', 404);
  }

  // Check if current user already has a partner (using new partners array) - only check active partners
  const currentUser = await User.findById(fromUserId);
  const activePartners = currentUser?.partners?.filter(p => p.status === 'active') || [];
  if (activePartners.length > 0) {
    throw new AppError('You already have a partner. Cannot add more than one partner.', 400);
  }

  // Check if target user already has a partner (using new partners array) - only check active partners
  const targetActivePartners = targetUser.partners?.filter(p => p.status === 'active') || [];
  if (targetActivePartners.length > 0) {
    throw new AppError('This user already has a partner', 400);
  }

  // Check if there's already a pending request between these users
  const existingRequest = await PartnerRequest.findOne({
    $or: [
      { fromUserId, toUserId },
      { fromUserId: toUserId, toUserId: fromUserId }
    ],
    status: 'pending'
  });

  if (existingRequest) {
    throw new AppError('A request already exists between these users', 400);
  }

  // Create partner request
  const partnerRequest = await PartnerRequest.create({
    fromUserId,
    toUserId,
    status: 'pending'
  });

  // Add to pendingRequests array of target user
  const fromUserAge = currentUser?.dob ? Math.floor((Date.now() - new Date(currentUser.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : undefined;
  
  await User.findByIdAndUpdate(toUserId, {
    $push: {
      pendingRequests: {
        requestId: (partnerRequest._id as any).toString(),
        fromUserId: fromUserId,
        fromUserName: currentUser?.name || '',
        fromUserEmail: currentUser?.email || '',
        fromUserAvatar: currentUser?.avatar,
        fromUserAge: fromUserAge,
        fromUserGender: currentUser?.gender,
        status: 'pending',
        createdAt: new Date()
      }
    }
  });

  console.log('Added request to pendingRequests array');

  // Add to history
  await PartnerHistory.create({
    userId: fromUserId,
    partnerId: toUserId,
    action: 'request_sent',
    details: `Sent partner request to ${targetUser.name}`
  });

  await PartnerHistory.create({
    userId: toUserId,
    partnerId: fromUserId,
    action: 'request_received',
    details: `Received partner request from ${req.user?.email}`
  });

  // Create notification for target user using NotificationService
  await NotificationService.sendPartnerRequestNotification(
    fromUserId!,
    toUserId,
    currentUser?.name || 'Someone'
  );

  // Populate user data
  await partnerRequest.populate([
    { path: 'fromUserId', select: 'name email avatar', model: 'User' },
    { path: 'toUserId', select: 'name email avatar', model: 'User' }
  ]);

  // Transform request to include id field
  const transformedRequest = {
    ...partnerRequest.toObject(),
    id: (partnerRequest._id as any).toString()
  };

  // Emit socket event for real-time notification
  const socketHandler = getSocketHandler();
  if (socketHandler) {
    // Get user details for notification
    const fromUserDetails = await User.findById(fromUserId).select('name email avatar dob gender');
    
    socketHandler.emitToUser(toUserId, 'partner_request_received', {
      requestId: partnerRequest._id,
      fromUserId,
      toUserId,
      fromUser: fromUserDetails,
      toUser: targetUser,
      status: 'pending',
      createdAt: partnerRequest.createdAt,
      message: `${fromUserDetails?.name || 'Someone'} sent you a partner request`
    });
    
    console.log('Socket notification sent to user:', toUserId);
  }

  res.status(201).json({
    success: true,
    message: 'Partner request sent successfully',
    data: {
      request: transformedRequest
    }
  });
});

// Get partner requests (sent and received)
export const getPartnerRequests = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;

  console.log('Backend: getPartnerRequests called for user:', userId);

  // Get user with pendingRequests
  const user = await User.findById(userId).select('pendingRequests');
  
  if (!user) {
    throw new AppError('User not found', 404);
  }

  console.log('Backend: Found pendingRequests:', user.pendingRequests?.length || 0);

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

  console.log('Backend: Transformed requests:', transformedRequests);

  res.json({
    success: true,
    message: 'Partner requests retrieved successfully',
    data: {
      requests: transformedRequests,
      total: transformedRequests.length
    }
  });
});

// Accept partner request
export const acceptPartnerRequest = asyncHandler(async (req: Request, res: Response) => {
  const { requestId } = req.params;
  const userId = req.user?.userId;

  if (!userId) {
    throw new AppError('User not authenticated', 401);
  }

  // Handle custom ID format from pendingRequests array
  if (!mongoose.Types.ObjectId.isValid(requestId)) {
    try {
      // This is a custom ID from pendingRequests array
      const user = await User.findById(userId!).select('pendingRequests');
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
    
    // Check if current user already has a partner - only check active partners
    const userActivePartners = user.partners?.filter((p: any) => p.status === 'active') || [];
    if (userActivePartners.length > 0) {
      throw new AppError('You already have a partner. Cannot add more than one partner.', 400);
    }
    
    // Check if sender already has a partner - only check active partners
    const fromUser = await User.findById(pendingRequest.fromUserId).select('partners');
    const fromUserActivePartners = fromUser?.partners?.filter((p: any) => p.status === 'active') || [];
    if (fromUserActivePartners.length > 0) {
      throw new AppError('This user already has a partner', 400);
    }
    
    // Get user details
    const toUser = await User.findById(userId).select('name email avatar dob gender bio');
    const fromUserDetails = await User.findById(pendingRequest.fromUserId).select('name email avatar dob gender bio');
    
    if (!fromUserDetails || !toUser || !toUser.name) {
      throw new AppError('User not found or invalid user data', 404);
    }
    
    // 🔄 CHECK FOR PREVIOUS RELATIONSHIP - 30 DAY RESTORATION LOGIC
    const FROM_USER_ID = pendingRequest.fromUserId;
    const TO_USER_ID = userId;
    
    // Check if they have a previous relationship in exPartners
    const fromUserData = await User.findById(FROM_USER_ID).select('exPartners');
    const previousRelationship = fromUserData?.exPartners?.find(
      (ex: any) => ex.partnerId === TO_USER_ID
    );
    
    let shouldRestoreData = false;
    let restoredFromDate = null;
    
    if (previousRelationship && previousRelationship.breakupDate) {
      const breakupDate = new Date(previousRelationship.breakupDate);
      const daysSinceBreakup = Math.floor((Date.now() - breakupDate.getTime()) / (1000 * 60 * 60 * 24));
      
      console.log(`Previous relationship found. Days since breakup: ${daysSinceBreakup}`);
      
      if (daysSinceBreakup <= 30) {
        shouldRestoreData = true;
        restoredFromDate = previousRelationship.startedAt;
        console.log('✅ RESTORATION: Data will be restored (within 30 days)');
      } else {
        // Mark old data as archived after 30 days
        await User.findByIdAndUpdate(FROM_USER_ID, {
          $set: { 'exPartners.$[elem].dataArchived': true }
        }, {
          arrayFilters: [{ 'elem.partnerId': TO_USER_ID }]
        });
        
        await User.findByIdAndUpdate(TO_USER_ID, {
          $set: { 'exPartners.$[elem].dataArchived': true }
        }, {
          arrayFilters: [{ 'elem.partnerId': FROM_USER_ID }]
        });
        
        console.log('🆕 NEW START: Data will be fresh (over 30 days)');
      }
    }
    
    // Create partner relationship
    const startedAt = shouldRestoreData && restoredFromDate ? restoredFromDate : new Date();
    const toUserAge = toUser?.dob ? Math.floor((Date.now() - new Date(toUser.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : undefined;
    const fromUserAge = fromUserDetails?.dob ? Math.floor((Date.now() - new Date(fromUserDetails.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : undefined;
    
    // Add to partners array for both users
    await User.findByIdAndUpdate(pendingRequest.fromUserId, {
      $push: {
        partners: {
          partnerId: userId,
          partnerName: toUser?.name || '',
          partnerEmail: toUser?.email || '',
          partnerAvatar: toUser?.avatar,
          partnerAge: toUserAge,
          partnerGender: toUser?.gender,
          startedAt: startedAt,
          status: 'active'
        }
      }
    });
    
    await User.findByIdAndUpdate(userId, {
      $push: {
        partners: {
          partnerId: pendingRequest.fromUserId,
          partnerName: fromUserDetails?.name || '',
          partnerEmail: fromUserDetails?.email || '',
          partnerAvatar: fromUserDetails?.avatar,
          partnerAge: fromUserAge,
          partnerGender: fromUserDetails?.gender,
          startedAt: startedAt,
          status: 'active'
        }
      }
    });
    
    // Remove from pendingRequests arrays
    await User.findByIdAndUpdate(pendingRequest.fromUserId, {
      $pull: { pendingRequests: { requestId: requestId } }
    });
    
    await User.findByIdAndUpdate(userId, {
      $pull: { pendingRequests: { requestId: requestId } }
    });
    
    // Add history
    await PartnerHistory.create([{
      userId: pendingRequest.fromUserId,
      partnerId: userId,
      action: 'request_accepted',
      details: `Partner request accepted by ${toUser?.name || userId}`
    }, {
      userId: userId,
      partnerId: pendingRequest.fromUserId,
      action: 'relationship_started',
      details: `Started relationship with ${fromUserDetails?.name || pendingRequest.fromUserId}`
    }]);
    
    // Send notification
    await NotificationService.sendPartnerAcceptedNotification(
      pendingRequest.fromUserId,
      userId!,
      toUser.name
    );
    
    // Emit socket event
    const socketHandler = getSocketHandler();
    if (socketHandler) {
      socketHandler.emitToUser(pendingRequest.fromUserId, 'partner_request_accepted', {
        requestId: requestId,
        fromUserId: pendingRequest.fromUserId,
        toUserId: userId,
        fromUser: fromUserDetails,
        toUser: toUser,
        status: 'accepted',
        message: `${toUser?.name || 'Someone'} accepted your partner request`
      });
    }
    
    return res.json({
      success: true,
      message: 'Partner request accepted successfully',
      data: { requestId }
    });
    } catch (error) {
      console.error('Error in custom ID accept flow:', error);
      throw error;
    }
  }

  // For MongoDB ObjectId - handle normally
  const request = await PartnerRequest.findById(requestId);
  
  if (!request) {
    throw new AppError('Request not found', 404);
  }

  if (request.toUserId !== userId) {
    throw new AppError('You can only accept requests sent to you', 403);
  }

  if (request.status !== 'pending') {
    throw new AppError('Request is not pending', 400);
  }

  // Check if current user already has a partner (using new partners array) - only check active partners
  const currentUser = await User.findById(userId);
  const userActivePartners = currentUser?.partners?.filter(p => p.status === 'active') || [];
  if (userActivePartners.length > 0) {
    throw new AppError('You already have a partner. Cannot add more than one partner.', 400);
  }

  // Get user details for both users
  const fromUser = await User.findById(request.fromUserId);
  const toUser = await User.findById(request.toUserId);

  // Check if sender already has a partner (using new partners array) - only check active partners
  const fromUserActivePartners = fromUser?.partners?.filter(p => p.status === 'active') || [];
  if (fromUserActivePartners.length > 0) {
    throw new AppError('This user already has a partner', 400);
  }

  if (!fromUser || !toUser) {
    throw new AppError('User not found', 404);
  }

  try {
    // 🔄 CHECK FOR PREVIOUS RELATIONSHIP - 30 DAY RESTORATION LOGIC
    const FROM_USER_ID = request.fromUserId;
    const TO_USER_ID = request.toUserId;
    
    // Check if they have a previous relationship in exPartners
    const fromUserData = await User.findById(FROM_USER_ID).select('exPartners');
    const previousRelationship = fromUserData?.exPartners?.find(
      (ex: any) => ex.partnerId === TO_USER_ID
    );
    
    let shouldRestoreData = false;
    let restoredFromDate = null;
    
    if (previousRelationship && previousRelationship.breakupDate) {
      const breakupDate = new Date(previousRelationship.breakupDate);
      const daysSinceBreakup = Math.floor((Date.now() - breakupDate.getTime()) / (1000 * 60 * 60 * 24));
      
      console.log(`Previous relationship found. Days since breakup: ${daysSinceBreakup}`);
      
      if (daysSinceBreakup <= 30) {
        shouldRestoreData = true;
        restoredFromDate = previousRelationship.startedAt;
        console.log('✅ RESTORATION: Data will be restored (within 30 days)');
      } else {
        // Mark old data as archived after 30 days
        await User.findByIdAndUpdate(FROM_USER_ID, {
          $set: { 'exPartners.$[elem].dataArchived': true }
        }, {
          arrayFilters: [{ 'elem.partnerId': TO_USER_ID }]
        });
        
        await User.findByIdAndUpdate(TO_USER_ID, {
          $set: { 'exPartners.$[elem].dataArchived': true }
        }, {
          arrayFilters: [{ 'elem.partnerId': FROM_USER_ID }]
        });
        
        console.log('🆕 NEW START: Data will be fresh (over 30 days)');
      }
    }
    
    // Update request status
    request.status = 'accepted';
    await request.save();

    // Create partner relationship
    const partner = await Partner.create([{
      user1Id: request.fromUserId,
      user2Id: request.toUserId,
      status: 'active',
      startedAt: shouldRestoreData && restoredFromDate ? restoredFromDate : new Date()
    }]);

    console.log('Partner relationship created:', partner);

    // Update both users with partner information
    const startedAt = shouldRestoreData && restoredFromDate ? restoredFromDate : new Date();
    const toUserAge = toUser?.dob ? Math.floor((Date.now() - new Date(toUser.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : undefined;
    const fromUserAge = fromUser?.dob ? Math.floor((Date.now() - new Date(fromUser.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : undefined;
    
    // Add to partners array for both users
    await User.findByIdAndUpdate(request.fromUserId, {
      $push: {
        partners: {
          partnerId: request.toUserId,
          partnerName: toUser?.name || '',
          partnerEmail: toUser?.email || '',
          partnerAvatar: toUser?.avatar,
          partnerAge: toUserAge,
          partnerGender: toUser?.gender,
          startedAt: startedAt,
          status: 'active'
        }
      }
    });

    await User.findByIdAndUpdate(request.toUserId, {
      $push: {
        partners: {
          partnerId: request.fromUserId,
          partnerName: fromUser?.name || '',
          partnerEmail: fromUser?.email || '',
          partnerAvatar: fromUser?.avatar,
          partnerAge: fromUserAge,
          partnerGender: fromUser?.gender,
          startedAt: startedAt,
          status: 'active'
        }
      }
    });

    // Remove from pendingRequests array of both users
    await User.findByIdAndUpdate(request.fromUserId, {
      $pull: {
        pendingRequests: { requestId: requestId }
      }
    });

    await User.findByIdAndUpdate(request.toUserId, {
      $pull: {
        pendingRequests: { requestId: requestId }
      }
    });

    console.log('Users updated with partner information');

    // Add to history
    await PartnerHistory.create([{
      userId: request.fromUserId,
      partnerId: request.toUserId,
      action: 'request_accepted',
      details: `Partner request accepted by ${req.user?.email}`
    }, {
      userId: request.toUserId,
      partnerId: request.fromUserId,
      action: 'relationship_started',
      details: `Started relationship with ${req.user?.email}`
    }]);

    console.log('Partner history created');

    // Create notification for sender using NotificationService
    await NotificationService.sendPartnerAcceptedNotification(
      request.fromUserId,
      request.toUserId,
      toUser?.name || 'Someone'
    );

    console.log('Notification created');

    console.log('Accept operation completed successfully');

    // Populate user data
    await request.populate([
      { path: 'fromUserId', select: 'name email avatar', model: 'User' },
      { path: 'toUserId', select: 'name email avatar', model: 'User' }
    ]);

    // Transform request to include id field
    const transformedRequest = {
      ...request.toObject(),
      id: (request._id as any).toString()
    };

    // Emit socket event for real-time notification
    const socketHandler = getSocketHandler();
    if (socketHandler) {
      // Get user details for notification
      const toUserDetails = await User.findById(request.toUserId).select('name email avatar');
      
      socketHandler.emitToUser(request.fromUserId, 'partner_request_accepted', {
        requestId: request._id,
        fromUserId: request.fromUserId,
        toUserId: request.toUserId,
        fromUser: request.fromUserId,
        toUser: toUserDetails,
        status: 'accepted',
        createdAt: request.createdAt,
        message: `${toUserDetails?.name || 'Someone'} accepted your partner request`
      });
      
      console.log('Socket notification sent for accepted request to user:', request.fromUserId);
    }

    return res.json({
      success: true,
      message: 'Partner request accepted successfully',
      data: {
        request: transformedRequest
      }
    });
  } catch (error) {
    console.error('Error in acceptPartnerRequest:', error);
    
    // Provide more specific error message
    if (error instanceof Error) {
      throw new AppError(`Database operation failed: ${error.message}`, 500);
    } else {
      throw new AppError('Database operation failed', 500);
    }
  }
});

// Reject partner request
export const rejectPartnerRequest = asyncHandler(async (req: Request, res: Response) => {
  const { requestId } = req.params;
  const userId = req.user?.userId;

  if (!userId) {
    throw new AppError('User not authenticated', 401);
  }

  // Handle custom ID format from pendingRequests array
  if (!mongoose.Types.ObjectId.isValid(requestId)) {
    try {
      // This is a custom ID from pendingRequests array, not PartnerRequest collection
      // We need to find the request from the user's pendingRequests array
      const user = await User.findById(userId!).select('pendingRequests');
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
    
    // Update the request directly in user's pendingRequests array
    await User.findByIdAndUpdate(userId, {
      $set: {
        'pendingRequests.$[elem].status': 'rejected'
      }
    }, {
      arrayFilters: [{ 'elem.requestId': requestId }]
    });
    
    // Remove from sender's pendingRequests as well
    await User.findByIdAndUpdate(pendingRequest.fromUserId, {
      $pull: {
        pendingRequests: { requestId: requestId }
      }
    });
    
    // Create history
    await PartnerHistory.create([{
      userId: pendingRequest.fromUserId,
      partnerId: userId,
      action: 'request_rejected',
      details: `Partner request rejected by ${userId}`
    }, {
      userId: userId,
      partnerId: pendingRequest.fromUserId,
      action: 'request_rejected',
      details: `Rejected partner request from ${pendingRequest.fromUserId}`
    }]);
    
    // Send notification
    const currentUser = await User.findById(userId!).select('name email');
    if (currentUser && currentUser.name) {
      await NotificationService.sendPartnerRejectedNotification(
        pendingRequest.fromUserId,
        userId!,
        currentUser.name
      );
    }
    
    // Emit socket event
    const socketHandler = getSocketHandler();
    if (socketHandler) {
      socketHandler.emitToUser(pendingRequest.fromUserId, 'partner_request_rejected', {
        requestId: requestId,
        fromUserId: pendingRequest.fromUserId,
        toUserId: userId,
        fromUser: { name: pendingRequest.fromUserName },
        toUser: { name: currentUser?.name },
        status: 'rejected',
        message: `${currentUser?.name || 'Someone'} rejected your partner request`
      });
    }
    
    return res.json({
      success: true,
      message: 'Partner request rejected successfully',
      data: { requestId }
    });
    } catch (error) {
      console.error('Error in custom ID reject flow:', error);
      throw error;
    }
  }

  // For MongoDB ObjectId - handle normally
  const request = await PartnerRequest.findById(requestId);
  
  if (!request) {
    throw new AppError('Request not found', 404);
  }

  if (request.toUserId !== userId) {
    throw new AppError('You can only reject requests sent to you', 403);
  }

  if (request.status !== 'pending') {
    throw new AppError('Request is not pending', 400);
  }

  // Get user details for both users
  const fromUser = await User.findById(request.fromUserId);
  const toUser = await User.findById(request.toUserId);

  if (!fromUser || !toUser) {
    throw new AppError('User not found', 404);
  }

  try {
    // Update request status
    request.status = 'rejected';
    await request.save();

    // Remove from pendingRequests array of both users
    await User.findByIdAndUpdate(request.fromUserId, {
      $pull: {
        pendingRequests: { requestId: requestId }
      }
    });

    await User.findByIdAndUpdate(request.toUserId, {
      $pull: {
        pendingRequests: { requestId: requestId }
      }
    });

    console.log('Request removed from pendingRequests arrays');

    // Add to history
    await PartnerHistory.create([{
      userId: request.fromUserId,
      partnerId: request.toUserId,
      action: 'request_rejected',
      details: `Partner request rejected by ${req.user?.email}`
    }, {
      userId: request.toUserId,
      partnerId: request.fromUserId,
      action: 'request_rejected',
      details: `Rejected partner request from ${req.user?.email}`
    }]);

    // Create notification for sender using NotificationService
    await NotificationService.sendPartnerRejectedNotification(
      request.fromUserId,
      request.toUserId,
      toUser?.name || 'Someone'
    );

    console.log('Reject operation completed successfully');

    // Populate user data
    await request.populate([
      { path: 'fromUserId', select: 'name email avatar', model: 'User' },
      { path: 'toUserId', select: 'name email avatar', model: 'User' }
    ]);

    // Transform request to include id field
    const transformedRequest = {
      ...request.toObject(),
      id: (request._id as any).toString()
    };

    // Emit socket event for real-time notification
    const socketHandler = getSocketHandler();
    if (socketHandler) {
      // Get user details for notification
      const toUserDetails = await User.findById(request.toUserId).select('name email avatar');
      
      socketHandler.emitToUser(request.fromUserId, 'partner_request_rejected', {
        requestId: request._id,
        fromUserId: request.fromUserId,
        toUserId: request.toUserId,
        fromUser: request.fromUserId,
        toUser: toUserDetails,
        status: 'rejected',
        createdAt: request.createdAt,
        message: `${toUserDetails?.name || 'Someone'} rejected your partner request`
      });
      
      console.log('Socket notification sent for rejected request to user:', request.fromUserId);
    }

    return res.json({
      success: true,
      message: 'Partner request rejected successfully',
      data: {
        request: transformedRequest
      }
    });
  } catch (error) {
    console.error('Error in rejectPartnerRequest:', error);
    
    // Provide more specific error message
    if (error instanceof Error) {
      throw new AppError(`Database operation failed: ${error.message}`, 500);
    } else {
      throw new AppError('Database operation failed', 500);
    }
  }
});

// Cancel partner request
export const cancelPartnerRequest = asyncHandler(async (req: Request, res: Response) => {
  const { requestId } = req.params;
  const userId = req.user?.userId;

  const request = await PartnerRequest.findById(requestId);
  if (!request) {
    throw new AppError('Request not found', 404);
  }

  if (request.fromUserId !== userId) {
    throw new AppError('You can only cancel requests sent by you', 403);
  }

  if (request.status !== 'pending') {
    throw new AppError('Request is not pending', 400);
  }

  // Update request status
  request.status = 'cancelled';
  await request.save();

  // Add to history
  await PartnerHistory.create({
    userId: request.fromUserId,
    partnerId: request.toUserId,
    action: 'request_cancelled',
    details: `Partner request cancelled by ${req.user?.email}`
  });

  res.json({
    success: true,
    message: 'Partner request cancelled successfully'
  });
});

// Get current partner
export const getCurrentPartner = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;

  console.log('getCurrentPartner called for userId:', userId);

  const user = await User.findById(userId).select('partners');
  console.log('User found:', !!user);
  console.log('User partners:', user?.partners);

  if (!user || !user.partners || user.partners.length === 0) {
    console.log('No partners found, returning null');
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

  return res.json({
    success: true,
    message: 'Current partner retrieved successfully',
    data: {
      partner: transformedPartner,
      relationshipStartedAt: activePartner.startedAt
    }
  });
});

// Send breakup request (request to end relationship)
export const removePartner = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const { reason } = req.body;

  console.log('Backend: removePartner (send breakup request) called for userId:', userId);

  // Get current user with partners array
  const currentUser = await User.findById(userId).select('partners name email');
  
  if (!currentUser || !currentUser.partners || currentUser.partners.length === 0) {
    throw new AppError('No active relationship found', 404);
  }

  // Find active partner
  const activePartner = currentUser.partners.find(p => p.status === 'active');
  
  if (!activePartner) {
    throw new AppError('No active relationship found', 404);
  }

  const partnerId = activePartner.partnerId;
  
  console.log('Backend: Found active partner:', partnerId);

  // Get partner user details
  const partnerUser = await User.findById(partnerId).select('name email pushToken');
  
  if (!partnerUser) {
    throw new AppError('Partner user not found', 404);
  }

  // Check if breakup request already exists
  const existingRequest = await BreakupRequest.findOne({
    $or: [
      { fromUserId: userId, toUserId: partnerId, status: 'pending' },
      { fromUserId: partnerId, toUserId: userId, status: 'pending' }
    ]
  });

  if (existingRequest) {
    throw new AppError('Breakup request already sent', 400);
  }

  try {
    const endedAt = new Date();
    const endedReason = reason || 'Wants to end the relationship';

    // Create breakup request
    const breakupRequest = await BreakupRequest.create({
      fromUserId: userId,
      toUserId: partnerId,
      status: 'pending',
      reason: endedReason
    });

    console.log('Backend: Created breakup request:', breakupRequest._id);
    
    const breakupRequestId = (breakupRequest._id as any).toString();

    // Add to history for current user
    await PartnerHistory.create({
      userId: userId,
      partnerId: partnerId,
      action: 'relationship_ended',
      details: `Sent breakup request to ${partnerUser.name}. Reason: ${endedReason}`
    });

    console.log('Backend: Added to partner history');

    // Send notification to partner user
    await NotificationService.sendBreakupRequestNotification(
      userId!,
      partnerId,
      currentUser.name || 'Someone',
      endedReason,
      breakupRequestId
    );

    // Emit socket event
    const socketHandler = getSocketHandler();
    if (socketHandler) {
      const requestId = (breakupRequest._id as any).toString();
      socketHandler.emitToUser(partnerId, 'breakup_request_received', {
        requestId: requestId,
        fromUserId: userId,
        toUserId: partnerId,
        reason: endedReason,
        fromUserName: currentUser.name,
        fromUserEmail: currentUser.email,
        fromUser: {
          _id: userId,
          name: currentUser.name,
          email: currentUser.email
        }
      });
      console.log('Socket notification sent to user:', partnerId);
    }

    res.json({
      success: true,
      message: 'Breakup request sent successfully',
      data: {
        requestId: breakupRequest._id,
        sentAt: endedAt,
        reason: endedReason
      }
    });
  } catch (error) {
    console.error('Backend: Error in removePartner:', error);
    
    if (error instanceof Error) {
      throw new AppError(`Database operation failed: ${error.message}`, 500);
    } else {
      throw new AppError('Database operation failed', 500);
    }
  }
});

// Accept breakup request (actually break the relationship)
export const acceptBreakup = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const { requestId } = req.params;

  console.log('Backend: acceptBreakup called for userId:', userId, 'requestId:', requestId);

  const breakupRequest = await BreakupRequest.findById(requestId);
  
  if (!breakupRequest) {
    throw new AppError('Breakup request not found', 404);
  }

  if (breakupRequest.toUserId !== userId) {
    throw new AppError('You can only accept breakup requests sent to you', 403);
  }

  if (breakupRequest.status !== 'pending') {
    throw new AppError('Breakup request is not pending', 400);
  }

  try {
    // Get both users
    const currentUser = await User.findById(userId).select('name email');
    const partnerUser = await User.findById(breakupRequest.fromUserId).select('partners name email');
    
    if (!currentUser || !partnerUser) {
      throw new AppError('User not found', 404);
    }

    const partnerId = breakupRequest.fromUserId;
    const endedAt = new Date();
    const endedReason = breakupRequest.reason || 'Mutual breakup';

    console.log('Backend: Moving partners to exPartners and clearing partners array');
    
    // Get current user's partner data before clearing
    const currentUserData = await User.findById(userId).select('partners');
    const partnerToMove1 = currentUserData?.partners?.find(p => p.partnerId === partnerId);
    
    // Get partner user's partner data before clearing  
    const partnerUserData = await User.findById(partnerId).select('partners');
    const partnerToMove2 = partnerUserData?.partners?.find(p => p.partnerId === userId);
    
    // Move inactive partner to exPartners for current user
    if (partnerToMove1) {
      await User.findByIdAndUpdate(
        userId,
        {
          $push: {
            exPartners: {
              partnerId: partnerToMove1.partnerId,
              partnerName: partnerToMove1.partnerName,
              partnerEmail: partnerToMove1.partnerEmail,
              partnerAvatar: partnerToMove1.partnerAvatar,
              partnerAge: partnerToMove1.partnerAge,
              partnerGender: partnerToMove1.partnerGender,
              startedAt: partnerToMove1.startedAt,
              endedAt: endedAt,
              endedBy: userId,
              endedReason: endedReason,
              breakupDate: endedAt, // Store breakup date for 30-day restoration
              dataArchived: false // Not archived yet, still within 30-day window
            }
          },
          $set: { partners: [] } // Clear partners array
        }
      );
    }
    
    // Move inactive partner to exPartners for partner user
    if (partnerToMove2) {
      await User.findByIdAndUpdate(
        partnerId,
        {
          $push: {
            exPartners: {
              partnerId: partnerToMove2.partnerId,
              partnerName: partnerToMove2.partnerName,
              partnerEmail: partnerToMove2.partnerEmail,
              partnerAvatar: partnerToMove2.partnerAvatar,
              partnerAge: partnerToMove2.partnerAge,
              partnerGender: partnerToMove2.partnerGender,
              startedAt: partnerToMove2.startedAt,
              endedAt: endedAt,
              endedBy: userId,
              endedReason: endedReason,
              breakupDate: endedAt, // Store breakup date for 30-day restoration
              dataArchived: false // Not archived yet, still within 30-day window
            }
          },
          $set: { partners: [] } // Clear partners array
        }
      );
    }

    console.log('Backend: Updated both users with inactive status');

    // Update breakup request status
    breakupRequest.status = 'accepted';
    await breakupRequest.save();

    // Add to history for both users
    await PartnerHistory.create([{
      userId: userId,
      partnerId: partnerId,
      action: 'relationship_ended',
      details: `Breakup request accepted. Relationship ended with ${partnerUser.name}`
    }, {
      userId: partnerId,
      partnerId: userId,
      action: 'relationship_ended',
      details: `Breakup request accepted by ${currentUser.name}. Relationship ended.`
    }]);

    console.log('Backend: Added to partner history');

    // Send notification to original requester (who sent the breakup request)
    await NotificationService.sendBreakupAcceptedNotification(
      userId!,
      partnerId,
      currentUser.name || 'Your partner'
    );

    // Emit socket event to both users
    const socketHandler = getSocketHandler();
    if (socketHandler) {
      // Notify the requester that breakup was accepted
      socketHandler.emitToUser(partnerId, 'breakup_request_accepted', {
        requestId: breakupRequest._id,
        fromUserId: userId,
        toUserId: partnerId,
        acceptedBy: currentUser.name
      });
      
      // Also notify the current user (who accepted) that their relationship ended
      socketHandler.emitToUser(userId!, 'breakup_request_accepted', {
        requestId: breakupRequest._id,
        fromUserId: partnerId,
        toUserId: userId,
        acceptedBy: currentUser.name,
        message: 'Your relationship has been ended successfully'
      });
      console.log('Socket notifications sent to both users');
    }

    res.json({
      success: true,
      message: 'Relationship ended successfully',
      data: {
        requestId: breakupRequest._id,
        endedAt,
        reason: endedReason
      }
    });
  } catch (error) {
    console.error('Backend: Error in acceptBreakup:', error);
    
    if (error instanceof Error) {
      throw new AppError(`Database operation failed: ${error.message}`, 500);
    } else {
      throw new AppError('Database operation failed', 500);
    }
  }
});

// Reject breakup request
export const rejectBreakup = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const { requestId } = req.params;

  console.log('Backend: rejectBreakup called for userId:', userId, 'requestId:', requestId);

  const breakupRequest = await BreakupRequest.findById(requestId);
  
  if (!breakupRequest) {
    throw new AppError('Breakup request not found', 404);
  }

  if (breakupRequest.toUserId !== userId) {
    throw new AppError('You can only reject breakup requests sent to you', 403);
  }

  if (breakupRequest.status !== 'pending') {
    throw new AppError('Breakup request is not pending', 400);
  }

  try {
    // Get current user
    const currentUser = await User.findById(userId).select('name email');
    const partnerUser = await User.findById(breakupRequest.fromUserId).select('name email');
    
    if (!currentUser || !partnerUser) {
      throw new AppError('User not found', 404);
    }

    // Update breakup request status
    breakupRequest.status = 'rejected';
    await breakupRequest.save();

    console.log('Backend: Breakup request rejected');

    // Send notification to original requester
    await NotificationService.sendBreakupRejectedNotification(
      userId!,
      breakupRequest.fromUserId,
      currentUser.name || 'Your partner'
    );

    // Emit socket event to both users
    const socketHandler = getSocketHandler();
    if (socketHandler) {
      // Notify the requester that their breakup request was rejected
      socketHandler.emitToUser(breakupRequest.fromUserId, 'breakup_request_rejected', {
        requestId: breakupRequest._id,
        fromUserId: userId,
        toUserId: breakupRequest.fromUserId,
        rejectedBy: currentUser.name
      });
      
      // Also notify the current user (who rejected) to refresh their partner data
      socketHandler.emitToUser(userId!, 'breakup_request_rejected', {
        requestId: breakupRequest._id,
        fromUserId: breakupRequest.fromUserId,
        toUserId: userId,
        rejectedBy: currentUser.name,
        message: 'Your partner wants to continue the relationship'
      });
      console.log('Socket notifications sent to both users');
    }

    res.json({
      success: true,
      message: 'Breakup request rejected. Relationship continues.',
      data: {
        requestId: breakupRequest._id
      }
    });
  } catch (error) {
    console.error('Backend: Error in rejectBreakup:', error);
    
    if (error instanceof Error) {
      throw new AppError(`Database operation failed: ${error.message}`, 500);
    } else {
      throw new AppError('Database operation failed', 500);
    }
  }
});

// Get breakup request status
export const getBreakupRequestStatus = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;

  console.log('Backend: getBreakupRequestStatus called for userId:', userId);

  // Check if user has an active partner
  const currentUser = await User.findById(userId).select('partners');
  
  if (!currentUser || !currentUser.partners || currentUser.partners.length === 0) {
    return res.json({
      success: true,
      hasBreakupRequest: false,
      status: null
    });
  }

  // Find active partner
  const activePartner = currentUser.partners.find(p => p.status === 'active');
  
  if (!activePartner) {
    return res.json({
      success: true,
      hasBreakupRequest: false,
      status: null
    });
  }

  const partnerId = activePartner.partnerId;

  // Check for pending breakup request
  const breakupRequest = await BreakupRequest.findOne({
    $or: [
      { fromUserId: userId, toUserId: partnerId, status: 'pending' },
      { fromUserId: partnerId, toUserId: userId, status: 'pending' }
    ]
  }).sort({ createdAt: -1 });

  if (breakupRequest) {
    // Get sender details
    const senderUser = await User.findById(breakupRequest.fromUserId).select('name email avatar');
    
    return res.json({
      success: true,
      hasBreakupRequest: true,
      status: breakupRequest.status,
      isFromCurrentUser: breakupRequest.fromUserId === userId,
      requestId: breakupRequest._id,
      reason: breakupRequest.reason,
      createdAt: breakupRequest.createdAt,
      fromUserId: breakupRequest.fromUserId,
      fromUserName: senderUser?.name || 'Unknown',
      fromUserEmail: senderUser?.email || '',
      fromUserAvatar: senderUser?.avatar || null
    });
  }

  return res.json({
    success: true,
    hasBreakupRequest: false,
    status: null
  });
});

// Get partner history
export const getPartnerHistory = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;

  const history = await PartnerHistory.find({
    userId: userId
  })
    .populate('partnerId', 'name email avatar')
    .sort({ createdAt: -1 });

  res.json({
    success: true,
    message: 'Partner history retrieved successfully',
    data: {
      history,
      total: history.length
    }
  });
});
