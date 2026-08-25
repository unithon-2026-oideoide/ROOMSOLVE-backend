import swaggerJSDoc from 'swagger-jsdoc';

const swaggerSpec = swaggerJSDoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'ROOMSOLVE API',
      version: '1.0.0',
      description: '집 하자보수 매칭 플랫폼 백엔드 API',
    },
    servers: [
      { url: 'http://localhost:3000', description: '개발 환경' },
      { url: 'http://134.185.108.221:3000', description: '실 서버' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Supabase Auth의 access_token을 Authorization: Bearer {token} 형태로 전달',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string', example: '잘못된 요청입니다.' },
          },
        },
        // 아래 네 개는 여러 스키마/요청 바디가 공유하는 enum이라 여기 한 곳에서만
        // 정의하고 나머지는 $ref로 참조한다. 값이 바뀌면(=DB CHECK 제약이 바뀌면)
        // 여기 하나만 고치면 된다.
        UserRole: {
          type: 'string',
          enum: ['tenant', 'landlord', 'technician'],
        },
        Category: {
          type: 'string',
          enum: ['plumbing', 'electrical', 'heating', 'appliance', 'door_window', 'interior', 'pest', 'other'],
        },
        Severity: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'emergency'],
        },
        RecommendedPath: {
          type: 'string',
          enum: ['self_fix', 'manufacturer_as', 'vendor_match'],
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            role: { $ref: '#/components/schemas/UserRole' },
            phone: { type: 'string', nullable: true },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        AuthSession: {
          type: 'object',
          description: 'Supabase Auth 세션 (이메일 인증 대기 중이면 null)',
          nullable: true,
          properties: {
            access_token: { type: 'string' },
            refresh_token: { type: 'string' },
            token_type: { type: 'string', example: 'bearer' },
            expires_in: { type: 'integer', example: 3600 },
            expires_at: { type: 'integer' },
          },
        },
        Report: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            tenant_id: { type: 'string', format: 'uuid' },
            landlord_id: { type: 'string', format: 'uuid' },
            photo_url: { type: 'string', format: 'uri' },
            description: { type: 'string', nullable: true },
            category: { allOf: [{ $ref: '#/components/schemas/Category' }], nullable: true },
            severity: { allOf: [{ $ref: '#/components/schemas/Severity' }], nullable: true },
            recommended_path: { allOf: [{ $ref: '#/components/schemas/RecommendedPath' }], nullable: true },
            self_fix_guide: { type: 'string', nullable: true },
            status: { type: 'string', example: 'requested' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        LandlordAutoApprovalPolicy: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            landlord_id: { type: 'string', format: 'uuid' },
            category: { $ref: '#/components/schemas/Category' },
            auto_approve_limit: { type: 'integer', example: 50000 },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        Quote: {
          description: '견적 원본 레코드 (DB row 그대로). GET /api/quotes 목록 조회에서는 is_outlier 대신 isOutlier/outlierReason이 계산되어 내려온다.',
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            report_id: { type: 'string', format: 'uuid' },
            vendor_id: { type: 'string', format: 'uuid' },
            price: { type: 'integer', example: 80000 },
            status: { type: 'string', enum: ['recommended', 'selected'] },
            is_outlier: { type: 'boolean', description: 'DB 컬럼이지만 사용하지 않음 (항상 false)' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        QuoteWithOutlierInfo: {
          description: 'GET /api/quotes 목록의 각 항목 — is_outlier 컬럼 대신 조회 시점에 계산한 isOutlier/outlierReason을 담음.',
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            report_id: { type: 'string', format: 'uuid' },
            vendor_id: { type: 'string', format: 'uuid' },
            price: { type: 'integer', example: 80000 },
            status: { type: 'string', enum: ['recommended', 'selected'] },
            created_at: { type: 'string', format: 'date-time' },
            isOutlier: { type: 'boolean', description: '해당 report 견적들의 중앙값 * 2를 초과하면 true' },
            outlierReason: { type: 'string', nullable: true, example: '평균 대비 과도하게 높음' },
            vendor: {
              type: 'object',
              description: '견적을 낸 업체 정보 (vendors 조인). 견적 비교 화면의 업체명 표시용.',
              properties: {
                id: { type: 'string', format: 'uuid' },
                name: { type: 'string', example: '가온하우스설비' },
                rating: { type: 'number', example: 4.6 },
                phone: { type: 'string', nullable: true },
              },
            },
          },
        },
        ApplianceJudgement: {
          description:
            'POST /api/reports/analyze 의 가전 판정. 가전이 아니면 appliance 자체가 null. 보충 질문이 남아 있으면 questions 에 다음 질문이 담기고 liability 는 null.',
          type: 'object',
          properties: {
            applianceType: {
              type: 'string',
              enum: ['aircon', 'boiler', 'induction', 'refrigerator', 'washer'],
            },
            questions: {
              type: 'array',
              description: '아직 답을 받지 못한 보충 질문. 비어 있으면 판정이 끝난 것.',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', enum: ['ownership', 'purchase_age'] },
                  text: { type: 'string', example: '이 가전은 임대인이 제공한 것인가요?' },
                  options: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: { value: { type: 'string' }, label: { type: 'string' } },
                    },
                  },
                },
              },
            },
            liability: {
              type: 'string',
              nullable: true,
              enum: ['tenant', 'manufacturer_warranty', 'landlord', 'negotiable'],
              description:
                'tenant=임차인 구매 / manufacturer_warranty=보증기간 내 무상 / landlord=빌트인 기본설비(민법 623조) / negotiable=옵션 가전, 특약에 따라 갈림',
            },
            basis: { type: 'string', description: '판정 근거' },
            notice: { type: 'string', description: '세입자에게 보여줄 안내 문구' },
            warning: {
              type: 'string',
              nullable: true,
              description: '보증기간 내일 때 사설 업체 이용 시 유상 전환 경고',
            },
            confidence: {
              type: 'number',
              nullable: true,
              description: '판정 확신도 0~1. negotiable 이나 연차 모름이면 낮게 나온다.',
            },
            blockVendorMatch: {
              type: 'boolean',
              description: 'true 면 업체 매칭으로 넘기지 말고 제조사 A/S 안내로 종료할 것',
            },
          },
        },
        ReplacementAdvice: {
          description:
            'GET /api/quotes 의 수리/교체 권장. 수리 예상비(견적 중앙값)가 동급 신품가의 60% 이상이면 replace.',
          type: 'object',
          properties: {
            repairEstimate: {
              type: 'integer',
              example: 235000,
              description: '수리 예상비. 해당 리포트 견적들의 중앙값을 쓴다(이상치 견적 하나에 판정이 휘둘리지 않도록).',
            },
            replacementPrice: {
              type: 'integer',
              example: 700000,
              description: '동급 신품가. appliance_reference_price 의 해당 종류 최저가(기본형).',
            },
            recommendation: { type: 'string', enum: ['repair', 'replace'] },
            reason: { type: 'string', example: '수리 예상비가 동급 신품가(벽걸이 기본형)의 34%로 60% 미만입니다. 수리가 낫습니다.' },
          },
        },
        Vendor: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            categories: {
              type: 'array',
              items: { $ref: '#/components/schemas/Category' },
            },
            region: { type: 'string', nullable: true, description: '컬럼만 존재 — 매칭 필터에는 아직 미사용' },
            phone: { type: 'string', nullable: true },
            rating: { type: 'number', description: 'db/002_vendors_rating_active.sql 실행 후에만 응답에 존재' },
            is_active: { type: 'boolean', description: 'db/002_vendors_rating_active.sql 실행 후에만 응답에 존재. POST /api/vendors/match가 이 값으로 필터링함' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        RepairSchedule: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            report_id: { type: 'string', format: 'uuid' },
            technician_id: { type: 'string', format: 'uuid' },
            scheduled_at: { type: 'string', format: 'date-time' },
            confirmed: { type: 'boolean' },
          },
        },
        RepairStatusTimelineEntry: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            report_id: { type: 'string', format: 'uuid' },
            status: {
              type: 'string',
              description: 'DB에 CHECK 제약 없는 자유 문자열. 프론트와 맞춘 값은 scheduled/confirmed/in_progress/done 정도.',
              example: 'confirmed',
            },
            changed_at: { type: 'string', format: 'date-time' },
          },
        },
        ManufacturerAsInfo: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            category: { $ref: '#/components/schemas/Category' },
            manufacturer_name: { type: 'string' },
            as_phone: { type: 'string', nullable: true },
            as_url: { type: 'string', nullable: true },
          },
        },
      },
    },
  },
  apis: ['./src/routes/*.routes.ts'],
});

export default swaggerSpec;
