import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { createQuote, listQuotes, updateQuoteStatus } from '../controllers/quotes.controller';

// TODO: 팀원B 담당
//
// 아래 @swagger 주석들은 아직 스텁인 상태에서 미리 채워둔 "의도된" 요청/응답 스키마임.
// 실제 로직을 구현하면서 필드가 바뀌면 주석도 같이 업데이트해줘.

const router = Router();

/**
 * @swagger
 * /api/quotes:
 *   post:
 *     summary: 견적 등록
 *     description: (스텁) 현재는 200 placeholder만 반환함.
 *     tags: [Quotes]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [report_id, vendor_id, price]
 *             properties:
 *               report_id:
 *                 type: string
 *                 format: uuid
 *               vendor_id:
 *                 type: string
 *                 format: uuid
 *               price:
 *                 type: integer
 *                 minimum: 0
 *                 example: 80000
 *     responses:
 *       201:
 *         description: 등록 성공 (구현 완료 후)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 quote:
 *                   $ref: '#/components/schemas/Quote'
 *       200:
 *         description: (현재 스텁) placeholder 응답
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: 'TODO(팀원B): createQuote 구현 필요'
 *       400:
 *         description: 필수값 누락 (구현 완료 후)
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
router.post('/', asyncHandler(createQuote));

/**
 * @swagger
 * /api/quotes:
 *   get:
 *     summary: 견적 목록 조회
 *     description: (스텁) 현재는 200 placeholder만 반환함.
 *     tags: [Quotes]
 *     parameters:
 *       - in: query
 *         name: reportId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 특정 리포트에 대한 견적만 조회 (구현 예정)
 *     responses:
 *       200:
 *         description: 목록 조회 성공 (구현 완료 후) / 현재는 placeholder 메시지
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: object
 *                   properties:
 *                     quotes:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Quote'
 *                 - type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: 'TODO(팀원B): listQuotes 구현 필요'
 *       500:
 *         description: 서버 오류 (구현 완료 후)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/', asyncHandler(listQuotes));

/**
 * @swagger
 * /api/quotes/{id}/status:
 *   patch:
 *     summary: 견적 상태 변경
 *     description: (스텁) 현재는 200 placeholder만 반환함. 수락/거절 등 상태 전이 예정.
 *     tags: [Quotes]
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
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 example: accepted
 *     responses:
 *       200:
 *         description: 상태 변경 성공 (구현 완료 후) / 현재는 placeholder 메시지
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: object
 *                   properties:
 *                     quote:
 *                       $ref: '#/components/schemas/Quote'
 *                 - type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: 'TODO(팀원B): updateQuoteStatus 구현 필요'
 *       400:
 *         description: status 값 누락/유효하지 않음 (구현 완료 후)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: 존재하지 않는 견적 (구현 완료 후)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.patch('/:id/status', asyncHandler(updateQuoteStatus));

export default router;
