import { Request, Response } from 'express';
import { asyncHandler, AppError } from '@/middleware/errorHandler';
import CalendarNote from '@/models/CalendarNote';
import User from '@/models/User';
import { getSocketHandler } from '@/socket/socketHandler';

// Get calendar notes
export const getCalendarNotes = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const { start, end, tags, search } = req.query;

  if (!userId) {
    throw new AppError('Authentication required', 401);
  }

  // Build query
  const query: any = {
    isDeleted: false,
    $or: [
      { authorId: userId },
      { privacy: 'public' }
    ]
  };

  // Date range filter
  if (start && end) {
    query.date = {
      $gte: new Date(start as string),
      $lte: new Date(end as string)
    };
  }

  // Tags filter
  if (tags) {
    const tagArray = Array.isArray(tags) ? tags : [tags];
    query.tags = { $in: tagArray };
  }

  // Search filter
  if (search) {
    query.text = { $regex: search as string, $options: 'i' };
  }

  console.log('Calendar notes query:', query);

  const notes = await CalendarNote.find(query)
    .sort({ date: -1, createdAt: -1 })
    .limit(100);

  console.log('Found calendar notes:', notes.length);

  res.json({
    success: true,
    message: 'Calendar notes retrieved successfully',
    data: notes
  });
});

// Create calendar note
export const createCalendarNote = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const { date, text, authorName, privacy = 'public', tags = [], reminderAt } = req.body;

  if (!userId) {
    throw new AppError('Authentication required', 401);
  }

  if (!date || !text || !authorName) {
    throw new AppError('Date, text, and author name are required', 400);
  }

  // Get user's partner ID
  const user = await User.findById(userId).select('partners');
  const partnerId = user?.partners?.[0]?.partnerId || null;

  const note = await CalendarNote.create({
    partnerId,
    date: new Date(date),
    text: text.trim(),
    authorId: userId,
    authorName: authorName.trim(),
    privacy,
    tags: Array.isArray(tags) ? tags : [],
    reminderAt: reminderAt ? new Date(reminderAt) : undefined,
    reminderSent: false,
    auditTrail: [{
      action: 'created',
      userId,
      userName: authorName,
      timestamp: new Date().toISOString()
    }]
  });

  console.log('Created calendar note:', note._id);

  // Emit socket update to partner
  const socketHandler = getSocketHandler();
  if (socketHandler && partnerId) {
    socketHandler.emitCalendarUpdate(partnerId, 'note_created', {
      noteId: note._id,
      date: note.date,
      text: note.text,
      authorName: note.authorName
    });
  }

  res.status(201).json({
    success: true,
    message: 'Calendar note created successfully',
    data: note
  });
});

// Update calendar note
export const updateCalendarNote = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const { noteId } = req.params;
  const { text, privacy, tags, reminderAt } = req.body;

  if (!userId) {
    throw new AppError('Authentication required', 401);
  }

  const note = await CalendarNote.findById(noteId);
  if (!note) {
    throw new AppError('Note not found', 404);
  }

  if (note.authorId !== userId) {
    throw new AppError('You can only update your own notes', 403);
  }

  if (note.isDeleted) {
    throw new AppError('Cannot update deleted note', 400);
  }

  const updateData: any = {};
  if (text !== undefined) updateData.text = text.trim();
  if (privacy !== undefined) updateData.privacy = privacy;
  if (tags !== undefined) updateData.tags = Array.isArray(tags) ? tags : [];
  if (reminderAt !== undefined) updateData.reminderAt = reminderAt ? new Date(reminderAt) : undefined;

  updateData.updatedAt = new Date();
  
  // Create audit trail entry separately to avoid circular reference
  const auditEntry = {
    action: 'updated',
    userId,
    userName: note.authorName,
    timestamp: new Date().toISOString(),
    changes: { ...updateData }
  };

  updateData.$push = {
    auditTrail: auditEntry
  };

  const updatedNote = await CalendarNote.findByIdAndUpdate(noteId, updateData, { new: true });

  console.log('Updated calendar note:', noteId);

  res.json({
    success: true,
    message: 'Calendar note updated successfully',
    data: updatedNote
  });
});

