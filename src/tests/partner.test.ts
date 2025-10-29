import request from 'supertest';
import mongoose from 'mongoose';
import app from '../index';
import User from '../models/User';
import { PartnerRequest, PartnerHistory } from '../models/Partner';
import partnerService from '../services/partnerService';
import auditService from '../services/auditService';

describe('Enhanced Partner Request Flow', () => {
  let testUser1: any;
  let testUser2: any;
  let authToken1: string;
  let authToken2: string;

  beforeAll(async () => {
    // Connect to test database
    await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/bond_mate_test');
    
    // Clean up test data
    await User.deleteMany({ email: /test.*@example\.com/ });
    await PartnerRequest.deleteMany({});
    await PartnerHistory.deleteMany({});
  });

  afterAll(async () => {
    // Clean up test data
    await User.deleteMany({ email: /test.*@example\.com/ });
    await PartnerRequest.deleteMany({});
    await PartnerHistory.deleteMany({});
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    // Create test users
    testUser1 = await User.create({
      name: 'Test User 1',
      email: 'test1@example.com',
      password: 'password123',
      UserSearchId: 'TEST001',
      isActive: true
    });

    testUser2 = await User.create({
      name: 'Test User 2',
      email: 'test2@example.com',
      password: 'password123',
      UserSearchId: 'TEST002',
      isActive: true
    });

    // Get auth tokens (simplified for testing)
    authToken1 = 'test-token-1';
    authToken2 = 'test-token-2';
  });

  afterEach(async () => {
    // Clean up after each test
    await User.deleteMany({ email: /test.*@example\.com/ });
    await PartnerRequest.deleteMany({});
    await PartnerHistory.deleteMany({});
  });

  describe('Partner Request Sending', () => {
    it('should send partner request successfully', async () => {
      const response = await request(app)
        .post('/api/enhanced-partners/request')
        .set('Authorization', `Bearer ${authToken1}`)
        .send({
          toUserId: testUser2._id.toString(),
          message: 'Test message'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.request).toBeDefined();
      expect(response.body.data.request.status).toBe('pending');
    });

    it('should reject request to self', async () => {
      const response = await request(app)
        .post('/api/enhanced-partners/request')
        .set('Authorization', `Bearer ${authToken1}`)
        .send({
          toUserId: testUser1._id.toString(),
          message: 'Test message'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject request with invalid user ID', async () => {
      const response = await request(app)
        .post('/api/enhanced-partners/request')
        .set('Authorization', `Bearer ${authToken1}`)
        .send({
          toUserId: 'invalid-id',
          message: 'Test message'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject request with message too long', async () => {
      const longMessage = 'a'.repeat(501);
      const response = await request(app)
        .post('/api/enhanced-partners/request')
        .set('Authorization', `Bearer ${authToken1}`)
        .send({
          toUserId: testUser2._id.toString(),
          message: longMessage
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Partner Request Acceptance', () => {
    it('should accept partner request successfully', async () => {
      // First send a request
      await request(app)
        .post('/api/enhanced-partners/request')
        .set('Authorization', `Bearer ${authToken1}`)
        .send({
          toUserId: testUser2._id.toString(),
          message: 'Test message'
        });

      // Get the request ID from user's pendingRequests
      const user = await User.findById(testUser2._id).select('pendingRequests');
      const requestId = user?.pendingRequests?.[0]?.requestId;

      // Accept the request
      const response = await request(app)
        .put(`/api/enhanced-partners/request/${requestId}/accept`)
        .set('Authorization', `Bearer ${authToken2}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.partner).toBeDefined();
    });

    it('should reject non-existent request', async () => {
      const response = await request(app)
        .put('/api/enhanced-partners/request/invalid-id/accept')
        .set('Authorization', `Bearer ${authToken2}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Partner Request Rejection', () => {
    it('should reject partner request successfully', async () => {
      // First send a request
      await request(app)
        .post('/api/enhanced-partners/request')
        .set('Authorization', `Bearer ${authToken1}`)
        .send({
          toUserId: testUser2._id.toString(),
          message: 'Test message'
        });

      // Get the request ID from user's pendingRequests
      const user = await User.findById(testUser2._id).select('pendingRequests');
      const requestId = user?.pendingRequests?.[0]?.requestId;

      // Reject the request
      const response = await request(app)
        .put(`/api/enhanced-partners/request/${requestId}/reject`)
        .set('Authorization', `Bearer ${authToken2}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('30-Day Restoration Logic', () => {
    it('should restore relationship data within 30 days', async () => {
      const originalStartDate = new Date('2023-01-01');
      
      // Simulate previous relationship in exPartners
      await User.findByIdAndUpdate(testUser1._id, {
        $push: {
          exPartners: {
            partnerId: testUser2._id.toString(),
            partnerName: 'Test User 2',
            partnerEmail: 'test2@example.com',
            startedAt: originalStartDate,
            endedAt: new Date('2023-12-01'),
            endedBy: testUser1._id.toString(),
            endedReason: 'Test breakup',
            breakupDate: new Date('2023-12-01'),
            dataArchived: false
          }
        }
      });

      await User.findByIdAndUpdate(testUser2._id, {
        $push: {
          exPartners: {
            partnerId: testUser1._id.toString(),
            partnerName: 'Test User 1',
            partnerEmail: 'test1@example.com',
            startedAt: originalStartDate,
            endedAt: new Date('2023-12-01'),
            endedBy: testUser1._id.toString(),
            endedReason: 'Test breakup',
            breakupDate: new Date('2023-12-01'),
            dataArchived: false
          }
        }
      });

      // Check restoration logic
      const restorationResult = await partnerService.checkPartnerRestoration(
        testUser1._id.toString(),
        testUser2._id.toString()
      );

      expect(restorationResult.shouldRestore).toBe(true);
      expect(restorationResult.restoredFromDate).toEqual(originalStartDate);
    });

    it('should not restore relationship data after 30 days', async () => {
      const originalStartDate = new Date('2023-01-01');
      const breakupDate = new Date('2023-01-15'); // More than 30 days ago
      
      // Simulate old relationship in exPartners
      await User.findByIdAndUpdate(testUser1._id, {
        $push: {
          exPartners: {
            partnerId: testUser2._id.toString(),
            partnerName: 'Test User 2',
            partnerEmail: 'test2@example.com',
            startedAt: originalStartDate,
            endedAt: breakupDate,
            endedBy: testUser1._id.toString(),
            endedReason: 'Test breakup',
            breakupDate: breakupDate,
            dataArchived: false
          }
        }
      });

      // Check restoration logic
      const restorationResult = await partnerService.checkPartnerRestoration(
        testUser1._id.toString(),
        testUser2._id.toString()
      );

      expect(restorationResult.shouldRestore).toBe(false);
      expect(restorationResult.reason).toContain('over 30 days');
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits on partner requests', async () => {
      const promises = [];
      
      // Send multiple requests quickly to trigger rate limit
      for (let i = 0; i < 15; i++) {
        promises.push(
          request(app)
            .post('/api/enhanced-partners/request')
            .set('Authorization', `Bearer ${authToken1}`)
            .send({
              toUserId: testUser2._id.toString(),
              message: `Test message ${i}`
            })
        );
      }

      const responses = await Promise.all(promises);
      
      // Some requests should be rate limited
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('Security', () => {
    it('should reject requests without authentication', async () => {
      const response = await request(app)
        .post('/api/enhanced-partners/request')
        .send({
          toUserId: testUser2._id.toString(),
          message: 'Test message'
        });

      expect(response.status).toBe(401);
    });

    it('should sanitize input data', async () => {
      const response = await request(app)
        .post('/api/enhanced-partners/request')
        .set('Authorization', `Bearer ${authToken1}`)
        .send({
          toUserId: testUser2._id.toString(),
          message: '<script>alert("xss")</script>Test message'
        });

      expect(response.status).toBe(400); // Should be rejected due to XSS attempt
    });
  });

  describe('Audit Logging', () => {
    it('should log partner request activities', async () => {
      await request(app)
        .post('/api/enhanced-partners/request')
        .set('Authorization', `Bearer ${authToken1}`)
        .send({
          toUserId: testUser2._id.toString(),
          message: 'Test message'
        });

      // Check if audit log was created
      const logs = await auditService.getUserActivityLogs(testUser1._id.toString(), 10);
      const partnerRequestLogs = logs.logs.filter(log => log.action === 'partner_request_sent');
      
      expect(partnerRequestLogs.length).toBeGreaterThan(0);
    });
  });
});
