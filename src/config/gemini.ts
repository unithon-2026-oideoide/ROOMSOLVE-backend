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
// ⚠️ 무료 티어 할당량은 "모델당 하루 20회"다
//    (GenerateRequestsPerDayPerProjectPerModel-FreeTier = 20).
//    한 모델만 쓰면 테스트 몇 번에 하루치가 사라진다. 할당량이 모델별로 따로
//    잡히므로 기본 모델이 바닥나면 다른 모델로 넘겨 쓴다.
//    시연 규모로 쓰려면 결제를 활성화해야 한다 — 20회로는 어림도 없다.
//
// 2026-08-25 실측: 3.7-flash는 20초가 걸리고 503이 잦았다. 3.5-flash-lite가
// 1.4초로 가장 빠르고 덜 붐벼서 기본으로 두고, 3.6-flash를 예비로 쓴다.
export const GEMINI_MODEL = 'gemini-3.5-flash-lite';

// 기본 모델이 붐비거나 하루 할당량을 다 썼을 때 넘어갈 모델.
// 할당량이 모델별로 따로라, 이 전환만으로 하루에 쓸 수 있는 횟수가 두 배가 된다.
export const GEMINI_FALLBACK_MODEL = 'gemini-3.6-flash';
