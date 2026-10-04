import { Router } from 'express';
import {
  csrfHandler,
  forgotPasswordHandler,
  loginHandler,
  logoutHandler,
  refreshHandler,
  registerHandler,
  resetPasswordHandler,
} from '../controllers/auth.controller.js';
import { validateBody } from '../middleware/validate.js';
import {
  forgotPasswordRateLimit,
  loginRateLimit,
  refreshRateLimit,
  registerRateLimit,
  resetPasswordRateLimit,
} from '../middleware/rate-limit.js';
import {
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
} from '../validators/auth.validators.js';

const router = Router();

// Each endpoint has its own bucket (see middleware/rate-limit.ts): exhausting
// one must never lock the others — e.g. a login brute-force run from a shared
// IP must not stop clients on that IP from refreshing their sessions.
router.post('/register', registerRateLimit, validateBody(registerSchema), registerHandler);
router.post('/login', loginRateLimit, validateBody(loginSchema), loginHandler);
router.post('/refresh', refreshRateLimit, validateBody(refreshSchema), refreshHandler);
router.post('/logout', logoutHandler);
router.post('/forgot-password', forgotPasswordRateLimit, validateBody(forgotPasswordSchema), forgotPasswordHandler);
router.post('/reset-password', resetPasswordRateLimit, validateBody(resetPasswordSchema), resetPasswordHandler);

// Not rate limited like the credential endpoints: a client calls it on every page
// load, and each call is an HMAC over a cookie the attacker already lacks.
router.get('/csrf', csrfHandler);

export default router;