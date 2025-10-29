import mongoose from 'mongoose';
import User from '@/models/User';
import { Partner, PartnerRequest, PartnerHistory, BreakupRequest } from '@/models/Partner';
import auditService from './auditService';
import logger from '@/utils/logger';

export interface PartnerRestorationResult {
  shouldRestore: boolean;
  restoredFromDate?: Date;
  reason: string;
}

export interface PartnerAssignmentResult {
  canAssign: boolean;
  reason: string;
  previousPartner?: any;
}

class PartnerService {
  /**
   * Enhanced 30-day restoration logic with dynamic partner assignment
   */
  async checkPartnerRestoration(
    fromUserId: string, 
    toUserId: string
  ): Promise<PartnerRestorationResult> {
    try {
      // Check if both users have no active partners
      const [fromUser, toUser] = await Promise.all([
        User.findById(fromUserId).select('partners exPartners'),
        User.findById(toUserId).select('partners exPartners')
      ]);

      if (!fromUser || !toUser) {
        return {
          shouldRestore: false,
          reason: 'One or both users not found'
        };
      }

      // Check if either user has an active partner
      const fromUserActivePartners = fromUser.partners?.filter(p => p.status === 'active') || [];
      const toUserActivePartners = toUser.partners?.filter(p => p.status === 'active') || [];

      if (fromUserActivePartners.length > 0 || toUserActivePartners.length > 0) {
        return {
          shouldRestore: false,
          reason: 'One or both users already have active partners'
        };
      }

      // Check for previous relationship in exPartners
      const previousRelationship = fromUser.exPartners?.find(
        (ex: any) => ex.partnerId === toUserId
      );

      if (!previousRelationship || !previousRelationship.breakupDate) {
        return {
          shouldRestore: false,
          reason: 'No previous relationship found'
        };
      }

      const breakupDate = new Date(previousRelationship.breakupDate);
      const daysSinceBreakup = Math.floor((Date.now() - breakupDate.getTime()) / (1000 * 60 * 60 * 24));

      if (daysSinceBreakup <= 30) {
        // Within 30 days - restore relationship
        await auditService.logPartnerActivity({
          userId: fromUserId,
          targetUserId: toUserId,
          action: 'data_restored',
          details: `Restoring relationship data from ${previousRelationship.startedAt} (${daysSinceBreakup} days since breakup)`,
          metadata: {
            previousStartedAt: previousRelationship.startedAt,
            breakupDate: previousRelationship.breakupDate,
            daysSinceBreakup
          }
        });

        return {
          shouldRestore: true,
          restoredFromDate: previousRelationship.startedAt,
          reason: `Restoring relationship (${daysSinceBreakup} days since breakup)`
        };
      } else {
        // Over 30 days - archive old data and start fresh
        await this.archiveOldRelationshipData(fromUserId, toUserId);
        
        await auditService.logPartnerActivity({
          userId: fromUserId,
          targetUserId: toUserId,
          action: 'data_archived',
          details: `Archiving old relationship data (${daysSinceBreakup} days since breakup)`,
          metadata: {
            previousStartedAt: previousRelationship.startedAt,
            breakupDate: previousRelationship.breakupDate,
            daysSinceBreakup
          }
        });

        return {
          shouldRestore: false,
          reason: `Starting fresh relationship (${daysSinceBreakup} days since breakup - data archived)`
        };
      }
    } catch (error) {
      logger.error('Error checking partner restoration', {
        error: error instanceof Error ? error.message : 'Unknown error',
        fromUserId,
        toUserId
      });
      return {
        shouldRestore: false,
        reason: 'Error checking restoration status'
      };
    }
  }

  /**
   * Archive old relationship data after 30 days
   */
  private async archiveOldRelationshipData(fromUserId: string, toUserId: string): Promise<void> {
    try {
      await Promise.all([
        User.findByIdAndUpdate(fromUserId, {
          $set: { 'exPartners.$[elem].dataArchived': true }
        }, {
          arrayFilters: [{ 'elem.partnerId': toUserId }]
        }),
        User.findByIdAndUpdate(toUserId, {
          $set: { 'exPartners.$[elem].dataArchived': true }
        }, {
          arrayFilters: [{ 'elem.partnerId': fromUserId }]
        })
      ]);
    } catch (error) {
      logger.error('Error archiving old relationship data', {
        error: error instanceof Error ? error.message : 'Unknown error',
        fromUserId,
        toUserId
      });
    }
  }

  /**
   * Check if a new partner can be assigned (slot availability)
   */
  async checkPartnerAssignment(
    fromUserId: string, 
    toUserId: string
  ): Promise<PartnerAssignmentResult> {
    try {
      const [fromUser, toUser] = await Promise.all([
        User.findById(fromUserId).select('partners exPartners'),
        User.findById(toUserId).select('partners exPartners')
      ]);

      if (!fromUser || !toUser) {
        return {
          canAssign: false,
          reason: 'One or both users not found'
        };
      }

      // Check if either user has an active partner
      const fromUserActivePartners = fromUser.partners?.filter(p => p.status === 'active') || [];
      const toUserActivePartners = toUser.partners?.filter(p => p.status === 'active') || [];

      if (fromUserActivePartners.length > 0) {
        return {
          canAssign: false,
          reason: 'From user already has an active partner',
          previousPartner: fromUserActivePartners[0]
        };
      }

      if (toUserActivePartners.length > 0) {
        return {
          canAssign: false,
          reason: 'Target user already has an active partner',
          previousPartner: toUserActivePartners[0]
        };
      }

      return {
        canAssign: true,
        reason: 'Both users are available for new partnership'
      };
    } catch (error) {
      logger.error('Error checking partner assignment', {
        error: error instanceof Error ? error.message : 'Unknown error',
        fromUserId,
        toUserId
      });
      return {
        canAssign: false,
        reason: 'Error checking assignment availability'
      };
    }
  }

