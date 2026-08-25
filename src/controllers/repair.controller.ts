import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';

// repair_schedule / repair_status_timeline 컨트롤러.
//
// NOTE: reports 는 B 범위에서 읽기 전용이라 여기서 reports.status 를 건드리지 않는다.
//       (reports.status 는 landlord.controller 의 승인 플로우가 쓴다.)
//       수리 진행 상태는 repair_status_timeline 에만 쌓고, 현재 상태 = 가장 최근 행.
// NOTE: repair_status_timeline.status 는 DB에 CHECK가 없어 값이 자유다. 프론트와
//       맞춘 값은 scheduled / confirmed / in_progress / done 정도를 상정한다.
// NOTE: 인증이 없으므로 technician_id 는 요청 body 로 받는다.
//       (users(id) FK가 걸려 있어 실제 존재하는 사용자여야 INSERT가 통과한다.)

// 수리 완료 상태값.
export const COMPLETION_STATUS = 'done';

// 타임라인 상태 중 reports.status 로도 올려야 하는 것들.
// 임대인/세입자 목록 화면은 reports.status 하나로 그룹을 나누는데(승인 대기 / 수리 대기 /
// 수리 진행 중 / 완료), 타임라인만 쌓으면 목록에서는 계속 'approved'로 보인다.
// scheduled / confirmed 는 올리지 않는다 — 일정이 잡히는 중에도 '수리 대기'가 맞다.
// 값은 타임라인과 같은 단어를 그대로 쓴다(새 어휘를 만들지 않는다).
const REPORT_STATUS_FROM_TIMELINE: Record<string, string> = {
  in_progress: 'in_progress',
  [COMPLETION_STATUS]: COMPLETION_STATUS,
};

async function addTimelineEntry(reportId: string, status: string) {
  return supabaseAdmin.from('repair_status_timeline').insert({ report_id: reportId, status });
}

// POST /api/repair/schedule — 방문 일정 등록. 등록과 동시에 타임라인에 'scheduled' 기록.
export async function createSchedule(req: Request, res: Response) {
  const { report_id, technician_id, scheduled_at } = req.body as {
    report_id: string;
    technician_id: string;
    scheduled_at: string;
  };

  if (!report_id || !technician_id || !scheduled_at) {
    return res.status(400).json({ error: 'report_id, technician_id, scheduled_at은 필수입니다.' });
  }
  if (Number.isNaN(Date.parse(scheduled_at))) {
    return res.status(400).json({ error: 'scheduled_at은 ISO 8601 형식이어야 합니다.' });
  }

  const { data, error } = await supabaseAdmin
    .from('repair_schedule')
    .insert({ report_id, technician_id, scheduled_at })
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  await addTimelineEntry(report_id, 'scheduled');

  return res.status(201).json({ schedule: data });
}

// GET /api/repair/schedule?reportId= | ?technicianId= — 방문 일정 목록.
// reportId: 세입자/임대인이 한 신고의 일정을 볼 때. technicianId: 기사가 자기 배정 작업을 볼 때.
// 둘 다 주면 AND로 걸린다.
export async function listSchedules(req: Request, res: Response) {
  const reportId = req.query.reportId as string | undefined;
  const technicianId = req.query.technicianId as string | undefined;

  if (!reportId && !technicianId) {
    return res.status(400).json({ error: 'reportId 또는 technicianId 쿼리 파라미터가 필요합니다.' });
  }

  let query = supabaseAdmin
    .from('repair_schedule')
    // 기사 홈의 "배정된 작업" 목록이 카드에 뿌릴 신고 내용(카테고리/설명/사진)을 같이 내려 준다.
    // 이게 없으면 프론트가 일정 건수만큼 GET /api/reports/:id를 다시 불러야 하는데,
    // 그 엔드포인트는 tenant_id로 스코프돼 있어 기사가 부르면 항상 404다 — 그래서
    // photo_urls/created_at까지 여기서 전부 내려줘서 프론트가 그 호출을 할 필요가
    // 아예 없게 한다(technician_job_loader.dart).
    .select('*, technician:users(id, name, phone), report:reports(id, category, severity, description, photo_url, photo_urls, status, available_times, created_at)')
    .order('scheduled_at', { ascending: true });

  if (reportId) query = query.eq('report_id', reportId);
  if (technicianId) query = query.eq('technician_id', technicianId);

  const { data, error } = await query;

  if (error) {
    return res.status(500).json({ error: error.message });
  }
  return res.json({ schedules: data });
}

// PATCH /api/repair/schedule/:id/confirm — 방문 일정 확정. 타임라인에 'confirmed' 기록.
export async function confirmSchedule(req: Request, res: Response) {
  const { id } = req.params;

  const { data, error } = await supabaseAdmin
    .from('repair_schedule')
    .update({ confirmed: true })
    .eq('id', id)
    .select()
    // single()은 0건일 때 에러를 내서 아래 404 분기가 죽는다. maybeSingle()은 data=null을 준다.
    .maybeSingle();

  if (error) {
    return res.status(500).json({ error: error.message });
  }
  if (!data) {
    return res.status(404).json({ error: '일정을 찾을 수 없습니다.' });
  }

  await addTimelineEntry(data.report_id, 'confirmed');

  return res.json({ schedule: data });
}

// POST /api/repair/status — 수리 진행 상태 변경. 타임라인에 이력 한 줄을 남긴다.
//
// 완료 사진 기능은 뺐다. repair_status_timeline.photo_url 컬럼이 DB에 없는 채로
// 코드만 먼저 들어와 있었고, 팀에서 이 기능을 넣지 않기로 정했다. photo_url을
// 받아 두면 컬럼 없는 DB에 insert가 통과하지 못해 완료 처리 자체가 막힌다.
export async function changeRepairStatus(req: Request, res: Response) {
  const { report_id, status } = req.body as {
    report_id: string;
    status: string;
  };

  if (!report_id || !status) {
    return res.status(400).json({ error: 'report_id, status는 필수입니다.' });
  }

  const { data, error } = await supabaseAdmin
    .from('repair_status_timeline')
    .insert({ report_id, status })
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const reportStatus = REPORT_STATUS_FROM_TIMELINE[status];
  if (reportStatus) {
    const { error: reportError } = await supabaseAdmin
      .from('reports')
      .update({ status: reportStatus })
      .eq('id', report_id);
    if (reportError) {
      // 타임라인 기록은 이미 남았으므로 실패로 되돌리지 않는다. 로그만 남긴다.
      console.warn(`[repair] report ${report_id} status를 ${reportStatus}로 올리지 못했습니다:`, reportError.message);
    }
  }

  return res.status(201).json({ entry: data });
}

// GET /api/repair/timeline?reportId= — 상태 변경 이력. 현재 상태는 마지막 항목.
export async function getRepairTimeline(req: Request, res: Response) {
  const reportId = req.query.reportId as string | undefined;

  if (!reportId) {
    return res.status(400).json({ error: 'reportId 쿼리 파라미터가 필요합니다.' });
  }

  const { data, error } = await supabaseAdmin
    .from('repair_status_timeline')
    .select('*')
    .eq('report_id', reportId)
    .order('changed_at', { ascending: true });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const timeline = data ?? [];
  return res.json({ timeline, currentStatus: timeline[timeline.length - 1]?.status ?? null });
}
