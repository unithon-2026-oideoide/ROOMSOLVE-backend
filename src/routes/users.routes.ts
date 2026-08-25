import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { updateUserRole } from '../controllers/users.controller';

const router = Router();

router.patch('/:id/role', asyncHandler(updateUserRole));

export default router;
