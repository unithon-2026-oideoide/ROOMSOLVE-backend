import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../middleware/auth';
import { linkLandlordByCode } from '../controllers/users.controller';

const router = Router();

/**
 * @swagger
 * /api/users/link-landlord:
 *   patch:
 *     summary: 임대인 초대 코드로 세입자-임대인 연결
 *     description: |
 *       landlord role 계정이 회원가입 시 발급받은 6자리 초대 코드를 로그인한
 *       사용자(보통 세입자)의 linked_landlord_id에 연결한다. 연결해두면
 *       POST /api/reports 호출 시 landlord_id를 생략해도 이 값이 대신 쓰인다.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code]
 *             properties:
 *               code:
 *                 type: string
 *                 example: AB12CD
 *     responses:
 *       200:
 *         description: 연결 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *                 landlord:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     name:
 *                       type: string
 *       400:
 *         description: code 누락 또는 본인 코드를 연결하려 함
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: 인증 토큰 누락 또는 만료
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: 유효하지 않은 초대 코드
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
router.patch('/link-landlord', requireAuth, asyncHandler(linkLandlordByCode));

export default router;
