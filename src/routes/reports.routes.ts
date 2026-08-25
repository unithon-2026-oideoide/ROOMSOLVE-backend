import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../middleware/auth';
import {
  createReport,
  listReports,
  getReport,
  analyzeReport,
  getManufacturerAs,
} from '../controllers/reports.controller';

// TODO: 팀원A 담당 — 이 파일의 라우트 전부 (report CRUD + AI 분석 + 제조사 A/S 조회)
// 저녁에 응답 스키마(특히 /analyze) 확정되면 팀 전체 공유 필요.
//
// 아래 @swagger 주석들은 아직 스텁인 상태에서 미리 채워둔 "의도된" 요청/응답 스키마임.
// 실제 로직을 구현하면서 필드가 바뀌면 주석도 같이 업데이트해줘 — 문서 구조(경로,
// 태그, 200/400 등 기본 골격)는 그대로 두고 필요한 부분만 고치면 됨.

const reportsRouter = Router();

// 이 라우터의 모든 경로는 로그인 필수. 컨트롤러에서 req.user!.id로 세입자 id를 쓴다.
reportsRouter.use(requireAuth);

/**
 * @swagger
 * /api/reports:
 *   post:
 *     summary: 하자 리포트 생성
 *     description: |
 *       (스텁) 현재는 body를 무시하고 200 placeholder만 반환함.
 *       POST /api/uploads로 먼저 photo_url을 받아온 뒤 호출하는 흐름을 전제로 함.
 *     tags: [Reports]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [landlord_id, photo_url]
 *             properties:
 *               landlord_id:
 *                 type: string
 *                 format: uuid
 *                 description: 세입자가 속한 임대인 id (프론트에서 미리 확보해서 함께 전달)
 *               photo_url:
 *                 type: string
 *                 format: uri
 *                 description: POST /api/uploads 응답으로 받은 url
 *               description:
 *                 type: string
 *                 nullable: true
 *               category:
 *                 type: string
 *                 nullable: true
 *                 enum: [plumbing, electrical, heating, appliance, door_window, interior, pest, other]
 *               severity:
 *                 type: string
 *                 nullable: true
 *                 enum: [low, medium, high, emergency]
 *               recommended_path:
 *                 type: string
 *                 nullable: true
 *                 enum: [self_fix, manufacturer_as, vendor_match]
 *               self_fix_guide:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       201:
 *         description: 생성 성공 (구현 완료 후)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 report:
 *                   $ref: '#/components/schemas/Report'
 *       200:
 *         description: (현재 스텁) placeholder 응답
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: 'TODO(팀원A): createReport 구현 필요'
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
reportsRouter.post('/', asyncHandler(createReport));

/**
 * @swagger
 * /api/reports:
 *   get:
 *     summary: 리포트 목록 조회
 *     description: (스텁) 현재는 200 placeholder만 반환함. tenant_id/status 필터 및 페이지네이션 추가 예정.
 *     tags: [Reports]
 *     parameters:
 *       - in: query
 *         name: tenant_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 특정 세입자의 리포트만 조회 (구현 예정)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: 상태 필터 (구현 예정)
 *     responses:
 *       200:
 *         description: 목록 조회 성공 (구현 완료 후) / 현재는 placeholder 메시지
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: object
 *                   properties:
 *                     reports:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Report'
 *                 - type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: 'TODO(팀원A): listReports 구현 필요'
 *       500:
 *         description: 서버 오류 (구현 완료 후)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
reportsRouter.get('/', asyncHandler(listReports));

/**
 * @swagger
 * /api/reports/{id}:
 *   get:
 *     summary: 리포트 단건 조회
 *     description: (스텁) 현재는 200 placeholder만 반환함.
 *     tags: [Reports]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: 조회 성공 (구현 완료 후) / 현재는 placeholder 메시지
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: object
 *                   properties:
 *                     report:
 *                       $ref: '#/components/schemas/Report'
 *                 - type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: 'TODO(팀원A): getReport 구현 필요'
 *       404:
 *         description: 존재하지 않는 리포트 (구현 완료 후)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
reportsRouter.get('/:id', asyncHandler(getReport));

/**
 * @swagger
 * /api/reports/analyze:
 *   post:
 *     summary: 사진/설명 기반 AI 하자 분석
 *     description: |
 *       (스텁) 현재는 200 placeholder만 반환함. Claude Vision 등으로 분석 후
 *       category/severity/recommended_path/self_fix_guide를 반환하는 것이 목표.
 *       landlord_id는 이 API와 무관 — POST /api/reports(createReport)에서 별도 처리.
 *     tags: [Reports]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               photo_url:
 *                 type: string
 *                 format: uri
 *               description:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       200:
 *         description: 분석 성공 (구현 완료 후) / 현재는 placeholder 메시지
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: object
 *                   properties:
 *                     category:
 *                       type: string
 *                       enum: [plumbing, electrical, heating, appliance, door_window, interior, pest, other]
 *                     severity:
 *                       type: string
 *                       enum: [low, medium, high, emergency]
 *                     recommended_path:
 *                       type: string
 *                       enum: [self_fix, manufacturer_as, vendor_match]
 *                     self_fix_guide:
 *                       type: string
 *                       nullable: true
 *                 - type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: 'TODO(팀원A): analyzeReport 구현 필요'
 *       400:
 *         description: 분석 입력값 누락 (구현 완료 후)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: 분석 실패 (구현 완료 후)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
reportsRouter.post('/analyze', asyncHandler(analyzeReport));

export default reportsRouter;

// GET /api/manufacturer-as 는 base path가 달라서 별도 라우터로 분리해 app.ts에서 마운트함.
// 사용자 데이터가 아닌 제조사 A/S 연락처(고정 참조 데이터)라 인증을 걸지 않았다.
// 로그인 전 화면에서 노출할 일이 없다면 여기에도 requireAuth를 붙이면 된다.
export const manufacturerAsRouter = Router();

/**
 * @swagger
 * /api/manufacturer-as:
 *   get:
 *     summary: 제조사 A/S 정보 조회
 *     description: (스텁) 현재는 200 placeholder만 반환함. category 기준으로 manufacturer_as_info 조회 예정.
 *     tags: [Reports]
 *     parameters:
 *       - in: query
 *         name: category
 *         required: true
 *         schema:
 *           type: string
 *           enum: [plumbing, electrical, heating, appliance, door_window, interior, pest, other]
 *         description: 조회할 하자 카테고리
 *     responses:
 *       200:
 *         description: 조회 성공 (구현 완료 후) / 현재는 placeholder 메시지
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: object
 *                   properties:
 *                     results:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/ManufacturerAsInfo'
 *                 - type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: 'TODO(팀원A): getManufacturerAs 구현 필요'
 *       400:
 *         description: category 누락 (구현 완료 후)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
manufacturerAsRouter.get('/', asyncHandler(getManufacturerAs));
