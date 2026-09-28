import type { Request, Response } from 'express';
import * as authService from '../services/auth.service.js';
import { asyncHandler } from '../lib/async-handler.js';
import type { RegisterBody, LoginBody } from '../validators/auth.validators.js';

function sessionMeta(req: Request): { userAgent?: string; ipAddress?: string } {
  return {
    userAgent: req.headers['user-agent'],
    ipAddress: req.ip,
  };
}

export const registerHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as RegisterBody;
  const result = await authService.register(body, sessionMeta(req));
  res.status(201).json(result);
});

export const loginHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as LoginBody;
  const result = await authService.login(body, sessionMeta(req));
  res.status(200).json(result);
});

export const refreshHandler = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body as { refreshToken: string };
  const tokens = await authService.refresh(refreshToken, sessionMeta(req));
  res.status(200).json(tokens);
});

export const logoutHandler = asyncHandler(async (req: Request, res: Response) => {
  const userId = authService.tryIdentifyFromAccessToken(req.headers.authorization);
  if (userId) {
    await authService.logoutAllSessions(userId);
  }
  res.status(204).end();
});

export const forgotPasswordHandler = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body as { email: string };
  await authService.requestPasswordReset(email);
  res.status(202).json({});
});

export const resetPasswordHandler = asyncHandler(async (req: Request, res: Response) => {
  const { token, newPassword } = req.body as { token: string; newPassword: string };
  await authService.resetPassword(token, newPassword);
  res.status(204).end();
});
