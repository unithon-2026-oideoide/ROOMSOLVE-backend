-- 008_landlord_tenant_link.sql — 임대인 초대 코드 기반 세입자-임대인 매칭
--
-- ⚠️ 팀 공유 후 실행할 것. Supabase 프로젝트가 하나뿐이라 실행 즉시 전원에게 반영된다.
--
-- 배경: reports.landlord_id를 채우려면 세입자가 자기 임대인의 id를 알아야 하는데,
--       그걸 이어주는 properties(호실) 테이블이 없다(팀 README에 명시된 알려진 gap).
--       properties 테이블을 새로 설계하는 대신, 임대인이 발급받는 짧은 랜덤 코드를
--       세입자가 입력해 연결하는 가벼운 방식을 쓴다.
--
-- 설계:
--   landlord_code      : landlord role 계정에만 회원가입 시 자동 발급되는 6자리 코드.
--                         auth.controller.ts의 signup이 채운다.
--   linked_landlord_id : tenant(또는 임의 계정)가 코드를 입력해 연결한 임대인의 id.
--                         PATCH /api/users/link-landlord (users.controller.ts)가 채운다.
--
-- reports.landlord_id는 여전히 body로 직접 보낼 수 있지만(레거시 호환), 생략하면
-- createReport가 요청자의 linked_landlord_id를 대신 쓴다.
--
-- 실행 순서: 001 → 002 → ... → 008 (이 파일)

alter table public.users
  add column if not exists landlord_code      text unique,
  add column if not exists linked_landlord_id uuid references public.users (id) on delete set null;

create index if not exists users_linked_landlord_id_idx on public.users (linked_landlord_id);

-- 이 마이그레이션 이전에 가입한 landlord 계정에는 코드가 없다. 데모/개발 편의를 위해
-- 여기서 한 번 채워준다. 최초 6자리 조합이 우연히 겹치면(극히 낮은 확률) 유니크 제약
-- 위반으로 해당 행만 건너뛰므로, 필요하면 이 UPDATE를 다시 실행하면 된다.
update public.users
set landlord_code = upper(substr(md5(random()::text || id::text), 1, 6))
where role = 'landlord' and landlord_code is null;

select id, name, role, landlord_code, linked_landlord_id from public.users order by created_at desc limit 20;
