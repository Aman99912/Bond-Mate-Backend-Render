import { Router } from 'express';
import { authenticate } from '@/middleware/auth';
import {
  getCalendarNotes,
  createCalendarNote,
  updateCalendarNote,
  deleteCalendarNote,
  restoreCalendarNote,
  getAuditTrail,
  getReminders,
  markReminderSent
} from '@/controllers/calendarController';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Calendar notes routes
router.get('/', getCalendarNotes);
router.post('/', createCalendarNote);
router.put('/:noteId', updateCalendarNote);
router.delete('/:noteId', deleteCalendarNote);
router.post('/:noteId/restore', restoreCalendarNote);
router.get('/:noteId/audit', getAuditTrail);

// Reminders routes
router.get('/reminders', getReminders);
router.post('/:noteId/reminder-sent', markReminderSent);

export default router;