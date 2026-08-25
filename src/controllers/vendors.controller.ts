import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { RepairCategory, REPAIR_CATEGORIES, Vendor } from '../types';

// POST /api/vendors/match — category에 속하는 활성 업체를 업체명 가나다순으로 반환.
// NOTE: region 필터링은 이번 범위에서 제외 (vendors.region 컬럼만 준비된 상태).
// NOTE: is_active 필터는 db/002_vendors_rating_active.sql 을 실행해야 동작한다.
export async function matchVendors(req: Request, res: Response) {
  const { category } = req.body as { category: RepairCategory };

  if (!REPAIR_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: `category는 ${REPAIR_CATEGORIES.join('|')} 중 하나여야 합니다.` });
  }

  const { data, error } = await supabaseAdmin
    .from('vendors')
    // business_number는 공개 매칭 응답에서 제외한다.
    .select('id, name, categories, region, phone, rating, is_active, created_at')
    .contains('categories', [category])
    .eq('is_active', true);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // 한글 정렬은 Postgres collation에 의존하지 않고 JS localeCompare('ko')로 처리.
  const vendors = (data as Vendor[]).sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  return res.json({ vendors });
}

// GET /api/vendors/requests?technicianId= | ?vendorId= — 업체가 받아 볼 신고 목록.
//
// AI 분석이 vendor_match로 판정한 신고 중, 업체의 전문 분야(categories)에 해당하고
// 아직 낙찰(selected)된 견적이 없는 것만 준다. 업체는 여기서 report_id와
// 세입자의 거주 가능 시간대(available_times, 자유 텍스트)를 보고 POST /api/quotes로
// proposed_visit_at을 담아 견적을 낸다.
//
// technicianId(로그인한 수리기사의 users.id)로 부르는 것이 기본이다. 프론트는 로그인 응답에서
// users.id만 들고 있고 vendors.id는 모르기 때문이다 — db/007의 vendors.user_id로 이어 준다.
// 응답에 vendor를 함께 실어 주므로, 프론트는 그 vendor.id를 POST /api/quotes의 vendor_id로 쓰면 된다.
// (vendorId로 직접 부르는 경로도 남겨 둔다.)
export async function listVendorRequests(req: Request, res: Response) {
  const technicianId = req.query.technicianId as string | undefined;
  const vendorId = req.query.vendorId as string | undefined;

  if (!technicianId && !vendorId) {
    return res.status(400).json({ error: 'technicianId 또는 vendorId 쿼리 파라미터가 필요합니다.' });
  }

  const lookup = supabaseAdmin.from('vendors').select('id, name, categories, phone, rating');
  const { data: vendor, error: vendorError } = await (technicianId
    ? lookup.eq('user_id', technicianId)
    : lookup.eq('id', vendorId!)
  ).maybeSingle();

  if (vendorError) {
    return res.status(500).json({ error: vendorError.message });
  }
  if (!vendor) {
    return res.status(404).json({
      error: technicianId
        ? '이 계정에 연결된 업체 정보가 없습니다. technician으로 회원가입할 때 사업자등록번호와 전문 분야를 등록해야 합니다.'
        : '업체를 찾을 수 없습니다.',
    });
  }

  const { data, error } = await supabaseAdmin
    .from('reports')
    .select('id, category, severity, description, photo_url, photo_urls, available_times, status, created_at')
    .in('category', vendor.categories as RepairCategory[])
    .eq('recommended_path', 'vendor_match')
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // 이미 업체가 정해진 신고는 뺀다. 조인으로 한 번에 거르려면 PostgREST에서 not-exists를
  // 표현해야 해서, 낙찰된 report_id를 따로 읽어 JS에서 제외한다.
  // ponytail: 신고 수가 수만 건이 되면 뷰나 RPC로 옮길 것.
  const { data: taken } = await supabaseAdmin.from('quotes').select('report_id').eq('status', 'selected');
  const takenIds = new Set((taken ?? []).map((q: { report_id: string }) => q.report_id));

  // 이미 내가 견적을 낸 신고는 alreadyQuoted로 표시한다 — 목록에서 빼면 업체가 자기가 낸
  // 견적을 다시 볼 수 없어진다.
  const { data: mine } = await supabaseAdmin.from('quotes').select('report_id').eq('vendor_id', vendor.id);
  const myIds = new Set((mine ?? []).map((q: { report_id: string }) => q.report_id));

  const requests = (data ?? [])
    .filter((r: { id: string }) => !takenIds.has(r.id))
    .map((r: { id: string }) => ({ ...r, alreadyQuoted: myIds.has(r.id) }));

  return res.json({ vendor, requests });
}
