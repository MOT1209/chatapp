import type { Request, Response } from 'express';
import * as userService from '../services/user.service.js';
import { asyncHandler } from '../lib/async-handler.js';
import type { SearchQuery, UpdateProfileBody } from '../validators/users.validators.js';

export const meHandler = asyncHandler(async (req: Request, res: Response) => {
  const user = await userService.getMe(req.userId!);
  res.status(200).json(user);
});

export const searchHandler = asyncHandler(async (req: Request, res: Response) => {
  const { q, limit } = res.locals.query as SearchQuery;
  const users = await userService.search(req.userId!, q, limit);
  res.status(200).json({ users });
});

export const byIdHandler = asyncHandler(async (req: Request, res: Response) => {
  const user = await userService.getById(req.params.id as string);
  res.status(200).json(user);
});

export const updateMeHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as UpdateProfileBody;
  const user = await userService.updateMe(req.userId!, body);
  res.status(200).json(user);
});
