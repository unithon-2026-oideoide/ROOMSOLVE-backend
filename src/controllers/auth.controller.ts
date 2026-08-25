import { Request, Response } from 'express';
import { supabase, supabaseAdmin } from '../config/supabase';
import { UserRole } from '../types';

const VALID_ROLES: UserRole[] = ['tenant', 'landlord', 'technician'];

export async function signup(req: Request, res: Response) {
  const { email, password, name, role, phone } = req.body as {
    email: string;
    password: string;
    name: string;
    role: UserRole;
    phone?: string;
  };

  if (!email || !password || !name || !role) {
    return res.status(400).json({ error: 'email, password, name, role는 필수입니다.' });
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `role은 ${VALID_ROLES.join('|')} 중 하나여야 합니다.` });
  }

  // 1) Supabase Auth에 계정 생성
  const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
  if (authError || !authData.user) {
    return res.status(400).json({ error: authError?.message ?? 'Auth 계정 생성에 실패했습니다.' });
  }

  // 2) public.users 프로필 row 생성 (auth user id를 그대로 사용)
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('users')
    .insert({ id: authData.user.id, name, role, phone: phone ?? null })
    .select()
    .single();

  if (profileError) {
    return res.status(500).json({ error: profileError.message });
  }

  return res.status(201).json({ user: profile, session: authData.session });
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body as { email: string; password: string };

  if (!email || !password) {
    return res.status(400).json({ error: 'email, password는 필수입니다.' });
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session || !data.user) {
    return res.status(401).json({ error: error?.message ?? '이메일 또는 비밀번호가 올바르지 않습니다.' });
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('id', data.user.id)
    .single();

  if (profileError) {
    return res.status(500).json({ error: profileError.message });
  }

  return res.json({ user: profile, session: data.session });
}
