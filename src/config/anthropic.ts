import Anthropic from '@anthropic-ai/sdk';

// AI 하자 분석(POST /api/reports/analyze)에서 쓰는 Claude 클라이언트.
//
// supabase.ts와 달리 import 시점에 throw하지 않는다. ANTHROPIC_API_KEY가 없어도
// 나머지 API는 전부 정상 동작해야 하기 때문이다. 키가 없으면 analyze만 503으로
// 실패하고 서버는 계속 뜬다.
//
// .env.example의 placeholder(your-anthropic-api-key)가 그대로 들어 있는 경우도
// 키 없음으로 취급한다. 그대로 호출하면 인증 오류가 401로 튀어나와서 원인을
// 찾기 어렵다.
let client: Anthropic | null = null;

export function getAnthropic(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key.startsWith('your-')) return null;
  if (!client) client = new Anthropic({ apiKey: key });
  return client;
}