// Delete calendar note
export const deleteCalendarNote = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const { noteId } = req.params;
  const { reason } = req.body;

  if (!userId) {
    throw new AppError('Authentication required', 401);
  }

  const note = await CalendarNote.findById(noteId);
  if (!note) {
    throw new AppError('Note not found', 404);
  }

  if (note.authorId !== userId) {
    throw new AppError('You can only delete your own notes', 403);
  }

  if (note.isDeleted) {
    throw new AppError('Note already deleted', 400);
  }

  const updateData = {
    isDeleted: true,
    deletedAt: new Date(),
    deletedBy: userId,
    deletedReason: reason || 'No reason provided',
    updatedAt: new Date(),
    $push: {
      auditTrail: {
        action: 'deleted',
        userId,
        userName: note.authorName,
        timestamp: new Date().toISOString(),
        reason: reason || 'No reason provided'
      }
    }
  };

  await CalendarNote.findByIdAndUpdate(noteId, updateData);

  console.log('Deleted calendar note:', noteId);

  res.json({
    success: true,
    message: 'Calendar note deleted successfully'
  });
});

// Restore calendar note
export const restoreCalendarNote = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const { noteId } = req.params;

  if (!userId) {
    throw new AppError('Authentication required', 401);
  }

  const note = await CalendarNote.findById(noteId);
  if (!note) {
    throw new AppError('Note not found', 404);
  }

  if (note.authorId !== userId) {
    throw new AppError('You can only restore your own notes', 403);
  }

  if (!note.isDeleted) {
    throw new AppError('Note is not deleted', 400);
  }

  const updateData = {
    isDeleted: false,
    deletedAt: undefined,
    deletedBy: undefined,
    deletedReason: undefined,
    updatedAt: new Date(),
    $push: {
      auditTrail: {
        action: 'restored',
        userId,
        userName: note.authorName,
        timestamp: new Date().toISOString()
      }
    }
  };

  const restoredNote = await CalendarNote.findByIdAndUpdate(noteId, updateData, { new: true });

  console.log('Restored calendar note:', noteId);

  res.json({
    success: true,
    message: 'Calendar note restored successfully',
    data: restoredNote
  });
});

// Get audit trail
export const getAuditTrail = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const { noteId } = req.params;

  if (!userId) {
    throw new AppError('Authentication required', 401);
  }

  const note = await CalendarNote.findById(noteId);
  if (!note) {
    throw new AppError('Note not found', 404);
  }

  if (note.authorId !== userId) {
    throw new AppError('You can only view audit trail of your own notes', 403);
  }

  res.json({
    success: true,
    message: 'Audit trail retrieved successfully',
    data: note.auditTrail
  });
});

// Get reminders
export const getReminders = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;

  if (!userId) {
    throw new AppError('Authentication required', 401);
  }

  const now = new Date();
  const reminders = await CalendarNote.find({
    authorId: userId,
    isDeleted: false,
    reminderAt: { $lte: now },
    reminderSent: false
  }).sort({ reminderAt: 1 });

  res.json({
    success: true,
    message: 'Reminders retrieved successfully',
    data: reminders
  });
});

// Mark reminder as sent
export const markReminderSent = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const { noteId } = req.params;

  if (!userId) {
    throw new AppError('Authentication required', 401);
  }

  const note = await CalendarNote.findById(noteId);
  if (!note) {
    throw new AppError('Note not found', 404);
  }

  if (note.authorId !== userId) {
    throw new AppError('You can only mark reminders of your own notes', 403);
  }

  note.reminderSent = true;
  await note.save();

  res.json({
    success: true,
    message: 'Reminder marked as sent'
  });
});
