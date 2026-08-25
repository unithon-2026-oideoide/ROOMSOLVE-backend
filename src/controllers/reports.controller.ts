import { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../config/supabase';
import { getGemini, GEMINI_MODEL, GEMINI_FALLBACK_MODEL } from '../config/gemini';
import { AuthedRequest } from '../middleware/auth';
import {
  APPLIANCE_TYPES,
  ApplianceOwnership,
  ApplianceType,
  Liability,
  PurchaseAge,
  RecommendedPath,
  RepairCategory,
} from '../types';

const CATEGORIES: RepairCategory[] = [
  'plumbing', 'electrical', 'heating', 'appliance',
  'door_window', 'interior', 'pest', 'other',
];
const SEVERITIES = ['low', 'medium', 'high', 'emergency'] as const;
const RECOMMENDED_PATHS: RecommendedPath[] = ['self_fix', 'manufacturer_as', 'vendor_match'];

// 하자 리포트 생성.
//
// tenant_id는 body가 아니라 토큰에서 꺼낸다. 라우터에 requireAuth가 걸려 있으므로
// req.user는 항상 채워져 있고, 세입자가 남의 이름으로 신고할 수 없다.
//
// 사진은 photo_urls(배열)로 받는다. 프론트는 POST /api/uploads를 사진 수만큼 호출해
// url을 모은 뒤 그 배열을 통째로 보내면 된다. DB에서 photo_url만 NOT NULL이라
// 첫 번째 원소를 대표 사진으로 함께 저장한다.
//
// landlord_id는 여전히 body로 받는다. properties(호실) 테이블이 없어서 세입자와
// 임대인을 이어줄 경로가 서버에 없기 때문이다. 테이블이 생기면 조인으로 대체할 것.
export async function createReport(req: AuthedRequest, res: Response) {
  const { landlord_id, photo_urls, description, category, severity, recommended_path, self_fix_guide,
          appliance_type } =
    req.body as {
      landlord_id?: string;
      photo_urls?: unknown;
      description?: string;
      category?: string;
      severity?: string;
      recommended_path?: string;
      self_fix_guide?: string;
      appliance_type?: string;
    };

  if (!landlord_id) {
    return res.status(400).json({ error: 'landlord_id는 필수입니다.' });
  }

  const urls = Array.isArray(photo_urls) ? photo_urls.filter((u): u is string => typeof u === 'string' && !!u) : [];
  if (urls.length === 0) {
    return res.status(400).json({ error: 'photo_urls에 사진 URL이 최소 한 개 필요합니다.' });
  }

  // 분석 결과를 함께 저장하는 경우에만 값을 검증한다. 셋 다 DB에 CHECK가 걸려 있어서
  // 잘못된 값이면 500이 나므로, 여기서 400으로 먼저 걸러 준다.
  if (category !== undefined && !CATEGORIES.includes(category as RepairCategory)) {
    return res.status(400).json({ error: `category는 ${CATEGORIES.join('|')} 중 하나여야 합니다.` });
  }
  if (severity !== undefined && !SEVERITIES.includes(severity as (typeof SEVERITIES)[number])) {
    return res.status(400).json({ error: `severity는 ${SEVERITIES.join('|')} 중 하나여야 합니다.` });
  }
  if (recommended_path !== undefined && !RECOMMENDED_PATHS.includes(recommended_path as RecommendedPath)) {
    return res.status(400).json({ error: `recommended_path는 ${RECOMMENDED_PATHS.join('|')} 중 하나여야 합니다.` });
  }
  if (appliance_type !== undefined && !APPLIANCE_TYPES.includes(appliance_type as ApplianceType)) {
    return res.status(400).json({ error: `appliance_type은 ${APPLIANCE_TYPES.join('|')} 중 하나여야 합니다.` });
  }

  const { data, error } = await supabaseAdmin
    .from('reports')
    .insert({
      tenant_id: req.user!.id,
      landlord_id,
      photo_url: urls[0],
      photo_urls: urls,
      description: description ?? null,
      category: category ?? null,
      severity: severity ?? null,
      recommended_path: recommended_path ?? null,
      self_fix_guide: self_fix_guide ?? null,
      appliance_type: appliance_type ?? null,
      status: 'pending',
    })
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(201).json({ report: data });
}

// 내 신고 목록. 로그인한 세입자 본인 것만 반환한다.
//
// tenant_id를 쿼리로 받지 않는 것이 중요하다. 받으면 남의 id를 넣어 조회할 수 있다.
// 임대인이 자기 소속 신고를 보는 경로는 GET /api/landlord/requests로 따로 있다.
export async function listReports(req: AuthedRequest, res: Response) {
  const { status } = req.query as { status?: string };

  let query = supabaseAdmin
    .from('reports')
    .select('*')
    .eq('tenant_id', req.user!.id)
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) {
    return res.status(500).json({ error: error.message });
  }
  return res.json({ reports: data });
}

