# 집 하자보수 매칭 플랫폼 — 백엔드

세입자 / 임대인 / 수리기사(전문업체) 3자 구조의 하자보수 매칭 서비스 백엔드.
Node.js + Express + TypeScript + Supabase(Postgres/Storage/Realtime) 기반.

## 로컬 실행 방법

```bash
npm install

# .env.example을 복사해서 .env를 만들고 값을 채워줘 (Supabase URL/key 등)
cp .env.example .env

npm run dev
```

- `npm run dev` : nodemon + ts-node로 개발 서버 실행 (src 변경 감지)
- `npm run build` : TypeScript 컴파일 (dist/ 생성)
- `npm run start` : 컴파일된 dist/server.js 실행 (프로덕션용)

서버가 뜨면 `GET /health` 로 헬스체크 가능.

API 문서: 서버 실행 후 http://localhost:3000/api-docs (또는 실서버
http://134.185.108.221:3000/api-docs)에서 확인 및 테스트 가능. Swagger UI의
Authorize 버튼으로 로그인 후 받은 access token을 넣으면 인증 필요한 API도
바로 테스트 가능.

## 환경 변수

`.env.example` 참고. 필수 값:

- `PORT`, `NODE_ENV`
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET`
- `GEMINI_API_KEY` (팀원A의 AI 분석 기능에서 사용 — `POST /api/reports/analyze`)

`.env`는 절대 커밋하지 않는다 — `.gitignore`에 포함되어 있는지 항상 확인.

## 브랜치 전략

- `main` : 배포/데모 기준 브랜치. 항상 정상 동작하는 상태로 유지.
- `develop` : 통합 브랜치. 각자 작업은 여기로 먼저 모은다.
- 기능/수정 브랜치(`ft-a`, `ft-c`처럼 개인 단위든 `feat/xxx`처럼 기능 단위든 상관없음)에서
  작업 → `develop`으로 머지 → `develop`이 문제 없이 돌아가면 그때 `main`으로 머지.
- 즉 `내 브랜치 → develop → main` 순서. `main`으로 바로 머지하지 않는다.

### develop 로컬 테스트 방법

별도 스테이징 서버 없이, 각자 로컬에서 develop을 띄워서 확인하고 main으로 올린다.

```bash
git checkout develop
git pull

npm install        # package.json이 바뀌었을 수 있으니 항상 먼저
npm run build       # 타입 에러부터 확인 — 여기서 걸러지는 게 제일 빠름
npm run dev          # http://localhost:3000/api-docs 에서 Swagger로 실제 호출까지 확인
```

주의: 로컬 서버든, 실서버(134.185.108.221)든 전부 같은 Supabase 프로젝트(같은 DB)를
보고 있다. 브랜치별로 DB가 분리되는 게 아니므로:

- 테스트용으로 만든 계정/리포트/견적 등은 확인 후 지워두기 (Supabase 대시보드 Table
  Editor에서 직접 지우거나, service role 키로 임시 스크립트 돌려서 정리)
- 회원가입 테스트할 땐 실제 존재하는 메일 도메인 필요 (Supabase가 존재하지 않는
  도메인은 거부함) — `본인이메일+test1@gmail.com` 같은 서브어드레싱 활용
- `landlord_auto_approval_policy`처럼 unique 제약이 걸린 테이블은 같은 조합으로
  두 번 넣으면 다른 사람 테스트와 충돌할 수 있음

### main으로 머지하기 전 체크리스트

1. `develop`에서 `npm run build` 통과 (타입 에러 없음)
2. `npm run dev`로 로컬 기동 확인, 바뀐 엔드포인트는 Swagger UI나 curl로 직접 호출해서
   응답 확인
3. 문제 없으면 `develop` → `main` 머지 후 푸시

## 프로젝트 구조

```
src/
  config/supabase.ts   # Supabase 클라이언트 (anon / service role)
  config/swagger.ts    # swagger-jsdoc 설정 (/api-docs)
  routes/               # 라우트 정의
  controllers/          # 라우트 핸들러 로직
  middleware/            # asyncHandler, 에러 핸들러, 인증 미들웨어
  types/index.ts         # DB 테이블 타입
  app.ts                 # express app + 라우터 연결
  server.ts              # 서버 진입점
