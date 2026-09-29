/**
 * Express Request augmentation.
 *
 * `requireAuth` sets `userId` after verifying the access token, so protected controllers
 * can read a typed, guaranteed-present value.
 */

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export {};
