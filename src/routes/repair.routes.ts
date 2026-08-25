import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import {
  createSchedule,
  listSchedules,
  confirmSchedule,
  changeRepairStatus,
  getRepairTimeline,
} from '../controllers/repair.controller';

const router = Router();

/**
 * @swagger
 * /api/repair/schedule:
 *   post:
 *     summary: 방문 일정 등록
 *     description: 등록과 동시에 repair_status_timeline에 'scheduled' 이력이 함께 기록됨. 인증이 없어 technician_id를 body로 직접 받음(users(id) FK가 걸려있어 실제 존재하는 사용자여야 함).
 *     tags: [Repair]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [report_id, technician_id, scheduled_at]
 *             properties:
 *               report_id:
 *                 type: string
 *                 format: uuid
 *               technician_id:
 *                 type: string
 *                 format: uuid
 *               scheduled_at:
 *                 type: string
 *                 format: date-time
 *                 description: ISO 8601 형식
 *     responses:
 *       201:
 *         description: 등록 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 schedule:
 *                   $ref: '#/components/schemas/RepairSchedule'
 *       400:
 *         description: 필수값 누락 또는 scheduled_at 형식 오류
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
router.post('/schedule', asyncHandler(createSchedule));

/**
 * @swagger
 * /api/repair/schedule:
 *   get:
 *     summary: 방문 일정 목록 조회 (리포트별 또는 기사별)
 *     description: >
 *       scheduled_at 오름차순. 각 항목에 담당 technician 정보(id, name, phone)와
 *       신고 내용 report(id, category, severity, description, photo_url, status, available_times)가
 *       조인되어 포함됨 — 기사 홈의 "배정된 작업" 카드를 이 응답 하나로 그릴 수 있다.
 *       reportId 또는 technicianId 중 최소 하나가 필요하며, 둘 다 주면 AND로 걸린다.
 *       기사 홈의 배정 작업 목록은 technicianId로 조회한다.
 *     tags: [Repair]
 *     parameters:
 *       - in: query
 *         name: reportId
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 한 신고 건의 일정을 조회할 때
 *       - in: query
 *         name: technicianId
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 기사에게 배정된 작업 목록을 조회할 때
 *     responses:
 *       200:
 *         description: 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 schedules:
 *                   type: array
 *                   items:
 *                     allOf:
 *                       - $ref: '#/components/schemas/RepairSchedule'
 *                       - type: object
 *                         properties:
 *                           technician:
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
 *                           report:
 *                             $ref: '#/components/schemas/Report'
 *       400:
 *         description: reportId / technicianId 둘 다 누락
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
router.get('/schedule', asyncHandler(listSchedules));

/**
 * @swagger
 * /api/repair/schedule/{id}/confirm:
 *   patch:
 *     summary: 방문 일정 확정
 *     description: 확정 시 repair_status_timeline에 'confirmed' 이력이 함께 기록됨.
 *     tags: [Repair]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: 확정 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 schedule:
 *                   $ref: '#/components/schemas/RepairSchedule'
 *       404:
 *         description: 존재하지 않는 일정
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
router.patch('/schedule/:id/confirm', asyncHandler(confirmSchedule));

/**
 * @swagger
 * /api/repair/status:
 *   post:
 *     summary: 수리 진행 상태 변경 (타임라인 기록)
 *     description: |
 *       repair_status_timeline에 이력 한 줄을 추가함. status는 DB CHECK 제약이 없는 자유 문자열이며,
 *       scheduled/confirmed/in_progress/done 정도를 상정.
 *
 *       status가 in_progress / done이면 reports.status도 같은 값으로 올린다 — 임대인·세입자
 *       목록 화면이 reports.status 하나로 그룹을 나누기 때문. scheduled / confirmed는 올리지
 *       않는다(일정이 잡히는 중에도 '수리 대기'가 맞다).
 *       reports.status 흐름: pending(승인 대기) → approved(수리 대기) → in_progress(수리 진행 중) → done(완료)
 *     tags: [Repair]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [report_id, status]
 *             properties:
 *               report_id:
 *                 type: string
 *                 format: uuid
 *               status:
 *                 type: string
 *                 example: in_progress
 *     responses:
 *       201:
 *         description: 이력 추가 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 entry:
 *                   $ref: '#/components/schemas/RepairStatusTimelineEntry'
 *       400:
 *         description: report_id 또는 status 누락
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
router.post('/status', asyncHandler(changeRepairStatus));

/**
 * @swagger
 * /api/repair/timeline:
 *   get:
 *     summary: 수리 상태 이력 + 현재 상태 조회
 *     description: changed_at 오름차순 이력 목록과, 가장 최근 항목의 status를 currentStatus로 함께 반환.
 *     tags: [Repair]
 *     parameters:
 *       - in: query
 *         name: reportId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 timeline:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/RepairStatusTimelineEntry'
 *                 currentStatus:
 *                   type: string
 *                   nullable: true
 *                   description: 이력이 없으면 null
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
router.get('/timeline', asyncHandler(getRepairTimeline));

export default router;
