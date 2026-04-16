import { request } from "../request";
import type {
  DigitalEmployeeListResponse,
  PromptTemplate,
  PromptTemplateListResponse,
  PromptTemplateResolveResponse,
  PromptTemplateScanResponse,
} from "../types";

export const promptTemplateApi = {
  listPromptTemplates: () =>
    request<PromptTemplateListResponse>("/prompt-templates"),

  createPromptTemplate: (body: Partial<PromptTemplate>) =>
    request<{ item: PromptTemplate }>("/prompt-templates", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updatePromptTemplate: (id: string, body: Partial<PromptTemplate>) =>
    request<{ item: PromptTemplate }>(`/prompt-templates/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  deletePromptTemplate: (id: string) =>
    request<{ success: boolean; id: string }>(
      `/prompt-templates/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    ),

  resolvePromptTemplate: (params: Record<string, string>) => {
    const search = new URLSearchParams(params);
    return request<PromptTemplateResolveResponse>(
      `/prompt-templates/resolve?${search.toString()}`,
    );
  },

  listDigitalEmployees: () =>
    request<DigitalEmployeeListResponse>("/prompt-templates/digital-employees"),

  importSkillsAsTemplates: (body: {
    overwrite?: boolean;
    include_disabled?: boolean;
    category?: string;
    agent_key?: string;
    agent_name?: string;
  }) =>
    request<{
      created: number;
      updated: number;
      skipped: number;
      imported: string[];
    }>("/prompt-templates/import-skills", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  scanPromptTemplate: (body: {
    prompt_text: string;
    runtime_profile?: "standard" | "isolated";
  }) =>
    request<PromptTemplateScanResponse>("/prompt-templates/scan", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