// 신고 단건 조회. 본인 것이 아니면 404를 준다.
// 403이 아니라 404인 이유는, 403이면 "그 id의 신고가 존재한다"는 사실이 새기 때문이다.
export async function getReport(req: AuthedRequest, res: Response) {
  const { id } = req.params;

  const { data, error } = await supabaseAdmin
    .from('reports')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', req.user!.id)
    .maybeSingle();

  if (error) {
    return res.status(500).json({ error: error.message });
  }
  if (!data) {
    return res.status(404).json({ error: '신고를 찾을 수 없습니다.' });
  }
  return res.json({ report: data });
}

// 분석 결과 스키마. AI 응답을 이 모양으로만 받도록 강제한다(structured outputs).
// 자유 문자열을 허용하면 category가 DB CHECK와 어긋나 insert가 조용히 실패한다.
const AnalysisSchema = z.object({
  category: z.enum(['plumbing', 'electrical', 'heating', 'appliance',
                    'door_window', 'interior', 'pest', 'other']),
  severity: z.enum(['low', 'medium', 'high', 'emergency']),
  recommended_path: z.enum(['self_fix', 'manufacturer_as', 'vendor_match']),
  self_fix_guide: z.string().nullable(),
  // 가전이 아니면 빈 문자열. self_fix_guide와 같은 이유로 null 대신 ''를 쓴다.
  appliance_type: z.enum(['', 'aircon', 'boiler', 'induction', 'refrigerator', 'washer']),
});

const ANALYSIS_SYSTEM_PROMPT = `당신은 주거 하자를 진단하는 전문가입니다. 세입자가 올린 사진과 설명을 보고 분류하세요.

severity 기준:
- low: 생활에 지장이 적고 미뤄도 되는 수준
- medium: 불편하지만 당장 위험하지는 않은 수준
- high: 방치하면 피해가 커지는 수준(누수 확산, 곰팡이 등)
- emergency: 안전 위험이 있어 즉시 조치가 필요한 수준(감전, 가스, 대량 누수 등)

recommended_path 기준:
- self_fix: 세입자가 도구 없이 몇 분 안에 해결할 수 있는 경우
- manufacturer_as: 보일러·에어컨 등 제조사 보증/AS 대상 기기의 고장인 경우
- vendor_match: 전문 수리업체의 방문이 필요한 경우

self_fix_guide는 recommended_path가 self_fix일 때만 채우고, 그 외에는 빈 문자열로 두세요.
가이드는 한국어로 3~5문장, 순서대로 따라 할 수 있게 쓰세요.
안전 위험이 조금이라도 있으면 self_fix를 고르지 마세요.

appliance_type 기준:
- 고장난 대상이 아래 가전 중 하나로 보이면 해당 값을 고르세요.
  aircon(에어컨), boiler(보일러), induction(인덕션/가스레인지),
  refrigerator(냉장고), washer(세탁기)
- 위 가전이 아니거나 확실하지 않으면 빈 문자열로 두세요.
- 이것은 사실 확인일 뿐입니다. 수리비를 누가 부담하는지는 판단하지 마세요.`;

