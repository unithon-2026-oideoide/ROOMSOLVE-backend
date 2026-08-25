import { Request, Response } from 'express';

// TODO: 팀원B — category/region 기준으로 vendors 테이블 매칭 로직 구현.
export async function matchVendors(req: Request, res: Response) {
  res.status(200).json({ message: 'TODO(팀원B): matchVendors 구현 필요' });
}
