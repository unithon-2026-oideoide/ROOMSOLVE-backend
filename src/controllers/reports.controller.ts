import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
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

// TODO: 팀원A — 리포트 목록 조회. tenant_id/status 등 필터, 페이지네이션 고려.
export async function listReports(req: Request, res: Response) {
  res.status(200).json({ message: 'TODO(팀원A): listReports 구현 필요' });
}

// TODO: 팀원A — 리포트 단건 조회.
export async function getReport(req: Request, res: Response) {
  res.status(200).json({ message: 'TODO(팀원A): getReport 구현 필요' });
}

// TODO: 팀원A — 사진/설명 기반 AI 분석(Claude Vision 등) 후 아래 응답 스키마로 반환:
// {
//   category: string,
//   severity: string,
//   recommended_path: 'self_fix' | 'manufacturer_as' | 'vendor_match',
//   self_fix_guide: string | null
// }
// 이 API는 AI 분석(분류)만 담당함 — landlord_id는 여기서 다루지 않음.
// landlord_id는 POST /api/reports(createReport)에서 별도로 처리.
export async function analyzeReport(req: Request, res: Response) {
  res.status(200).json({ message: 'TODO(팀원A): analyzeReport 구현 필요' });
}

// TODO: 팀원A — category 기준으로 manufacturer_as_info 테이블 조회.
export async function getManufacturerAs(req: Request, res: Response) {
  res.status(200).json({ message: 'TODO(팀원A): getManufacturerAs 구현 필요' });
}
