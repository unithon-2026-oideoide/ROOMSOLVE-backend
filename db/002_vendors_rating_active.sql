-- 002_vendors_rating_active.sql
--
-- ⚠️ 팀 공유 후 실행할 것. supabase/schema.sql 에 없는 컬럼을 추가하는 DDL이고,
--    Supabase 프로젝트가 하나뿐이라 실행 즉시 전원에게 반영된다.
--
-- 배경: "전문업체 매칭" 요구사항에 vendors 의 평점 / 활성 여부가 포함돼 있는데
--       supabase/schema.sql 의 vendors 에는 두 컬럼이 없다.
--       GET 매칭 API(matchVendors)가 is_active 로 필터하므로 이 파일을 실행하기
--       전에는 POST /api/vendors/match 가 동작하지 않는다.
--
-- 실행 순서: 001_vendor_matching.sql (시딩) → 002 (이 파일)
-- 001 을 아직 안 돌렸어도 ALTER 는 그대로 동작하고, 아래 UPDATE 만 0건 처리된다.

alter table public.vendors
  add column if not exists rating    numeric(2,1) not null default 0.0,
  add column if not exists is_active boolean      not null default true;

-- 데모용 값. 비활성 2곳을 섞어 두어 매칭에서 실제로 제외되는지 확인할 수 있게 한다.
-- (두 곳을 빼도 카테고리 8종 모두 활성 업체가 2곳 이상 남는다.)
update public.vendors set rating = 4.6, is_active = true  where name = '가온하우스설비';
update public.vendors set rating = 4.7, is_active = true  where name = '나래전기공사';
update public.vendors set rating = 4.4, is_active = true  where name = '다솜하우징';
update public.vendors set rating = 4.3, is_active = true  where name = '라온배관';
update public.vendors set rating = 4.0, is_active = false where name = '마루인테리어';
update public.vendors set rating = 4.8, is_active = true  where name = '바로수리센터';
update public.vendors set rating = 4.9, is_active = true  where name = '사계절보일러';
update public.vendors set rating = 4.5, is_active = true  where name = '아름드리창호';
update public.vendors set rating = 4.2, is_active = true  where name = '자연도배마감';
update public.vendors set rating = 4.1, is_active = true  where name = '차오름종합설비';
update public.vendors set rating = 4.6, is_active = true  where name = '카이로스전기';
update public.vendors set rating = 3.9, is_active = false where name = '타임리페어';
update public.vendors set rating = 4.4, is_active = true  where name = '파랑방역센터';
update public.vendors set rating = 4.5, is_active = true  where name = '한결가전서비스';
update public.vendors set rating = 4.4, is_active = true  where name = '하늘보일러설비';

-- (선택) "한 report 에서 selected 는 하나만" 을 DB가 보장하게 하는 부분 인덱스.
-- quotes.status 는 값이 자유롭기로 한 컬럼이라 A 쪽 값('pending' 등)에는 영향이 없다.
-- 넣지 않아도 updateQuoteStatus 가 기존 selected 를 먼저 되돌리므로 동작에는 문제없음.
create unique index if not exists quotes_one_selected_per_report_idx
  on public.quotes (report_id) where status = 'selected';

select name, categories, rating, is_active from public.vendors order by name;
