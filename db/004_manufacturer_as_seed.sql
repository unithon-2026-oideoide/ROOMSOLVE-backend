-- 004_manufacturer_as_seed.sql — 제조사 A/S 연락처 시딩
--
-- 실행법: Supabase 대시보드 > SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전함.
--
-- GET /api/manufacturer-as?category=... 가 읽는 참조 데이터.
-- recommended_path 가 manufacturer_as 로 나왔을 때 세입자에게 보여줄 연락처다.
--
-- NOTE: category 는 공용 8종 안에서만 써야 한다
--       (plumbing | electrical | heating | appliance | door_window | interior | pest | other).
--       CHECK 제약이 걸려 있어 목록 밖의 값이 하나라도 섞이면 INSERT 전체가 실패한다.
--
-- NOTE: 데모용 가상 제조사다. 실존 기업명·연락처가 아니다. 전화번호는 문서용으로
--       예약된 02-555-01xx 대역을 쓴다.
--
--       제조사 A/S 가 의미 있는 카테고리에만 넣었다. plumbing(배관)이나 interior(도배)
--       처럼 제조사가 없는 하자는 비워 둔다 — 조회 결과가 비면 프론트가 자연스럽게
--       전문업체 매칭으로 넘기면 된다.

insert into public.manufacturer_as_info (category, manufacturer_name, as_phone, as_url)
select m.category, m.manufacturer_name, m.as_phone, m.as_url
from (values
  ('heating',     '한빛보일러',     '02-555-0201', 'https://as.example.com/hanbit'),
  ('heating',     '온누리에너지',   '02-555-0202', 'https://as.example.com/onnuri'),
  ('appliance',   '새롬전자',       '02-555-0203', 'https://as.example.com/saerom'),
  ('appliance',   '누리가전',       '02-555-0204', 'https://as.example.com/nuri'),
  ('appliance',   '푸른냉난방',     '02-555-0205', 'https://as.example.com/pureun'),
  ('electrical',  '빛솔전기',       '02-555-0206', 'https://as.example.com/bitsol'),
  ('electrical',  '한울전자',       '02-555-0207', null),
  ('door_window', '튼튼창호',       '02-555-0208', 'https://as.example.com/teunteun'),
  ('door_window', '미르도어',       '02-555-0209', null),
  ('pest',        '깨끗방역',       '02-555-0210', 'https://as.example.com/kkakkeut')
) as m(category, manufacturer_name, as_phone, as_url)
where not exists (
  select 1 from public.manufacturer_as_info existing
  where existing.category = m.category
    and existing.manufacturer_name = m.manufacturer_name
);

-- 카테고리별 등록 수 확인용 (Run 하면 결과 그리드에 표시됨)
select category, count(*) as manufacturers
from public.manufacturer_as_info
group by 1 order by 1;
