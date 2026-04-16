import { request } from "../request";
import type {
  AgentOSActiveUserListResponse,
  AgentOSArtifactListResponse,
  AgentOSAuditRouteListResponse,
  AgentOSCollabRequestPayload,
  AgentOSCreateArtifactPayload,
  AgentOSCreateEvalPayload,
  AgentOSCreatePlanPayload,
  AgentOSCreateReplayPayload,
  AgentOSCreateRoomEventPayload,
  AgentOSCreateRoomPayload,
  AgentOSDuplicateHitsResponse,
  AgentOSEvalListResponse,
  AgentOSExecutePlanPayload,
  AgentOSIAPEnvelopePayload,
  AgentOSIAPMessagesResponse,
  AgentOSIAPSendResponse,
  AgentOSIAPSummaryResponse,
  AgentOSMailboxMessagesResponse,
  AgentOSMailboxOverviewResponse,
  AgentOSPlanDetailResponse,
  AgentOSPlanListResponse,
  AgentOSRegistryListResponse,
  AgentOSReplayListResponse,
  AgentOSRoomDetailResponse,
  AgentOSRoomEventsResponse,
  AgentOSRoomListResponse,
  AgentOSSceneLaunchPayload,
  AgentOSSceneLaunchResponse,
  AgentOSTraceDetailResponse,
  AgentOSTraceListResponse,
} from "../types";

