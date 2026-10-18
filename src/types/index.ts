/**
 * EduGuard Agent - TypeScript Type Definitions
 * Source of truth: Backend schemas and API specifications.
 */

export type SeverityLevel = 'Critical' | 'High' | 'Medium' | 'Low';

export interface User {
  user_id: string;
  name: string;
  role: string;
  employment_status: string; // 'Active' | 'Inactive'
  account_status: string; // 'Active' | 'Suspended' | 'Disabled'
}

export interface Permission {
  user_id: string;
  allowed_classes: string[];
  can_view_student_records: boolean;
  permission_level: string; // 'Standard' | 'Administrator'
  authorized_districts: string[];
}

export interface Student {
  student_id: string;
  name: string;
  class: string;
  district_id: string;
}

export interface AccessLog {
  log_id: string;
  user_id: string;
  student_id: string;
  action: 'view_record' | 'edit_record' | 'export_record' | string;
  timestamp: string; // 'YYYY-MM-DD HH:MM'
  result: 'success' | 'denied';
}

export interface Incident {
  incident_id: string;
  title: string;
  user_id: string;
  related_log_id: string;
  expected_risk: SeverityLevel;
  expected_recommendation: string;
}

export interface Analysis {
  incident_type: string;
  risk_level: string; // 'low' | 'medium' | 'high' | 'critical'
  evidence: string[];
  explanation: string;
  recommended_action: string;
  confidence: number;
  needs_human_review: boolean;
  policy_floor_applied?: boolean;
  policy_floor_reason?: string;
  model?: string;
  error?: string;
}

export interface DecisionRecord {
  decision: 'approve' | 'reject' | 'escalate';
  decided_by: string;
  note: string;
  decided_at: string;
}

export interface AnalysisRecord {
  incident_id: string;
  analysis: Analysis;
  decision: DecisionRecord | null;
  provider: string; // 'amd_direct' | 'gemini_flash' | 'policy_engine'
  model?: string;
  fallback_reason: string | null;
  analyzed_at: string;
}

export interface FlaggedAccount {
  user_id: string;
  name: string;
  role: string;
  employment_status: string;
  account_status: string;
  highest_severity: SeverityLevel;
  rules_triggered: string[];
  rule_severities: Record<string, string>;
  flagged_logs_count: number;
  related_incident_ids: string[];
  latest_activity: string;
  evidence_notes: string[];
}

export interface AuthUser {
  id: string;
  first_name: string;
  last_name: string;
  name: string;
  email: string;
  role: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface HealthResponse {
  status: string;
  data_dir: string;
  records: {
    users: number;
    permissions: number;
    students: number;
    access_logs: number;
    incidents: number;
  };
  integrity_issues: string[];
  gemini_configured?: boolean;
  amd_direct_configured: boolean;
  analysis_provider: string;
  env_file: string | null;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  linkedin: string;
  photo?: string;
  isPlaceholder?: boolean;
}
