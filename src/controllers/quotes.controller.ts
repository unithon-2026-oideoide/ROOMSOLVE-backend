import { Request, Response } from 'express';

// TODO: 팀원B — 견적 등록. report_id, vendor_id, price 저장, is_outlier 계산 로직 포함 가능.
export async function createQuote(req: Request, res: Response) {
  res.status(200).json({ message: 'TODO(팀원B): createQuote 구현 필요' });
}

// TODO: 팀원B — 견적 목록 조회. report_id 필터 등.
export async function listQuotes(req: Request, res: Response) {
  res.status(200).json({ message: 'TODO(팀원B): listQuotes 구현 필요' });
}

// TODO: 팀원B — 견적 상태 변경 (수락/거절 등).
export async function updateQuoteStatus(req: Request, res: Response) {
  res.status(200).json({ message: 'TODO(팀원B): updateQuoteStatus 구현 필요' });
}
