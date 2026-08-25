-- ROOMSOLVE 스키마 — 현재 Supabase에 적용돼 있는 상태를 그대로 옮겨 적은 파일.
--
-- ⚠️ 이 파일을 지금 Supabase에 Run하지 말 것. 테이블은 이미 전부 존재하므로
--    create table에서 에러가 난다. 새 DB를 처음부터 만들 때만 쓰는 파일이고,
--    평소에는 "지금 DB가 어떤 모양인지" 확인하는 용도로 읽는다.
--
-- 번호를 붙인 db/ 마이그레이션 이력은 없앴다. 이 파일 하나가 유일한 기준이다.
-- 스키마를 바꿀 때는 Supabase에서 ALTER를 직접 돌린 뒤 이 파일도 반드시 같이 고칠 것.
-- Supabase 프로젝트가 하나뿐이라 DDL은 실행 즉시 전원에게 반영되고, 이 파일을 안 고치면
-- 다음 사람이 새 DB를 만들 때 그 변경이 통째로 빠진다.
--
-- NOT NULL과 기본값은 PostgREST가 노출하는 실제 스키마에서 읽어 맞춘 것이다.
-- 실제 DB는 PK와 핵심 FK 말고는 NOT NULL이 거의 걸려 있지 않다. 제약이 느슨하다는
-- 뜻이므로, 값 보장은 애플리케이션 쪽에서 해야 한다.
--
-- 공용 값 목록 (여러 테이블이 조인 키로 함께 쓰므로 바꿀 때는 전부 같이 바꿀 것)
--   category : plumbing | electrical | heating | appliance | door_window | interior | pest | other
--   severity : low | medium | high | emergency
--   recommended_path : self_fix | manufacturer_as | vendor_match
--   role     : tenant | landlord | technician
--
-- status 계열은 CHECK가 없다. 실제로 쓰이는 값은 아래와 같다.
--   reports.status                : pending (기본값) → approved | rejected
--   quotes.status                 : recommended | selected | rejected (CHECK 제약 있음)
--                                   selected 하나를 고르면 같은 신고의 나머지는 자동 rejected
--   repair_status_timeline.status : scheduled | confirmed | in_progress | done


-- ---------------------------------------------------------------------------
-- users : Supabase Auth(auth.users)의 프로필 확장 테이블.
-- auth.controller.ts의 signup이 auth.users.id를 그대로 넣어 준다.
-- (id에 gen_random_uuid() 기본값이 붙어 있지만 실제로는 쓰이지 않는다.
--  auth.users로의 외래키가 실제로 걸려 있는지는 PostgREST로 확인되지 않았다.)
-- ---------------------------------------------------------------------------
-- landlord_code / linked_landlord_id 는 임대인 초대 코드 매칭용 컬럼.
-- landlord_code   : role이 landlord인 계정에만 회원가입 시 자동 발급되는 6자리 초대 코드.
-- linked_landlord_id : 세입자가 그 코드를 입력해 연결한 임대인의 id(PATCH /api/users/link-landlord).
--                       reports.landlord_id를 생략하고 신고하면 createReport가 이 값을 대신 쓴다.
create table public.users (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  role               text not null check (role in ('tenant', 'landlord', 'technician')),
  phone              text,
  landlord_code      text unique,
  linked_landlord_id uuid references public.users (id) on delete set null,
  created_at         timestamptz default now()
);

create index users_linked_landlord_id_idx on public.users (linked_landlord_id);


