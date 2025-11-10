import { Router } from 'express';
import { authenticate } from '@/middleware/auth';
import { getChatMessages } from '@/controllers/chatController';

const router = Router();

router.use(authenticate);
router.get('/:chatId/messages', getChatMessages);

export default router;

