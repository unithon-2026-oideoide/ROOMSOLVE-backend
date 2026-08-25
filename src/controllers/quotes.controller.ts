import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { Quote, QuoteStatus } from '../types';

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

// GET /api/quotes?reportId= — 해당 report의 견적 목록 + median 기반 이상치 플래그.
// 이상치는 목록에서 제외하지 않고 플래그만 달아서 함께 반환한다.
export async function listQuotes(req: Request, res: Response) {
  const reportId = req.query.reportId as string | undefined;

  if (!reportId) {
    return res.status(400).json({ error: 'reportId 쿼리 파라미터가 필요합니다.' });
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

  return res.json({ quotes, median: med });
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
