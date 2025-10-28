import express from 'express';
import { 
  getCurrentPartnerChat,
  getOrCreateChat, 
  getChatMessages, 
  sendMessage, 
  markMessageAsViewed, 
  getMessageViewStatus, 
  getUserChats, 
  deleteMessageForMe,
  deleteMessageForEveryone,
  editMessage,
  reactToMessage,
  processMessages,
  validateFileUpload
} from '@/controllers/chatController';
import { uploadFile, getFile, deleteFile, uploadVoiceMessage } from '@/controllers/fileController';
import { upload } from '@/controllers/fileController';
import { authenticate } from '@/middleware/auth';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

// Chat routes
router.get('/chats', getUserChats);
router.get('/current', getCurrentPartnerChat); // New endpoint for current partner chat
router.get('/:partnerId', getOrCreateChat);
router.get('/:chatId/messages', getChatMessages);
router.post('/send', sendMessage);
router.put('/message/:messageId/viewed', markMessageAsViewed);
router.get('/message/:messageId/view-status', getMessageViewStatus);
router.put('/message/:messageId/edit', editMessage);
router.put('/message/:messageId/react', reactToMessage);
router.get('/:chatId/processed-messages', processMessages);
router.post('/validate-file', validateFileUpload);
router.patch('/message/:messageId/delete-for-me', deleteMessageForMe);
router.patch('/:chatId/delete-for-everyone/:messageId', deleteMessageForEveryone);

// File routes
router.post('/upload', upload.single('file'), uploadFile);
router.post('/upload-voice', upload.single('voice'), uploadVoiceMessage);
router.get('/file/:filename', getFile);
router.delete('/file/:messageId', deleteFile);

export default router;
