import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import {
  createReport,
  listReports,
  getReport,
  analyzeReport,
  getManufacturerAs,
} from '../controllers/reports.controller';

// TODO: 팀원A 담당 — 이 파일의 라우트 전부 (report CRUD + AI 분석 + 제조사 A/S 조회)
// 저녁에 응답 스키마(특히 /analyze) 확정되면 팀 전체 공유 필요.

const reportsRouter = Router();

reportsRouter.post('/', asyncHandler(createReport));
reportsRouter.get('/', asyncHandler(listReports));
reportsRouter.get('/:id', asyncHandler(getReport));
reportsRouter.post('/analyze', asyncHandler(analyzeReport));

export default reportsRouter;

// GET /api/manufacturer-as 는 base path가 달라서 별도 라우터로 분리해 app.ts에서 마운트함.
export const manufacturerAsRouter = Router();
manufacturerAsRouter.get('/', asyncHandler(getManufacturerAs));
