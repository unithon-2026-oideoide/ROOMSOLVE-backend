import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { ApplianceType, Quote, QuoteStatus } from '../types';

const VALID_QUOTE_STATUSES: QuoteStatus[] = ['recommended', 'selected', 'rejected'];

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

// ---------------------------------------------------------------------------
// 견적 순위
//
// 임대인이 고르는 기준은 가격과 업체 평점 둘뿐이다. 두 값을 각각 0~1로 정규화해
// 가중합한 점수로 줄을 세우고, 1위를 추천으로 표시한다.
//
// 저장하지 않고 조회 시점에 계산한다 — is_outlier 컬럼을 버린 것과 같은 이유다.
// 견적이 하나 더 들어오면 최저가가 바뀌어 모든 순위가 움직이므로, 저장해두면
// 그 순간 전부 낡은 값이 된다.
// ---------------------------------------------------------------------------

// 가격에 더 큰 비중을 둔다. 수리비를 부담하는 쪽이 임대인이라, 평점이 조금 높다고
// 가격 차이를 뒤집으면 납득하기 어렵다.
const PRICE_WEIGHT = 0.6;
const RATING_WEIGHT = 0.4;
const MAX_RATING = 5;

export interface RankedQuoteInput {
  id: string;
  price: number;
  rating: number | null;
}

export interface QuoteRanking {
  id: string;
  rank: number;
  score: number;
  isRecommended: boolean;
  recommendReason: string | null;
}

// 최저가 대비 비율. 최저가가 1.0이고 비쌀수록 0에 가까워진다.
// 가격이 0원인 견적(무상 수리 등)이 섞이면 나눗셈이 깨지므로 그때는 전부 1.0으로 둔다.
function priceScore(price: number, minPrice: number): number {
  if (minPrice <= 0) return 1;
  return minPrice / price;
}

// 평점이 없는 업체(가입 직후 rating 0)는 중간값으로 취급한다. 0으로 두면
// 신규 업체가 가격과 무관하게 항상 꼴찌가 된다.
function ratingScore(rating: number | null): number {
  if (rating === null || rating <= 0) return 0.5;
  return Math.min(rating, MAX_RATING) / MAX_RATING;
}

export function rankQuotes(quotes: RankedQuoteInput[]): QuoteRanking[] {
  if (quotes.length === 0) return [];

  const minPrice = Math.min(...quotes.map((q) => q.price));
  const best = quotes.reduce((a, b) => (a.price <= b.price ? a : b));
  const topRated = quotes.reduce((a, b) => ((a.rating ?? 0) >= (b.rating ?? 0) ? a : b));

  const scored = quotes.map((q) => ({
    q,
    score: PRICE_WEIGHT * priceScore(q.price, minPrice) + RATING_WEIGHT * ratingScore(q.rating),
  }));

  // 점수가 같으면 싼 쪽이 앞. 그것도 같으면 id로 고정해 순서가 요청마다 흔들리지 않게 한다.
  scored.sort((a, b) => b.score - a.score || a.q.price - b.q.price || a.q.id.localeCompare(b.q.id));

  return scored.map((s, i) => ({
    id: s.q.id,
    rank: i + 1,
    score: Number(s.score.toFixed(4)),
    isRecommended: i === 0,
    recommendReason: i === 0 ? buildReason(s.q, best, topRated, quotes.length) : null,
  }));
}

