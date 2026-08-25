-- ROOMSOLVE 스키마 — 현재 Supabase에 적용돼 있는 상태를 그대로 옮겨 적은 파일.
--
-- ⚠️ 이 파일을 지금 Supabase에 Run하지 말 것. 테이블은 이미 전부 존재하므로
--    create table에서 에러가 난다. 새 DB를 처음부터 만들 때만 쓰는 파일이고,
--    평소에는 "지금 DB가 어떤 모양인지" 확인하는 용도로 읽는다.
--
-- 스키마를 바꿀 때는 이 파일을 고치는 것으로 끝내지 말고, db/ 에 번호를 붙인
-- 마이그레이션(alter table ...)을 추가해서 실제 DB에 적용한 뒤 이 파일도 같이
-- 갱신할 것. Supabase 프로젝트가 하나뿐이라 DDL은 실행 즉시 전원에게 반영된다.
--
--   db/001_vendor_matching.sql      vendors 시딩 15개 (데이터만)
--   db/002_vendors_rating_active.sql vendors.rating / is_active 추가 + quotes 부분 인덱스
--
-- 공용 값 목록 (여러 테이블이 조인 키로 함께 쓰므로 바꿀 때는 전부 같이 바꿀 것)
--   category : plumbing | electrical | heating | appliance | door_window | interior | pest | other
--   severity : low | medium | high | emergency
--   recommended_path : self_fix | manufacturer_as | vendor_match
--   role     : tenant | landlord | technician
--
-- status 계열은 CHECK를 걸지 않았다. 현재 쓰이는 값은 아래와 같다.
--   reports.status                : pending (신규 생성 시)
--   quotes.status                 : recommended | selected
--   repair_status_timeline.status : scheduled | confirmed | in_progress | done


-- ---------------------------------------------------------------------------
-- users : Supabase Auth(auth.users)의 프로필 확장 테이블.
-- id는 auth.users.id를 그대로 쓴다 (auth.controller.ts의 signup이 그렇게 넣는다).
-- ---------------------------------------------------------------------------
create table public.users (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text not null,
  role       text not null check (role in ('tenant', 'landlord', 'technician')),
  phone      text,
  created_at timestamptz not null default now()
);


-- ---------------------------------------------------------------------------
-- reports : 세입자가 올린 하자 신고.
--
-- tenant_id / landlord_id 둘 다 users를 참조한다. 참조가 둘이라 PostgREST가
-- 조인 대상을 자동으로 못 고르므로, landlord.controller.ts는
-- users!reports_tenant_id_fkey 처럼 제약 이름을 명시해서 조인한다.
-- 아래처럼 컬럼 레벨 references로 선언하면 Postgres가 그 이름을 그대로 만들어 준다.
-- (제약 이름을 바꾸면 landlord.controller.ts의 쿼리도 같이 고쳐야 한다.)
--
-- landlord_id를 reports가 직접 들고 있는 것은 임시 구조다. 원래는 properties(호실)
-- 테이블을 거쳐야 하지만 시연 범위에서는 생략했다.
-- ---------------------------------------------------------------------------
create table public.reports (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.users (id) on delete cascade,
  landlord_id      uuid not null references public.users (id) on delete cascade,
  -- 사진 없는 신고는 받지 않는다. POST /api/uploads로 먼저 올린 뒤 그 url을 넘긴다.
  photo_url        text not null,
  description      text,
  category         text check (category in ('plumbing', 'electrical', 'heating', 'appliance',
                                            'door_window', 'interior', 'pest', 'other')),
  severity         text check (severity in ('low', 'medium', 'high', 'emergency')),
  recommended_path text check (recommended_path in ('self_fix', 'manufacturer_as', 'vendor_match')),
  -- 자가조치 가이드. 지금은 types/index.ts의 `self_fix_guide: string | null`에 맞춰 text다.
  -- 단계 배열({ steps, caution }) 형태로 확정되면 jsonb로 바꾸고 타입도 같이 고칠 것.
  self_fix_guide   text,
  status           text not null default 'pending',
  created_at       timestamptz not null default now()
);

create index reports_landlord_id_created_at_idx on public.reports (landlord_id, created_at desc);
create index reports_tenant_id_created_at_idx   on public.reports (tenant_id, created_at desc);


-- ---------------------------------------------------------------------------
-- manufacturer_as_info : 제조사 A/S 연락처. 고정 참조 데이터(시드로 채운다).
-- ---------------------------------------------------------------------------
create table public.manufacturer_as_info (
  id                uuid primary key default gen_random_uuid(),
  category          text not null check (category in ('plumbing', 'electrical', 'heating', 'appliance',
                                                      'door_window', 'interior', 'pest', 'other')),
  manufacturer_name text not null,
  as_phone          text,
  as_url            text
);

create index manufacturer_as_info_category_idx on public.manufacturer_as_info (category);


