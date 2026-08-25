import { randomInt } from 'crypto';
import { Request, Response } from 'express';
import { supabase, supabaseAdmin } from '../config/supabase';
import { RepairCategory, REPAIR_CATEGORIES, UserRole, USER_ROLES } from '../types';

// landlord 가입 시 발급하는 초대 코드 문자셋. 0/O, 1/I/L처럼 헷갈리는 문자는 뺐다 —
// 세입자가 임대인에게 문자/구두로 코드를 전달받아 손으로 입력하는 경우가 많아서다.
const LANDLORD_CODE_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LANDLORD_CODE_LENGTH = 6;
// users.landlord_code에 unique 제약이 걸려 있어 우연히 겹치면 insert가 23505로 실패한다.
// 문자셋 32^6 ≈ 10억 조합이라 실제로 겹칠 확률은 거의 없지만, 재시도로 방어한다.
const LANDLORD_CODE_MAX_ATTEMPTS = 5;
const POSTGRES_UNIQUE_VIOLATION = '23505';

function generateLandlordCode(): string {
  let code = '';
  for (let i = 0; i < LANDLORD_CODE_LENGTH; i++) {
    code += LANDLORD_CODE_CHARSET[randomInt(LANDLORD_CODE_CHARSET.length)];
  }
  return code;
}

// technician(수리업체) 가입에만 필요한 추가 입력 검증. 문제가 없으면 null.
// Auth 계정을 만들기 *전에* 호출한다 — 나중에 걸리면 계정만 남는다.
export function vendorSignupError(businessNumber?: string, categories?: unknown): string | null {
  if (!businessNumber) {
    return 'role이 technician이면 business_number는 필수입니다.';
  }
  if (!Array.isArray(categories) || categories.length === 0) {
    return 'role이 technician이면 categories는 비어 있지 않은 배열이어야 합니다.';
  }
  const invalid = categories.filter((c) => !REPAIR_CATEGORIES.includes(c as RepairCategory));
  if (invalid.length > 0) {
    return `categories의 값은 ${REPAIR_CATEGORIES.join('|')} 중 하나여야 합니다. (잘못된 값: ${invalid.join(', ')})`;
  }
  return null;
}

export async function signup(req: Request, res: Response) {
  const { email, password, name, role, phone, business_number, categories } = req.body as {
    email: string;
    password: string;
    name: string;
    role: UserRole;
    phone?: string;
    business_number?: string;
    categories?: RepairCategory[];
  };

  if (!email || !password || !name || !role) {
    return res.status(400).json({ error: 'email, password, name, role는 필수입니다.' });
  }
  if (!USER_ROLES.includes(role)) {
    return res.status(400).json({ error: `role은 ${USER_ROLES.join('|')} 중 하나여야 합니다.` });
  }
  if (role === 'technician') {
    const vendorError = vendorSignupError(business_number, categories);
    if (vendorError) {
      return res.status(400).json({ error: vendorError });
    }
  }

  // 1) Supabase Auth에 계정 생성
  const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
  if (authError || !authData.user) {
    return res.status(400).json({ error: authError?.message ?? 'Auth 계정 생성에 실패했습니다.' });
  }

  // 2) public.users 프로필 row 생성 (auth user id를 그대로 사용).
  //    role이 landlord면 초대 코드를 함께 발급한다. landlord_code에 unique 제약이
  //    있어 우연히 겹치면(23505) 새 코드로 재시도한다 — auth 계정은 이미 만들어졌으므로
  //    여기서 실패하면 안 된다.
  let profile: Record<string, unknown> | null = null;
  let profileError: { message: string; code?: string } | null = null;
  for (let attempt = 0; attempt < LANDLORD_CODE_MAX_ATTEMPTS; attempt++) {
    const landlordCode = role === 'landlord' ? generateLandlordCode() : null;
    const { data, error } = await supabaseAdmin
      .from('users')
      .insert({ id: authData.user.id, name, role, phone: phone ?? null, landlord_code: landlordCode })
      .select()
      .single();

    if (!error) {
      profile = data;
      profileError = null;
      break;
    }
    profileError = error;
    if (error.code !== POSTGRES_UNIQUE_VIOLATION) break;
  }

  if (!profile) {
    return res.status(500).json({ error: profileError?.message ?? '프로필 생성에 실패했습니다.' });
  }

  // 3) technician이면 업체 정보를 vendors에 별도로 저장한다.
  //    users에는 기존 컬럼만 두고, 사업자등록번호 / 전문 분야는 여기에 들어간다.
  //    ponytail: 트랜잭션 없음. 여기서 실패하면 계정만 만들어진 상태로 남는다.
  //    같은 이메일로 다시 가입할 수 없으므로, 재시도가 필요해지면 별도의
  //    "업체 정보 등록" 엔드포인트를 두는 편이 낫다.
  if (role !== 'technician') {
    return res.status(201).json({ user: profile, session: authData.session });
  }

  const { data: vendor, error: vendorError } = await supabaseAdmin
    .from('vendors')
    .insert({
      user_id: authData.user.id,
      name,
      business_number,
      categories,
      phone: phone ?? null,
    })
    .select()
    .single();

  if (vendorError) {
    return res.status(500).json({ error: vendorError.message });
  }

  return res.status(201).json({ user: profile, vendor, session: authData.session });
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