// 1위가 왜 1위인지 한 줄로 설명한다. 최저가이면서 평점도 최고면 그렇게 말하고,
// 어느 한쪽을 양보한 경우에는 얼마를 더 내고 무엇을 얻는지 숫자로 밝힌다.
function buildReason(
  winner: RankedQuoteInput,
  cheapest: RankedQuoteInput,
  topRated: RankedQuoteInput,
  total: number
): string {
  if (total === 1) return '제출된 견적이 하나뿐입니다.';

  const isCheapest = winner.price === cheapest.price;
  const isTopRated = (winner.rating ?? 0) >= (topRated.rating ?? 0);

  if (isCheapest && isTopRated) return '최저가이면서 평점도 가장 높습니다.';
  if (isCheapest) return `최저가입니다. 평점은 ${(winner.rating ?? 0).toFixed(1)}점입니다.`;

  const extra = winner.price - cheapest.price;
  const percent = Math.round((extra / cheapest.price) * 100);
  const gap = (winner.rating ?? 0) - (cheapest.rating ?? 0);
  if (gap > 0) {
    return `최저가보다 ${extra.toLocaleString('ko-KR')}원(${percent}%) 비싸지만 평점이 ${gap.toFixed(1)}점 높습니다.`;
  }
  return `가격과 평점을 함께 고려한 결과입니다. 평점 ${(winner.rating ?? 0).toFixed(1)}점.`;
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
  const { report_id, vendor_id, price, proposed_visit_at } = req.body as {
    report_id: string;
    vendor_id: string;
    price: number;
    // 업체가 제안하는 방문 가능 시간(선택). db/009. ISO 8601 문자열만 받는다 —
    // repair.controller.ts의 scheduled_at 검증과 같은 방식이다.
    proposed_visit_at?: string;
  };

  if (!report_id || !vendor_id) {
    return res.status(400).json({ error: 'report_id, vendor_id는 필수입니다.' });
  }
  if (typeof price !== 'number' || !Number.isInteger(price) || price < 0) {
    return res.status(400).json({ error: 'price는 0 이상의 정수여야 합니다.' });
  }
  if (proposed_visit_at !== undefined && Number.isNaN(Date.parse(proposed_visit_at))) {
    return res.status(400).json({ error: 'proposed_visit_at은 ISO 8601 형식이어야 합니다.' });
  }

  const { data, error } = await supabaseAdmin
    .from('quotes')
    .insert({ report_id, vendor_id, price, status: 'recommended', proposed_visit_at: proposed_visit_at ?? null })
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

  const rows = (data ?? []) as (Quote & { vendor?: { rating: number | null } | null })[];
  const med = median(rows.map((q) => q.price));

  // 이미 거절된 견적은 순위에서 뺀다. 임대인이 고를 수 없는 것을 1위로 올리면 안 된다.
  const rankable = rows.filter((q) => q.status !== 'rejected');
  const rankings = new Map(
    rankQuotes(rankable.map((q) => ({ id: q.id, price: q.price, rating: q.vendor?.rating ?? null })))
      .map((r) => [r.id, r])
  );

  // DB의 is_outlier 컬럼은 쓰지 않는다 — median은 견적이 하나 추가될 때마다 움직여서
  // 저장해두면 기존 행 값이 낡는다. 조회 시점에 계산해서 응답에만 싣고 컬럼은 버린다.
  const quotes = rows.map(({ is_outlier: _unused, ...q }) => {
    const outlier = isOutlier(q.price, med);
    const ranking = rankings.get(q.id);
    return {
      ...q,
      isOutlier: outlier,
      outlierReason: outlier ? OUTLIER_REASON : null,
      rank: ranking?.rank ?? null,
      score: ranking?.score ?? null,
      isRecommended: ranking?.isRecommended ?? false,
      recommendReason: ranking?.recommendReason ?? null,
    };
  });

  // 추천이 맨 위로 오도록 순위순 정렬. 거절된 견적(rank 없음)은 뒤로 보낸다.
  quotes.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));

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

// 새 repair_schedule row가 생기면(또는 스킵되면) 이 모양으로 응답에 실어 준다.
interface AutoScheduleResult {
  schedule: unknown | null;
  // 스케줄을 못 만든 이유. 성공하면 null. 프론트가 "왜 일정이 안 잡혔는지" 보여줄 수 있게 남긴다.
  skippedReason: string | null;
}

