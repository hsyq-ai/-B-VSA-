import { request } from "../request";
import type {
  PlatformRuntimeSkillListResponse,
  PlatformSkillAuditLogListResponse,
  PlatformLearningSchedulerStatus,
} from "../types";

export const platformLearningApi = {
  getSchedulerStatus: () => request<PlatformLearningSchedulerStatus>("/platform-learning/scheduler/status"),

  listRuntimeSkills: (params?: { department?: string; status?: string; limit?: number }) => {
    const search = new URLSearchParams();
    if (params?.department) search.set("department", params.department);
    if (params?.status) search.set("status", params.status);
    if (params?.limit) search.set("limit", String(params.limit));
    const suffix = search.toString() ? `?${search.toString()}` : "";
    return request<PlatformRuntimeSkillListResponse>(`/platform-learning/skills${suffix}`);
  },

  evolveFromChat: (chatId: string) =>
    request<{ item: unknown }>(`/platform-learning/evolve/chat/${encodeURIComponent(chatId)}`, {
      method: "POST",
    }),

  updateRuntimeSkillStatus: (skillId: string, status: string) =>
    request<{ item: unknown }>(
      `/platform-learning/skills/${encodeURIComponent(skillId)}/status`,
      {
        method: "POST",
        body: JSON.stringify({ status }),
      },
    ),

  publishRuntimeSkill: (skillId: string) =>
    request<{ item: unknown; template: unknown }>(
      `/platform-learning/skills/${encodeURIComponent(skillId)}/publish`,
      {
        method: "POST",
      },
    ),

  reEvolveRuntimeSkill: (skillId: string) =>
    request<{ item: unknown }>(
      `/platform-learning/skills/${encodeURIComponent(skillId)}/re-evolve`,
      {
        method: "POST",
      },
    ),

  listAuditLogs: (params?: { skillId?: string; limit?: number }) => {
    const search = new URLSearchParams();
    if (params?.skillId) search.set("skill_id", params.skillId);
    if (params?.limit) search.set("limit", String(params.limit));
    const suffix = search.toString() ? `?${search.toString()}` : "";
    return request<PlatformSkillAuditLogListResponse>(`/platform-learning/audits${suffix}`);
  },
};
