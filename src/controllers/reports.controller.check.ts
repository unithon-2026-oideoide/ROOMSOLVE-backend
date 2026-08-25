// 가전 부담 판정 룰 자체 검증.
// 실행: npx ts-node src/controllers/reports.controller.check.ts
//      (ts-node가 느리면 npm run build && node dist/controllers/reports.controller.check.js)
import assert from 'assert';
import { judgeAppliance, nextApplianceQuestions } from './reports.controller';

// ── 보충 질문 순서
assert.deepStrictEqual(
  nextApplianceQuestions(undefined, undefined).map((q) => q.id),
  ['ownership'],
  '아무 답도 없으면 Q1부터'
);
assert.deepStrictEqual(
  nextApplianceQuestions('landlord_builtin', undefined).map((q) => q.id),
  ['purchase_age'],
  'Q1 답했으면 Q2'
);
assert.deepStrictEqual(
  nextApplianceQuestions('tenant_purchased', undefined).map((q) => q.id),
  [],
  '직접 구매면 Q2를 묻지 않는다 (보증기간과 무관하게 임차인 부담)'
);
assert.deepStrictEqual(
  nextApplianceQuestions('landlord_option', 'over_10y').map((q) => q.id),
  [],
  '둘 다 답했으면 질문 없음'
);

// ── case A: 임차인 직접 구매
const a = judgeAppliance('tenant_purchased', undefined);
assert.strictEqual(a.liability, 'tenant');
assert.strictEqual(a.blockVendorMatch, false);

// ── case B: 임대인 제공 + 2년 이내 → 빌트인/옵션 구분 없이 보증 우선
for (const own of ['landlord_builtin', 'landlord_option'] as const) {
  const b = judgeAppliance(own, 'within_2y');
  assert.strictEqual(b.liability, 'manufacturer_warranty', `${own} + 2년 이내`);
  assert.strictEqual(b.recommendedPath, 'manufacturer_as', '제조사 AS로 종료');
  assert.strictEqual(b.blockVendorMatch, true, '업체 매칭을 진행하지 않는다');
  assert.ok(b.warning && b.warning.includes('유상'), '사설 업체 유상 경고 포함');
}

// ── case C: 빌트인 + 보증 만료
for (const age of ['from_2y_to_10y', 'over_10y'] as const) {
  const c = judgeAppliance('landlord_builtin', age);
  assert.strictEqual(c.liability, 'landlord', `빌트인 + ${age}`);
  assert.ok(c.basis.includes('623'), '민법 제623조 근거 포함');
  assert.strictEqual(c.recommendedPath, 'vendor_match', '업체 매칭 진행');
}

// ── case D: 옵션 + 보증 만료 → 확신도를 낮춰서 반환
const d = judgeAppliance('landlord_option', 'over_10y');
assert.strictEqual(d.liability, 'negotiable');
assert.ok(d.notice.includes('특약'), '계약서 특약 안내 포함');
assert.ok(
  d.confidence < judgeAppliance('landlord_builtin', 'over_10y').confidence,
  'negotiable은 landlord보다 확신도가 낮아야 한다'
);

// ── '모름' — 보증 여부를 단정하지 않고 확신도만 낮춘다
for (const own of ['landlord_builtin', 'landlord_option'] as const) {
  const known = judgeAppliance(own, 'over_10y');
  const unsure = judgeAppliance(own, 'unknown');
  assert.strictEqual(unsure.liability, known.liability, `${own}: 모름이어도 판정은 같다`);
  assert.ok(unsure.confidence < known.confidence, `${own}: 모름이면 확신도가 낮아야 한다`);
  assert.ok(unsure.notice.includes('보증기간'), '보증기간 확인 안내 포함');
}

console.log('appliance liability rule checks passed');
