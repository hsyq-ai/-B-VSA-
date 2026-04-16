export type ExperimentJobStatus =
  | "created"
  | "diagnosed"
  | "repaired"
  | "verified"
  | "failed";

export interface ExperimentJobHistoryItem {
  ts: number;
  event: string;
  detail: string;
}

export interface ResearchExperimentJob {
  id: string;
  title: string;
  department: string;
  created_by_user_id: string;
  created_by_name: string;
  experiment_goal: string;
  error_log: string;
  code_snippet: string;
  reproduce_command: string;
  attachments: string[];
  status: ExperimentJobStatus;
  business_state: "active" | "paused" | "closed";
  running_state: string;
  diagnosis: string;
  repair_plan: string;
  result_feedback: string;
  stage_summary: string;
  suggested_patch: string;
  reproduce_script: string;
  verification_summary: string;
  confidence: string;
  followup_chat_id: string;
  followup_session_id: string;
  created_at: number;
  updated_at: number;
  history: ExperimentJobHistoryItem[];
}

export interface ResearchExperimentJobCreatePayload {
  title: string;
  experiment_goal?: string;
  error_log?: string;
  code_snippet?: string;
  reproduce_command?: string;
  attachments?: string[];
}

export interface ResearchExperimentJobListResponse {
  items: ResearchExperimentJob[];
  total: number;
}

export interface ResearchExperimentJobResponse {
  item: ResearchExperimentJob;
}

export interface ResearchExperimentJobBusinessStatePayload {
  business_state: "active" | "paused" | "closed";
}
