import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';

export interface AuthedRequest extends Request {
  user?: { id: string; email: string | null };
}

// Authorization: Bearer <supabase access token> 를 검증하고 req.user를 채워주는 미들웨어.
export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization Bearer token' });
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = { id: data.user.id, email: data.user.email ?? null };
  next();
}