// Gemini에 넘기는 응답 스키마. AnalysisSchema와 같은 모양이지만 self_fix_guide만
// nullable이 아니라 문자열이다. Gemini 스키마의 null 표현이 JSON Schema와 미묘하게
// 달라서, 해당 없음을 빈 문자열로 받고 우리 쪽에서 null로 바꾼다.
const GEMINI_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    category: {
      type: 'string',
      enum: ['plumbing', 'electrical', 'heating', 'appliance',
             'door_window', 'interior', 'pest', 'other'],
    },
    severity: { type: 'string', enum: ['low', 'medium', 'high', 'emergency'] },
    recommended_path: { type: 'string', enum: ['self_fix', 'manufacturer_as', 'vendor_match'] },
    self_fix_guide: {
      type: 'string',
      description: 'recommended_path가 self_fix일 때만 채우고, 그 외에는 빈 문자열',
    },
    appliance_type: {
      type: 'string',
      enum: ['', 'aircon', 'boiler', 'induction', 'refrigerator', 'washer'],
      description: '고장난 것이 가전제품일 때만 종류를 고르고, 아니면 빈 문자열',
    },
  },
  required: ['category', 'severity', 'recommended_path', 'self_fix_guide', 'appliance_type'],
};

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 업로드 제한과 동일하게 맞춘다

