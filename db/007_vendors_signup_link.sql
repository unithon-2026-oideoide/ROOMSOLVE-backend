-- 007_vendors_signup_link.sql
--
-- ⚠️ 팀 공유 후 실행할 것. Supabase 프로젝트가 하나뿐이라 실행 즉시 전원에게 반영된다.
--
-- 배경: technician(수리업체) role로 회원가입할 때 사업자등록번호와 전문 분야를
--       추가로 받는다. 업체 정보는 users에 넣지 않고 기존 vendors 테이블을 재활용한다.
--       vendors.categories(text[])가 전문 분야 목록 그대로이므로 새 테이블은 만들지 않는다.
--
-- 실행 순서: 001 → 002 → ... → 007 (이 파일)

alter table public.vendors
  add column if not exists user_id         uuid references public.users (id) on delete cascade,
  add column if not exists business_number text;

-- 한 계정당 업체 프로필은 하나. 가입이 중복 실행돼도 두 번째는 DB가 막는다.
create unique index if not exists vendors_user_id_idx
  on public.vendors (user_id) where user_id is not null;

-- 가입 시점에는 지역을 받지 않는다(시딩된 데모 업체 15곳만 값이 있다).
-- NOT NULL을 풀지 않으면 signup의 vendors insert가 실패한다.
alter table public.vendors alter column region drop not null;

select id, name, user_id, business_number, categories, region from public.vendors order by created_at desc limit 5;
