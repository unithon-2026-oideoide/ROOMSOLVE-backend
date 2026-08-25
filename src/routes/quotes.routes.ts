import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { createQuote, listQuotes, updateQuoteStatus } from '../controllers/quotes.controller';

// 견적 등록/조회/상태변경 (팀원B). 구현: src/controllers/quotes.controller.ts

const router = Router();

router.post('/', asyncHandler(createQuote));
router.get('/', asyncHandler(listQuotes));
router.patch('/:id/status', asyncHandler(updateQuoteStatus));

export default router;