-- ---------------------------------------------------------------------------
-- vendors : 전문 수리업체. 한 업체가 여러 카테고리를 다룰 수 있다.
-- categories의 CHECK는 배열의 모든 원소가 허용 목록 안에 있는지를 본다(<@ 는 포함 연산자).
-- ---------------------------------------------------------------------------
create table public.vendors (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  categories text[] not null default '{}' check (
               categories <@ array['plumbing', 'electrical', 'heating', 'appliance',
                                   'door_window', 'interior', 'pest', 'other']::text[]
             ),
  region     text,
  phone      text,
  -- rating / is_active 는 db/002_vendors_rating_active.sql 로 나중에 추가된 컬럼.
  -- matchVendors가 is_active로 필터하므로 매칭 API에 필수다.
  rating     numeric(2,1) not null default 0.0,
  is_active  boolean      not null default true,
  created_at timestamptz not null default now()
);

create index vendors_categories_idx on public.vendors using gin (categories);


-- ---------------------------------------------------------------------------
-- quotes : 업체가 제출한 견적.
-- is_outlier는 types/index.ts에 있어서 컬럼으로 뒀다. 다만 median은 견적이 하나
-- 추가될 때마다 움직이므로, 저장해두면 기존 행의 값이 낡는다. 조회 시점에 계산하는
-- 방식으로 간다면 이 컬럼은 그냥 쓰지 않으면 된다.
-- ---------------------------------------------------------------------------
create table public.quotes (
  id         uuid primary key default gen_random_uuid(),
  report_id  uuid not null references public.reports (id) on delete cascade,
  vendor_id  uuid not null references public.vendors (id) on delete cascade,
  price      integer not null check (price >= 0),
  status     text not null default 'pending',
  is_outlier boolean not null default false,
  created_at timestamptz not null default now()
);

create index quotes_report_id_idx on public.quotes (report_id);

-- 한 report에서 selected는 하나만. db/002_vendors_rating_active.sql로 추가됐다.
create unique index quotes_one_selected_per_report_idx
  on public.quotes (report_id) where status = 'selected';


-- ---------------------------------------------------------------------------
-- landlord_auto_approval_policy : 임대인이 카테고리별로 정해둔 자동승인 한도.
--
-- (landlord_id, category)에 unique를 걸었다. 이게 없으면 같은 임대인이 같은
-- 카테고리 정책을 두 번 저장했을 때 중복 행이 쌓이고 어느 한도가 적용될지
-- 알 수 없어진다.
-- landlord.controller.ts의 createAutoApprovalPolicy는 이 제약을 충돌 대상으로 삼아
-- upsert한다. 같은 카테고리를 다시 저장하면 한도가 덮어써진다.
-- ---------------------------------------------------------------------------
create table public.landlord_auto_approval_policy (
  id                 uuid primary key default gen_random_uuid(),
  landlord_id        uuid not null references public.users (id) on delete cascade,
  category           text not null check (category in ('plumbing', 'electrical', 'heating', 'appliance',
                                                       'door_window', 'interior', 'pest', 'other')),
  auto_approve_limit integer not null check (auto_approve_limit >= 0),
  created_at         timestamptz not null default now(),
  unique (landlord_id, category)
);


-- ---------------------------------------------------------------------------
-- repair_schedule : 확정된 방문 일정.
-- ---------------------------------------------------------------------------
create table public.repair_schedule (
  id            uuid primary key default gen_random_uuid(),
  report_id     uuid not null references public.reports (id) on delete cascade,
  technician_id uuid not null references public.users (id) on delete cascade,
  scheduled_at  timestamptz not null,
  confirmed     boolean not null default false
);

create index repair_schedule_report_id_idx on public.repair_schedule (report_id);


-- ---------------------------------------------------------------------------
-- repair_status_timeline : 수리 진행 상태 이력. 세입자 대시보드의 타임라인용.
-- ---------------------------------------------------------------------------
create table public.repair_status_timeline (
  id         uuid primary key default gen_random_uuid(),
  report_id  uuid not null references public.reports (id) on delete cascade,
  status     text not null,
  changed_at timestamptz not null default now()
);

create index repair_status_timeline_report_id_changed_at_idx
  on public.repair_status_timeline (report_id, changed_at);


-- ---------------------------------------------------------------------------
-- RLS
--
-- SQL Editor로 만든 테이블은 RLS가 꺼진 상태다. 서버가 대부분 service role 키로
-- 접근하므로 지금 구조에서는 그대로도 동작하지만, anon 키로는 테이블이 통째로
-- 열려 있는 셈이다. 켜려면 아래처럼 테이블마다 활성화하고 정책을 따로 써야 한다.
--
--   alter table public.reports enable row level security;
--   create policy "tenant reads own reports" on public.reports
--     for select using (auth.uid() = tenant_id);
--
-- 켜기 전에 서버가 anon 클라이언트로 데이터를 조회하는 곳이 없는지 먼저 확인할 것.
-- ---------------------------------------------------------------------------
