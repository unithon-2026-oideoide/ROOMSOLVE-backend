// median / 이상치 판정 자체 검증.
// 실행: npx ts-node src/controllers/quotes.controller.check.ts
//      (ts-node가 느리면 npm run build && node dist/controllers/quotes.controller.check.js)
import assert from 'assert';
import { median, isOutlier, adviseReplacement, rankQuotes } from './quotes.controller';

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

// ── 견적 순위 / 추천
{
  const r = rankQuotes([]);
  assert.deepStrictEqual(r, [], '견적 0건이면 빈 배열');
}
{
  const [only] = rankQuotes([{ id: 'a', price: 100_000, rating: 4.0 }]);
  assert.strictEqual(only.rank, 1);
  assert.strictEqual(only.isRecommended, true, '1건뿐이면 그게 추천');
  assert.strictEqual(only.recommendReason, '제출된 견적이 하나뿐입니다.');
}
{
  // 같은 평점이면 순수하게 가격 순.
  const r = rankQuotes([
    { id: 'expensive', price: 300_000, rating: 4.5 },
    { id: 'cheap', price: 100_000, rating: 4.5 },
    { id: 'mid', price: 200_000, rating: 4.5 },
  ]);
  assert.deepStrictEqual(r.map((x) => x.id), ['cheap', 'mid', 'expensive'], '평점이 같으면 가격순');
  assert.strictEqual(r[0].recommendReason, '최저가이면서 평점도 가장 높습니다.');
}
{
  // 최저가가 평점까지 최고면 이견 없이 1위.
  const r = rankQuotes([
    { id: 'best', price: 100_000, rating: 4.9 },
    { id: 'other', price: 150_000, rating: 4.0 },
  ]);
  assert.strictEqual(r[0].id, 'best');
  assert.strictEqual(r[0].recommendReason, '최저가이면서 평점도 가장 높습니다.');
}
{
  // 평점이 크게 앞서면 약간 비싸도 1위를 가져갈 수 있다.
  const r = rankQuotes([
    { id: 'cheap-bad', price: 100_000, rating: 2.0 },
    { id: 'slightly-pricier-good', price: 105_000, rating: 5.0 },
  ]);
  assert.strictEqual(r[0].id, 'slightly-pricier-good', '평점 차가 크면 소폭 비싼 쪽이 이긴다');
  assert.match(r[0].recommendReason!, /비싸지만 평점이/, '더 낸 금액과 평점 차를 밝힌다');
}
{
  // 가격 차가 크면 평점으로 못 뒤집는다 — 가격 가중치가 더 크다.
  const r = rankQuotes([
    { id: 'cheap', price: 100_000, rating: 3.0 },
    { id: 'triple', price: 300_000, rating: 5.0 },
  ]);
  assert.strictEqual(r[0].id, 'cheap', '3배 가격 차는 만점 평점으로도 못 뒤집는다');
}
{
  // 평점이 없는 신규 업체는 중간값(0.5)으로 취급 — 가격만으로 밀리지 않는다.
  const r = rankQuotes([
    { id: 'new-vendor', price: 100_000, rating: null },
    { id: 'rated', price: 100_000, rating: 5.0 },
  ]);
  assert.strictEqual(r[0].id, 'rated', '같은 가격이면 평점 있는 쪽이 앞');
  assert.strictEqual(r[1].id, 'new-vendor');
}
{
  // 점수가 완전히 같으면 id로 순서를 고정한다(요청마다 흔들리면 안 된다).
  const a = rankQuotes([
    { id: 'bbb', price: 100_000, rating: 4.0 },
    { id: 'aaa', price: 100_000, rating: 4.0 },
  ]);
  assert.deepStrictEqual(a.map((x) => x.id), ['aaa', 'bbb'], '동점이면 id 순으로 고정');
}

console.log('quotes.controller 자체 검증 통과');
