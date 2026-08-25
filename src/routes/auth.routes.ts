import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { signup, login } from '../controllers/auth.controller';

const router = Router();

router.post('/signup', asyncHandler(signup));
router.post('/login', asyncHandler(login));

export default router;
