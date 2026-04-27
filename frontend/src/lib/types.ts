export type ChangeElementType =
  | "PRODUCT_CREATED" | "PRODUCT_DELETED" | "PRODUCT_RECLASSIFIED"
  | "PRODUCT_TYPE_CHANGED" | "PRODUCT_NAME_CHANGED"
  | "ATTRIBUTE_VALUE" | "MULTIVALUE_CHANGED"
  | "REFERENCE_ADDED" | "REFERENCE_REMOVED" | "REFERENCE_SUPPRESSED"
  | "ASSET_LINKED" | "ASSET_UNLINKED" | "ASSET_SUPPRESSED"
  | "CLASSIFICATION_LINKED" | "CLASSIFICATION_UNLINKED"
  | "CONTAINER_ADDED" | "CONTAINER_REMOVED" | "CONTAINER_VALUE";

export interface ChangeRecord {
  id: number;
  change_element_type: ChangeElementType;
  step_product_id: string;
  attribute_id?: string | null;
  ref_type?: string | null;
  target_id?: string | null;
  qualifier_id?: string | null;
  unit_id?: string | null;
  lov_id?: string | null;
  current_value?: string | null;
  previous_value?: string | null;
  current_values?: unknown[] | null;
  previous_values?: unknown[] | null;
  step_container_id?: string | null;
  changed_by?: string | null;
  change_date: string;
  snapshot_id?: number | null;
  snapshot_week?: string | null;
  changed_hint: boolean;
}

export interface ChangeListResponse {
  total: number | null;
  has_more: boolean;
  next_cursor: string | null;
  items: ChangeRecord[];
}

export interface ProductListResponse {
  has_more: boolean;
  next_cursor: string | null;
  items: Product[];
}

export interface SnapshotListResponse {
  has_more: boolean;
  next_cursor: string | null;
  items: Snapshot[];
}

export interface FilterOptions {
  change_element_types: string[];
  attribute_ids: string[];
  qualifier_ids: string[];
  snapshot_weeks: string[];
  changed_by: string[];
  product_ids: string[];
}

export interface Snapshot {
  id: number; received_at: string; file_hash?: string | null;
  status: string; records_parsed: number; records_changed: number;
  snapshot_week?: string | null; error_log?: string | null;
}

export interface ClientConfig {
  client_name: string;
  logo_url?: string | null;
  primary_colour: string;
  step_base_url?: string | null;
  change_records_retention_days?: number | null;
  raw_xml_retention_days?: number | null;
  updated_at?: string | null;
}

export interface User {
  id: number; email: string; role: string;
  step_user_id?: string | null; active: boolean;
  must_change_password?: boolean;
  last_login?: string | null; created_at: string;
}

export type UserRole = "admin" | "editor" | "viewer";

export interface IngestCredentials {
  api_key: string;
  masked: string;
  header_name: string;
  endpoint: string;
  source: "db" | "env";
}

export interface RetentionRunResult {
  change_records_deleted: number;
  raw_xml_cleared: number;
  cutoff_change_records: string | null;
  cutoff_raw_xml: string | null;
}

export interface SecurityPolicies {
  jwt_expire_minutes: number;
  login_rate_limit_per_min: number;
  password_min_length: number;
  max_users: number;
  user_count: number;
  smtp_configured: boolean;
  env: string;
}

export interface Product {
  step_product_id: string;
  parent_id?: string | null;
  user_type_id?: string | null;
  change_count?: number | null;
  last_change_date?: string | null;
}

export interface ProductAttributeRow {
  attribute_id: string;
  qualifier_id?: string | null;
  unit_id?: string | null;
  lov_id?: string | null;
  value_text?: string | null;
  values_json?: unknown[] | null;
  kind: "single" | "multi";
  change_count: number;
  last_change_date?: string | null;
}

export interface ProductReferenceRow {
  ref_type: string;
  target_product_id: string;
  qualifier_id?: string | null;
  suppressed: boolean;
}

export interface ProductDetail {
  step_product_id: string;
  parent_id?: string | null;
  user_type_id?: string | null;
  names: { qualifier_id?: string | null; name_text?: string | null }[];
  attributes: ProductAttributeRow[];
  references: ProductReferenceRow[];
  classifications: string[];
  change_count: number;
  last_change_date?: string | null;
}

export interface NotificationRule {
  id: number; rule_name: string;
  // Legacy single-value fields — may be null when the rule uses multi-value lists
  change_element_type?: string | null;
  attribute_id?: string | null;
  qualifier_id?: string | null;
  // Multi-value filters
  change_element_types?: string[] | null;
  attribute_ids?: string[] | null;
  qualifier_ids?: string[] | null;
  ref_types?: string[] | null;
  target_ids?: string[] | null;
  notify_channel: string; notify_target: string;
  active: boolean; created_at: string;
}

export interface NotificationFilterOptions {
  change_element_types: string[];
  attribute_ids: string[];
  qualifier_ids: string[];
  ref_types: string[];
  target_ids: string[];
}
