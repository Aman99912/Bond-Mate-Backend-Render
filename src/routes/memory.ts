import express from 'express';
import Memory from '../models/memory';
import { Types } from 'mongoose';
import { authenticate } from '../middleware/auth';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

// Add a new memory (dummy image for now)
router.post('/add', async (req, res) => {
  try {
    const { uploadedBy, coupleId } = req.body;
    // Dummy image URL
    const imageUrl = 'https://via.placeholder.com/300x200.png?text=Dummy+Image';
    const memory = await Memory.create({
      imageUrl,
      uploadedBy: new Types.ObjectId(uploadedBy),
      coupleId: new Types.ObjectId(coupleId),
    });
    res.status(201).json(memory);
  } catch (err) {
    res.status(500).json({ error: "Error adding memory"});
  }
});

// Get all memories for a couple
router.get('/:coupleId', async (req, res) => {
  try {
    const { coupleId } = req.params;
    const memories = await Memory.find({ coupleId }).populate('uploadedBy', 'name');
    res.json(memories);
  } catch (err) {
    res.status(500).json({ error: "Error fetching memories" });
  }
});

export default router;
