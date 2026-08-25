import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../middleware/auth';
import {
  listRequests,
  getRequest,
  approveRequest,
  createAutoApprovalPolicy,
  listProperties,
} from '../controllers/landlord.controller';

const router = Router();

router.use(requireAuth);

router.get('/requests', asyncHandler(listRequests));
router.get('/requests/:id', asyncHandler(getRequest));
router.patch('/requests/:id/approve', asyncHandler(approveRequest));
router.post('/auto-approval-policy', asyncHandler(createAutoApprovalPolicy));
router.get('/properties', asyncHandler(listProperties));

export default router;