// selected로 전환된 견적으로 repair_schedule을 자동 생성한다.
// - vendors.user_id가 없으면(시딩된 데모 업체) 스킵 — repair_schedule.technician_id가
//   users(id)를 참조하므로 계정 없는 업체로는 INSERT가 통과하지 않는다.
// - proposed_visit_at이 없으면(업체가 방문 시간을 안 준 견적) 스킵 — repair.controller.ts의
//   createSchedule과 동일하게 scheduled_at 없이는 일정을 만들지 않는다.
// 두 경우 다 에러로 취급하지 않는다 — 견적 선택 자체는 이미 성공했으므로 quote는 그대로 반환한다.
async function autoCreateSchedule(
  reportId: string,
  vendorId: string,
  proposedVisitAt: string | null
): Promise<AutoScheduleResult> {
  const { data: vendor, error: vendorError } = await supabaseAdmin
    .from('vendors')
    .select('user_id')
    .eq('id', vendorId)
    .maybeSingle();

  if (vendorError) {
    console.warn(`[quotes] vendor ${vendorId} 조회 실패, repair_schedule 자동 생성을 건너뜁니다:`, vendorError.message);
    return { schedule: null, skippedReason: '업체 정보를 조회하지 못했습니다.' };
  }
  if (!vendor?.user_id) {
    console.warn(`[quotes] vendor ${vendorId}에 연결된 계정(user_id)이 없어 repair_schedule 자동 생성을 건너뜁니다.`);
    return { schedule: null, skippedReason: '이 업체는 계정이 연결되어 있지 않아 자동으로 일정을 잡을 수 없습니다.' };
  }
  if (!proposedVisitAt) {
    console.warn(`[quotes] report ${reportId} 견적에 proposed_visit_at이 없어 repair_schedule 자동 생성을 건너뜁니다.`);
    return { schedule: null, skippedReason: '견적에 제안된 방문 시간이 없어 일정을 자동으로 잡을 수 없습니다.' };
  }

  const { data: schedule, error: scheduleError } = await supabaseAdmin
    .from('repair_schedule')
    .insert({
      report_id: reportId,
      technician_id: vendor.user_id,
      scheduled_at: proposedVisitAt,
      // 임대인이 이미 이 견적을 선택했으므로 별도 확정 절차 없이 바로 확정 상태로 만든다.
      confirmed: true,
    })
    .select()
    .single();

  if (scheduleError) {
    console.warn(`[quotes] report ${reportId} repair_schedule 자동 생성 실패:`, scheduleError.message);
    return { schedule: null, skippedReason: '방문 일정 생성에 실패했습니다.' };
  }

  // repair.controller.ts의 addTimelineEntry와 같은 방식 — 타임라인에 'confirmed' 한 줄을 남긴다.
  const { error: timelineError } = await supabaseAdmin
    .from('repair_status_timeline')
    .insert({ report_id: reportId, status: 'confirmed' });
  if (timelineError) {
    // 일정 자체는 이미 만들어졌으니 실패로 되돌리지 않는다. 로그만 남긴다.
    console.warn(`[quotes] report ${reportId} repair_status_timeline 기록 실패:`, timelineError.message);
  }

  return { schedule, skippedReason: null };
}

