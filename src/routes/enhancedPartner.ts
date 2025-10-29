import { Router } from 'express';
import { authenticate } from '@/middleware/auth';
import {
  partnerRequestLimiter,
  partnerActionLimiter,
  searchLimiter,
  strictLimiter
} from '@/middleware/rateLimiter';
import {
  sendPartnerRequest,
  getPartnerRequests,
  acceptPartnerRequest,
  rejectPartnerRequest,
  getCurrentPartner,
  searchUsers,
  validatePartnerRequest
} from '@/controllers/enhancedPartnerController';
import { 
  removePartner,
  acceptBreakup,
  rejectBreakup,
  getBreakupRequestStatus,
  getPartnerHistory
} from '@/controllers/partnerController'; // Keep existing breakup functionality

const router = Router();

// All routes require authentication
router.use(authenticate);

// Partner search with rate limiting
router.get('/search', searchLimiter, searchUsers);

// Partner request management with strict rate limiting
router.post('/request', partnerRequestLimiter, validatePartnerRequest, sendPartnerRequest);
router.get('/requests', partnerActionLimiter, getPartnerRequests);
router.put('/request/:requestId/accept', partnerActionLimiter, acceptPartnerRequest);
router.put('/request/:requestId/reject', partnerActionLimiter, rejectPartnerRequest);

// Current partner info
router.get('/current', partnerActionLimiter, getCurrentPartner);

// Breakup management with strict rate limiting
router.get('/breakup-status', strictLimiter, getBreakupRequestStatus);
router.delete('/remove', strictLimiter, removePartner);
router.put('/breakup/:requestId/accept', strictLimiter, acceptBreakup);
router.put('/breakup/:requestId/reject', strictLimiter, rejectBreakup);

// Partner history
router.get('/history', partnerActionLimiter, getPartnerHistory);

export default router;
