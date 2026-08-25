-- 001_vendor_matching.sql — 전문업체 매칭 데모용 vendors 시딩
--
-- 실행법: Supabase 대시보드 > SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전함.
--
-- NOTE: 테이블 DDL은 여기 없음. vendors / quotes / repair_schedule /
--       repair_status_timeline 는 전부 main 브랜치의 supabase/schema.sql 로 이미
--       Supabase에 적용돼 있음. 이 파일은 데이터만 넣는다.
--
-- NOTE: categories 원소는 공용 category 8종 안에서만 써야 함
--       (plumbing | electrical | heating | appliance | door_window | interior | pest | other).
--       vendors.categories 에 CHECK (categories <@ array[...]) 가 걸려 있어 목록 밖의
--       값이 하나라도 섞이면 INSERT 전체가 실패한다.
--
-- 데모용 가상 업체 15개. 실존 업체명 아님.
--   - 카테고리 8종 전부 2곳 이상이 겹치도록 구성 (매칭 결과가 복수로 나와야 함)
--   - 이름 앞글자를 가~하로 분산 + 일부러 가나다순이 아닌 순서로 INSERT
--     → API 의 localeCompare('ko') 정렬이 실제로 동작하는지 눈으로 확인 가능
--   - vendors.name 에 unique 제약이 없으므로 NOT EXISTS 로 중복 삽입을 막는다.

insert into public.vendors (name, categories, region, phone)
select v.name, v.categories, v.region, v.phone
from (values
  ('하늘보일러설비', '{heating,plumbing}'::text[],            '서울 마포구',   '02-555-0113'),
  ('나래전기공사',   '{electrical,appliance}'::text[],        '서울 서대문구', '02-555-0102'),
  ('차오름종합설비', '{plumbing,heating}'::text[],            '서울 성동구',   '02-555-0110'),
  ('가온하우스설비', '{plumbing,heating}'::text[],            '서울 관악구',   '02-555-0101'),
  ('타임리페어',     '{electrical,door_window,appliance}'::text[], '서울 강서구', '02-555-0112'),
  ('마루인테리어',   '{interior}'::text[],                    '서울 은평구',   '02-555-0105'),
  ('아름드리창호',   '{door_window,interior}'::text[],        '서울 노원구',   '02-555-0108'),
  ('바로수리센터',   '{electrical,plumbing,heating,other}'::text[], '서울 광진구', '02-555-0106'),
  ('자연도배마감',   '{interior,pest}'::text[],               '서울 중랑구',   '02-555-0109'),
  ('라온배관',       '{plumbing}'::text[],                    '서울 동작구',   '02-555-0104'),
  ('한결가전서비스', '{appliance,electrical}'::text[],        '서울 송파구',   '02-555-0115'),
  ('카이로스전기',   '{electrical,door_window}'::text[],      '서울 양천구',   '02-555-0111'),
  ('다솜하우징',     '{interior,door_window}'::text[],        '서울 강북구',   '02-555-0103'),
  ('파랑방역센터',   '{pest,other}'::text[],                  '서울 금천구',   '02-555-0114'),
  ('사계절보일러',   '{heating}'::text[],                     '서울 구로구',   '02-555-0107')
) as v(name, categories, region, phone)
where not exists (
  select 1 from public.vendors existing where existing.name = v.name
);

-- 카테고리별 업체 수 확인용 (Run 하면 결과 그리드에 표시됨)
select unnest(categories) as category, count(*) as vendors
from public.vendors
group by 1 order by 1;
