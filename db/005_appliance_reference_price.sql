-- 005_appliance_reference_price.sql — 가전 교체 권장 판정용 신품 기준가
--
-- 실행법: Supabase 대시보드 > SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전함.
--
-- GET /api/quotes?reportId=...&applianceType=... 이 읽는 참조 데이터다.
-- 들어온 견적이 동급 신품가의 일정 비율을 넘으면 "수리보다 교체" 를 권한다.
--
-- NOTE: 실제 상품 연동이 아니다. 시연에서 비교를 보여주기 위한 참고용 기준가이며,
--       특정 제조사·모델의 가격이 아니다. 2026년 기준 대략적인 시장 가격대를
--       라운드 넘버로 적었다.
--
-- NOTE: 판정에는 종류별 최저가(= 기본형 grade)를 쓴다. "같은 걸 새로 사면 얼마"
--       를 묻는 것이므로 프리미엄 등급을 기준으로 잡으면 교체 권장이 거의 나오지
--       않는다. grade 를 둘 이상 둔 것은 화면에 가격대를 보여주기 위해서다.
--
-- NOTE: appliance_type 은 reports.category 8종과는 별개 축이다. 가전 하자 진단
--       (팀원A 범위)에서 하위 종류를 다루게 되면 그쪽 값과 맞춰야 한다.
--       지금은 이 테이블만 쓰므로 여기서 CHECK 로 닫아 둔다.

create table if not exists public.appliance_reference_price (
  id             uuid primary key default gen_random_uuid(),
  appliance_type text    not null check (appliance_type in
                     ('aircon', 'boiler', 'induction', 'refrigerator', 'washer')),
  grade          text    not null check (grade in ('standard', 'premium')),
  price          integer not null check (price >= 0),   -- 원 단위 정수
  note           text,
  created_at     timestamptz not null default now(),
  unique (appliance_type, grade)
);

insert into public.appliance_reference_price (appliance_type, grade, price, note)
select p.appliance_type, p.grade, p.price, p.note
from (values
  ('aircon',       'standard',   700000, '벽걸이 기본형'),
  ('aircon',       'premium',   1500000, '스탠드형'),
  ('boiler',       'standard',   700000, '일반형'),
  ('boiler',       'premium',   1100000, '콘덴싱'),
  ('induction',    'standard',   400000, '2구'),
  ('induction',    'premium',    800000, '3구 빌트인'),
  ('refrigerator', 'standard',   700000, '300L대 일반형'),
  ('refrigerator', 'premium',   1600000, '양문형 대용량'),
  ('washer',       'standard',   700000, '드럼 기본형'),
  ('washer',       'premium',   1300000, '대용량 건조겸용')
) as p(appliance_type, grade, price, note)
where not exists (
  select 1 from public.appliance_reference_price existing
  where existing.appliance_type = p.appliance_type
    and existing.grade = p.grade
);

-- 종류별 기준가 확인용 (Run 하면 결과 그리드에 표시됨)
select appliance_type, grade, price, note
from public.appliance_reference_price
order by appliance_type, price;
