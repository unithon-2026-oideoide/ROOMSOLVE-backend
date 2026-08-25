import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { signup, login } from '../controllers/auth.controller';

const router = Router();

/**
 * @swagger
 * /api/auth/signup:
 *   post:
 *     summary: 회원가입
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, name, role]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *               name:
 *                 type: string
 *               role:
 *                 $ref: '#/components/schemas/UserRole'
 *               phone:
 *                 type: string
 *               business_number:
 *                 type: string
 *                 description: 사업자등록번호. role이 technician이면 필수, 아니면 무시된다.
 *                 example: '123-45-67890'
 *               categories:
 *                 type: array
 *                 minItems: 1
 *                 description: 전문 분야(복수 선택). role이 technician이면 필수, 아니면 무시된다.
 *                 items:
 *                   $ref: '#/components/schemas/Category'
 *     responses:
 *       201:
 *         description: 회원가입 성공. role이 technician이면 vendor가 함께 반환된다.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *                 vendor:
 *                   allOf:
 *                     - $ref: '#/components/schemas/Vendor'
 *                   description: role이 technician일 때만 존재하는 업체 정보 (vendors 테이블에 저장)
 *                 session:
 *                   $ref: '#/components/schemas/AuthSession'
 *       400:
 *         description: 필수값 누락, 잘못된 role/categories, business_number 누락, 또는 Auth 계정 생성 실패
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: 프로필 또는 업체 정보 저장 실패
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/signup', asyncHandler(signup));

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: 로그인
 *     description: role이 technician이면 응답에 vendor(연결된 업체 프로필)가 함께 온다.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: 로그인 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *                 vendor:
 *                   allOf:
 *                     - $ref: '#/components/schemas/Vendor'
 *                   description: role이 technician일 때만 존재하는 업체 정보 (vendors 테이블)
 *                 session:
 *                   $ref: '#/components/schemas/AuthSession'
 *       400:
 *         description: 필수값 누락
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: 이메일/비밀번호 불일치 또는 이메일 미인증
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: 프로필 조회 실패
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/login', asyncHandler(login));

export default router;
