export interface AgentOSActiveUser {
  user_id: string;
  name: string;
  department?: string;
  position?: string;
}

export interface AgentOSActiveUserListResponse {
  items: AgentOSActiveUser[];
  total: number;
}

export interface AgentOSIAPEnvelopePayload {
  to_agent_id: string;
  from_agent_id?: string;
  intent: string;
  trace_id?: string;
  payload?: Record<string, unknown>;
  allow_cross_user?: boolean;
}

export interface AgentOSCollabRequestPayload {
  target_user_id: string;
  topic: string;
  content: string;
  trace_id?: string;
}

export interface AgentOSIAPSummaryResponse {
  summary: {
    total: number;
    by_route_result: Record<string, number>;
  };
}

export interface AgentOSRegistryItem {
  agent_id: string;
  agent_type?: string;
  owner_user_id?: string;
  status?: string;
  sandbox_ref?: string;
  memory_root?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentOSRegistryListResponse {
  items: AgentOSRegistryItem[];
  total: number;
}

export interface AgentOSMailboxMessageItem {
  entry_id?: string;
  envelope_id?: string;
  direction?: string;
  intent?: string;
  from_agent_id?: string;
  to_agent_id?: string;
  status?: string;
  summary?: string;
  created_at?: string;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface AgentOSMailboxOverviewItem {
  agent_id: string;
  agent_type?: string;
  owner_user_id?: string;
  status?: string;
  sandbox_ref?: string;
  memory_root?: string;
  mailbox_root?: string;
  inbox_total?: number;
  outbox_total?: number;
  recent_inbox?: AgentOSMailboxMessageItem[];
  recent_outbox?: AgentOSMailboxMessageItem[];
}

export interface AgentOSMailboxOverviewResponse {
  items: AgentOSMailboxOverviewItem[];
  total: number;
}

export interface AgentOSMailboxMessagesResponse {
  items: AgentOSMailboxMessageItem[];
  total: number;
}

export interface AgentOSIAPMessageItem {
  envelope_id?: string;
  intent?: string;
  from_agent_id?: string;
  to_agent_id?: string;
  route_result?: string;
  created_at?: string;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface AgentOSIAPMessagesResponse {
  items: AgentOSIAPMessageItem[];
  total: number;
}

export interface AgentOSDuplicateHitsResponse {
  duplicate_hit_count: number;
  days: number;
  [key: string]: unknown;
}

export interface AgentOSAuditRouteItem {
  user_id?: string;
  source_user_name?: string;
  target_user_name?: string;
  status?: string;
  detail?: string;
  task_id?: string;
  trace_id?: string;
  conversation_key?: string;
  route_result?: string;
  created_at?: string;
}

export interface AgentOSAuditRouteListResponse {
  items: AgentOSAuditRouteItem[];
  total: number;
  days: number;
}

export interface AgentOSSceneLaunchPayload {
  scene_key?: string;
  scene_label?: string;
  scene_skill?: string;
  scene_prompt?: string;
  scene_session_id?: string;
  scene_context?: Record<string, unknown>;
  allow_cross_user?: boolean;
}

export interface AgentOSSceneLaunchResponse {
  ok: boolean;
  scene_key: string;
  scene_label: string;
  scene_skill: string;
  session_id: string;
  conversation_key: string;
  trace_id?: string;
  room_id?: string;
  target_count: number;
  targets?: Record<string, unknown>[];
  items?: Record<string, unknown>[];
}

export interface AgentOSIAPSendResponse {
  ok: boolean;
  duplicate: boolean;
  item?: Record<string, unknown>;
}

export interface AgentOSPlanStepItem {
  title?: string;
  description?: string;
  status?: string;
  owner_user_id?: string;
  depends_on?: string[];
  [key: string]: unknown;
}

export interface AgentOSPlanItem {
  plan_id: string;
  owner_user_id: string;
  room_id?: string;
  trace_id?: string;
  session_id?: string;
  title?: string;
  goal?: string;
  status?: string;
  source?: string;
  steps?: AgentOSPlanStepItem[];
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface AgentOSPlanListResponse {
  items: AgentOSPlanItem[];
  total: number;
}

export interface AgentOSPlanDetailResponse {
  item: AgentOSPlanItem;
  room?: AgentOSRoomItem | null;
}

export interface AgentOSCreatePlanPayload {
  title?: string;
  goal: string;
  room_id?: string;
  trace_id?: string;
  session_id?: string;
  source?: string;
  status?: string;
  steps?: AgentOSPlanStepItem[];
  metadata?: Record<string, unknown>;
}

export interface AgentOSExecutePlanPayload {
  status?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentOSRoomItem {
  room_id: string;
  room_key: string;
  title: string;
  room_type: string;
  status: string;
  owner_user_id: string;
  source_agent_id?: string;
  target_agent_id?: string;
  trace_id?: string;
  session_id?: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface AgentOSRoomMemberItem {
  room_id: string;
  member_id: string;
  member_type: string;
  role?: string;
  display_name?: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface AgentOSRoomEventItem {
  event_id: string;
  room_id: string;
  event_type: string;
  actor_user_id?: string;
  actor_agent_id?: string;
  trace_id?: string;
  summary?: string;
  payload?: Record<string, unknown>;
  created_at?: string;
}

export interface AgentOSRoomListResponse {
  items: AgentOSRoomItem[];
  total: number;
}

export interface AgentOSRoomDetailResponse {
  item: AgentOSRoomItem;
  members: AgentOSRoomMemberItem[];
}

export interface AgentOSRoomEventsResponse {
  items: AgentOSRoomEventItem[];
  total: number;
  room: AgentOSRoomItem;
}

export interface AgentOSCreateRoomPayload {
  room_key?: string;
  title?: string;
  room_type?: string;
  status?: string;
  trace_id?: string;
  session_id?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentOSCreateRoomEventPayload {
  event_type: string;
  trace_id?: string;
  actor_agent_id?: string;
  summary?: string;
  payload?: Record<string, unknown>;
}

export interface AgentOSArtifactItem {
  artifact_id: string;
  room_id?: string;
  trace_id?: string;
  owner_user_id?: string;
  step_id?: string;
  artifact_type?: string;
  title?: string;
  uri?: string;
  mime_type?: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface AgentOSArtifactListResponse {
  items: AgentOSArtifactItem[];
  total: number;
}

export interface AgentOSCreateArtifactPayload {
  room_id?: string;
  trace_id?: string;
  step_id?: string;
  artifact_type?: string;
  title?: string;
  uri?: string;
  mime_type?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentOSTraceEventItem {
  event_id: string;
  trace_id: string;
  room_id?: string;
  owner_user_id?: string;
  event_type: string;
  actor_user_id?: string;
  actor_agent_id?: string;
  status?: string;
  summary?: string;
  payload?: Record<string, unknown>;
  created_at?: string;
}

export interface AgentOSTraceDetailResponse {
  trace_id: string;
  room_id?: string;
  event_count: number;
  status_counts: Record<string, number>;
  items: AgentOSTraceEventItem[];
}

export interface AgentOSTraceListItem {
  trace_id: string;
  room_id?: string;
  owner_user_id?: string;
  latest_event_type?: string;
  latest_status?: string;
  latest_summary?: string;
  last_event_at?: string;
  started_at?: string;
  event_count: number;
}

export interface AgentOSTraceListResponse {
  items: AgentOSTraceListItem[];
  total: number;
}

export interface AgentOSEvalItem {
  eval_id: string;
  trace_id?: string;
  room_id?: string;
  owner_user_id?: string;
  title?: string;
  status?: string;
  dataset?: string;
  metric?: string;
  summary?: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface AgentOSEvalListResponse {
  items: AgentOSEvalItem[];
  total: number;
}

export interface AgentOSCreateEvalPayload {
  title?: string;
  trace_id?: string;
  room_id?: string;
  dataset?: string;
  metric?: string;
  summary?: string;
  status?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentOSReplayItem {
  replay_id: string;
  trace_id?: string;
  room_id?: string;
  owner_user_id?: string;
  title?: string;
  status?: string;
  source?: string;
  summary?: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface AgentOSReplayListResponse {
  items: AgentOSReplayItem[];
  total: number;
}

export interface AgentOSCreateReplayPayload {
  title?: string;
  trace_id?: string;
  room_id?: string;
  source?: string;
  summary?: string;
  status?: string;
  metadata?: Record<string, unknown>;
}
