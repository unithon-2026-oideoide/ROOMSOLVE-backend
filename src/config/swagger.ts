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
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            report_id: { type: 'string', format: 'uuid' },
            vendor_id: { type: 'string', format: 'uuid' },
            price: { type: 'integer', example: 80000 },
            status: { type: 'string', example: 'pending' },
            is_outlier: { type: 'boolean' },
            created_at: { type: 'string', format: 'date-time' },
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
            region: { type: 'string', nullable: true },
            phone: { type: 'string', nullable: true },
            created_at: { type: 'string', format: 'date-time' },
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
