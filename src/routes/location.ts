import express from 'express';
import { 
  updateLocation, 
  getPartnerLocation, 
  getBothLocations,
  requestPartnerLocation
} from '@/controllers/locationController';
import { authenticate } from '@/middleware/auth';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

// PUT /api/location - Update user's current location
router.put('/', updateLocation);

// GET /api/location/partner - Get partner's last known location
router.get('/partner', getPartnerLocation);

// GET /api/location/both - Get both users' locations
router.get('/both', getBothLocations);

// POST /api/location/request - Request partner's current location
router.post('/request', requestPartnerLocation);

export default router;
