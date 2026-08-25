import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import {
  createSchedule,
  listSchedules,
  confirmSchedule,
  changeRepairStatus,
  getRepairTimeline,
} from '../controllers/repair.controller';

const router = Router();

router.post('/schedule', asyncHandler(createSchedule));
router.get('/schedule', asyncHandler(listSchedules));
router.patch('/schedule/:id/confirm', asyncHandler(confirmSchedule));
router.post('/status', asyncHandler(changeRepairStatus));
router.get('/timeline', asyncHandler(getRepairTimeline));

export default router;
