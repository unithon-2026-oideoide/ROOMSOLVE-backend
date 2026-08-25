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
  // 임시로 이 landlord와 연결된(linked_landlord_id, db/008) tenant 목록을
  // 반환합니다. 실제 매물(properties) 테이블이 생기면 이 로직을 교체해줘야 합니다.
  //
  // 예전에는 reports.landlord_id에서 뽑았는데, 그건 "그 신고를 보낼 당시"의
  // 스냅샷이라 세입자가 초대 코드로 다른 임대인에게 옮겨가도(linked_landlord_id
  // 변경) 예전 임대인 목록에 계속 남고 새 임대인 목록에는 신고를 새로 보내기
  // 전까지 안 보이는 문제가 있었다. linked_landlord_id는 "지금" 연결 상태를
  // 그대로 담고 있어 이 문제가 없다.
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, name, phone')
    .eq('linked_landlord_id', landlordId)
    .eq('role', 'tenant')
    .order('name');

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json({ properties: (data ?? []) as TenantSummary[] });
}
