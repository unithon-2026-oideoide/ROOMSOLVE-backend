import { Response } from 'express';
import { AuthedRequest } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';

// PATCH /api/users/link-landlord — 임대인 초대 코드로 세입자-임대인을 연결한다.
//
// properties(호실) 테이블이 없어 세입자가 자기 landlord_id를 알 방법이 없던 문제
// (팀 README에 명시된 gap)를 임대인이 발급받는 6자리 코드로 임시 해결한다
// (db/008_landlord_tenant_link.sql). 여기서 채운 linked_landlord_id는
// createReport가 landlord_id 생략 시 대신 쓴다(reports.controller.ts).
//
// 인증만 요구하고 role은 검증하지 않는다 — 세입자만 쓰는 게 자연스럽지만, 코드가
// 존재하는 landlord로만 연결되므로(아래 role='landlord' 필터) 다른 role이 잘못
// 눌러도 실질적인 부작용은 없다.
export async function linkLandlordByCode(req: AuthedRequest, res: Response) {
  const { code } = req.body as { code?: string };

  if (!code || typeof code !== 'string' || !code.trim()) {
    return res.status(400).json({ error: 'code(임대인 초대 코드)가 필요합니다.' });
  }

  const { data: landlord, error: landlordError } = await supabaseAdmin
    .from('users')
    .select('id, name')
    .eq('landlord_code', code.trim().toUpperCase())
    .eq('role', 'landlord')
    .maybeSingle();

  if (landlordError) {
    return res.status(500).json({ error: landlordError.message });
  }
  if (!landlord) {
    return res.status(404).json({ error: '유효하지 않은 초대 코드입니다.' });
  }
  if (landlord.id === req.user!.id) {
    return res.status(400).json({ error: '본인의 코드는 연결할 수 없습니다.' });
  }

  const { data, error } = await supabaseAdmin
    .from('users')
    .update({ linked_landlord_id: landlord.id })
    .eq('id', req.user!.id)
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json({ user: data, landlord: { id: landlord.id, name: landlord.name } });
}
