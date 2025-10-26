import { Router } from 'express';
import { authenticate } from '@/middleware/auth';
import {
  searchUsers,
  sendPartnerRequest,
  getPartnerRequests,
  acceptPartnerRequest,
  rejectPartnerRequest,
  cancelPartnerRequest,
  getCurrentPartner,
  removePartner,
  getPartnerHistory,
  acceptBreakup,
  rejectBreakup,
  getBreakupRequestStatus
} from '@/controllers/partnerController';

const router = Router();

// Protected routes
router.use(authenticate);

router.get('/search', searchUsers);

router.post('/request', sendPartnerRequest);
router.get('/requests', getPartnerRequests);
router.put('/request/:requestId/accept', acceptPartnerRequest);
router.put('/request/:requestId/reject', rejectPartnerRequest);
router.delete('/request/:requestId', cancelPartnerRequest);
router.get('/current', getCurrentPartner);
router.get('/breakup-status', getBreakupRequestStatus);
router.delete('/remove', removePartner);
router.put('/breakup/:requestId/accept', acceptBreakup);
router.put('/breakup/:requestId/reject', rejectBreakup);
router.get('/history', getPartnerHistory);

export default router;
