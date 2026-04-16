import { request } from "../request";
import type {
  DashboardSkillRules,
  DashboardSkillRulesResponse,
  DashboardSkillResolveResponse,
} from "../types";

export const dashboardSkillApi = {
  getRules: () => request<DashboardSkillRulesResponse>("/dashboard-skills"),

  updateRules: (rules: DashboardSkillRules) =>
    request<{ rules: DashboardSkillRules }>("/dashboard-skills", {
      method: "PUT",
      body: JSON.stringify(rules),
    }),

  resolve: (department: string) => {
    const search = new URLSearchParams({ department });
    return request<DashboardSkillResolveResponse>(`/dashboard-skills/resolve?${search.toString()}`);
  },
};
