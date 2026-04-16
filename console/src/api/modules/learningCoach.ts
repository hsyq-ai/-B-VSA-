import { request } from "../request";

const base = "/party/learning-coach";

export type LearningMode = "微课推送" | "一对一辅导" | "集中学习";
export type LearningStatus = "待学习" | "学习中" | "已完成";

export interface LearningCoachItem {
  id: string;
  learner_name: string;
  topic: string;
  mode: LearningMode;
  status: LearningStatus;
  weakness_point?: string;
  micro_course_title?: string;
  mentor?: string;
  score?: number;
  due_at?: string;
  created_at?: string;
  updated_at?: string;
}

interface LearningCoachListResponse {
  items?: LearningCoachItem[];
}

const buildSearch = (params: Record<string, string | number | boolean> = {}) => {
  return new URLSearchParams(
    Object.entries(params).reduce<Record<string, string>>((acc, [k, v]) => {
      acc[k] = String(v);
      return acc;
    }, {}),
  ).toString();
};

const normalizeList = (data: LearningCoachItem[] | LearningCoachListResponse): LearningCoachItem[] => {
  if (Array.isArray(data)) return data;
  return Array.isArray(data?.items) ? data.items : [];
};

export const learningCoachApi = {
  async list(params: Record<string, string | number | boolean> = {}) {
    const search = buildSearch(params);
    const res = await request<LearningCoachItem[] | LearningCoachListResponse>(
      `${base}${search ? `?${search}` : ""}`,
    );
    return normalizeList(res);
  },
  detail: (id: string) => request<LearningCoachItem>(`${base}/${encodeURIComponent(id)}`),
  create: (payload: Omit<LearningCoachItem, "id" | "created_at" | "updated_at">) =>
    request<LearningCoachItem>(base, { method: "POST", body: JSON.stringify(payload) }),
  update: (
    id: string,
    payload: Partial<Omit<LearningCoachItem, "id" | "created_at" | "updated_at">>,
  ) =>
    request<LearningCoachItem>(`${base}/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  exportReport: (params: Record<string, string | number | boolean> = {}) => {
    const search = buildSearch(params);
    return request<string>(`${base}/export/file${search ? `?${search}` : ""}`);
  },
};
