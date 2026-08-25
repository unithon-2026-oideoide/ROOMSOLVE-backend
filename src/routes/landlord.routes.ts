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

/**
 * @swagger
 * /api/landlord/requests:
 *   get:
 *     summary: 임대인 요청(리포트) 목록 조회
 *     tags: [Landlord]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 로그인한 임대인 앞으로 온 리포트 목록 (세입자 정보 포함)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 requests:
 *                   type: array
 *                   items:
 *                     allOf:
 *                       - $ref: '#/components/schemas/Report'
 *                       - type: object
 *                         properties:
 *                           tenant:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                                 format: uuid
 *                               name:
 *                                 type: string
 *                               phone:
 *                                 type: string
 *                                 nullable: true
 *       401:
 *         description: 인증 토큰 누락 또는 만료
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
router.get('/requests', asyncHandler(listRequests));

/**
 * @swagger
 * /api/landlord/requests/{id}:
 *   get:
 *     summary: 임대인 요청(리포트) 단건 조회
 *     tags: [Landlord]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: 리포트 단건 (세입자 정보 포함)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 request:
 *                   $ref: '#/components/schemas/Report'
 *       401:
 *         description: 인증 토큰 누락 또는 만료
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: 로그인한 임대인 소속이 아니거나 존재하지 않는 리포트
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/requests/:id', asyncHandler(getRequest));

/**
 * @swagger
 * /api/landlord/requests/{id}/approve:
 *   patch:
 *     summary: 임대인 요청 승인/거절
 *     tags: [Landlord]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [approved]
 *             properties:
 *               approved:
 *                 type: boolean
 *                 description: true면 status를 approved로, false면 rejected로 변경
 *     responses:
 *       200:
 *         description: 상태 변경 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 request:
 *                   $ref: '#/components/schemas/Report'
 *       400:
 *         description: approved(boolean) 값 누락
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
 *         description: 로그인한 임대인 소속이 아니거나 존재하지 않는 리포트
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
router.patch('/requests/:id/approve', asyncHandler(approveRequest));

/**
 * @swagger
 * /api/landlord/auto-approval-policy:
 *   post:
 *     summary: 카테고리별 자동승인 한도 등록/수정
 *     description: (landlord_id, category) 기준 upsert — 같은 카테고리로 다시 요청하면 한도가 갱신됨.
 *     tags: [Landlord]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [category, auto_approve_limit]
 *             properties:
 *               category:
 *                 type: string
 *                 enum: [plumbing, electrical, heating, appliance, door_window, interior, pest, other]
 *               auto_approve_limit:
 *                 type: integer
 *                 minimum: 0
 *                 example: 50000
 *     responses:
 *       201:
 *         description: 등록/갱신 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 policy:
 *                   $ref: '#/components/schemas/LandlordAutoApprovalPolicy'
 *       400:
 *         description: category/auto_approve_limit 누락 또는 형식 오류
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
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/auto-approval-policy', asyncHandler(createAutoApprovalPolicy));

/**
 * @swagger
 * /api/landlord/properties:
 *   get:
 *     summary: 임대인 매물(세입자) 목록 조회
 *     description: 별도 properties 테이블이 아직 없어, 이 임대인 앞으로 리포트를 올린 세입자 목록을 중복 제거해서 반환하는 임시 구조.
 *     tags: [Landlord]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 properties:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       name:
 *                         type: string
 *                       phone:
 *                         type: string
 *                         nullable: true
 *       401:
 *         description: 인증 토큰 누락 또는 만료
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
router.get('/properties', asyncHandler(listProperties));

export default router;
