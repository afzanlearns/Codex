import { Request, Response, NextFunction, RequestHandler } from 'express';

type AsyncRoute = (req: Request, res: Response, next: NextFunction) => Promise<void>;

export function asyncHandler(fn: AsyncRoute): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function isMissingDbObject(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  return code === 'ER_NO_SUCH_TABLE'
    || code === 'ER_BAD_FIELD_ERROR'
    || code === 'ER_SP_DOES_NOT_EXIST'
    || code === 'ER_VIEW_INVALID';
}
