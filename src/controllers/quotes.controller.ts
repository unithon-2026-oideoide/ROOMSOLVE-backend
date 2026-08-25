import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { ApplianceType, Quote, QuoteStatus } from '../types';

const VALID_QUOTE_STATUSES: QuoteStatus[] = ['recommended', 'selected'];

// 이상치 판정 기준: 중앙값의 2배 초과.
const OUTLIER_MULTIPLIER = 2;
const OUTLIER_REASON = '평균 대비 과도하게 높음';

// 정렬 후 중앙값. 짝수 개면 가운데 두 값의 평균. 빈 배열이면 null.
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// 중앙값의 OUTLIER_MULTIPLIER배를 초과하면 이상치. 견적이 1건뿐이면(med === price) 이상치가 될 수 없다.
export function isOutlier(price: number, med: number | null): boolean {
  return med !== null && price > med * OUTLIER_MULTIPLIER;
}

const APPLIANCE_TYPES: ApplianceType[] = ['aircon', 'boiler', 'induction', 'refrigerator', 'washer'];

// 수리비가 동급 신품가의 이 비율 이상이면 교체를 권한다.
const REPLACE_THRESHOLD_RATIO = 0.6;

export interface ReplacementAdvice {
  repairEstimate: number;
  replacementPrice: number;
  recommendation: 'repair' | 'replace';
  reason: string;
}

// 수리비 vs 동급 신품가. 기준 비율 '이상'이면 교체(이상치 판정과 달리 경계값 포함).
export function adviseReplacement(
  repairEstimate: number,
  replacementPrice: number,
  priceNote: string | null
): ReplacementAdvice {
  const ratio = repairEstimate / replacementPrice;
  const percent = Math.round(ratio * 100);
  const replace = ratio >= REPLACE_THRESHOLD_RATIO;
  const basis = priceNote ? `동급 신품가(${priceNote})` : '동급 신품가';

  return {
    repairEstimate,
    replacementPrice,
    recommendation: replace ? 'replace' : 'repair',
    reason: replace
      ? `수리 예상비가 ${basis}의 ${percent}%로 ${REPLACE_THRESHOLD_RATIO * 100}% 이상입니다. 교체가 낫습니다.`
      : `수리 예상비가 ${basis}의 ${percent}%로 ${REPLACE_THRESHOLD_RATIO * 100}% 미만입니다. 수리가 낫습니다.`,
  };
}

// POST /api/quotes — 견적 등록.
// NOTE: quotes.status 의 DB 기본값은 'pending'(A/공용 스키마)이라 요구사항의
//       'recommended'를 얻으려면 insert에서 명시해야 한다.
export async function createQuote(req: Request, res: Response) {
  const { report_id, vendor_id, price } = req.body as {
    report_id: string;
    vendor_id: string;
    price: number;
  };

  if (!report_id || !vendor_id) {
    return res.status(400).json({ error: 'report_id, vendor_id는 필수입니다.' });
  }
  if (typeof price !== 'number' || !Number.isInteger(price) || price < 0) {
    return res.status(400).json({ error: 'price는 0 이상의 정수여야 합니다.' });
  }

  const { data, error } = await supabaseAdmin
    .from('quotes')
    .insert({ report_id, vendor_id, price, status: 'recommended' })
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }
  return res.status(201).json({ quote: data });
}