// PATCH /api/quotes/:id/status — recommended / selected / rejected 전환.
//
// status를 selected로 바꾸면:
//   1. 같은 report_id의 나머지 견적을 전부 rejected로 명시 전환한다(지금 선택된 것 제외).
//      기존에는 이전 selected 한 건만 recommended로 되돌렸지만, 이제 quotes.status에
//      rejected가 생겨서 "선택 안 된 나머지"를 전부 명확히 거절 처리할 수 있다.
//   2. 선택된 견적의 proposed_visit_at으로 repair_schedule을 자동 생성하고(확정 상태),
//      repair_status_timeline에도 'confirmed'를 기록한다. autoCreateSchedule() 참고 —
//      업체 계정이 없거나 방문 시간이 없으면 조용히 건너뛴다(에러 아님).
//   3. reports.status를 approved로 올린다. 바뀐 플로우에서는 임대인이 견적을 고르는
//      행위가 곧 승인이다. 이걸 안 하면 업체는 정해졌는데 신고는 pending으로 남아,
//      임대인 화면이 아직 처리 안 된 건으로 계속 보여준다.
//
// db/009_quote_visit_and_reject.sql로 quotes.status CHECK에 rejected가 추가돼야
// 아래 update가 통과한다.
export async function updateQuoteStatus(req: Request, res: Response) {
  const { id } = req.params;
  const { status } = req.body as { status: QuoteStatus };

  if (!VALID_QUOTE_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status는 ${VALID_QUOTE_STATUSES.join('|')} 중 하나여야 합니다.` });
  }

  // maybeSingle()을 쓰고 error/target을 따로 확인한다. single()은 0건일 때도
  // error를 채우는데, 예전 코드는 그 error를 버리고 target만 봐서 "견적 없음"과
  // "조회 자체가 실패함"(네트워크/권한 등 진짜 500 상황)을 구분하지 못하고
  // 둘 다 404로 응답했다.
  const { data: target, error: targetError } = await supabaseAdmin
    .from('quotes')
    .select('id, report_id, vendor_id, proposed_visit_at, status')
    .eq('id', id)
    .maybeSingle();

  if (targetError) {
    return res.status(500).json({ error: targetError.message });
  }
  if (!target) {
    return res.status(404).json({ error: '견적을 찾을 수 없습니다.' });
  }

  // 이미 selected인 견적을 다른 상태로 옮기는 요청은 막는다. selected가 되는
  // 순간 repair_schedule이 자동 생성되고(confirmed) reports.status도 approved로
  // 올라간다 — 여기서 조용히 다른 상태로 바꾸면 이미 만들어진 일정/승인 상태가
  // 고아로 남아 서로 어긋난다. 되돌리려면 별도의 취소 플로우가 필요하다.
  if (target.status === 'selected' && status !== 'selected') {
    return res.status(409).json({
      error: '이미 선택된 견적의 상태는 이 API로 바꿀 수 없습니다. 방문 일정이 이미 생성되어 있습니다.',
    });
  }

  if (status === 'selected') {
    // 선택된 것만 빼고 나머지 전부 rejected. 기존 상태(recommended든 이미 rejected든) 상관없이
    // 덮어쓴다 — "선택 안 된 건 전부 거절"이라는 규칙이 이전 상태에 따라 달라질 이유가 없다.
    const { error: rejectError } = await supabaseAdmin
      .from('quotes')
      .update({ status: 'rejected' })
      .eq('report_id', target.report_id)
      .neq('id', id);

    if (rejectError) {
      return res.status(500).json({ error: rejectError.message });
    }

    // 견적 선택이 곧 승인이다. 예전 승인 버튼(PATCH /api/landlord/requests/:id/approve)과
    // 달리 이 경로는 업체까지 확정되므로, 여기서 신고 상태를 함께 올려야 둘이 어긋나지 않는다.
    const { error: reportError } = await supabaseAdmin
      .from('reports')
      .update({ status: 'approved' })
      .eq('id', target.report_id);

    if (reportError) {
      return res.status(500).json({ error: reportError.message });
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

  if (status !== 'selected') {
    return res.json({ quote: data });
  }

  // 임대인이 견적을 고른 것이 곧 승인이다 — 프론트가 PATCH /api/landlord/requests/:id/approve를
  // 따로 부르지 않아도 신고가 '수리 대기'(approved)로 넘어가야 한다.
  // status가 pending일 때만 올린다: 이미 rejected된 신고를 견적 선택으로 되살리거나,
  // 수리가 시작된(in_progress/done) 신고를 approved로 되돌리면 안 된다.
  const { error: reportError } = await supabaseAdmin
    .from('reports')
    .update({ status: 'approved' })
    .eq('id', target.report_id)
    .eq('status', 'pending');
  if (reportError) {
    // 견적 선택 자체는 이미 성공했으므로 실패로 되돌리지 않는다. 로그만 남긴다.
    console.warn(`[quotes] report ${target.report_id} status를 approved로 올리지 못했습니다:`, reportError.message);
  }

  const { schedule, skippedReason } = await autoCreateSchedule(target.report_id, target.vendor_id, target.proposed_visit_at);
  return res.json({ quote: data, schedule, scheduleSkippedReason: skippedReason });
}
