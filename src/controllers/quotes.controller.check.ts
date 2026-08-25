// median / 이상치 판정 자체 검증.
// 실행: npx ts-node src/controllers/quotes.controller.check.ts
//      (ts-node가 느리면 npm run build && node dist/controllers/quotes.controller.check.js)
import assert from 'assert';
import { median, isOutlier, adviseReplacement } from './quotes.controller';

assert.strictEqual(median([]), null, '빈 목록');
assert.strictEqual(median([100]), 100, '1건');
assert.strictEqual(median([300, 100, 200]), 200, '홀수 개 — 정렬 후 가운데');
assert.strictEqual(median([100, 200, 300, 400]), 250, '짝수 개 — 가운데 두 값 평균');

const prices = [80_000, 100_000, 120_000, 500_000];
const med = median(prices);
assert.strictEqual(med, 110_000);
assert.deepStrictEqual(
  prices.map((p) => isOutlier(p, med)),
  [false, false, false, true],
  '중앙값 110,000의 2배(220,000) 초과분만 이상치'
);

assert.strictEqual(isOutlier(220_000, 110_000), false, '정확히 2배는 이상치 아님 (초과일 때만)');
assert.strictEqual(isOutlier(220_001, 110_000), true, '2배 초과는 이상치');
assert.strictEqual(isOutlier(999_999, null), false, '견적 0건이면 판정 불가');
assert.strictEqual(isOutlier(150_000, 150_000), false, '견적 1건이면 자기 자신이 중앙값 — 이상치 아님');

// ── 교체 권장 판정 (수리비 >= 신품가의 60%면 replace, 경계값 포함)
assert.strictEqual(adviseReplacement(420_000, 700_000, null).recommendation, 'replace', '정확히 60%는 교체 (이상 조건)');
assert.strictEqual(adviseReplacement(419_999, 700_000, null).recommendation, 'repair', '60% 미만은 수리');
assert.strictEqual(adviseReplacement(235_000, 700_000, null).recommendation, 'repair', '34%는 수리');
assert.strictEqual(adviseReplacement(690_000, 700_000, null).recommendation, 'replace', '99%는 교체');

const advice = adviseReplacement(500_000, 700_000, '벽걸이 기본형');
assert.strictEqual(advice.repairEstimate, 500_000);
assert.strictEqual(advice.replacementPrice, 700_000);
assert.strictEqual(advice.recommendation, 'replace');
assert.ok(advice.reason.includes('71%'), `비율이 문구에 들어가야 함: ${advice.reason}`);
assert.ok(advice.reason.includes('벽걸이 기본형'), '기준가 근거가 문구에 들어가야 함');

console.log('quotes median/outlier/replacement checks passed');