// Gemini는 이미지 URL을 대신 받아 오지 않는다. 서버가 직접 내려받아
// base64로 넘겨야 한다. 실패는 호출한 쪽에서 400으로 처리한다.
async function fetchImagePart(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) {
    throw new Error(`사진을 가져오지 못했습니다 (${res.status}): ${url}`);
  }

  const mimeType = res.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
  if (!mimeType.startsWith('image/')) {
    throw new Error(`이미지가 아닌 응답입니다 (${mimeType || '알 수 없음'}): ${url}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`사진이 10MB를 넘습니다: ${url}`);
  }

  return { inlineData: { mimeType, data: buffer.toString('base64') } };
}

// ---------------------------------------------------------------------------
// 가전 하자 판정
//
// 가전은 일반 하자와 흐름이 다르다 — 소유 관계와 보증기간에 따라 부담 주체가 갈리고,
// 보증기간 내라면 사설 업체를 부르는 순간 무상 수리 기회를 잃는다.
//
// 판정은 전부 아래 룰로 한다. LLM은 "이게 어떤 가전인가"(사실 추출)까지만 하고
// 부담 주체는 정하지 않는다 — 책임 판단을 확률적 출력에 맡기지 않기 위해서다.
// ---------------------------------------------------------------------------

export interface ApplianceQuestion {
  id: 'ownership' | 'purchase_age';
  text: string;
  options: { value: string; label: string }[];
}

const OWNERSHIP_QUESTION: ApplianceQuestion = {
  id: 'ownership',
  text: '이 가전은 임대인이 제공한 것인가요?',
  options: [
    { value: 'landlord_builtin', label: '임대인 제공(빌트인)' },
    { value: 'landlord_option', label: '임대인 제공(옵션)' },
    { value: 'tenant_purchased', label: '내가 직접 구매' },
  ],
};

const PURCHASE_AGE_QUESTION: ApplianceQuestion = {
  id: 'purchase_age',
  text: '구매하신 지 얼마나 됐는지 아시나요?',
  options: [
    { value: 'within_2y', label: '2년 이내' },
    { value: 'from_2y_to_10y', label: '2~10년' },
    { value: 'over_10y', label: '10년 이상' },
    { value: 'unknown', label: '모름' },
  ],
};

const OWNERSHIPS: ApplianceOwnership[] = ['landlord_builtin', 'landlord_option', 'tenant_purchased'];
const PURCHASE_AGES: PurchaseAge[] = ['within_2y', 'from_2y_to_10y', 'over_10y', 'unknown'];

export interface ApplianceJudgement {
  liability: Liability;
  basis: string;
  notice: string;
  warning: string | null;
  confidence: number;
  blockVendorMatch: boolean;
  recommendedPath: RecommendedPath;
}

// 소유 관계 + 사용 연차 → 부담 주체. 순수 함수라 self-check에서 표로 검증한다.
export function judgeAppliance(
  ownership: ApplianceOwnership,
  purchaseAge: PurchaseAge | undefined
): ApplianceJudgement {
  // case A — 임차인이 직접 산 가전. 보증기간을 물을 필요가 없다(임대인과 무관).
  if (ownership === 'tenant_purchased') {
    return {
      liability: 'tenant',
      basis: '임차인이 직접 구매한 가전으로 임대차 목적물에 포함되지 않습니다.',
      notice: '임차인 소유 가전이라 수리비는 임차인 부담입니다. 제조사 A/S 또는 사설 수리업체를 이용하세요.',
      warning: null,
      confidence: 0.9,
      blockVendorMatch: false,
      recommendedPath: 'manufacturer_as',
    };
  }

  // case B — 임대인 제공 + 보증기간 내. 빌트인/옵션 구분 없이 제조사가 먼저다.
  if (purchaseAge === 'within_2y') {
    return {
      liability: 'manufacturer_warranty',
      basis: '구매 2년 이내로 제조사 보증기간(통상 2년) 내일 가능성이 높습니다.',
      notice: '제조사 보증기간 내일 가능성이 높아 무상 수리 대상입니다. 제조사 A/S를 먼저 접수하세요.',
      warning:
        '사설 수리업체를 먼저 부르면 유상 수리가 되고, 임의 분해로 남은 보증까지 사라질 수 있습니다.',
      confidence: 0.85,
      blockVendorMatch: true,
      recommendedPath: 'manufacturer_as',
    };
  }

  // 연차를 모르면 보증 여부를 단정할 수 없다. 아래 판정은 그대로 두되 확신도를 낮추고
  // 보증기간 확인을 함께 안내한다.
  const unsure = purchaseAge === 'unknown' || purchaseAge === undefined;
  const unsureNote = unsure
    ? ' 구매 시점이 확인되면 보증기간 내 무상 수리가 가능할 수 있으니 함께 확인해 보세요.'
    : '';

  // case C — 빌트인 + 보증 만료. 기본 설비라 임대인이 사용·수익 상태를 유지할 의무가 있다.
  if (ownership === 'landlord_builtin') {
    return {
      liability: 'landlord',
      basis: '빌트인 가전은 임대차 목적물의 기본 설비에 해당합니다. (민법 제623조 임대인의 수선의무)',
      notice: '기본 설비에 해당해 임대인 부담으로 수리하는 것이 원칙입니다.' + unsureNote,
      warning: null,
      confidence: unsure ? 0.6 : 0.85,
      blockVendorMatch: false,
      recommendedPath: 'vendor_match',
    };
  }

  // case D — 옵션 + 보증 만료. 기본 설비로 보기 어려워 계약 특약에 따라 갈린다.
  return {
    liability: 'negotiable',
    basis: '옵션 가전은 기본 설비로 단정하기 어려워 계약서 특약에 따라 부담 주체가 달라집니다.',
    notice: '계약서 특약에 따라 달라질 수 있습니다. 임대인과 확인이 필요합니다.' + unsureNote,
    warning: null,
    confidence: unsure ? 0.4 : 0.5,
    blockVendorMatch: false,
    recommendedPath: 'vendor_match',
  };
}

// 아직 답을 받지 못한 질문을 순서대로 하나씩 돌려준다.
// Q2는 '내가 직접 구매'가 아닐 때만 묻는다 — 임차인 소유면 보증기간과 무관하게 임차인 부담이다.
export function nextApplianceQuestions(
  ownership: ApplianceOwnership | undefined,
  purchaseAge: PurchaseAge | undefined
): ApplianceQuestion[] {
  if (!ownership) return [OWNERSHIP_QUESTION];
  if (ownership !== 'tenant_purchased' && !purchaseAge) return [PURCHASE_AGE_QUESTION];
  return [];
}

// 사진/설명 기반 AI 하자 분석.
//
// 이 API는 분류만 한다 — DB에 저장하지 않는다. 프론트는 결과를 확인시킨 뒤
// POST /api/reports에 그대로 넘겨서 저장한다. landlord_id도 여기서는 다루지 않는다.
export async function analyzeReport(req: Request, res: Response) {
  const gemini = await getGemini();
  if (!gemini) {
    return res.status(503).json({
      error: 'GEMINI_API_KEY가 설정되지 않아 AI 분석을 사용할 수 없습니다. .env를 확인하세요.',
    });
  }

  const { photo_urls, photo_url, description, answers } = req.body as {
    photo_urls?: unknown;
    photo_url?: string;
    description?: string;
    // 가전 보충 질문의 답. 프론트가 모아서 같은 엔드포인트로 다시 보낸다.
    // 대화 세션을 서버에 두지 않으려는 것 — analyze는 저장하지 않는 순수 분류다.
    answers?: { ownership?: string; purchase_age?: string };
  };

  const ownership = answers?.ownership as ApplianceOwnership | undefined;
  const purchaseAge = answers?.purchase_age as PurchaseAge | undefined;

  if (ownership !== undefined && !OWNERSHIPS.includes(ownership)) {
    return res.status(400).json({ error: `answers.ownership은 ${OWNERSHIPS.join('|')} 중 하나여야 합니다.` });
  }
  if (purchaseAge !== undefined && !PURCHASE_AGES.includes(purchaseAge)) {
    return res.status(400).json({ error: `answers.purchase_age는 ${PURCHASE_AGES.join('|')} 중 하나여야 합니다.` });
  }

  // photo_urls(배열)를 우선 쓰고, 예전 방식인 photo_url 단건도 받아 준다.
  const urls = Array.isArray(photo_urls)
    ? photo_urls.filter((u): u is string => typeof u === 'string' && !!u)
    : photo_url
      ? [photo_url]
      : [];

  if (urls.length === 0) {
    return res.status(400).json({ error: 'photo_urls에 사진 URL이 최소 한 개 필요합니다.' });
  }

  // 사진이 많아도 앞의 4장만 본다. 장수가 늘수록 비용과 응답 시간이 그대로 늘고,
  // 같은 하자를 여러 각도로 찍은 것이라 4장이면 판단에 충분하다.
  let imageParts;
  try {
    imageParts = await Promise.all(urls.slice(0, 4).map(fetchImagePart));
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : '사진을 가져오지 못했습니다.' });
  }

  const request = {
    contents: [
      {
        role: 'user',
        parts: [
          ...imageParts,
          {
            text: description
              ? `세입자 설명: ${description}\n\n위 사진과 설명을 보고 분류해 주세요.`
              : '위 사진을 보고 분류해 주세요. 세입자가 남긴 설명은 없습니다.',
          },
        ],
      },
    ],
    config: {
      systemInstruction: ANALYSIS_SYSTEM_PROMPT,
      responseMimeType: 'application/json',
      responseJsonSchema: GEMINI_RESPONSE_SCHEMA,
    },
  };

  // 예외 메시지에 담긴 Gemini 상태 문자열을 꺼낸다. 오류가 JSON 문자열로 오기 때문이다.
  const geminiStatus = (err: unknown) =>
    /"status"\s*:\s*"([A-Z_]+)"/.exec(err instanceof Error ? err.message : '')?.[1];

  let rawText: string | undefined;
  try {
    try {
      rawText = (await gemini.models.generateContent({ model: GEMINI_MODEL, ...request })).text;
    } catch (err) {
      // 기본 모델이 붐빌 때만 더 가벼운 모델로 한 번 더 시도한다. 인증 오류나 잘못된
      // 요청까지 재시도하면 같은 실패를 두 번 기다리게 될 뿐이다.
      const status = geminiStatus(err);
      if (status !== 'UNAVAILABLE' && status !== 'DEADLINE_EXCEEDED') throw err;
      rawText = (await gemini.models.generateContent({ model: GEMINI_FALLBACK_MODEL, ...request })).text;
    }
  } catch (err) {
    // 그대로 내보내면 사용자에게 Gemini 원문 JSON이 노출되므로,
    // 아는 상태만 우리 상태 코드로 옮겨 준다.
    const raw = err instanceof Error ? err.message : '';
    const status = geminiStatus(err);

    if (status === 'UNAVAILABLE' || status === 'DEADLINE_EXCEEDED') {
      return res.status(503).json({ error: 'AI 분석 서버가 혼잡합니다. 잠시 후 다시 시도해 주세요.' });
    }
    if (status === 'RESOURCE_EXHAUSTED') {
      return res.status(429).json({ error: 'AI 호출 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.' });
    }
    if (status === 'INVALID_ARGUMENT' || status === 'PERMISSION_DENIED' || status === 'UNAUTHENTICATED') {
      return res.status(503).json({ error: 'GEMINI_API_KEY가 올바르지 않습니다.' });
    }
    return res.status(502).json({ error: `AI 분석 실패: ${raw || '알 수 없는 오류'}` });
  }

  if (!rawText) {
    return res.status(502).json({ error: 'AI가 빈 응답을 반환했습니다.' });
  }

  // 스키마를 걸어도 응답을 그대로 믿지 않는다. 여기서 한 번 더 검증해야
  // 잘못된 category가 DB CHECK까지 흘러가 500으로 터지는 일을 막을 수 있다.
  const parsed = AnalysisSchema.safeParse(
    (() => { try { return JSON.parse(rawText); } catch { return null; } })(),
  );
  if (!parsed.success) {
    return res.status(502).json({ error: 'AI 응답을 분석 결과로 해석하지 못했습니다.' });
  }

  const applianceType = (parsed.data.appliance_type || null) as ApplianceType | null;

  const base = {
    ...parsed.data,
    // 빈 문자열은 "자가조치 가이드 없음"이라는 뜻이므로 null로 바꿔 내보낸다.
    self_fix_guide: parsed.data.self_fix_guide || null,
    appliance_type: applianceType,
  };

  // 가전이 아니면 기존 응답 그대로다. appliance만 null로 덧붙는다.
  if (!applianceType) {
    return res.json({ ...base, appliance: null });
  }

  const questions = nextApplianceQuestions(ownership, purchaseAge);

  // 아직 물어볼 게 남았으면 판정하지 않는다. 부담 주체를 추측으로 채우지 않기 위해서다.
  if (questions.length > 0) {
    return res.json({
      ...base,
      appliance: { applianceType, questions, liability: null, confidence: null },
    });
  }

  const judged = judgeAppliance(ownership!, purchaseAge);

  return res.json({
    ...base,
    // 룰이 정한 경로가 LLM 추측보다 우선한다. 보증기간 내인데 업체 매칭으로
    // 흘려보내면 무상 수리 기회를 잃는다.
    recommended_path: judged.recommendedPath,
    appliance: {
      applianceType,
      questions: [],
      liability: judged.liability,
      basis: judged.basis,
      notice: judged.notice,
      warning: judged.warning,
      confidence: judged.confidence,
      blockVendorMatch: judged.blockVendorMatch,
    },
  });
}

// 제조사 A/S 연락처 조회. recommended_path가 manufacturer_as일 때 프론트가 부른다.
export async function getManufacturerAs(req: Request, res: Response) {
  const { category, applianceType } = req.query as { category?: string; applianceType?: string };

  if (!category) {
    return res.status(400).json({ error: 'category 쿼리 파라미터가 필요합니다.' });
  }
  if (!CATEGORIES.includes(category as RepairCategory)) {
    return res.status(400).json({ error: `category는 ${CATEGORIES.join('|')} 중 하나여야 합니다.` });
  }
  if (applianceType !== undefined && !APPLIANCE_TYPES.includes(applianceType as ApplianceType)) {
    return res.status(400).json({ error: `applianceType은 ${APPLIANCE_TYPES.join('|')} 중 하나여야 합니다.` });
  }

  let query = supabaseAdmin
    .from('manufacturer_as_info')
    .select('*')
    .eq('category', category)
    .order('manufacturer_name');

  // 종류를 주면 그 종류 전담 + 카테고리 범용(appliance_type IS NULL)을 함께 준다.
  // 냉장고 고장에 냉난방 전담 업체가 섞여 나오던 문제를 막는다.
  if (applianceType) query = query.or(`appliance_type.eq.${applianceType},appliance_type.is.null`);

  const { data, error } = await query;

  if (error) {
    return res.status(500).json({ error: error.message });
  }
  return res.json({ results: data });
}
