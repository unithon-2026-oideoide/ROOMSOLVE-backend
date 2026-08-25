import { Response } from 'express';
import { AuthedRequest } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import { RepairCategory } from '../types';

// GET /api/landlord/requests, GET /api/landlord/requests/:id, GET /api/landlord/properties가
// 공통으로 조인해 오는 tenant 프로필 형태.
interface TenantSummary {
  id: string;
  name: string;
  phone: string | null;
}

// NOTE: 아래 쿼리들은 `reports` 테이블에 landlord_id 컬럼이 있다고 가정합니다.
// 공유받은 스키마 요약에는 명시돼 있지 않던 컬럼이라, 실제 DB 구조와 다르면
// (예: 별도 tenancy/properties 테이블을 통해 매핑되는 구조라면) 아래 .eq('landlord_id', ...)
// 부분을 실제 관계에 맞게 고쳐줘야 합니다.

export async function listRequests(req: AuthedRequest, res: Response) {
  const landlordId = req.user!.id;

  const { data, error } = await supabaseAdmin
    .from('reports')
    .select('*, tenant:users!reports_tenant_id_fkey(id, name, phone)')
    .eq('landlord_id', landlordId)
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }
  return res.json({ requests: data });
}

export async function getRequest(req: AuthedRequest, res: Response) {
  const landlordId = req.user!.id;
  const { id } = req.params;

  const { data, error } = await supabaseAdmin
    .from('reports')
    .select('*, tenant:users!reports_tenant_id_fkey(id, name, phone)')
    .eq('id', id)
    .eq('landlord_id', landlordId)
    .single();

  if (error || !data) {
    return res.status(404).json({ error: '요청을 찾을 수 없습니다.' });
  }
  return res.json({ request: data });
}

export async function approveRequest(req: AuthedRequest, res: Response) {
  const landlordId = req.user!.id;
  const { id } = req.params;
  const { approved } = req.body as { approved: boolean };

  if (typeof approved !== 'boolean') {
    return res.status(400).json({ error: 'approved(boolean) 값이 필요합니다.' });
  }

  const { data, error } = await supabaseAdmin
    .from('reports')
    .update({ status: approved ? 'approved' : 'rejected' })
    .eq('id', id)
    .eq('landlord_id', landlordId)
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }
  if (!data) {
    return res.status(404).json({ error: '요청을 찾을 수 없습니다.' });
  }

  return res.json({ request: data });
}

export async function createAutoApprovalPolicy(req: AuthedRequest, res: Response) {
  const landlordId = req.user!.id;
  const { category, auto_approve_limit } = req.body as { category: RepairCategory; auto_approve_limit: number };

  if (!category || typeof auto_approve_limit !== 'number') {
    return res.status(400).json({ error: 'category(string), auto_approve_limit(number)이 필요합니다.' });
  }

  // landlord_auto_approval_policy는 (landlord_id, category)에 unique 제약이 있어서
  // 같은 카테고리로 다시 저장하면 insert는 409로 실패한다. upsert로 덮어쓴다.
  const { data, error } = await supabaseAdmin
    .from('landlord_auto_approval_policy')
    .upsert(
      { landlord_id: landlordId, category, auto_approve_limit },
      { onConflict: 'landlord_id,category' }
    )
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }
  return res.status(201).json({ policy: data });
}

export async function listProperties(req: AuthedRequest, res: Response) {
  const landlordId = req.user!.id;

  // NOTE: 현재 스키마에는 별도 `properties` 테이블이 없습니다.
  // 임시로 이 landlord의 reports에 연결된 tenant 목록을 중복 제거해서 반환합니다.
  // 실제 매물(properties) 테이블이 생기면 이 로직을 교체해줘야 합니다.
  const { data, error } = await supabaseAdmin
    .from('reports')
    .select('tenant:users!reports_tenant_id_fkey(id, name, phone)')
    .eq('landlord_id', landlordId);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // supabase-js는 FK 관계를 코드 생성 타입 없이는 배열로 추론한다.
  // reports_tenant_id_fkey는 실제로는 to-one 관계라 런타임엔 단일 객체로 온다.
  const seen = new Set<string>();
  const tenants = (data as unknown as { tenant: TenantSummary | null }[])
    .map((row) => row.tenant)
    .filter((tenant): tenant is TenantSummary => {
      if (!tenant || seen.has(tenant.id)) return false;
      seen.add(tenant.id);
      return true;
    });

  return res.json({ properties: tenants });
}