-- ---------------------------------------------------------------------------
-- reports : 세입자가 올린 하자 신고.
--
-- tenant_id / landlord_id 둘 다 users를 참조한다. 참조가 둘이라 PostgREST가
-- 조인 대상을 자동으로 못 고르므로, landlord.controller.ts는
-- users!reports_tenant_id_fkey 처럼 제약 이름을 명시해서 조인한다.
-- (제약 이름을 바꾸면 landlord.controller.ts의 쿼리도 같이 고쳐야 한다.)
--
-- landlord_id를 reports가 직접 들고 있는 것은 임시 구조다. 원래는 properties(호실)
-- 테이블을 거쳐야 하지만 시연 범위에서는 생략했다.
--
-- 사진은 photo_urls(여러 장)가 실제 목록이고, photo_url은 그중 대표 1장이다.
-- photo_url만 NOT NULL이라 신고에는 사진이 최소 한 장 있어야 한다.
-- createReport가 photo_urls를 받아 첫 번째 원소를 photo_url에 채운다.
-- ---------------------------------------------------------------------------
create table public.reports (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.users (id) on delete cascade,
  -- 나중에 ALTER로 붙은 컬럼이라 NOT NULL이 걸려 있지 않다.
  -- 값은 createReport가 필수로 검증해서 항상 채운다.
  landlord_id      uuid references public.users (id) on delete cascade,
  photo_url        text not null,
  photo_urls       text[],
  description      text,
  category         text check (category in ('plumbing', 'electrical', 'heating', 'appliance',
                                            'door_window', 'interior', 'pest', 'other')),
  severity         text check (severity in ('low', 'medium', 'high', 'emergency')),
  recommended_path text check (recommended_path in ('self_fix', 'manufacturer_as', 'vendor_match')),
  -- 자가조치 가이드. types/index.ts와 Swagger 모두 문자열로 확정돼 있다.
  self_fix_guide   text,
  -- 가전 하자일 때만 채워진다. analyze가 사실 확인만 하고(어떤 가전인가) 부담 주체는
  -- 정하지 않는다. reports.category 8종과는 별개 축이다.
  appliance_type   text check (appliance_type in ('aircon', 'boiler', 'induction',
                                                  'refrigerator', 'washer')),
  -- recommended_path와 무관하게 항상 채워지는 AI 진단 요약(1~3문장).
  ai_summary       text,
  -- 세입자가 집에 있는 시간대. 자유 텍스트.
  available_times  text,
  status           text default 'pending',
  created_at       timestamptz default now()
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
  -- 가전 종류별 A/S. NULL이면 해당 카테고리의 범용 A/S 연락처다.
  appliance_type    text check (appliance_type in ('aircon', 'boiler', 'induction',
                                                   'refrigerator', 'washer')),
  manufacturer_name text not null,
  as_phone          text,
  as_url            text
);

create index manufacturer_as_info_category_idx on public.manufacturer_as_info (category);


-- ---------------------------------------------------------------------------
-- appliance_reference_price : 가전 종류별 신품 기준가. 고정 참조 데이터.
--
-- GET /api/quotes 가 applianceType을 받으면 견적 중앙값을 이 값과 비교해
-- 수리/교체를 권한다(quotes.controller.ts buildAdvice). 기준은 종류별 최저가
-- (standard 등급)다 — "같은 걸 새로 사면 얼마"가 비교 대상이라 premium으로 잡으면
-- 교체 권장이 거의 나오지 않는다.
--
-- ⚠️ 지금 이 테이블은 비어 있다. 행이 없으면 buildAdvice가 항상 null을 반환해
-- 교체 권장 기능이 조용히 꺼진 상태가 된다.
-- ---------------------------------------------------------------------------
create table public.appliance_reference_price (
  id             uuid primary key default gen_random_uuid(),
  appliance_type text not null check (appliance_type in ('aircon', 'boiler', 'induction',
                                                         'refrigerator', 'washer')),
  grade          text not null check (grade in ('standard', 'premium')),
  price          integer not null check (price >= 0),
  note           text,
  created_at     timestamptz not null default now()
);


-- ---------------------------------------------------------------------------
-- vendors : 전문 수리업체. 한 업체가 여러 카테고리를 다룰 수 있다.
-- categories의 CHECK는 배열의 모든 원소가 허용 목록 안에 있는지를 본다(<@ 는 포함 연산자).
-- rating / is_active 는 매칭·순위에 쓰는 컬럼이다.
-- matchVendors가 is_active로 필터하므로 매칭 API에 필수다.
-- ---------------------------------------------------------------------------
create table public.vendors (
  id         uuid primary key default gen_random_uuid(),
  -- technician role로 가입한 계정과의 연결.
  -- 시딩된 데모 업체 15곳은 계정이 없어 NULL이다.
  user_id    uuid references public.users (id) on delete cascade,
  business_number text,
  name       text not null,
  categories text[] not null default '{}' check (
               categories <@ array['plumbing', 'electrical', 'heating', 'appliance',
                                   'door_window', 'interior', 'pest', 'other']::text[]
             ),
  -- 가입 시점에는 지역을 받지 않으므로 NOT NULL이 아니다.
  region     text,
  phone      text,
  rating     numeric(2,1) not null default 0.0,
  is_active  boolean      not null default true,
  created_at timestamptz default now()
);