export const agentOsApi = {
  listActiveUsers: () =>
    request<AgentOSActiveUserListResponse>("/agent-os/active-users"),

  listRegistry: (params?: { owner_user_id?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.owner_user_id) searchParams.append("owner_user_id", params.owner_user_id);
    const query = searchParams.toString();
    return request<AgentOSRegistryListResponse>(`/agent-os/registry${query ? `?${query}` : ""}`);
  },

  listMailboxOverview: (params?: { owner_user_id?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.owner_user_id) searchParams.append("owner_user_id", params.owner_user_id);
    const query = searchParams.toString();
    return request<AgentOSMailboxOverviewResponse>(
      `/agent-os/mailbox/overview${query ? `?${query}` : ""}`,
    );
  },

  listMailboxMessages: (agentId: string, params?: { direction?: string; limit?: number }) => {
    const searchParams = new URLSearchParams({ agent_id: agentId });
    if (params?.direction) searchParams.append("direction", params.direction);
    if (params?.limit) searchParams.append("limit", params.limit.toString());
    return request<AgentOSMailboxMessagesResponse>(
      `/agent-os/mailbox/messages?${searchParams.toString()}`,
    );
  },

  listIapMessages: (params?: { owner_user_id?: string; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.owner_user_id) searchParams.append("owner_user_id", params.owner_user_id);
    if (params?.limit) searchParams.append("limit", params.limit.toString());
    const query = searchParams.toString();
    return request<AgentOSIAPMessagesResponse>(`/agent-os/iap/messages${query ? `?${query}` : ""}`);
  },

  getDuplicateHits: (params?: { days?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.days) searchParams.append("days", params.days.toString());
    const query = searchParams.toString();
    return request<AgentOSDuplicateHitsResponse>(
      `/agent-os/audit/duplicate-hits${query ? `?${query}` : ""}`,
    );
  },

  cleanupAuditRoutes: (keepDays: number) =>
    request<{ deleted: number; keep_days: number }>(
      `/agent-os/audit/routes/cleanup?keep_days=${encodeURIComponent(String(keepDays))}`,
      {
        method: "POST",
      },
    ),

  sendIAP: (payload: AgentOSIAPEnvelopePayload) =>
    request<AgentOSIAPSendResponse>("/agent-os/iap/send", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  sendCollabRequest: (payload: AgentOSCollabRequestPayload) =>
    request<AgentOSIAPSendResponse>("/agent-os/collab/request", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  launchSceneLink: (payload: AgentOSSceneLaunchPayload) =>
    request<AgentOSSceneLaunchResponse>("/agent-os/scenes/launch", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getSummary: () =>
    request<AgentOSIAPSummaryResponse>("/agent-os/iap/summary"),

  listPlans: (params?: {
    owner_user_id?: string;
    room_id?: string;
    trace_id?: string;
    session_id?: string;
    status?: string;
    limit?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.owner_user_id) searchParams.append("owner_user_id", params.owner_user_id);
    if (params?.room_id) searchParams.append("room_id", params.room_id);
    if (params?.trace_id) searchParams.append("trace_id", params.trace_id);
    if (params?.session_id) searchParams.append("session_id", params.session_id);
    if (params?.status) searchParams.append("status", params.status);
    if (params?.limit) searchParams.append("limit", params.limit.toString());
    const query = searchParams.toString();
    return request<AgentOSPlanListResponse>(`/agent-os/plans${query ? `?${query}` : ""}`);
  },

  createPlan: (payload: AgentOSCreatePlanPayload) =>
    request<AgentOSPlanDetailResponse>("/agent-os/plans", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getPlan: (planId: string) =>
    request<AgentOSPlanDetailResponse>(`/agent-os/plans/${encodeURIComponent(planId)}`),

  executePlan: (planId: string, payload?: AgentOSExecutePlanPayload) =>
    request<{ ok: boolean; item?: Record<string, unknown> }>(
      `/agent-os/plans/${encodeURIComponent(planId)}/execute`,
      {
        method: "POST",
        body: JSON.stringify(payload || {}),
      },
    ),

  listRooms: (params?: { owner_user_id?: string; status?: string; room_type?: string; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.owner_user_id) searchParams.append("owner_user_id", params.owner_user_id);
    if (params?.status) searchParams.append("status", params.status);
    if (params?.room_type) searchParams.append("room_type", params.room_type);
    if (params?.limit) searchParams.append("limit", params.limit.toString());
    const query = searchParams.toString();
    return request<AgentOSRoomListResponse>(`/agent-os/rooms${query ? `?${query}` : ""}`);
  },

  createRoom: (payload: AgentOSCreateRoomPayload) =>
    request<AgentOSRoomDetailResponse>("/agent-os/rooms", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getRoom: (roomId: string) =>
    request<AgentOSRoomDetailResponse>(`/agent-os/rooms/${encodeURIComponent(roomId)}`),

  listRoomEvents: (roomId: string, params?: { limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.append("limit", params.limit.toString());
    const query = searchParams.toString();
    return request<AgentOSRoomEventsResponse>(
      `/agent-os/rooms/${encodeURIComponent(roomId)}/events${query ? `?${query}` : ""}`,
    );
  },

  createRoomEvent: (roomId: string, payload: AgentOSCreateRoomEventPayload) =>
    request<{ item: Record<string, unknown> }>(`/agent-os/rooms/${encodeURIComponent(roomId)}/events`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  listArtifacts: (params?: { room_id?: string; trace_id?: string; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.room_id) searchParams.append("room_id", params.room_id);
    if (params?.trace_id) searchParams.append("trace_id", params.trace_id);
    if (params?.limit) searchParams.append("limit", params.limit.toString());
    const query = searchParams.toString();
    return request<AgentOSArtifactListResponse>(`/agent-os/artifacts${query ? `?${query}` : ""}`);
  },

  createArtifact: (payload: AgentOSCreateArtifactPayload) =>
    request<{ item: Record<string, unknown> }>("/agent-os/artifacts", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  listTraces: (params?: { owner_user_id?: string; room_id?: string; status?: string; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.owner_user_id) searchParams.append("owner_user_id", params.owner_user_id);
    if (params?.room_id) searchParams.append("room_id", params.room_id);
    if (params?.status) searchParams.append("status", params.status);
    if (params?.limit) searchParams.append("limit", params.limit.toString());
    const query = searchParams.toString();
    return request<AgentOSTraceListResponse>(`/agent-os/traces${query ? `?${query}` : ""}`);
  },

  getTrace: (traceId: string) =>
    request<AgentOSTraceDetailResponse>(`/agent-os/traces/${encodeURIComponent(traceId)}`),

  listEvals: (params?: { owner_user_id?: string; trace_id?: string; status?: string; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.owner_user_id) searchParams.append("owner_user_id", params.owner_user_id);
    if (params?.trace_id) searchParams.append("trace_id", params.trace_id);
    if (params?.status) searchParams.append("status", params.status);
    if (params?.limit) searchParams.append("limit", params.limit.toString());
    const query = searchParams.toString();
    return request<AgentOSEvalListResponse>(`/agent-os/evals${query ? `?${query}` : ""}`);
  },

  createEval: (payload: AgentOSCreateEvalPayload) =>
    request<{ item: Record<string, unknown> }>("/agent-os/evals", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  listReplays: (params?: { owner_user_id?: string; trace_id?: string; status?: string; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.owner_user_id) searchParams.append("owner_user_id", params.owner_user_id);
    if (params?.trace_id) searchParams.append("trace_id", params.trace_id);
    if (params?.status) searchParams.append("status", params.status);
    if (params?.limit) searchParams.append("limit", params.limit.toString());
    const query = searchParams.toString();
    return request<AgentOSReplayListResponse>(`/agent-os/replays${query ? `?${query}` : ""}`);
  },

  createReplay: (payload: AgentOSCreateReplayPayload) =>
    request<{ item: Record<string, unknown> }>("/agent-os/replays", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  listAuditRoutes: (params?: { days?: number; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.days) searchParams.append("days", params.days.toString());
    if (params?.limit) searchParams.append("limit", params.limit.toString());
    const query = searchParams.toString();
    return request<AgentOSAuditRouteListResponse>(
      `/agent-os/audit/routes${query ? `?${query}` : ""}`,
    );
  },
};