  /**
   * Create partner relationship with atomic transaction
   */
  async createPartnerRelationship(
    fromUserId: string,
    toUserId: string,
    startedAt: Date,
    session?: mongoose.ClientSession
  ): Promise<{ partner: any; fromUser: any; toUser: any }> {
    const sessionToUse = session || await mongoose.startSession();
    
    try {
      if (!session) {
        await sessionToUse.startTransaction();
      }

      // Get user details
      const [fromUser, toUser] = await Promise.all([
        User.findById(fromUserId).select('name email avatar dob gender bio').session(sessionToUse),
        User.findById(toUserId).select('name email avatar dob gender bio').session(sessionToUse)
      ]);

      if (!fromUser || !toUser) {
        throw new Error('One or both users not found');
      }

      // Calculate ages
      const fromUserAge = fromUser.dob ? Math.floor((Date.now() - new Date(fromUser.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : undefined;
      const toUserAge = toUser.dob ? Math.floor((Date.now() - new Date(toUser.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : undefined;

      // Create partner relationship
      const partner = await Partner.create([{
        user1Id: fromUserId,
        user2Id: toUserId,
        status: 'active',
        startedAt
      }], { session: sessionToUse });

      // Update both users with partner information
      await Promise.all([
        User.findByIdAndUpdate(fromUserId, {
          $push: {
            partners: {
              partnerId: toUserId,
              partnerName: toUser.name,
              partnerEmail: toUser.email,
              partnerAvatar: toUser.avatar,
              partnerAge: toUserAge,
              partnerGender: toUser.gender,
              startedAt: startedAt,
              status: 'active'
            }
          }
        }, { session: sessionToUse }),
        User.findByIdAndUpdate(toUserId, {
          $push: {
            partners: {
              partnerId: fromUserId,
              partnerName: fromUser.name,
              partnerEmail: fromUser.email,
              partnerAvatar: fromUser.avatar,
              partnerAge: fromUserAge,
              partnerGender: fromUser.gender,
              startedAt: startedAt,
              status: 'active'
            }
          }
        }, { session: sessionToUse })
      ]);

      // Create history entries
      await PartnerHistory.create([{
        userId: fromUserId,
        partnerId: toUserId,
        action: 'relationship_started',
        details: `Started relationship with ${toUser.name}`
      }, {
        userId: toUserId,
        partnerId: fromUserId,
        action: 'relationship_started',
        details: `Started relationship with ${fromUser.name}`
      }], { session: sessionToUse });

      if (!session) {
        await sessionToUse.commitTransaction();
      }

      return { partner: partner[0], fromUser, toUser };
    } catch (error) {
      if (!session) {
        await sessionToUse.abortTransaction();
      }
      throw error;
    } finally {
      if (!session) {
        await sessionToUse.endSession();
      }
    }
  }

  /**
   * Clean up old partner requests between users
   */
  async cleanupOldRequests(fromUserId: string, toUserId: string): Promise<void> {
    try {
      const deletedCount = await PartnerRequest.deleteMany({
        $or: [
          { fromUserId, toUserId },
          { fromUserId: toUserId, toUserId: fromUserId }
        ]
      });

      if (deletedCount > 0) {
        logger.info('Cleaned up old partner requests', {
          fromUserId,
          toUserId,
          deletedCount
        });
      }
    } catch (error) {
      logger.error('Error cleaning up old requests', {
        error: error instanceof Error ? error.message : 'Unknown error',
        fromUserId,
        toUserId
      });
    }
  }

  /**
   * Validate partner request data
   */
  validatePartnerRequest(data: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!data.toUserId || typeof data.toUserId !== 'string') {
      errors.push('Target user ID is required and must be a string');
    }

    if (data.message && typeof data.message === 'string' && data.message.length > 500) {
      errors.push('Message cannot exceed 500 characters');
    }

    if (data.fromUserId === data.toUserId) {
      errors.push('Cannot send request to yourself');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Get partner statistics for monitoring
   */
  async getPartnerStatistics(): Promise<{
    totalActivePartnerships: number;
    totalPendingRequests: number;
    totalBreakupRequests: number;
    recentActivity: number;
  }> {
    try {
      const [totalActivePartnerships, totalPendingRequests, totalBreakupRequests, recentActivity] = await Promise.all([
        Partner.countDocuments({ status: 'active' }),
        PartnerRequest.countDocuments({ status: 'pending' }),
        BreakupRequest.countDocuments({ status: 'pending' }),
        PartnerHistory.countDocuments({
          createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        })
      ]);

      return {
        totalActivePartnerships,
        totalPendingRequests,
        totalBreakupRequests,
        recentActivity
      };
    } catch (error) {
      logger.error('Error getting partner statistics', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return {
        totalActivePartnerships: 0,
        totalPendingRequests: 0,
        totalBreakupRequests: 0,
        recentActivity: 0
      };
    }
  }
}

export default new PartnerService();
