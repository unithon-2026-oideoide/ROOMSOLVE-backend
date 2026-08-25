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

// 공용 카테고리. reports / vendors / manufacturer_as_info /
// landlord_auto_approval_policy 가 조인 키로 공유하며 DB에 CHECK 제약이 걸려 있다.
// 값을 추가/변경할 때는 supabase/schema.sql 의 네 테이블을 전부 같이 고칠 것.
export type RepairCategory =
  | 'plumbing'
  | 'electrical'
  | 'heating'
  | 'appliance'
  | 'door_window'
  | 'interior'
  | 'pest'
  | 'other';

export interface Report {
  id: string;
  tenant_id: string;
  landlord_id: string;
  // photo_urls가 실제 사진 목록이고, photo_url은 그중 대표 1장이다.
  // DB에서 photo_url만 NOT NULL이라 createReport가 photo_urls[0]을 채워 넣는다.
  photo_url: string;
  photo_urls: string[];
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
  categories: RepairCategory[];
  region: string | null; // 컬럼만 존재. 현재 매칭 필터에는 사용하지 않음
  phone: string | null;
  // rating / is_active 는 db/002_vendors_rating_active.sql 로 추가되는 컬럼.
  // 002를 실행하지 않으면 이 두 필드는 응답에 존재하지 않는다.
  rating: number;
  is_active: boolean;
  created_at: string;
}

export type QuoteStatus = 'recommended' | 'selected';

export interface Quote {
  id: string;
  report_id: string;
  vendor_id: string;
  price: number;
  status: QuoteStatus;
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
