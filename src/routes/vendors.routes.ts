import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { matchVendors } from '../controllers/vendors.controller';

// 전문업체 매칭 (팀원B). 구현: src/controllers/vendors.controller.ts

const router = Router();

/**
 * @swagger
 * /api/vendors/match:
 *   post:
 *     summary: 카테고리 기준 활성 업체 매칭
 *     description: |
 *       category에 속하고 is_active인 업체를 업체명 가나다순('ko' locale)으로 정렬해 반환.
 *       region 필터는 아직 미적용 (vendors.region 컬럼만 준비된 상태).
 *       is_active 필터는 db/002_vendors_rating_active.sql을 실행해야 동작함 — 실행 전에는
 *       모든 업체의 is_active가 없어 매칭 결과가 항상 빈 배열일 수 있음.
 *     tags: [Vendors]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [category]
 *             properties:
 *               category:
 *                 type: string
 *                 enum: [plumbing, electrical, heating, appliance, door_window, interior, pest, other]
 *     responses:
 *       200:
 *         description: 매칭 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 vendors:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Vendor'
 *       400:
 *         description: category가 유효한 값이 아님
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/match', asyncHandler(matchVendors));

export default router;
