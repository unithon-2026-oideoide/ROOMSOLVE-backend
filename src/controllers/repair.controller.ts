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

// 수리 완료 상태값. 이 상태로 바꿀 때만 완료 사진(photo_url)을 필수로 받는다.
export const COMPLETION_STATUS = 'done';

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
    .select('*, technician:users(id, name, phone)')
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
// status가 'done'(완료)이면 완료 사진 photo_url이 필수다. 그 외 상태에서는 무시된다.
export async function changeRepairStatus(req: Request, res: Response) {
  const { report_id, status, photo_url } = req.body as {
    report_id: string;
    status: string;
    photo_url?: string;
  };

  if (!report_id || !status) {
    return res.status(400).json({ error: 'report_id, status는 필수입니다.' });
  }
  if (status === COMPLETION_STATUS && !photo_url) {
    return res.status(400).json({ error: `status가 '${COMPLETION_STATUS}'이면 완료 사진 photo_url이 필수입니다.` });
  }

  const { data, error } = await supabaseAdmin
    .from('repair_status_timeline')
    // 완료가 아닌 상태에 사진이 붙어 오면 버린다 — 타임라인에서 완료 사진의 의미가 흐려진다.
    .insert({ report_id, status, photo_url: status === COMPLETION_STATUS ? photo_url : null })
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
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
