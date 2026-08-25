-- seed_test_data.sql — 프론트 연동 테스트용 데모 데이터
--
-- ⚠️ 스키마 마이그레이션이 아니다. 스키마(컬럼·제약)는 supabase/schema.sql
--    하나로 이미 재현 가능하게 관리되고 있고, 이 파일은 그 위에 테스트용
--    행 데이터만 채운다. 몇 번을 다시 실행해도 안전하다(전부
--    where not exists로 막아 둠) — 데모 데이터가 필요할 때마다 재실행할 것.
--
-- ⚠️ auth.users는 이 파일로 만들지 않는다. 로그인이 필요한 계정
--    (임대인·수리업체)은 반드시 POST /api/auth/signup(또는 Admin API)으로
--    먼저 만들 것 — 직접 SQL로 넣으면 GoTrue 내부 스키마와 어긋나서 로그인이
--    깨질 수 있다.
--
-- 아래 데이터는 각 role이 실제로 회원가입했을 때 서버(auth.controller.ts)가
-- 만드는 것과 같은 모양이다 — 세입자/임대인은 users 한 줄, 수리업체는
-- users + vendors 두 줄(user_id로 연결).
--
-- 구성:
--   1부 — 임대인 "김임대" (로그인 필요 — POST /api/auth/signup으로 먼저 만들 것.
--         이 파일은 프로필만 채우는 게 아니라 "김임대"라는 이름의 landlord가
--         이미 있다고 가정하고 2부에서 그 id를 찾아 쓴다.)
--   2부 — 세입자 "최세입", 김임대에 바로 연결(초대 코드 절차 생략). 로그인 불가.
--   3부 — 수리업체 8곳. 8개 카테고리에 정확히 하나씩 배정해서 분야가 안 겹친다.
--         그중 "새지마 종합설비"는 실제 technician 회원가입을 흉내 내
--         users+vendors가 함께 있다(로그인은 안 됨 — 로그인하려면 이 이름으로
--         POST /api/auth/signup을 대신 호출해줄 것). 나머지 7곳은 db/001과
--         같은 카탈로그 전용 업체(계정 없음).
--
-- 실행법: Supabase 대시보드 > SQL Editor에 붙여넣고 Run.
-- 순서: 1부(김임대) 없이 2부만 실행하면 linked_landlord_id가 비워진 채로
--       들어간다 — 김임대를 먼저 signup으로 만든 뒤 이 파일을 돌릴 것.

-- ---------------------------------------------------------------------------
-- 1부 — 임대인 "김임대"
-- 이미 POST /api/auth/signup으로 만들어져 있으면(권장) 아래는 건드릴 게 없다.
-- 혹시 프로필만 없는 상태(로그인은 되는데 users row가 없는 경우)를 대비해
-- landlord_code 없이 하나 채워 넣는 안전장치만 둔다 — 정상적으로 signup을
-- 거쳤다면 이 INSERT는 이름이 이미 있어 조용히 건너뛴다.
-- ---------------------------------------------------------------------------
insert into public.users (name, role, phone, landlord_code)
select '김임대', 'landlord', '010-3000-0001',
       upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6))
where not exists (
  select 1 from public.users existing where existing.name = '김임대' and existing.role = 'landlord'
);

-- ---------------------------------------------------------------------------
-- 2부 — 세입자 "최세입". 김임대에 바로 연결한다.
-- ---------------------------------------------------------------------------
insert into public.users (name, role, phone, linked_landlord_id)
select '최세입', 'tenant', '010-3000-0002',
       (select id from public.users where role = 'landlord' and name = '김임대' limit 1)
where not exists (
  select 1 from public.users existing where existing.name = '최세입' and existing.role = 'tenant'
)
and exists (
  select 1 from public.users landlord where landlord.role = 'landlord' and landlord.name = '김임대'
);

-- ---------------------------------------------------------------------------
-- 3부 — 수리업체 8곳. 카테고리 8종에 정확히 하나씩 배정(분야 안 겹침).
-- ---------------------------------------------------------------------------

-- 계정이 있는 업체 — technician 회원가입을 흉내 낸다(plumbing 전담).
insert into public.users (name, role, phone)
select '새지마 종합설비', 'technician', '010-4000-0001'
where not exists (
  select 1 from public.users existing where existing.name = '새지마 종합설비' and existing.role = 'technician'
);

insert into public.vendors (user_id, name, business_number, categories, phone)
select u.id, '새지마 종합설비', '456-78-90123', '{plumbing}'::text[], '010-4000-0001'
from public.users u
where u.name = '새지마 종합설비' and u.role = 'technician'
and not exists (
  select 1 from public.vendors existing where existing.user_id = u.id
);

-- 계정 없는 카탈로그 업체 7곳 — 나머지 7개 카테고리.
insert into public.vendors (name, categories, region, phone)
select v.name, v.categories, v.region, v.phone
from (values
  ('번쩍번쩍전기', '{electrical}'::text[],   '서울 강남구', '02-777-0102'),
  ('훈훈보일러',   '{heating}'::text[],      '서울 노원구', '02-777-0103'),
  ('가전주치의',   '{appliance}'::text[],    '서울 송파구', '02-777-0104'),
  ('여닫이명장',   '{door_window}'::text[],  '서울 은평구', '02-777-0105'),
  ('공간연구소',   '{interior}'::text[],     '서울 마포구', '02-777-0106'),
  ('해충제로',     '{pest}'::text[],         '서울 강동구', '02-777-0107'),
  ('만능해결단',   '{other}'::text[],        '서울 관악구', '02-777-0108')
) as v(name, categories, region, phone)
where not exists (
  select 1 from public.vendors existing where existing.name = v.name
);

-- rating / is_active. 여닫이명장만 비활성으로 둬서 is_active 필터가 실제로
-- 걸러내는지 테스트할 수 있게 한다.
update public.vendors set rating = 4.7, is_active = true  where name = '새지마 종합설비';
update public.vendors set rating = 4.5, is_active = true  where name = '번쩍번쩍전기';
update public.vendors set rating = 4.8, is_active = true  where name = '훈훈보일러';
update public.vendors set rating = 4.2, is_active = true  where name = '가전주치의';
update public.vendors set rating = 3.9, is_active = false where name = '여닫이명장';
update public.vendors set rating = 4.6, is_active = true  where name = '공간연구소';
update public.vendors set rating = 4.4, is_active = true  where name = '해충제로';
update public.vendors set rating = 4.1, is_active = true  where name = '만능해결단';

-- 확인용
select id, name, role, landlord_code, linked_landlord_id from public.users order by created_at;
select id, name, user_id, categories, region, rating, is_active from public.vendors order by created_at;
