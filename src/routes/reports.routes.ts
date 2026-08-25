import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../middleware/auth';
import {
  createReport,
  listReports,
  getReport,
  analyzeReport,
  chatSelfRepair,
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
 *
 *       landlord_id는 생략 가능하다. 생략하면 로그인한 세입자의
 *       users.linked_landlord_id(PATCH /api/users/link-landlord로 임대인 초대
 *       코드를 입력해 채운 값)를 대신 쓴다. 아직 어느 임대인과도 연결돼 있지 않고
 *       landlord_id도 안 보내면 400이 난다.
 *     tags: [Reports]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [photo_urls]
 *             properties:
 *               landlord_id:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *                 description: >
 *                   세입자가 속한 임대인 id. 생략하면 linked_landlord_id를 대신 쓴다
 *                   (레거시 호환용 필드 — 새로 연동할 때는 생략을 권장).
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
 *               available_times:
 *                 type: string
 *                 nullable: true
 *                 description: >
 *                   세입자가 집에 있는 시간대. 자유 텍스트, 선택값. 예 "평일 오후, 주말 오전". db/009
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
 *         description: photo_urls가 비었거나, landlord_id/linked_landlord_id 둘 다 없거나, category/severity/recommended_path 값이 허용 목록 밖
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
 *               answers:
 *                 type: object
 *                 description: >
 *                   가전 보충 질문의 답. 응답의 appliance.questions 에 질문이 담겨 오면
 *                   답을 모아 같은 엔드포인트로 다시 호출한다. 서버에 대화 세션을 두지
 *                   않으므로 매번 photo_urls 와 함께 보내야 한다.
 *                 properties:
 *                   ownership:
 *                     type: string
 *                     enum: [landlord_builtin, landlord_option, tenant_purchased]
 *                   purchase_age:
 *                     type: string
 *                     enum: [within_2y, from_2y_to_10y, over_10y, unknown]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: >
 *           분석 성공. 고장난 것이 가전이 아니면 appliance는 null이다. 가전이면
 *           appliance.questions에 아직 답하지 않은 보충 질문(ownership/purchase_age)이
 *           담겨 오고, 이 경우 appliance.liability는 null이다(요청 body의 answers에
 *           그 질문들의 답을 채워 같은 엔드포인트를 다시 호출하면 된다). 질문에 모두
 *           답하면 appliance.liability/basis/notice/warning/confidence/blockVendorMatch가
 *           채워지고, 최상위 recommended_path도 이 판정(judgeAppliance)이 정한 값으로
 *           덮어써진다 — LLM의 1차 추측보다 이 규칙 기반 판정이 우선한다.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [category, severity, recommended_path, self_fix_guide, appliance_type, appliance]
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
 *                 appliance_type:
 *                   type: string
 *                   nullable: true
 *                   enum: [aircon, boiler, induction, refrigerator, washer]
 *                   description: 고장난 것이 가전으로 보이면 종류, 아니면 null.
 *                 appliance:
 *                   nullable: true
 *                   allOf:
 *                     - $ref: '#/components/schemas/ApplianceJudgement'
 *                   description: appliance_type이 null이면 이 필드도 null이다.
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

/**
 * @swagger
 * /api/reports/chat:
 *   post:
 *     summary: 자가수리 AI 챗봇 상담
 *     description: |
 *       세입자 플로우는 직렬이다 — 사진 → AI 진단 → **자가수리 상담** → (막히면) 업체 추천.
 *       진단 결과가 무엇이든 일단 이 상담을 거친다.
 *
 *       **무상태다.** 대화 기록은 클라이언트가 들고 있다가 매 요청에 함께 보낸다.
 *       DB는 건드리지 않으므로, `escalate`가 true가 된 뒤 리포트 상태를 바꾸는 것은
 *       기존 리포트 API의 몫이다. 비용 때문에 최근 20턴만 모델에 보낸다.
 *
 *       AI를 부르지 않고 코드가 바로 끊는 경우가 둘 있다:
 *       - `severity`가 `emergency` → 감전·가스 등 즉시 조치가 필요한 상황에서
 *         세입자를 대화에 붙잡아 두면 안 되므로 곧바로 업체로 넘긴다.
 *       - `recommended_path`가 `manufacturer_as` → 직접 분해하면 보증이 깨질 수 있어
 *         제조사 A/S로 넘긴다.
 *
 *       첫 턴은 `messages`를 빈 배열로 보내면 된다. 챗봇이 자가수리 가이드를 먼저 제시한다.
 *     tags: [Reports]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [context]
 *             properties:
 *               context:
 *                 type: object
 *                 required: [category, severity]
 *                 description: POST /api/reports/analyze 응답을 그대로 넣으면 된다.
 *                 properties:
 *                   category:
 *                     type: string
 *                     enum: [plumbing, electrical, heating, appliance, door_window, interior, pest, other]
 *                   severity:
 *                     type: string
 *                     enum: [low, medium, high, emergency]
 *                   recommended_path:
 *                     type: string
 *                     enum: [self_fix, manufacturer_as, vendor_match]
 *                   self_fix_guide:
 *                     type: string
 *                     nullable: true
 *               messages:
 *                 type: array
 *                 description: 지금까지의 대화. 첫 턴은 빈 배열.
 *                 items:
 *                   type: object
 *                   required: [role, content]
 *                   properties:
 *                     role:
 *                       type: string
 *                       enum: [user, assistant]
 *                     content:
 *                       type: string
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 상담 응답
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [reply, escalate, escalate_to]
 *               properties:
 *                 reply:
 *                   type: string
 *                   description: 세입자에게 보여줄 답변
 *                 escalate:
 *                   type: boolean
 *                   description: 자가수리로 해결이 어려워 다음 단계로 넘어가야 하면 true
 *                 escalate_to:
 *                   type: string
 *                   nullable: true
 *                   enum: [vendor_match, manufacturer_as]
 *                   description: escalate가 true일 때 어디로 갈지. false면 null.
 *       400:
 *         description: context 누락 또는 category/severity 값이 허용 목록 밖
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
 *         description: AI 서버 혼잡 또는 GEMINI_API_KEY 미설정
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
reportsRouter.post('/chat', asyncHandler(chatSelfRepair));

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
 *       - in: query
 *         name: applianceType
 *         required: false
 *         schema:
 *           type: string
 *           enum: [aircon, boiler, induction, refrigerator, washer]
 *         description: >
 *           가전 종류. 주면 그 종류 전담 A/S와 해당 카테고리 범용 A/S만 반환한다.
 *           생략하면 카테고리 전체를 반환한다(기존 동작).
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
