import type { NextFunction, Request, Response } from 'express';

type Handler = (req: Request, res: Response) => Promise<void>;

/** Express 4 does not forward a rejected promise to error middleware on its own. */
export function asyncHandler(handler: Handler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch(next);
  };
}
