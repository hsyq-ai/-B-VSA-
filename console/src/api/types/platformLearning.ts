export interface PlatformRuntimeSkill {
  id: string;
  name: string;
  description: string;
  content: string;
  department: string;
  source_chat_id: string;
  source_session_id: string;
  source_user_id: string;
  published_trigger_key: string;
  status: string;
  created_at: number;
  updated_at: number;
}

export interface PlatformRuntimeSkillListResponse {
  items: PlatformRuntimeSkill[];
  total: number;
}

export interface PlatformSkillAuditLog {
  id: string;
  ts: number;
  action: string;
  skill_id: string;
  skill_name: string;
  status_from: string;
  status_to: string;
  trigger_key: string;
  source_chat_id: string;
  actor_user_id: string;
  actor_name: string;
  note: string;
}

export interface PlatformSkillAuditLogListResponse {
  items: PlatformSkillAuditLog[];
  total: number;
}

export interface PlatformLearningSchedulerStatus {
  running: boolean;
  started_at: number;
  uptime_seconds: number;
  max_pending: number;
  max_retries: number;
  retry_base_seconds: number;
  retry_max_seconds: number;
  pending_count: number;
  running_count: number;
  total_enqueued: number;
  total_deduped: number;
  total_dropped: number;
  total_started: number;
  total_succeeded: number;
  total_failed: number;
  total_retried: number;
  next_due_in_seconds: number | null;
  running_keys: string[];
  pending_keys: string[];
  last_errors: Array<{
    ts: number;
    key: string;
    error: string;
  }>;
}
