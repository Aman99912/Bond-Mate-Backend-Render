import { Request, Response } from 'express';
import Nickname from '../models/Nickname';
import User from '../models/User';
import { ApiResponse } from '@/types';
import logger from '@/utils/logger';

/**
 * Get all nicknames for the authenticated user (local-only)
 * Only returns nicknames owned by the requesting user
 */
export const getNicknames = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized'
      } as ApiResponse);
      return;
    }

    const nicknames = await Nickname.find({ ownerId: userId })
      .populate('targetUserId', 'name email avatar')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: {
        nicknames: nicknames.map(n => ({
          _id: n._id,
          targetUserId: n.targetUserId,
          nickname: n.nickname,
          conversationId: n.conversationId,
          createdAt: n.createdAt,
          updatedAt: n.updatedAt,
        }))
      }
    } as ApiResponse);
  } catch (error) {
    logger.error('Error fetching nicknames:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    } as ApiResponse);
  }
};

/**
 * Get nickname for a specific target user
 * Only returns if owned by the requesting user (local-only)
 */
export const getNicknameForUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const { targetUserId } = req.params;
    
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized'
      } as ApiResponse);
      return;
    }

    if (!targetUserId) {
      res.status(400).json({
        success: false,
        message: 'Target user ID is required'
      } as ApiResponse);
      return;
    }

    // Verify target user exists
    const targetUser = await User.findById(targetUserId).select('name email avatar');
    if (!targetUser) {
      res.status(404).json({
        success: false,
        message: 'Target user not found'
      } as ApiResponse);
      return;
    }

    // Find nickname (must be owned by requesting user)
    const nickname = await Nickname.findOne({
      ownerId: userId,
      targetUserId: targetUserId
    });

    res.json({
      success: true,
      data: {
        nickname: nickname?.nickname || null,
        targetUser: {
          _id: targetUser._id,
          name: targetUser.name,
          email: targetUser.email,
          avatar: targetUser.avatar
        }
      }
    } as ApiResponse);
  } catch (error) {
    logger.error('Error fetching nickname:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    } as ApiResponse);
  }
};

/**
 * Set or update nickname for a target user
 * Ensures nickname is owned by the requesting user (local-only)
 */
export const setNickname = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const { targetUserId, nickname, conversationId } = req.body;
    
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized'
      } as ApiResponse);
      return;
    }

    // Validation
    if (!targetUserId) {
      res.status(400).json({
        success: false,
        message: 'Target user ID is required'
      } as ApiResponse);
      return;
    }

    if (!nickname || typeof nickname !== 'string' || nickname.trim().length === 0) {
      res.status(400).json({
        success: false,
        message: 'Nickname is required and cannot be empty'
      } as ApiResponse);
      return;
    }

    if (nickname.trim().length > 50) {
      res.status(400).json({
        success: false,
        message: 'Nickname cannot exceed 50 characters'
      } as ApiResponse);
      return;
    }

    // Verify target user exists
    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      res.status(404).json({
        success: false,
        message: 'Target user not found'
      } as ApiResponse);
      return;
    }

    // Prevent self-nicknaming
    if (userId === targetUserId) {
      res.status(400).json({
        success: false,
        message: 'Cannot set nickname for yourself'
      } as ApiResponse);
      return;
    }

    // Create or update nickname (ensuring ownerId is always the requesting user)
    const updatedNickname = await Nickname.findOneAndUpdate(
      {
        ownerId: userId,  // CRITICAL: Always use authenticated user as owner
        targetUserId: targetUserId
      },
      {
        ownerId: userId,  // Ensure ownerId is set correctly
        targetUserId: targetUserId,
        nickname: nickname.trim(),
        conversationId: conversationId || undefined,
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      }
    );

    // Audit log
    logger.info('Nickname set/updated', {
      ownerId: userId,
      targetUserId: targetUserId,
      nickname: nickname.trim(),
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Nickname saved successfully',
      data: {
        _id: updatedNickname._id,
        targetUserId: updatedNickname.targetUserId,
        nickname: updatedNickname.nickname,
        conversationId: updatedNickname.conversationId,
        createdAt: updatedNickname.createdAt,
        updatedAt: updatedNickname.updatedAt,
      }
    } as ApiResponse);
  } catch (error: any) {
    logger.error('Error setting nickname:', error);
    
    // Handle duplicate key error (shouldn't happen with upsert, but just in case)
    if (error.code === 11000) {
      res.status(409).json({
        success: false,
        message: 'Nickname already exists for this user'
      } as ApiResponse);
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error'
    } as ApiResponse);
  }
};

/**
 * Delete nickname
 * Only allows deletion of nicknames owned by the requesting user
 */
export const deleteNickname = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const { targetUserId } = req.params;
    
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized'
      } as ApiResponse);
      return;
    }

    if (!targetUserId) {
      res.status(400).json({
        success: false,
        message: 'Target user ID is required'
      } as ApiResponse);
      return;
    }

    // Delete only if owned by requesting user
    const deleted = await Nickname.findOneAndDelete({
      ownerId: userId,  // CRITICAL: Ensure only owner can delete
      targetUserId: targetUserId
    });

    if (!deleted) {
      res.status(404).json({
        success: false,
        message: 'Nickname not found'
      } as ApiResponse);
      return;
    }

    // Audit log
    logger.info('Nickname deleted', {
      ownerId: userId,
      targetUserId: targetUserId,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Nickname deleted successfully'
    } as ApiResponse);
  } catch (error) {
    logger.error('Error deleting nickname:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    } as ApiResponse);
  }
};

