/**
 * Auth routes (docs/api-contract.md §3.1).
 *
 * Register/login/refresh/logout and the password-reset pair. All are rate limited per
 * client; forgot-password and reset always answer without revealing whether the account
 * or token existed.
 */

import { Router } from 'express';
import type { AppContext } from '../context.js';
import { asyncHandler } from '../lib/errors.js';
import { currentUserId, requireAuth } from '../middleware/auth.js';
import { createRateLimit } from '../middleware/rate-limit.js';
import { parse } from '../validation/schemas.js';
import {
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
} from '../validation/schemas.js';
import * as auth from '../services/auth.service.js';

export function createAuthRouter(ctx: AppContext): Router {
  const router = Router();

  const limit = createRateLimit({ windowMs: 15 * 60 * 1000, max: 50, prefix: 'auth' });

  const meta = (req: import('express').Request) => ({
    userAgent: req.header('user-agent') ?? null,
    ipAddress: req.ip ?? null,
  });

  router.post(
    '/register',
    limit,
    asyncHandler(async (req, res) => {
      const input = parse(registerSchema, req.body);
      const result = await auth.register(ctx, input, meta(req));
      res.status(201).json(result);
    }),
  );

  router.post(
    '/login',
    limit,
    asyncHandler(async (req, res) => {
      const input = parse(loginSchema, req.body);
      const result = await auth.login(ctx, input, meta(req));
      res.status(200).json(result);
    }),
  );

  router.post(
    '/refresh',
    limit,
    asyncHandler(async (req, res) => {
      const { refreshToken } = parse(refreshSchema, req.body);
      const result = await auth.refresh(ctx, refreshToken, meta(req));
      res.status(200).json(result);
    }),
  );

  router.post(
    '/logout',
    requireAuth,
    asyncHandler(async (req, res) => {
      await auth.logout(ctx, currentUserId(req));
      res.status(204).end();
    }),
  );

  router.post(
    '/forgot-password',
    limit,
    asyncHandler(async (req, res) => {
      const { email } = parse(forgotPasswordSchema, req.body);
      await auth.forgotPassword(ctx, email);
      res.status(202).json({});
    }),
  );

  router.post(
    '/reset-password',
    limit,
    asyncHandler(async (req, res) => {
      const { token, newPassword } = parse(resetPasswordSchema, req.body);
      await auth.resetPassword(ctx, token, newPassword);
      res.status(204).end();
    }),
  );

  return router;
}
