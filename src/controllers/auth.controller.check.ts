// technician 가입 추가 입력 검증 자체 검증.
// 실행: npm run build && node dist/controllers/auth.controller.check.js
import assert from 'assert';
import { vendorSignupError } from './auth.controller';

assert.ok(vendorSignupError(undefined, ['plumbing']), '사업자등록번호 누락');
assert.ok(vendorSignupError('', ['plumbing']), '빈 사업자등록번호도 누락으로 본다');
assert.ok(vendorSignupError('123-45-67890', undefined), 'categories 누락');
assert.ok(vendorSignupError('123-45-67890', []), '빈 배열은 전문 분야 미선택');
assert.ok(vendorSignupError('123-45-67890', 'plumbing'), '배열이 아니면 거부');
assert.ok(vendorSignupError('123-45-67890', ['plumbing', '배관']), '한 개라도 목록 밖이면 거부');

assert.strictEqual(vendorSignupError('123-45-67890', ['plumbing']), null, '한 개 선택');
assert.strictEqual(
  vendorSignupError('123-45-67890', ['plumbing', 'heating', 'appliance']),
  null,
  '여러 개 선택'
);

console.log('auth.controller.check: OK');
