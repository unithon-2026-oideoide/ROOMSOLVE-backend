import { Request, Response, NextFunction } from 'express';

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` });
}

// eslint 등에서 unused-vars로 걸리더라도 express가 에러 핸들러로 인식하려면
// 인자 4개(err, req, res, next) 시그니처를 반드시 유지해야 함.
export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  console.error(err);
  const status = err.status ?? 500;
  res.status(status).json({ error: err.message ?? 'Internal Server Error' });
}
