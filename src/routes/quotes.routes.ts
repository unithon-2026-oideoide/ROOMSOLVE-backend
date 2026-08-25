import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { createQuote, listQuotes, updateQuoteStatus } from '../controllers/quotes.controller';

// 견적 등록/조회/상태변경 (팀원B). 구현: src/controllers/quotes.controller.ts

const router = Router();

/**
 * @swagger
 * /api/quotes:
 *   post:
 *     summary: 견적 등록
 *     description: status는 'recommended'로 고정 삽입됨.
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
 *               proposed_visit_at:
 *                 type: string
 *                 format: date-time
 *                 description: >
 *                   업체가 제안하는 방문 가능 시간(선택, ISO 8601). 이 견적이 나중에 selected로
 *                   바뀌는 순간 이 값으로 repair_schedule이 자동 생성된다. db/009
 *     responses:
 *       201:
 *         description: 등록 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 quote:
 *                   $ref: '#/components/schemas/Quote'
 *       400:
 *         description: report_id/vendor_id 누락, price가 0 이상의 정수가 아님, 또는 proposed_visit_at 형식 오류
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
router.post('/', asyncHandler(createQuote));

/**
 * @swagger
 * /api/quotes:
 *   get:
 *     summary: 리포트별 견적 목록 + 이상치 판정 조회
 *     description: 각 견적의 price가 이 리포트 견적들의 중앙값(median) * 2를 초과하면 isOutlier true. 이상치도 목록에서 제외하지 않고 플래그만 붙여서 함께 반환.
 *     tags: [Quotes]
 *     parameters:
 *       - in: query
 *         name: reportId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 견적을 조회할 리포트 id
 *       - in: query
 *         name: applianceType
 *         required: false
 *         schema:
 *           type: string
 *           enum: [aircon, boiler, induction, refrigerator, washer]
 *         description: >
 *           가전 종류. 주면 동급 신품가와 비교해 수리/교체 권장(replacementAdvice)을 함께 낸다.
 *           생략하면 replacementAdvice가 null이다.
 *       - in: query
 *         name: warrantyCovered
 *         required: false
 *         schema:
 *           type: boolean
 *         description: >
 *           analyze 의 liability 가 manufacturer_warranty 일 때 true 로 준다.
 *           무상 수리가 가능한 가전에 교체 권장이 나가지 않도록 막는다.
 *     responses:
 *       200:
 *         description: 목록 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 quotes:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/QuoteWithOutlierInfo'
 *                 median:
 *                   type: number
 *                   nullable: true
 *                   description: 해당 리포트 견적 price들의 중앙값 (견적이 없으면 null)
 *                 replacementAdvice:
 *                   nullable: true
 *                   allOf:
 *                     - $ref: '#/components/schemas/ReplacementAdvice'
 *                   description: applianceType 미지정이거나 견적이 0건이면 null
 *       400:
 *         description: reportId 쿼리 파라미터 누락
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
router.get('/', asyncHandler(listQuotes));

/**
 * @swagger
 * /api/quotes/{id}/status:
 *   patch:
 *     summary: 견적 상태 변경 (recommended / selected / rejected)
 *     description: >
 *       status를 selected로 바꾸면 같은 report_id의 나머지 견적은 전부 rejected로
 *       명시 전환된다(지금 선택된 것 제외). 그리고 이 견적의 proposed_visit_at으로
 *       repair_schedule을 자동 생성(confirmed 상태)하고 repair_status_timeline에도
 *       'confirmed'를 기록한다 — 단, 업체 계정(vendors.user_id)이 연결돼 있지 않거나
 *       proposed_visit_at이 비어 있으면 일정 생성은 조용히 건너뛴다(에러 아님, 응답의
 *       scheduleSkippedReason으로 이유를 알려줌). db/009_quote_visit_and_reject.sql 필요.
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
 *                 enum: [recommended, selected, rejected]
 *     responses:
 *       200:
 *         description: 상태 변경 성공. status가 selected일 때만 schedule/scheduleSkippedReason이 채워짐(그 외 상태 변경은 quote만 반환).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 quote:
 *                   $ref: '#/components/schemas/Quote'
 *                 schedule:
 *                   nullable: true
 *                   allOf:
 *                     - $ref: '#/components/schemas/RepairSchedule'
 *                   description: 자동 생성된 방문 일정. selected가 아니거나 생성이 스킵되면 null.
 *                 scheduleSkippedReason:
 *                   type: string
 *                   nullable: true
 *                   description: schedule이 null인 이유(업체 계정 없음, 방문 시간 없음 등). 정상 생성됐거나 selected가 아니면 null.
 *       400:
 *         description: status가 recommended/selected/rejected 중 하나가 아님
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: 존재하지 않는 견적
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
router.patch('/:id/status', asyncHandler(updateQuoteStatus));

export default router;
