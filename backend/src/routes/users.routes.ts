import { Router } from 'express';
import { byIdHandler, meHandler, searchHandler, updateMeHandler } from '../controllers/users.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { searchRateLimit } from '../middleware/rate-limit.js';
import { searchQuerySchema, updateProfileSchema } from '../validators/users.validators.js';

const router = Router();

router.use(requireAuth);

// Order matters: a literal path must be registered before ":id" or "search"/"me"
// would be swallowed by the param route.
router.get('/me', meHandler);
router.patch('/me', validateBody(updateProfileSchema), updateMeHandler);
router.get('/search', searchRateLimit, validateQuery(searchQuerySchema), searchHandler);
router.get('/:id', byIdHandler);

export default router;