// GET /api/quotes?reportId=[&applianceType=] — 견적 목록 + median 기반 이상치 플래그.
// 이상치는 목록에서 제외하지 않고 플래그만 달아서 함께 반환한다.
//
// applianceType을 주면 동급 신품가와 비교해 수리/교체 권장을 함께 낸다.
// 안 주면 replacementAdvice가 null이라 기존 호출은 그대로 동작한다.
export async function listQuotes(req: Request, res: Response) {
  const reportId = req.query.reportId as string | undefined;
  const applianceType = req.query.applianceType as ApplianceType | undefined;
  // 제조사 보증기간 내(analyze의 liability === 'manufacturer_warranty')면 프론트가 이 값을 준다.
  // 무상 수리가 가능한 가전에 "신품가의 64%니 교체하세요"를 내보내지 않기 위한 차단이다.
  const warrantyCovered = req.query.warrantyCovered === 'true';

  if (!reportId) {
    return res.status(400).json({ error: 'reportId 쿼리 파라미터가 필요합니다.' });
  }
  if (applianceType && !APPLIANCE_TYPES.includes(applianceType)) {
    return res.status(400).json({ error: `applianceType은 ${APPLIANCE_TYPES.join('|')} 중 하나여야 합니다.` });
  }

  const { data, error } = await supabaseAdmin
    .from('quotes')
    // vendor_id가 vendors를 한 번만 참조하므로 PostgREST가 조인 대상을 자동으로 고른다.
    // 견적 비교 화면에서 업체명을 띄우려면 필요하다.
    .select('*, vendor:vendors(id, name, rating, phone)')
    .eq('report_id', reportId)
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const rows = (data ?? []) as Quote[];
  const med = median(rows.map((q) => q.price));
  // DB의 is_outlier 컬럼은 쓰지 않는다 — median은 견적이 하나 추가될 때마다 움직여서
  // 저장해두면 기존 행 값이 낡는다. 조회 시점에 계산해서 응답에만 싣고 컬럼은 버린다.
  const quotes = rows.map(({ is_outlier: _unused, ...q }) => {
    const outlier = isOutlier(q.price, med);
    return { ...q, isOutlier: outlier, outlierReason: outlier ? OUTLIER_REASON : null };
  });

  return res.json({
    quotes,
    median: med,
    replacementAdvice: await buildAdvice(applianceType, med, warrantyCovered),
  });
}

// 신품 기준가는 종류별 최저가(기본형)를 쓴다 — "같은 걸 새로 사면 얼마"가 기준이라
// 프리미엄 등급으로 잡으면 교체 권장이 거의 나오지 않는다.
// 견적이 없거나(med === null) applianceType을 안 주면 판정하지 않는다.
async function buildAdvice(
  applianceType: ApplianceType | undefined,
  med: number | null,
  warrantyCovered: boolean
): Promise<ReplacementAdvice | null> {
  if (!applianceType || med === null) return null;

  const { data } = await supabaseAdmin
    .from('appliance_reference_price')
    .select('price, note')
    .eq('appliance_type', applianceType)
    .order('price', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  if (warrantyCovered) {
    return {
      repairEstimate: med,
      replacementPrice: data.price,
      recommendation: 'repair',
      reason: '제조사 보증기간 내로 무상 수리가 가능할 수 있어 교체를 권하지 않습니다. 제조사 A/S를 먼저 확인하세요.',
    };
  }
  return adviseReplacement(med, data.price, data.note);
}

// PATCH /api/quotes/:id/status — recommended / selected 전환.
// 한 report에서 selected는 하나만 유지한다.
// db/002 의 quotes_one_selected_per_report_idx 를 넣었다면 DB도 같은 규칙을 강제한다.
export async function updateQuoteStatus(req: Request, res: Response) {
  const { id } = req.params;
  const { status } = req.body as { status: QuoteStatus };

  if (!VALID_QUOTE_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status는 ${VALID_QUOTE_STATUSES.join('|')} 중 하나여야 합니다.` });
  }

  const { data: target } = await supabaseAdmin
    .from('quotes')
    .select('id, report_id')
    .eq('id', id)
    .single();

  if (!target) {
    return res.status(404).json({ error: '견적을 찾을 수 없습니다.' });
  }

  if (status === 'selected') {
    // 기존 selected를 먼저 되돌린 뒤 승격시켜야 한다 (002의 unique index가 있으면 순서가 강제됨).
    const { error: demoteError } = await supabaseAdmin
      .from('quotes')
      .update({ status: 'recommended' })
      .eq('report_id', target.report_id)
      .eq('status', 'selected')
      .neq('id', id);

    if (demoteError) {
      return res.status(500).json({ error: demoteError.message });
    }
  }

  const { data, error } = await supabaseAdmin
    .from('quotes')
    .update({ status })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }
  return res.json({ quote: data });
}