```

## 담당자별 라우트

### 나 (기본 틀 + 인증/유저/임대인)

- `POST /api/auth/login`
- `POST /api/auth/signup`
- `PATCH /api/users/link-landlord`
- `GET /api/landlord/requests`
- `GET /api/landlord/requests/:id`
- `PATCH /api/landlord/requests/:id/approve`
- `POST /api/landlord/auto-approval-policy`
- `GET /api/landlord/properties`

> 임대인 라우트는 `reports.landlord_id` 컬럼이 있다고 가정하고 구현했음.
> 실제 스키마와 다르면 `src/controllers/landlord.controller.ts`의 쿼리를 맞춰서 수정 필요.
> `GET /api/landlord/properties`는 별도 `properties` 테이블이 아직 없어서, 리포트에 연결된
> tenant 목록으로 임시 대체함 — 테이블이 생기면 교체할 것.

**임대인-세입자 매칭 (초대 코드, db/008):** `properties` 테이블이 없어 세입자가
자기 `landlord_id`를 알 방법이 없던 문제를, 임대인이 회원가입 시 자동 발급받는
6자리 코드(`users.landlord_code`)로 임시 해결함. 세입자가 `PATCH
/api/users/link-landlord`에 그 코드를 보내면 `users.linked_landlord_id`가
채워지고, 이후 `POST /api/reports`에서 `landlord_id`를 생략하면 이 값을 대신
쓴다. `properties` 테이블이 생기면 이 매칭 로직은 걷어내고 교체할 것.

사진 업로드는 `POST /api/uploads` (multipart, 필드명 `file`)로 처리됨 —
본인(서버 오너) 담당, 이미 구현 완료. 한 번에 한 장씩 올리므로, 프론트는 사진 수만큼
호출해서 url을 모은 뒤 그 배열을 `POST /api/reports`의 `photo_urls`에 넣어 보내면 됨.
서버가 첫 번째 url을 대표 사진(`photo_url`)으로 함께 저장한다.

### 팀원A (AI 분석 & 경량 갈래)

- `POST /api/reports`
- `GET /api/reports`
- `GET /api/reports/:id`
- `POST /api/reports/analyze`
- `GET /api/manufacturer-as`

파일: `src/routes/reports.routes.ts`, `src/controllers/reports.controller.ts`

`tenant_id`는 body로 받지 않고 인증 토큰에서 꺼냄. `landlord_id`는 이제 생략
가능함 — 위 "임대인-세입자 매칭" 절에서 설명한 `linked_landlord_id`를 대신 쓴다.
`properties`(호실) 테이블이 없어 서버에서 세입자→임대인을 유도할 경로가 없다는
근본 문제는 그대로라, 이건 코드 기반의 임시 해결책이다.

`GET /api/reports`와 `GET /api/reports/:id`는 **본인 신고만** 반환함. 남의 신고 id로
조회하면 403이 아니라 404 — 403이면 그 id가 존재한다는 사실이 새기 때문.
임대인이 자기 소속 신고를 보는 경로는 `GET /api/landlord/requests`로 따로 있음.

**`POST /api/reports/analyze` 응답 스키마 (확정, 구현 완료):**

```ts
{
  category: 'plumbing' | 'electrical' | 'heating' | 'appliance'
          | 'door_window' | 'interior' | 'pest' | 'other',
  severity: 'low' | 'medium' | 'high' | 'emergency',
  recommended_path: 'self_fix' | 'manufacturer_as' | 'vendor_match',
  self_fix_guide: string | null   // recommended_path가 self_fix일 때만 채워짐
}
```

AI는 Gemini(`gemini-3.7-flash`)를 씀. responseSchema로 위 값 밖으로는 답할 수 없게
강제하고, 응답을 받은 뒤 서버에서 한 번 더 검증함 — 잘못된 category가 DB CHECK까지
흘러가 500으로 터지는 걸 막기 위해서.

이 API는 **분류만 하고 DB에 저장하지 않음.** 결과를 세입자에게 확인시킨 뒤
`POST /api/reports`로 넘겨서 저장하는 흐름.

Gemini는 이미지 URL을 대신 받아오지 않으므로 서버가 사진을 직접 내려받아 base64로
넘김. 그래서 `photo_urls`의 url은 서버에서 접근 가능해야 함(Supabase Storage의
public url이면 됨). 비용·응답시간 때문에 앞의 4장만 분석에 씀.

DB: `db/003_reports_photo_urls.sql`(photo_urls 컬럼 기록 + 백필),
`db/004_manufacturer_as_seed.sql`(제조사 A/S 시드 10건). 둘 다 재실행 안전.
004는 이미 적용해 둠.

### 팀원B (전문업체 매칭)

- `POST /api/vendors/match`
- `POST /api/quotes`
- `GET /api/quotes`
- `PATCH /api/quotes/:id/status`
- `POST /api/repair/schedule` — 방문 일정 등록 (타임라인에 `scheduled` 자동 기록)
- `GET /api/repair/schedule?reportId=` — 일정 조회
- `PATCH /api/repair/schedule/:id/confirm` — 일정 확정 (타임라인에 `confirmed` 기록)
- `POST /api/repair/status` — 수리 상태 변경 (타임라인에 이력 추가)
- `GET /api/repair/timeline?reportId=` — 이력 조회 + `currentStatus`

파일: `src/routes/{vendors,quotes,repair}.routes.ts`,
`src/controllers/{vendors,quotes,repair}.controller.ts`

DB: 테이블 DDL은 `supabase/schema.sql`에 이미 있음. B가 추가로 돌릴 것:

- `db/001_vendor_matching.sql` — vendors 데모 시딩 15건 (재실행 안전)
- `db/002_vendors_rating_active.sql` — **팀 공유 후 실행.** `vendors.rating` /
  `vendors.is_active` 컬럼 추가. `POST /api/vendors/match`가 `is_active`로
  필터하므로 이걸 돌려야 매칭 API가 동작함.

`quotes.status`는 DB 기본값이 `pending`이지만 B 범위에서는 `recommended` /
`selected` 두 값만 쓰며, `createQuote`가 `recommended`를 명시해서 넣음.
`quotes.is_outlier` 컬럼은 사용하지 않음 — median은 조회 시점에 계산함.

median / 이상치 판정 검증: `npx ts-node src/controllers/quotes.controller.check.ts`

---

각 스텁 함수에는 `// TODO(담당자): ...` 주석이 달려있으니 검색해서 채우면 됨.
