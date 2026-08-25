-- 010_repair_completion_photo.sql — 수리 완료 사진
--
-- ⚠️ 팀 공유 후 실행할 것. Supabase 프로젝트가 하나뿐이라 실행 즉시 전원에게 반영된다.
--
-- 배경: 수리가 끝났을 때 기사가 완료 사진을 올리고 임대인/세입자가 그걸 보고
--       확인하는 흐름이 필요한데, 사진을 담을 곳이 없었다.
--       상태 이력(repair_status_timeline)에 붙이면 "언제 완료됐고 그때 사진이 이거였다"가
--       한 줄로 남아서 별도 테이블을 만들 필요가 없다.
--       repair.controller.ts의 changeRepairStatus가 status='done'일 때 필수로 받는다.
--
-- 방문 시간 / 견적 거절 관련 컬럼은 db/009_quote_visit_and_reject.sql 에 이미 들어 있다.
--
-- 실행 순서: 001 → ... → 009 → 010 (이 파일)

alter table public.repair_status_timeline
  add column if not exists photo_url text;

select id, report_id, status, photo_url, changed_at
from public.repair_status_timeline order by changed_at desc limit 10;
