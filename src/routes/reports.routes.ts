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
 *       사진을 여러 장 첨부할 수 있다. POST /api/uploads를 사진 수만큼 호출해
 *       url을 모은 뒤, 그 배열을 photo_urls로 보내면 된다.
 *       서버가 첫 번째 url을 대표 사진(photo_url)으로 함께 저장한다.
 *
 *       tenant_id는 body로 받지 않는다 — 인증 토큰에서 꺼낸다.
 *       category / severity / recommended_path / self_fix_guide는
 *       POST /api/reports/analyze 결과를 그대로 넘길 때만 채우면 되고, 생략 가능하다.
 *     tags: [Reports]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [landlord_id, photo_urls]
 *             properties:
 *               landlord_id:
 *                 type: string
 *                 format: uuid
 *                 description: 세입자가 속한 임대인 id (프론트에서 미리 확보해서 함께 전달)
 *               photo_urls:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: string
 *                   format: uri
 *                 description: POST /api/uploads 응답으로 받은 url 목록. 최소 1개 필요.
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
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: 생성 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 report:
 *                   $ref: '#/components/schemas/Report'
 *       400:
 *         description: landlord_id 누락, photo_urls가 비었거나, category/severity/recommended_path 값이 허용 목록 밖
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: 토큰 누락 또는 만료
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
reportsRouter.post('/', asyncHandler(createReport));

/**
 * @swagger
 * /api/reports:
 *   get:
 *     summary: 내 신고 목록 조회
 *     description: |
 *       로그인한 세입자 본인의 신고만 최신순으로 반환한다.
 *       tenant_id는 쿼리로 받지 않는다 — 받으면 남의 id로 조회할 수 있기 때문이다.
 *       임대인이 자기 소속 신고를 보는 경로는 GET /api/landlord/requests로 따로 있다.
 *     tags: [Reports]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           example: pending
 *         description: 상태로 거르기 (생략 시 전체)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 목록 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 reports:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Report'
 *       401:
 *         description: 토큰 누락 또는 만료
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
reportsRouter.get('/', asyncHandler(listReports));

/**
 * @swagger
 * /api/reports/{id}:
 *   get:
 *     summary: 내 신고 단건 조회
 *     description: |
 *       본인의 신고만 조회할 수 있다. 남의 신고 id를 넣으면 403이 아니라 404를 준다 —
 *       403이면 "그 id의 신고가 존재한다"는 사실이 새기 때문이다.
 *     tags: [Reports]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
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
 *                 report:
 *                   $ref: '#/components/schemas/Report'
 *       401:
 *         description: 토큰 누락 또는 만료
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: 존재하지 않거나 본인의 신고가 아님
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
 *       Gemini로 사진을 분석해 카테고리·긴급도·해결 경로를 판정한다.
 *       **분류만 하고 DB에 저장하지 않는다.** 결과를 세입자에게 확인시킨 뒤
 *       POST /api/reports에 그대로 넘겨서 저장하는 흐름이다.
 *       landlord_id는 이 API와 무관하다.
 *
 *       사진은 앞의 4장까지만 본다. 장수가 늘수록 비용과 응답 시간이 그대로 늘고,
 *       같은 하자를 여러 각도로 찍은 것이라 4장이면 판단에 충분하다.
 *     tags: [Reports]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [photo_urls]
 *             properties:
 *               photo_urls:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: string
 *                   format: uri
 *                 description: POST /api/uploads로 받은 url 목록. 앞의 4장만 분석에 쓴다.
 *               photo_url:
 *                 type: string
 *                 format: uri
 *                 description: 사진 1장만 보낼 때 쓰는 예전 방식. photo_urls가 있으면 무시된다.
 *               description:
 *                 type: string
 *                 nullable: true
 *                 description: 세입자가 남긴 설명. 있으면 판정 정확도가 올라간다.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 분석 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [category, severity, recommended_path, self_fix_guide]
 *               properties:
 *                 category:
 *                   type: string
 *                   enum: [plumbing, electrical, heating, appliance, door_window, interior, pest, other]
 *                 severity:
 *                   type: string
 *                   enum: [low, medium, high, emergency]
 *                 recommended_path:
 *                   type: string
 *                   enum: [self_fix, manufacturer_as, vendor_match]
 *                 self_fix_guide:
 *                   type: string
 *                   nullable: true
 *                   description: recommended_path가 self_fix일 때만 채워지고, 그 외에는 null이다.
 *       400:
 *         description: photo_urls 누락 또는 빈 배열
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: 토큰 누락 또는 만료
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       429:
 *         description: AI 호출 한도 초과
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       502:
 *         description: AI 호출 실패 또는 응답 해석 실패
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       503:
 *         description: GEMINI_API_KEY 미설정
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
 *     description: |
 *       category에 해당하는 제조사 A/S 연락처를 제조사명 순으로 반환한다.
 *       analyze 결과의 recommended_path가 manufacturer_as일 때 프론트가 호출한다.
 *
 *       제조사 A/S가 의미 없는 카테고리(plumbing, interior 등)는 빈 배열이 나온다.
 *       그 경우 전문업체 매칭으로 넘기면 된다.
 *
 *       사용자 데이터가 아닌 고정 참조 데이터라 인증이 필요 없다.
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
 *         description: 조회 성공 (해당 카테고리에 등록된 제조사가 없으면 빈 배열)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 results:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ManufacturerAsInfo'
 *       400:
 *         description: category 누락 또는 허용 목록 밖의 값
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
manufacturerAsRouter.get('/', asyncHandler(getManufacturerAs));
