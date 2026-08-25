-- 006_appliance_type_and_as.sql — 가전 하위 종류 + 종류별 제조사 A/S
--
-- 실행법: Supabase 대시보드 > SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전함.
--
-- 배경: 가전은 일반 하자와 판정 흐름이 다르다(소유 관계·보증기간에 따라 부담 주체가
--       갈린다). 그런데 category 8종에는 appliance 하나뿐이라 종류를 구분할 수 없었고,
--       manufacturer_as_info 도 category 로만 조회돼서 냉장고 고장에 냉난방 업체가
--       같이 나왔다.
--
-- 설계: category 를 늘리지 않고 appliance_type 이라는 별개 축을 둔다. category 는
--       reports / vendors / manufacturer_as_info / landlord_auto_approval_policy 가
--       조인 키로 공유해서, 값을 늘리면 CHECK 4곳과 코드 10곳을 전부 고쳐야 한다.
--
--       값은 db/005_appliance_reference_price.sql 의 appliance_type 과 같아야 한다.
--       어긋나면 교체 권장(GET /api/quotes)이 기준가를 못 찾는다.
--
-- 호환: 두 컬럼 다 nullable 이다. 기존 행과 기존 코드는 그대로 동작한다.
--       manufacturer_as_info.appliance_type 이 NULL 이면 "그 카테고리 전반" 을 뜻한다.
--
-- NOTE: 보일러는 category 를 heating 으로 유지한다. 이미 heating 제조사가 시딩돼
--       있고 카테고리를 옮기면 기존 데이터가 갈라진다. 대신 appliance_type='boiler'
--       를 붙여서, 가전 판정은 category 와 무관하게 appliance_type 으로 태운다.

-- ---------------------------------------------------------------------------
-- 1) reports 에 가전 종류
-- ---------------------------------------------------------------------------
alter table public.reports
  add column if not exists appliance_type text
    check (appliance_type is null or appliance_type in
           ('aircon', 'boiler', 'induction', 'refrigerator', 'washer'));

-- ---------------------------------------------------------------------------
-- 2) manufacturer_as_info 에 가전 종류 (NULL = 해당 카테고리 범용)
-- ---------------------------------------------------------------------------
alter table public.manufacturer_as_info
  add column if not exists appliance_type text
    check (appliance_type is null or appliance_type in
           ('aircon', 'boiler', 'induction', 'refrigerator', 'washer'));

create index if not exists manufacturer_as_info_appliance_type_idx
  on public.manufacturer_as_info (category, appliance_type);

-- ---------------------------------------------------------------------------
-- 3) 기존 행에 종류 지정
--    이름으로 성격이 분명한 곳만 지정하고, 종합 가전 A/S 는 NULL(범용)로 둔다.
-- ---------------------------------------------------------------------------
update public.manufacturer_as_info set appliance_type = 'aircon'
  where manufacturer_name = '푸른냉난방' and appliance_type is null;
update public.manufacturer_as_info set appliance_type = 'boiler'
  where category = 'heating' and appliance_type is null;

-- ---------------------------------------------------------------------------
-- 4) 종류별 A/S 시딩
--
-- NOTE: db/004 와 같은 규칙이다 — 데모용 가상 제조사이며 실존 기업명·연락처가
--       아니다. 전화번호는 문서용으로 예약된 02-555-02xx 대역을 쓴다.
--       실존 브랜드(삼성·LG 등)로 바꾸려면 팀 합의 후 확인된 연락처로 교체할 것.
--       추측한 번호를 넣으면 시연에서 틀린 곳으로 안내하게 된다.
-- ---------------------------------------------------------------------------
insert into public.manufacturer_as_info (category, manufacturer_name, as_phone, as_url, appliance_type)
select m.category, m.manufacturer_name, m.as_phone, m.as_url, m.appliance_type
from (values
  ('appliance', '아이스원냉장',   '02-555-0211', 'https://as.example.com/iceone',  'refrigerator'),
  ('appliance', '맑은세탁기술',   '02-555-0212', 'https://as.example.com/malgeun', 'washer'),
  ('appliance', '불꽃인덕션AS',   '02-555-0213', 'https://as.example.com/bulkkot', 'induction'),
  ('appliance', '시원에어서비스', '02-555-0214', 'https://as.example.com/siwon',   'aircon')
) as m(category, manufacturer_name, as_phone, as_url, appliance_type)
where not exists (
  select 1 from public.manufacturer_as_info existing
  where existing.category = m.category
    and existing.manufacturer_name = m.manufacturer_name
);

-- 확인용 (Run 하면 결과 그리드에 표시됨)
select category, coalesce(appliance_type, '(범용)') as appliance_type, manufacturer_name, as_phone
from public.manufacturer_as_info
order by category, appliance_type nulls first, manufacturer_name;
