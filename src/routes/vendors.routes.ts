import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { matchVendors } from '../controllers/vendors.controller';

// 전문업체 매칭 (팀원B). 구현: src/controllers/vendors.controller.ts

const router = Router();

router.post('/match', asyncHandler(matchVendors));

export default router;
