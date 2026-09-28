import 'express';

declare module 'express-serve-static-core' {
  interface Request {
    /** Set by requireAuth after verifying the bearer token. */
    userId?: string;
  }
}
