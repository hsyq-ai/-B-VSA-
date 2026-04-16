import { request } from "../request";
import type {
  ExpertCenterSkillResolveResponse,
  ExpertCenterSkillRules,
  ExpertCenterSkillRulesResponse,
} from "../types";

export const expertCenterSkillApi = {
  getExpertCenterRules: () => request<ExpertCenterSkillRulesResponse>("/expert-center-skills"),

  updateExpertCenterRules: (rules: ExpertCenterSkillRules) =>
    request<{ rules: ExpertCenterSkillRules }>("/expert-center-skills", {
      method: "PUT",
      body: JSON.stringify(rules),
    }),

  resolveExpertCenterSkills: (department: string) => {
    const search = new URLSearchParams({ department });
    return request<ExpertCenterSkillResolveResponse>(
      `/expert-center-skills/resolve?${search.toString()}`,
    );
  },
};
