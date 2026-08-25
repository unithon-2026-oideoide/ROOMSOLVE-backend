import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { UserRole, USER_ROLES } from '../types';

export async function updateUserRole(req: Request, res: Response) {
  const { id } = req.params;
  const { role } = req.body as { role: UserRole };

  if (!USER_ROLES.includes(role)) {
    return res.status(400).json({ error: `role은 ${USER_ROLES.join('|')} 중 하나여야 합니다.` });
  }

  const { data, error } = await supabaseAdmin
    .from('users')
    .update({ role })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }
  if (!data) {
    return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
  }

  return res.json({ user: data });
}
