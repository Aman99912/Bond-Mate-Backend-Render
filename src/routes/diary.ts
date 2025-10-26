import express from 'express';
import { authenticate } from '@/middleware/auth';
import { Partner } from '@/models/Partner';
import DiaryEntry from '@/models/DiaryEntry';
import User from '@/models/User';
import { upload } from '@/controllers/fileController';
import { rateLimit } from 'express-rate-limit';

const router = express.Router();

router.use(authenticate);

// Rate limiting
const createEntryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 entries per windowMs
  message: 'Too many diary entries created, please try again later.'
});

async function getActivePartnerId(userId: string) {
  const partner = await Partner.findOne({
    status: 'active',
    $or: [{ user1Id: userId }, { user2Id: userId }]
  });
  return partner?._id;
}

// Helper: get user info for audit trail
async function getUserInfo(userId: string) {
  const user = await User.findById(userId);
  return { name: user?.name || 'Unknown', id: userId };
}

// List entries with search, filtering, and pagination
router.get('/', async (req: any, res) => {
  const userId = req.user?.userId as string;
  const { 
    search, 
    tags, 
    author, 
    privacy, 
    startDate, 
    endDate, 
    page = 1, 
    limit = 20,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = req.query;

  const partnerId = await getActivePartnerId(userId);
  if (!partnerId) {
    return res.json({ success: true, data: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } });
  }

  const filter: any = { 
    partnerId, 
    isDeleted: false,
    $and: [
      {
        $or: [
          { privacy: 'public' },
          { authorId: userId }
        ]
      }
    ]
  };

  // Search functionality
  if (search) {
    // Use regex search as fallback if text index is not available
    filter.$and.push({
      $or: [
        { title: { $regex: search as string, $options: 'i' } },
        { description: { $regex: search as string, $options: 'i' } },
        { tags: { $in: [new RegExp(search as string, 'i')] } }
      ]
    });
  }

  // Tag filtering
  if (tags) {
    filter.tags = { $in: Array.isArray(tags) ? tags : [tags] };
  }

  // Author filtering
  if (author) {
    filter.authorId = author;
  }

  // Privacy filtering
  if (privacy) {
    filter.privacy = privacy;
  }

  // Date range filtering
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate as string);
    if (endDate) filter.createdAt.$lte = new Date(endDate as string);
  }

  const sort: any = {};
  sort[sortBy as string] = sortOrder === 'desc' ? -1 : 1;

  const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
  const total = await DiaryEntry.countDocuments(filter);
  
  const entries = await DiaryEntry.find(filter)
    .sort(sort)
    .skip(skip)
    .limit(parseInt(limit as string))
    .lean();

  const pages = Math.ceil(total / parseInt(limit as string));

  return res.json({ 
    success: true, 
    data: entries,
    pagination: {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      total,
      pages
    }
  });
});

// Search entries with advanced filters
router.get('/search', async (req: any, res) => {
  const userId = req.user?.userId as string;
  const { q, tags, author, dateFrom, dateTo, privacy } = req.query;

  const partnerId = await getActivePartnerId(userId);
  if (!partnerId) {
    return res.json({ success: true, data: [] });
  }

  const filter: any = { 
    partnerId, 
    isDeleted: false,
    $and: [
      {
        $or: [
          { privacy: 'public' },
          { authorId: userId }
        ]
      }
    ]
  };

  if (q) {
    filter.$and.push({
      $or: [
        { title: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { tags: { $in: [new RegExp(q, 'i')] } }
      ]
    });
  }

  if (tags) {
    filter.tags = { $in: Array.isArray(tags) ? tags : [tags] };
  }

  if (author) {
    filter.authorId = author;
  }

  if (privacy) {
    filter.privacy = privacy;
  }

  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) filter.createdAt.$gte = new Date(dateFrom as string);
    if (dateTo) filter.createdAt.$lte = new Date(dateTo as string);
  }

  const entries = await DiaryEntry.find(filter)
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  return res.json({ success: true, data: entries });
});

