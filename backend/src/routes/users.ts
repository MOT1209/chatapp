/**
 * User routes (docs/api-contract.md §3.2). All protected.
 */

import { Router } from 'express';
import type { AppContext } from '../context.js';
import { asyncHandler } from '../lib/errors.js';
import { currentUserId, requireAuth } from '../middleware/auth.js';
import { createRateLimit } from '../middleware/rate-limit.js';
import { parse, searchQuerySchema, updateProfileSchema } from '../validation/schemas.js';
import * as users from '../services/user.service.js';

export function createUsersRouter(ctx: AppContext): Router {
  const router = Router();
  router.use(requireAuth);

  const searchLimit = createRateLimit({ windowMs: 60 * 1000, max: 60, prefix: 'search' });

  router.get(
    '/me',
    asyncHandler(async (req, res) => {
      res.status(200).json(await users.getMe(ctx, currentUserId(req)));
    }),
  );

  router.patch(
    '/me',
    asyncHandler(async (req, res) => {
      const patch = parse(updateProfileSchema, req.body);
      res.status(200).json(await users.updateProfile(ctx, currentUserId(req), patch));
    }),
  );

  router.get(
    '/search',
    searchLimit,
    asyncHandler(async (req, res) => {
      const { q, limit } = parse(searchQuerySchema, req.query);
      const found = await users.searchUsers(ctx, currentUserId(req), q, limit);
      res.status(200).json({ users: found });
    }),
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      res.status(200).json(await users.getUserById(ctx, req.params.id as string));
    }),
  );

  return router;
}
