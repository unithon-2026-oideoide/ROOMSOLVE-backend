import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { matchVendors } from '../controllers/vendors.controller';

// TODO: 팀원B 담당

const router = Router();

router.post('/match', asyncHandler(matchVendors));

export default router;
