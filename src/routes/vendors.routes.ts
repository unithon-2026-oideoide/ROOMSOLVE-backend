import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { listVendorRequests, matchVendors } from '../controllers/vendors.controller';

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

/**
 * @swagger
 * /api/vendors/requests:
 *   get:
 *     summary: 업체가 받아 볼 신고 목록
 *     description: |
 *       AI 분석이 recommended_path=vendor_match로 판정한 신고 중, 해당 업체의 전문 분야
 *       (vendors.categories)에 속하고 아직 낙찰된 견적이 없는 것만 반환한다.
 *       업체는 여기서 report_id와 세입자의 available_times(거주 가능 시간대, 자유 텍스트)를 보고
 *       POST /api/quotes로 proposed_visit_at을 담아 견적을 제출한다.
 *     tags: [Vendors]
 *     parameters:
 *       - in: query
 *         name: vendorId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 업체 id (technician 가입 시 응답의 vendor.id)
 *     responses:
 *       200:
 *         description: 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 requests:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string, format: uuid }
 *                       category: { $ref: '#/components/schemas/Category' }
 *                       severity: { type: string }
 *                       description: { type: string, nullable: true }
 *                       photo_urls: { type: array, items: { type: string } }
 *                       available_times:
 *                         type: string
 *                         nullable: true
 *                         description: 세입자가 알려준 거주 가능 시간대. 자유 텍스트. 예 "평일 오후, 주말 오전"
 *                         example: '평일 오후, 주말 오전'
 *                       status: { type: string }
 *                       created_at: { type: string, format: date-time }
 *       400:
 *         description: vendorId 누락
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: 업체를 찾을 수 없음
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
router.get('/requests', asyncHandler(listVendorRequests));

export default router;
