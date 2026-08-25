import { Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { supabaseAdmin } from '../config/supabase';
import { getAnthropic } from '../config/anthropic';
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

// 분석 결과 스키마. Claude가 이 모양으로만 답하도록 강제한다(structured outputs).
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

self_fix_guide는 recommended_path가 self_fix일 때만 채우고, 그 외에는 null로 두세요.
가이드는 한국어로 3~5문장, 순서대로 따라 할 수 있게 쓰세요.
안전 위험이 조금이라도 있으면 self_fix를 고르지 마세요.`;

// 사진/설명 기반 AI 하자 분석.
//
// 이 API는 분류만 한다 — DB에 저장하지 않는다. 프론트는 결과를 확인시킨 뒤
// POST /api/reports에 그대로 넘겨서 저장한다. landlord_id도 여기서는 다루지 않는다.
export async function analyzeReport(req: Request, res: Response) {
  const anthropic = getAnthropic();
  if (!anthropic) {
    return res.status(503).json({
      error: 'ANTHROPIC_API_KEY가 설정되지 않아 AI 분석을 사용할 수 없습니다. .env를 확인하세요.',
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
  const images = urls.slice(0, 4).map((url) => ({
    type: 'image' as const,
    source: { type: 'url' as const, url },
  }));

  try {
    const response = await anthropic.messages.parse({
      model: 'claude-opus-5',
      max_tokens: 4096,
      system: ANALYSIS_SYSTEM_PROMPT,
      // 사진 분류라 깊은 추론이 필요하지 않다. 시연 중 응답 시간을 줄이려고 낮췄다.
      output_config: {
        effort: 'medium',
        format: zodOutputFormat(AnalysisSchema),
      },
      messages: [
        {
          role: 'user',
          content: [
            ...images,
            {
              type: 'text',
              text: description
                ? `세입자 설명: ${description}\n\n위 사진과 설명을 보고 분류해 주세요.`
                : '위 사진을 보고 분류해 주세요. 세입자가 남긴 설명은 없습니다.',
            },
          ],
        },
      ],
    });

    if (response.stop_reason === 'refusal') {
      return res.status(502).json({ error: 'AI가 이 이미지의 분석을 거절했습니다.' });
    }
    if (!response.parsed_output) {
      return res.status(502).json({ error: 'AI 응답을 분석 결과로 해석하지 못했습니다.' });
    }

    return res.json(response.parsed_output);
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return res.status(503).json({ error: 'ANTHROPIC_API_KEY가 올바르지 않습니다.' });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return res.status(429).json({ error: 'AI 호출 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.' });
    }
    if (err instanceof Anthropic.APIError) {
      return res.status(502).json({ error: `AI 분석 실패: ${err.message}` });
    }
    throw err;
  }
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
