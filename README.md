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
- `ANTHROPIC_API_KEY` (팀원A의 AI 분석 기능에서 사용)

`.env`는 절대 커밋하지 않는다 — `.gitignore`에 포함되어 있는지 항상 확인.

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
- `PATCH /api/users/:id/role`
- `GET /api/landlord/requests`
- `GET /api/landlord/requests/:id`
- `PATCH /api/landlord/requests/:id/approve`
- `POST /api/landlord/auto-approval-policy`
- `GET /api/landlord/properties`

> 임대인 라우트는 `reports.landlord_id` 컬럼이 있다고 가정하고 구현했음.
> 실제 스키마와 다르면 `src/controllers/landlord.controller.ts`의 쿼리를 맞춰서 수정 필요.
> `GET /api/landlord/properties`는 별도 `properties` 테이블이 아직 없어서, 리포트에 연결된
> tenant 목록으로 임시 대체함 — 테이블이 생기면 교체할 것.

사진 업로드는 `POST /api/uploads` (multipart, 필드명 `file`)로 처리됨 —
본인(서버 오너) 담당, 이미 구현 완료. 프론트는 사진을 여기 먼저 올리고
받은 url을 `POST /api/reports`의 `photo_url` 필드에 넣어서 보내면 됨.

### 팀원A (AI 분석 & 경량 갈래)

- `POST /api/reports`
- `GET /api/reports`
- `GET /api/reports/:id`
- `POST /api/reports/analyze`
- `GET /api/manufacturer-as`

파일: `src/routes/reports.routes.ts`, `src/controllers/reports.controller.ts`

reports 생성 시 landlord_id 필수 — 프론트에서 세입자당 landlord_id를 미리 확보해서
같이 보내야 함 (현재 properties 테이블 없이 reports에 직접 저장하는 임시 구조)

**Day1 저녁에 `POST /api/reports/analyze` 응답 스키마 확정 후 팀 전체 공유 필요.**
현재 컨트롤러에 임시로 아래 스키마를 주석으로 남겨뒀음:

```ts
{
  category: string,
  severity: string,
  recommended_path: 'self_fix' | 'manufacturer_as' | 'vendor_match',
  self_fix_guide: string | null
}
```

### 팀원B (전문업체 매칭)

- `POST /api/vendors/match`
- `POST /api/quotes`
- `GET /api/quotes`
- `PATCH /api/quotes/:id/status`
- `repair_schedule` / `repair_status_timeline` 관련 API는 필요에 따라
  `src/controllers/repair.controller.ts`에 추가하고, 라우트가 정해지면
  `src/routes/repair.routes.ts`를 새로 만들어 `app.ts`에 연결하면 됨.

파일: `src/routes/vendors.routes.ts`, `src/routes/quotes.routes.ts`,
`src/controllers/vendors.controller.ts`, `src/controllers/quotes.controller.ts`

---

각 스텁 함수에는 `// TODO(담당자): ...` 주석이 달려있으니 검색해서 채우면 됨.
