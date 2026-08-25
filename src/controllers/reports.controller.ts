import { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../config/supabase';
import { getGemini, GEMINI_MODEL, GEMINI_FALLBACK_MODEL } from '../config/gemini';
import { AuthedRequest } from '../middleware/auth';
import { RecommendedPath, RepairCategory } from '../types';

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
  const { landlord_id, photo_urls, description, category, severity, recommended_path, self_fix_guide } =
    req.body as {
      landlord_id?: string;
      photo_urls?: unknown;
      description?: string;
      category?: string;
      severity?: string;
      recommended_path?: string;
      self_fix_guide?: string;
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
안전 위험이 조금이라도 있으면 self_fix를 고르지 마세요.`;

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
  },
  required: ['category', 'severity', 'recommended_path', 'self_fix_guide'],
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

// 예외 메시지에 담긴 Gemini 상태 문자열을 꺼낸다. 오류가 JSON 문자열로 오기 때문이다.
function geminiStatus(err: unknown): string | undefined {
  return /"status"\s*:\s*"([A-Z_]+)"/.exec(err instanceof Error ? err.message : '')?.[1];
}

// 기본 모델이 붐비거나(UNAVAILABLE) 하루 할당량을 다 썼을 때(RESOURCE_EXHAUSTED)
// 예비 모델로 한 번 더 시도한다. 무료 티어 할당량은 모델당 하루 20회로 따로 잡히므로,
// 이 전환만으로 하루에 쓸 수 있는 횟수가 두 배가 된다.
//
// 인증 오류나 잘못된 요청은 재시도하지 않는다 — 같은 실패를 두 번 기다릴 뿐이다.
const RETRYABLE_ON_FALLBACK = ['UNAVAILABLE', 'DEADLINE_EXCEEDED', 'RESOURCE_EXHAUSTED'];

async function generateWithFallback(
  gemini: NonNullable<Awaited<ReturnType<typeof getGemini>>>,
  request: Record<string, unknown>,
): Promise<string | undefined> {
  try {
    return (await gemini.models.generateContent({ model: GEMINI_MODEL, ...request } as never)).text;
  } catch (err) {
    const status = geminiStatus(err);
    if (!status || !RETRYABLE_ON_FALLBACK.includes(status)) throw err;
    return (await gemini.models.generateContent({ model: GEMINI_FALLBACK_MODEL, ...request } as never)).text;
  }
}

// Gemini 오류를 우리 상태 코드로 옮긴다. 그대로 내보내면 사용자에게 원문 JSON이 노출된다.
function respondGeminiError(res: Response, err: unknown) {
  const raw = err instanceof Error ? err.message : '';
  switch (geminiStatus(err)) {
    case 'UNAVAILABLE':
    case 'DEADLINE_EXCEEDED':
      return res.status(503).json({ error: 'AI 서버가 혼잡합니다. 잠시 후 다시 시도해 주세요.' });
    // 예비 모델까지 할당량을 다 썼다는 뜻이다. 무료 티어는 모델당 하루 20회라
    // 시연 규모로 쓰려면 결제를 켜야 한다 — 메시지에 그 힌트를 남긴다.
    case 'RESOURCE_EXHAUSTED':
      console.error('[gemini] 할당량 소진 (무료 티어는 모델당 하루 20회):', raw);
      return res.status(429).json({ error: 'AI 호출 한도를 모두 사용했습니다. 잠시 후 다시 시도해 주세요.' });
    case 'PERMISSION_DENIED':
    case 'UNAUTHENTICATED':
      return res.status(503).json({ error: 'GEMINI_API_KEY가 올바르지 않습니다.' });
    // INVALID_ARGUMENT는 키가 아니라 우리가 보낸 요청이 잘못됐다는 뜻이다.
    // 키 문제로 표시하면 엉뚱한 곳을 찾게 되므로 원문을 그대로 남긴다.
    case 'INVALID_ARGUMENT':
      console.error('[gemini] 잘못된 요청:', raw);
      return res.status(502).json({ error: `AI 요청이 거부되었습니다: ${raw}` });
    default:
      return res.status(502).json({ error: `AI 호출 실패: ${raw || '알 수 없는 오류'}` });
  }
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

  const { photo_urls, photo_url, description } = req.body as {
    photo_urls?: unknown;
    photo_url?: string;
    description?: string;
  };

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

  let rawText: string | undefined;
  try {
    rawText = await generateWithFallback(gemini, request);
  } catch (err) {
    return respondGeminiError(res, err);
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

  return res.json({
    ...parsed.data,
    // 빈 문자열은 "자가조치 가이드 없음"이라는 뜻이므로 null로 바꿔 내보낸다.
    self_fix_guide: parsed.data.self_fix_guide || null,
  });
}

// ---------------------------------------------------------------------------
// 자가수리 챗봇
//
// 세입자 플로우는 직렬이다: 사진 → AI 진단 → 자가수리 상담 → (막히면) 업체 추천.
// 진단 결과가 무엇이든 일단 이 상담을 거치되, 상담이 의미 없거나 위험한 두 경우는
// AI를 부르지 않고 코드에서 바로 다음 단계로 넘긴다.
// ---------------------------------------------------------------------------

const ChatReplySchema = z.object({
  reply: z.string(),
  escalate: z.boolean(),
});

const CHAT_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string', description: '세입자에게 보여줄 답변. 한국어.' },
    escalate: {
      type: 'boolean',
      description: '자가수리로는 해결이 어려워 전문 업체가 필요하면 true',
    },
  },
  required: ['reply', 'escalate'],
};

const MAX_CHAT_TURNS = 20;

function buildChatSystemPrompt(c: {
  category: string;
  severity: string;
  self_fix_guide?: string | null;
}): string {
  return `당신은 한국 세입자를 위한 자가수리 도우미입니다. 세입자가 스스로 고쳐볼 수 있게 돕되, 무리하지 않도록 판단해 주세요.

지금 상담 중인 하자:
- 유형: ${c.category}
- 긴급도: ${c.severity}${c.self_fix_guide ? `\n- 진단 단계에서 제안된 자가조치: ${c.self_fix_guide}` : ''}

역할:
1. 대화가 비어 있는 첫 턴에는 이 하자의 자가수리 방법을 번호 목록으로 안내하세요. 다이소·철물점에서 구할 수 있는 용품 기준으로 설명하세요.
2. 세입자가 진행 상황을 알려주면 다음 단계를 안내하거나 막힌 부분을 풀어 주세요.
3. 아래에 해당하면 자가수리를 말리고 전문 업체를 권하면서 escalate를 true로 두세요.
   - 전기·가스 관련 위험이 있는 경우
   - 벽 내부 배관 누수나 구조적 손상인 경우
   - 세입자가 시도했지만 실패했거나 어렵다고 말한 경우
   - 세입자가 직접 업체를 불러 달라고 요청한 경우
4. 그 밖에는 escalate를 false로 두세요.

reply는 한국어로 3~6문장. escalate가 true일 때는 왜 업체가 필요한지 짧게 설명하세요.`;
}

// 자가수리 상담. 무상태 — 대화 기록은 클라이언트가 들고 있다가 매번 보낸다.
// DB는 건드리지 않는다. 상태 변경은 리포트 API가 맡는다.
export async function chatSelfRepair(req: Request, res: Response) {
  const { context, messages } = req.body as {
    context?: { category?: string; severity?: string; recommended_path?: string; self_fix_guide?: string | null };
    messages?: unknown;
  };

  if (!context || typeof context !== 'object') {
    return res.status(400).json({ error: 'context(analyze 결과)가 필요합니다.' });
  }
  const { category, severity, recommended_path, self_fix_guide } = context;
  if (!category || !CATEGORIES.includes(category as RepairCategory)) {
    return res.status(400).json({ error: `context.category는 ${CATEGORIES.join('|')} 중 하나여야 합니다.` });
  }
  if (!severity || !SEVERITIES.includes(severity as (typeof SEVERITIES)[number])) {
    return res.status(400).json({ error: `context.severity는 ${SEVERITIES.join('|')} 중 하나여야 합니다.` });
  }

  // 안전 규칙. 모델 판단에 맡기지 않고 여기서 끊는다 — 감전·가스처럼 즉시 조치가
  // 필요한 상황에서 세입자를 챗봇과 대화하게 두면 안 된다.
  if (severity === 'emergency') {
    return res.json({
      reply: '지금은 직접 손대지 마세요. 안전 위험이 있어 즉시 전문가의 조치가 필요한 상태입니다. '
        + '가능하면 해당 구역의 전기 차단기나 밸브를 잠그고 자리를 피한 뒤, 바로 수리 요청을 진행해 주세요.',
      escalate: true,
      escalate_to: 'vendor_match',
    });
  }

  // 제조사 보증·AS 대상이면 자가수리를 권할 자리가 아니다. 보증이 깨질 수도 있다.
  if (recommended_path === 'manufacturer_as') {
    return res.json({
      reply: '이 하자는 제조사 A/S 대상으로 보입니다. 직접 분해하면 보증을 받지 못할 수 있으니 '
        + '제조사 서비스센터에 먼저 문의해 주세요. 아래에서 연락처를 확인할 수 있습니다.',
      escalate: true,
      escalate_to: 'manufacturer_as',
    });
  }

  const gemini = await getGemini();
  if (!gemini) {
    return res.status(503).json({
      error: 'GEMINI_API_KEY가 설정되지 않아 자가수리 상담을 사용할 수 없습니다. .env를 확인하세요.',
    });
  }

  // 대화가 길어질수록 매 턴 비용이 늘어난다. 최근 것만 보낸다.
  const history = (Array.isArray(messages) ? messages : [])
    .filter((m): m is { role: 'user' | 'assistant'; content: string } =>
      !!m && typeof m === 'object'
      && ((m as any).role === 'user' || (m as any).role === 'assistant')
      && typeof (m as any).content === 'string' && !!(m as any).content)
    .slice(-MAX_CHAT_TURNS)
    // Gemini는 assistant 대신 model을 쓴다.
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));

  // Gemini는 첫 항목이 user여야 한다. 첫 턴이면 상담을 여는 말을 대신 넣어 준다.
  if (history.length === 0 || history[0].role !== 'user') {
    history.unshift({
      role: 'user',
      parts: [{ text: '이 하자를 직접 고쳐보고 싶어요. 자가수리 방법을 알려주세요.' }],
    });
  }

  let rawText: string | undefined;
  try {
    rawText = await generateWithFallback(gemini, {
      contents: history,
      config: {
        systemInstruction: buildChatSystemPrompt({ category, severity, self_fix_guide }),
        responseMimeType: 'application/json',
        responseJsonSchema: CHAT_RESPONSE_SCHEMA,
      },
    });
  } catch (err) {
    return respondGeminiError(res, err);
  }

  if (!rawText) {
    return res.status(502).json({ error: 'AI가 빈 응답을 반환했습니다.' });
  }

  const parsed = ChatReplySchema.safeParse(
    (() => { try { return JSON.parse(rawText); } catch { return null; } })(),
  );
  if (!parsed.success) {
    return res.status(502).json({ error: 'AI 응답을 상담 결과로 해석하지 못했습니다.' });
  }

  return res.json({
    reply: parsed.data.reply,
    escalate: parsed.data.escalate,
    escalate_to: parsed.data.escalate ? 'vendor_match' : null,
  });
}

// 제조사 A/S 연락처 조회. recommended_path가 manufacturer_as일 때 프론트가 부른다.
export async function getManufacturerAs(req: Request, res: Response) {
  const { category } = req.query as { category?: string };

  if (!category) {
    return res.status(400).json({ error: 'category 쿼리 파라미터가 필요합니다.' });
  }
  if (!CATEGORIES.includes(category as RepairCategory)) {
    return res.status(400).json({ error: `category는 ${CATEGORIES.join('|')} 중 하나여야 합니다.` });
  }

  const { data, error } = await supabaseAdmin
    .from('manufacturer_as_info')
    .select('*')
    .eq('category', category)
    .order('manufacturer_name');

  if (error) {
    return res.status(500).json({ error: error.message });
  }
  return res.json({ results: data });
}
