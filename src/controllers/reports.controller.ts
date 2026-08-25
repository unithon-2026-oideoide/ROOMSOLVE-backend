import { Request, Response } from 'express';

// TODO: 팀원A — 하자 리포트 생성. photo_url(Supabase Storage 업로드 결과), description,
// category, severity 등을 받아 reports 테이블에 insert.
// - 요청 body에 landlord_id도 포함되어야 함 (해당 리포트를 생성한 세입자가 어느 임대인
//   소속인지 나타내는 값, reports.landlord_id는 nullable 아님).
// - 프론트(Flutter)에서 세입자가 가입/리포트 작성하는 시점에 landlord_id를 함께
//   전달해주는 구조여야 함 — 세입자별로 landlord_id를 미리 확보해두는 흐름을
//   프론트 쪽과 맞춰야 함.
export async function createReport(req: Request, res: Response) {
  res.status(200).json({ message: 'TODO(팀원A): createReport 구현 필요' });
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
