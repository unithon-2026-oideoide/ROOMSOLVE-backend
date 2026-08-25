import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { RepairCategory, Vendor } from '../types';

const VALID_CATEGORIES: RepairCategory[] = [
  'plumbing',
  'electrical',
  'heating',
  'appliance',
  'door_window',
  'interior',
  'pest',
  'other',
];

// POST /api/vendors/match — category에 속하는 활성 업체를 업체명 가나다순으로 반환.
// NOTE: region 필터링은 이번 범위에서 제외 (vendors.region 컬럼만 준비된 상태).
// NOTE: is_active 필터는 db/002_vendors_rating_active.sql 을 실행해야 동작한다.
export async function matchVendors(req: Request, res: Response) {
  const { category } = req.body as { category: RepairCategory };

  if (!VALID_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: `category는 ${VALID_CATEGORIES.join('|')} 중 하나여야 합니다.` });
  }

  const { data, error } = await supabaseAdmin
    .from('vendors')
    .select('*')
    .contains('categories', [category])
    .eq('is_active', true);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // 한글 정렬은 Postgres collation에 의존하지 않고 JS localeCompare('ko')로 처리.
  const vendors = (data as Vendor[]).sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  return res.json({ vendors });
}
