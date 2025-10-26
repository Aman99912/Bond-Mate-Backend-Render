/**
 * Migration Script: Clean up stale PartnerRequest documents
 * 
 * This script fixes the bug where old 'accepted' PartnerRequest documents
 * remain in the database after users break up, causing state confusion.
 * 
 * Run this script after deploying the fix:
 * node scripts/fixPartnerRequests.js
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: '.env' });

// Import models
const { PartnerRequest } = require('../dist/models/Partner');
const User = require('../dist/models/User');

const cleanupStaleRequests = async () => {
  try {
    console.log('🚀 Starting cleanup of stale PartnerRequest documents...');
    
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bondmate');
    console.log('✅ Connected to database');
    
    // Find all PartnerRequest documents with status 'accepted'
    const acceptedRequests = await PartnerRequest.find({ status: 'accepted' });
    console.log(`Found ${acceptedRequests.length} accepted PartnerRequest documents`);
    
    let deletedCount = 0;
    
    for (const request of acceptedRequests) {
      const fromUserId = request.fromUserId.toString();
      const toUserId = request.toUserId.toString();
      
      // Check if either user currently has the other as an active partner
      const fromUser = await User.findById(fromUserId).select('partners');
      const toUser = await User.findById(toUserId).select('partners');
      
      const fromUserHasActivePartner = fromUser?.partners?.some((p) => 
        p.partnerId === toUserId && p.status === 'active'
      );
      
      const toUserHasActivePartner = toUser?.partners?.some((p) => 
        p.partnerId === fromUserId && p.status === 'active'
      );
      
      // If neither user has the other as active partner, the request is stale
      if (!fromUserHasActivePartner && !toUserHasActivePartner) {
        console.log(`Deleting stale request between ${fromUserId} and ${toUserId}`);
        await PartnerRequest.findByIdAndDelete(request._id);
        deletedCount++;
      }
    }
    
    console.log(`✅ Deleted ${deletedCount} stale PartnerRequest documents`);
    
    // Also clean up duplicate pending requests between the same users
    console.log('\n🔍 Checking for duplicate pending requests...');
    
    const pendingRequests = await PartnerRequest.find({ status: 'pending' });
    const requestMap = new Map();
    let duplicateCount = 0;
    
    for (const request of pendingRequests) {
      const key = [request.fromUserId.toString(), request.toUserId.toString()]
        .sort()
        .join('_');
      
      if (requestMap.has(key)) {
        // Keep the newest request, delete older ones
        const existingRequest = requestMap.get(key);
        if (request.createdAt > existingRequest.createdAt) {
          await PartnerRequest.findByIdAndDelete(existingRequest._id);
          requestMap.set(key, request);
          duplicateCount++;
          console.log(`Deleted older request between ${key}`);
        } else {
          await PartnerRequest.findByIdAndDelete(request._id);
          duplicateCount++;
          console.log(`Deleted newer request between ${key}`);
        }
      } else {
        requestMap.set(key, request);
      }
    }
    
    console.log(`✅ Deleted ${duplicateCount} duplicate pending requests`);
    
    console.log('\n✨ Cleanup completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  }
};

cleanupStaleRequests();

