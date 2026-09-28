import { Router } from 'express';
import {
  createHandler,
  deleteMessageHandler,
  listHandler,
  markReadHandler,
  messagesHandler,
  sendMessageHandler,
} from '../controllers/conversations.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { messageRateLimit } from '../middleware/rate-limit.js';
import {
  createConversationSchema,
  markReadSchema,
  messagesQuerySchema,
  sendMessageSchema,
} from '../validators/conversations.validators.js';

const router = Router();

router.use(requireAuth);

router.get('/', listHandler);
router.post('/', validateBody(createConversationSchema), createHandler);
router.get('/:id/messages', validateQuery(messagesQuerySchema), messagesHandler);
router.post('/:id/messages', messageRateLimit, validateBody(sendMessageSchema), sendMessageHandler);
router.post('/:id/read', validateBody(markReadSchema), markReadHandler);
// Additive beyond the original contract — see docs/api-contract.md §3.4.1.
router.delete('/:id/messages/:messageId', deleteMessageHandler);

export default router;