create index vendors_categories_idx on public.vendors using gin (categories);

-- 한 계정당 업체 프로필 하나.
create unique index vendors_user_id_idx on public.vendors (user_id) where user_id is not null;


-- ---------------------------------------------------------------------------
-- quotes : 업체가 제출한 견적.
-- is_outlier 컬럼이 있지만, median은 견적이 하나 추가될 때마다 움직이므로
-- 저장해두면 기존 행의 값이 낡는다. 조회 시점에 계산한다면 이 컬럼은 쓰지 않으면 된다.
-- ---------------------------------------------------------------------------
create table public.quotes (
  id         uuid primary key default gen_random_uuid(),
  report_id  uuid not null references public.reports (id) on delete cascade,
  vendor_id  uuid not null references public.vendors (id) on delete cascade,
  price      integer not null check (price >= 0),
  -- ⚠️ 기본값은 'pending'이지만 CHECK 제약이 걸려 있어서
  --    status를 명시하지 않은 insert는 이제 통과하지 않는다. createQuote는 항상 'recommended'를 넣는다.
  status     text default 'pending' check (status in ('recommended', 'selected', 'rejected')),
  -- 업체가 제안한 방문 시간. selected로 바뀌는 순간 이 값으로 repair_schedule이 자동 생성된다.
  proposed_visit_at timestamptz,
  is_outlier boolean default false,
  created_at timestamptz default now()
);

create index quotes_report_id_idx on public.quotes (report_id);

-- 한 report에서 selected는 하나만.
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
  created_at         timestamptz default now(),
  unique (landlord_id, category)
);


-- ---------------------------------------------------------------------------
-- repair_schedule : 확정된 방문 일정.
-- technician_id / scheduled_at 이 nullable이라, 기사와 시간이 정해지기 전에도
-- report에 대해 행을 먼저 만들어 둘 수 있는 구조다.
-- ---------------------------------------------------------------------------
create table public.repair_schedule (
  id            uuid primary key default gen_random_uuid(),
  report_id     uuid not null references public.reports (id) on delete cascade,
  technician_id uuid references public.users (id) on delete cascade,
  scheduled_at  timestamptz,
  confirmed     boolean default false
);

create index repair_schedule_report_id_idx on public.repair_schedule (report_id);


-- ---------------------------------------------------------------------------
-- repair_status_timeline : 수리 진행 상태 이력. 세입자 대시보드의 타임라인용.
-- ---------------------------------------------------------------------------
create table public.repair_status_timeline (
  id         uuid primary key default gen_random_uuid(),
  report_id  uuid not null references public.reports (id) on delete cascade,
  status     text not null,
  -- ⚠️ 컬럼은 DB에 있지만 코드는 쓰지 않는다. 수리 완료 사진 기능을 넣지 않기로
  -- 정한 뒤에 이 컬럼이 DB에 추가됐다(결정과 엇갈림). 기능을 되살릴 게 아니라면
  -- 지워도 되고, 남겨 둬도 항상 NULL이라 동작에는 지장이 없다.
  photo_url  text,
  changed_at timestamptz default now()
);

create index repair_status_timeline_report_id_changed_at_idx
  on public.repair_status_timeline (report_id, changed_at);


-- ---------------------------------------------------------------------------
-- RLS
--
-- 현재 모든 테이블에서 꺼져 있다. 서버가 대부분 service role 키로 접근하므로
-- 지금 구조에서는 동작하지만, anon 키로는 테이블이 통째로 열려 있는 셈이다.
-- 켜려면 아래처럼 테이블마다 활성화하고 정책을 따로 써야 한다.
--
--   alter table public.reports enable row level security;
--   create policy "tenant reads own reports" on public.reports
--     for select using (auth.uid() = tenant_id);
--
-- 켜기 전에 서버가 anon 클라이언트로 데이터를 조회하는 곳이 없는지 먼저 확인할 것.
-- ---------------------------------------------------------------------------
