import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing Supabase env vars. Copy .env.example to .env and fill in SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY.'
  );
}

// anon 클라이언트: 로그인/회원가입 등 사용자 컨텍스트에서 쓰는 인증 플로우용.
// 서버에서 모든 요청이 이 인스턴스 하나를 공유하므로 세션을 남기면 안 된다.
// (남기면 마지막에 로그인한 사용자의 토큰으로 이후 요청이 나가서 사용자가 섞인다.)
// 로그인/회원가입 결과 세션은 응답으로 내려보내고, 서버 쪽 조회는 supabaseAdmin을 쓴다.
export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// service role 클라이언트: RLS를 우회해야 하는 서버 사이드 로직(관리자성 CRUD)용.
// 절대 프론트엔드로 이 키를 내려보내지 말 것.
export const supabaseAdmin: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
