import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../middleware/auth';
import { listVendorRequests, matchVendors } from '../controllers/vendors.controller';

// 전문업체 매칭 (팀원B). 구현: src/controllers/vendors.controller.ts

const router = Router();

// 로그인 필수. 이전에는 인증이 없어서 누구나 신고 목록(연락처 포함)을 조회할 수 있었다.
router.use(requireAuth);

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
 *         name: technicianId
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *         description: |
 *           로그인한 수리기사의 users.id. 프론트는 보통 이 값만 들고 있으므로 이쪽을 쓴다.
 *           db/007의 vendors.user_id로 업체를 찾아 준다.
 *       - in: query
 *         name: vendorId
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 업체 id로 직접 조회할 때. technicianId와 둘 중 하나는 필수.
 *     responses:
 *       200:
 *         description: 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 vendor:
 *                   description: 조회한 업체 정보. 이 vendor.id를 POST /api/quotes의 vendor_id로 쓴다.
 *                   type: object
 *                   properties:
 *                     id: { type: string, format: uuid }
 *                     name: { type: string }
 *                     categories: { type: array, items: { $ref: '#/components/schemas/Category' } }
 *                     phone: { type: string, nullable: true }
 *                     rating: { type: number }
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
 *                       alreadyQuoted:
 *                         type: boolean
 *                         description: 이 업체가 이미 견적을 낸 신고인지. true면 프론트에서 "견적 제출됨"으로 표시.
 *       400:
 *         description: technicianId / vendorId 둘 다 누락
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: 업체를 찾을 수 없음 (technician 계정에 연결된 업체 정보가 없는 경우 포함)
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
