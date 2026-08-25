import type { GoogleGenAI } from '@google/genai' with { 'resolution-mode': 'import' };

// AI 하자 분석(POST /api/reports/analyze)에서 쓰는 Gemini 클라이언트.
//
// supabase.ts와 달리 import 시점에 throw하지 않는다. GEMINI_API_KEY가 없어도
// 나머지 API는 전부 정상 동작해야 하기 때문이다. 키가 없으면 analyze만 503으로
// 실패하고 서버는 계속 뜬다.
//
// .env.example의 placeholder가 그대로 들어 있는 경우도 키 없음으로 취급한다.
// 그대로 호출하면 인증 오류로 튀어나와서 원인을 찾기 어렵다.
//
// @google/genai는 ESM 전용인데 이 프로젝트는 CommonJS라 정적 import가 안 된다
// (TS1479). 그래서 타입만 import type으로 가져오고 실제 로딩은 동적 import로 한다.
// 클라이언트는 한 번만 만들어 재사용한다.
let client: GoogleGenAI | null = null;

export async function getGemini(): Promise<GoogleGenAI | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key.startsWith('your-')) return null;
  if (!client) {
    const { GoogleGenAI: GoogleGenAICtor } = await import('@google/genai');
    client = new GoogleGenAICtor({ apiKey: key });
  }
  return client;
}

// 분류 작업이라 Pro까지 쓸 필요가 없고, 시연 중에는 응답 시간이 짧은 쪽이 낫다.
//
// 2026-08-25 실측: gemini-3.7-flash는 같은 요청에 20초가 걸리고 503(UNAVAILABLE)이
// 자주 떴다. 3.6-flash는 3초 안쪽으로 안정적이라 이쪽을 기본으로 쓴다.
// 최신 모델일수록 수요가 몰려 느린 시기가 있으니, 시연 전에 한 번 재보고 정할 것.
export const GEMINI_MODEL = 'gemini-3.6-flash';

// 기본 모델이 과부하일 때 한 번 더 시도할 모델. 더 가볍고 그만큼 덜 붐빈다.
// 분류 품질이 조금 떨어지더라도 시연 중 503으로 멈추는 것보다 낫다.
export const GEMINI_FALLBACK_MODEL = 'gemini-3.5-flash-lite';
