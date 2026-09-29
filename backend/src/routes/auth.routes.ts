import { Router } from 'express';
import {
  forgotPasswordHandler,
  loginHandler,
  logoutHandler,
  refreshHandler,
  registerHandler,
  resetPasswordHandler,
} from '../controllers/auth.controller.js';
import { validateBody } from '../middleware/validate.js';
import { authRateLimit } from '../middleware/rate-limit.js';
import {
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
} from '../validators/auth.validators.js';

const router = Router();

router.post('/register', authRateLimit, validateBody(registerSchema), registerHandler);
router.post('/login', authRateLimit, validateBody(loginSchema), loginHandler);
router.post('/refresh', authRateLimit, validateBody(refreshSchema), refreshHandler);
router.post('/logout', logoutHandler);
router.post('/forgot-password', authRateLimit, validateBody(forgotPasswordSchema), forgotPasswordHandler);
router.post('/reset-password', authRateLimit, validateBody(resetPasswordSchema), resetPasswordHandler);

export default router;
