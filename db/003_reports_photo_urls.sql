-- 003_reports_photo_urls.sql — reports에 사진 여러 장 저장
--
-- ⚠️ 이 컬럼은 이미 Supabase에 적용돼 있다. 누군가 대시보드에서 직접 ALTER를 돌렸고
--    마이그레이션 파일이 남지 않아, 새 DB에서 재현할 방법이 없었다. 그 기록을 뒤늦게
--    남기는 파일이다. 여러 번 실행해도 안전하다(if not exists).
--
-- 배경: 신고 사진을 1장에서 여러 장으로 바꾸면서 photo_urls를 추가했다.
--       photo_url은 지우지 않고 대표 사진 1장으로 남겼다. NOT NULL이라 지우려면
--       제약을 먼저 풀어야 하고, photo_url을 읽는 코드(Swagger 문서 포함)가
--       이미 여러 군데 있어서다.
--
--       POST /api/reports는 photo_urls를 받아 첫 번째 원소를 photo_url에 채운다.
--       그래서 두 컬럼은 항상 같이 채워지고, 기존 코드는 그대로 동작한다.
--
-- 실행 순서: 001 → 002 → 003 (서로 독립이라 순서가 중요하지는 않다)

alter table public.reports
  add column if not exists photo_urls text[];

-- 이 컬럼이 생기기 전에 만들어진 행은 photo_urls가 NULL이다.
-- 대표 사진 하나만 있는 상태이므로 그 값으로 배열을 채워 준다.
update public.reports
set photo_urls = array[photo_url]
where photo_urls is null
  and photo_url is not null;

select id, photo_url, photo_urls from public.reports order by created_at;
