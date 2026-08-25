-- 009_quote_visit_and_reject.sql — 견적 상태에 reject 추가 + 방문시간 입력
--
-- ⚠️ 팀 공유 후 실행할 것. Supabase 프로젝트가 하나뿐이라 실행 즉시 전원에게 반영된다.
--
-- 배경: 신고 → 매칭 → 견적 → 선택 흐름에서 세 가지가 빠져 있었다.
--   1. 견적 상태가 recommended/selected 둘뿐이라, 하나가 selected될 때 나머지가
--      거절됐다는 사실을 기록할 방법이 없었다. quotes.controller.ts의
--      updateQuoteStatus가 selected 처리 시 나머지 전부를 rejected로 명시
--      전환하므로, 그 값을 받을 수 있어야 한다.
--   2. 업체가 견적을 낼 때 방문 가능 시간을 같이 받을 컬럼이 없었다. 견적이
--      selected되는 순간 이 값으로 repair_schedule을 자동 생성한다(같은 파일).
--   3. 세입자가 신고할 때 자기가 집에 있는 시간대를 알려줄 방법이 없었다.
--      지금은 단순 텍스트로 시작한다(예: "평일 오후, 주말 오전").
--
-- ⚠️ 아래 ALTER 전에 quotes.status의 실제 제약 이름을 먼저 확인할 것.
--    supabase/schema.sql에는 quotes.status가 CHECK 없이 text로만 선언돼 있어서
--    (허용값은 지금까지 애플리케이션 쪽에서만 강제) 제약이 아예 없을 가능성이
--    높다. 그래도 과거에 대시보드에서 수동으로 걸어놨을 수 있으니, 아래 쿼리로
--    직접 확인한 뒤 이름이 quotes_status_check가 아니면 DROP CONSTRAINT의
--    이름을 그 값으로 바꿔서 실행할 것.
--
--   select conname, pg_get_constraintdef(oid)
--   from pg_constraint
--   where conrelid = 'public.quotes'::regclass
--     and contype = 'c';
--
-- 실행 순서: 001 → 002 → ... → 009 (이 파일)

-- quotes.status에 'rejected' 추가 (지금은 recommended/selected만 있음)
--
-- 만약 아래 ADD CONSTRAINT가 실패하면, status가 세 값 밖에 있는 기존 행이
-- 있다는 뜻이다. 먼저 아래로 확인하고 값을 정리한 뒤 다시 실행할 것.
--   select id, status from public.quotes where status not in ('recommended', 'selected', 'rejected');
alter table public.quotes drop constraint if exists quotes_status_check;
alter table public.quotes add constraint quotes_status_check
  check (status in ('recommended', 'selected', 'rejected'));

-- 업체가 견적 제출 시 방문 가능 시간도 같이 받기 위한 컬럼
alter table public.quotes
  add column if not exists proposed_visit_at timestamptz;

-- 세입자가 신고 시 거주 가능 시간대를 입력할 수 있게 하는 컬럼
-- (단순 텍스트로 시작 — 예: "평일 오후, 주말 오전")
alter table public.reports
  add column if not exists available_times text;

select id, report_id, vendor_id, status, proposed_visit_at from public.quotes order by created_at desc limit 10;
