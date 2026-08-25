// Supabase 테이블과 1:1 대응하는 타입 정의.
// DB 스키마가 바뀌면 이 파일도 함께 업데이트

export type UserRole = 'tenant' | 'landlord' | 'technician';

export interface User {
  id: string;
  name: string;
  role: UserRole;
  phone: string | null;
  created_at: string;
}

export type RecommendedPath = 'self_fix' | 'manufacturer_as' | 'vendor_match';

export interface Report {
  id: string;
  tenant_id: string;
  landlord_id: string;
  photo_url: string | null;
  description: string | null;
  category: string | null;
  severity: string | null;
  recommended_path: RecommendedPath | null;
  self_fix_guide: string | null;
  status: string;
  created_at: string;
}

export interface ManufacturerAsInfo {
  id: string;
  category: string;
  manufacturer_name: string;
  as_phone: string | null;
  as_url: string | null;
}

export interface Vendor {
  id: string;
  name: string;
  categories: string[];
  region: string | null;
  phone: string | null;
  created_at: string;
}

export interface Quote {
  id: string;
  report_id: string;
  vendor_id: string;
  price: number;
  status: string;
  is_outlier: boolean;
  created_at: string;
}

export interface LandlordAutoApprovalPolicy {
  id: string;
  landlord_id: string;
  category: string;
  auto_approve_limit: number;
  created_at: string;
}

export interface RepairSchedule {
  id: string;
  report_id: string;
  technician_id: string;
  scheduled_at: string;
  confirmed: boolean;
}

export interface RepairStatusTimeline {
  id: string;
  report_id: string;
  status: string;
  changed_at: string;
}
