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
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            role: { type: 'string', enum: ['tenant', 'landlord', 'technician'] },
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
            category: {
              type: 'string',
              nullable: true,
              enum: ['plumbing', 'electrical', 'heating', 'appliance', 'door_window', 'interior', 'pest', 'other'],
            },
            severity: { type: 'string', nullable: true, enum: ['low', 'medium', 'high', 'emergency'] },
            recommended_path: {
              type: 'string',
              nullable: true,
              enum: ['self_fix', 'manufacturer_as', 'vendor_match'],
            },
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
            category: {
              type: 'string',
              enum: ['plumbing', 'electrical', 'heating', 'appliance', 'door_window', 'interior', 'pest', 'other'],
            },
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
          },
        },
        Vendor: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            categories: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['plumbing', 'electrical', 'heating', 'appliance', 'door_window', 'interior', 'pest', 'other'],
              },
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
            category: {
              type: 'string',
              enum: ['plumbing', 'electrical', 'heating', 'appliance', 'door_window', 'interior', 'pest', 'other'],
            },
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