// Get all unique tags for current partner
router.get('/tags', async (req: any, res) => {
  const userId = req.user?.userId as string;
  const partnerId = await getActivePartnerId(userId);
  if (!partnerId) {
    return res.json({ success: true, data: [] });
  }

  const tags = await DiaryEntry.aggregate([
    { 
      $match: { 
        partnerId, 
        isDeleted: false,
        $or: [
          { privacy: 'public' },
          { authorId: userId }
        ]
      } 
    },
    { $unwind: '$tags' },
    { $group: { _id: '$tags', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $project: { tag: '$_id', count: 1, _id: 0 } }
  ]);

  return res.json({ success: true, data: tags });
});

// Create entry with images
router.post('/', createEntryLimiter, upload.array('images', 10), async (req: any, res) => {
  const userId = req.user?.userId as string;
  const { title, description, authorName, privacy = 'public', tags = [] } = req.body;
  
  // Validation
  if (!title || !description || !authorName) {
    return res.status(400).json({ 
      success: false, 
      message: 'Title, description, and author name are required' 
    });
  }

  if (title.length > 120) {
    return res.status(400).json({ 
      success: false, 
      message: 'Title too long. Maximum 120 characters allowed.' 
    });
  }

  if (description.length > 4000) {
    return res.status(400).json({ 
      success: false, 
      message: 'Description too long. Maximum 4000 characters allowed.' 
    });
  }

  let partnerId = await getActivePartnerId(userId);
  
  // If no active partner, create a self-partner for individual use
  if (!partnerId) {
    // Create a self-partner entry for individual diary use
    const selfPartner = await Partner.create({
      user1Id: userId,
      user2Id: userId,
      status: 'active',
      startedAt: new Date()
    });
    partnerId = selfPartner._id;
  }
  
  const images: string[] = (req.files || []).map((f: any) => `/uploads/${f.filename}`);
  
  const entry = await DiaryEntry.create({
    partnerId,
    title: title.trim(),
    description: description.trim(),
    images,
    authorId: userId,
    authorName: authorName.trim(),
    privacy,
    tags: Array.isArray(tags) ? tags : []
  });
  
  return res.status(201).json({ success: true, data: entry });
});

// Update entry (author only)
router.put('/:entryId', upload.array('images', 10), async (req: any, res) => {
  const userId = req.user?.userId as string;
  const { entryId } = req.params;
  const { title, description, privacy, tags, mode = 'append' } = req.body;
  
  const entry = await DiaryEntry.findById(entryId);
  if (!entry) return res.status(404).json({ success: false, message: 'Not found' });
  if (entry.isDeleted) return res.status(404).json({ success: false, message: 'Entry deleted' });
  if (entry.authorId.toString() !== userId) return res.status(403).json({ success: false, message: 'Forbidden' });

  if (title !== undefined) {
    if (title.length > 120) {
      return res.status(400).json({ 
        success: false, 
        message: 'Title too long. Maximum 120 characters allowed.' 
      });
    }
    entry.title = title.trim();
  }
  
  if (description !== undefined) {
    if (description.length > 4000) {
      return res.status(400).json({ 
        success: false, 
        message: 'Description too long. Maximum 4000 characters allowed.' 
      });
    }
    entry.description = description.trim();
  }
  
  if (privacy !== undefined) entry.privacy = privacy;
  if (tags !== undefined) entry.tags = Array.isArray(tags) ? tags : [];
  
  const images: string[] = (req.files || []).map((f: any) => `/uploads/${f.filename}`);
  if (images.length > 0) {
    if (mode === 'replace') entry.images = images;
    else entry.images = [...(entry.images || []), ...images];
  }
  
  await entry.save();
  return res.json({ success: true, data: entry });
});

// Soft delete entry (author only)
router.delete('/:entryId', async (req: any, res) => {
  const userId = req.user?.userId as string;
  const { entryId } = req.params;
  const { reason } = req.body;
  
  const entry = await DiaryEntry.findById(entryId);
  if (!entry) return res.status(404).json({ success: false, message: 'Not found' });
  if (entry.isDeleted) return res.status(404).json({ success: false, message: 'Already deleted' });
  if (entry.authorId.toString() !== userId) return res.status(403).json({ success: false, message: 'Forbidden' });

  const userInfo = await getUserInfo(userId);
  
  entry.isDeleted = true;
  entry.deletedAt = new Date();
  entry.deletedBy = userId as any;
  entry.deletedReason = reason;
  
  // Create audit trail entry without circular references
  const auditEntry = {
    action: 'deleted' as const,
    userId: userId as any,
    userName: userInfo.name,
    timestamp: new Date(),
    reason: reason || undefined
  };
  
  entry.auditTrail.push(auditEntry);
  
  try {
    await entry.save();
    return res.json({ success: true });
  } catch (error) {
    console.error('Error saving diary entry:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete entry' });
  }
});

// Restore deleted entry (author only)
router.post('/:entryId/restore', async (req: any, res) => {
  const userId = req.user?.userId as string;
  const { entryId } = req.params;
  
  const entry = await DiaryEntry.findById(entryId);
  if (!entry) return res.status(404).json({ success: false, message: 'Not found' });
  if (!entry.isDeleted) return res.status(400).json({ success: false, message: 'Not deleted' });
  if (entry.authorId.toString() !== userId) return res.status(403).json({ success: false, message: 'Forbidden' });

  const userInfo = await getUserInfo(userId);
  
  entry.isDeleted = false;
  entry.deletedAt = undefined;
  entry.deletedBy = undefined;
  entry.deletedReason = undefined;
  
  // Create audit trail entry without circular references
  const auditEntry = {
    action: 'restored' as const,
    userId: userId as any,
    userName: userInfo.name,
    timestamp: new Date()
  };
  
  entry.auditTrail.push(auditEntry);
  
  try {
    await entry.save();
    return res.json({ success: true, data: entry });
  } catch (error) {
    console.error('Error saving diary entry:', error);
    return res.status(500).json({ success: false, message: 'Failed to restore entry' });
  }
});

// Get audit trail for an entry
router.get('/:entryId/audit', async (req: any, res) => {
  const userId = req.user?.userId as string;
  const { entryId } = req.params;
  
  const entry = await DiaryEntry.findById(entryId);
  if (!entry) return res.status(404).json({ success: false, message: 'Not found' });
  
  // Check if user has access (author or partner)
  const partnerId = await getActivePartnerId(userId);
  if (!partnerId || entry.partnerId.toString() !== partnerId.toString()) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  
  return res.json({ success: true, data: entry.auditTrail });
});

// Get entry by ID
router.get('/:entryId', async (req: any, res) => {
  const userId = req.user?.userId as string;
  const { entryId } = req.params;
  
  const entry = await DiaryEntry.findById(entryId);
  if (!entry) return res.status(404).json({ success: false, message: 'Not found' });
  if (entry.isDeleted) return res.status(404).json({ success: false, message: 'Entry deleted' });
  
  // Check privacy
  const partnerId = await getActivePartnerId(userId);
  if (!partnerId || entry.partnerId.toString() !== partnerId.toString()) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  
  if (entry.privacy === 'private' && entry.authorId.toString() !== userId) {
    return res.status(403).json({ success: false, message: 'Private entry' });
  }
  
  return res.json({ success: true, data: entry });
});

export default router;


