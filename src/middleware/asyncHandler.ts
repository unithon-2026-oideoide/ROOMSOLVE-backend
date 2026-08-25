import { Request, Response, NextFunction, RequestHandler } from 'express';

// try/catch 없이도 async 라우트 핸들러의 에러가 errorHandler로 흘러가게 감싸주는 유틸.
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
