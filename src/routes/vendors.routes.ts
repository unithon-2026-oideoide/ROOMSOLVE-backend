import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { matchVendors } from '../controllers/vendors.controller';

// TODO: 팀원B 담당
//
// 아래 @swagger 주석은 아직 스텁인 상태에서 미리 채워둔 "의도된" 요청/응답 스키마임.
// 실제 로직을 구현하면서 필드가 바뀌면 주석도 같이 업데이트해줘.

const router = Router();

/**
 * @swagger
 * /api/vendors/match:
 *   post:
 *     summary: 카테고리/지역 기준 업체 매칭
 *     description: (스텁) 현재는 200 placeholder만 반환함.
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
 *               region:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       200:
 *         description: 매칭 성공 (구현 완료 후) / 현재는 placeholder 메시지
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: object
 *                   properties:
 *                     vendors:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Vendor'
 *                 - type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: 'TODO(팀원B): matchVendors 구현 필요'
 *       400:
 *         description: category 누락 (구현 완료 후)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: 서버 오류 (구현 완료 후)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/match', asyncHandler(matchVendors));

export default router;
