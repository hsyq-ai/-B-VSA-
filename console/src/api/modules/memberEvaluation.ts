import { request } from "../request";

const base = "/party/member-evaluation";

export type EvaluationLevel = "优秀" | "合格" | "一般";
export type CandidateStatus = "未入选" | "候选中" | "已推荐";

export interface MemberEvaluationItem {
  id: string;
  member_name: string;
  branch_name: string;
  level: EvaluationLevel;
  score: number;
  reviewer?: string;
  remark?: string;
  candidate_status?: CandidateStatus;
  candidate_reason?: string;
  candidate_rank?: number;
  candidate_updated_at?: string;
  created_at?: string;
  updated_at?: string;
}

interface MemberEvaluationListResponse {
  items?: MemberEvaluationItem[];
}

const buildSearch = (params: Record<string, string | number | boolean> = {}) => {
  return new URLSearchParams(
    Object.entries(params).reduce<Record<string, string>>((acc, [k, v]) => {
      acc[k] = String(v);
      return acc;
    }, {}),
  ).toString();
};

const normalizeList = (
  data: MemberEvaluationItem[] | MemberEvaluationListResponse,
): MemberEvaluationItem[] => {
  if (Array.isArray(data)) return data;
  return Array.isArray(data?.items) ? data.items : [];
};

export const memberEvaluationApi = {
  async list(params: Record<string, string | number | boolean> = {}) {
    const search = buildSearch(params);
    const res = await request<MemberEvaluationItem[] | MemberEvaluationListResponse>(
      `${base}${search ? `?${search}` : ""}`,
    );
    return normalizeList(res);
  },
  detail: (id: string) => request<MemberEvaluationItem>(`${base}/${encodeURIComponent(id)}`),
  create: (payload: Omit<MemberEvaluationItem, "id" | "created_at" | "updated_at">) =>
    request<MemberEvaluationItem>(base, { method: "POST", body: JSON.stringify(payload) }),
  update: (
    id: string,
    payload: Partial<Omit<MemberEvaluationItem, "id" | "created_at" | "updated_at">>,
  ) =>
    request<MemberEvaluationItem>(`${base}/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  exportReport: (params: Record<string, string | number | boolean> = {}) => {
    const search = buildSearch(params);
    return request<string>(`${base}/export/file${search ? `?${search}` : ""}`);
  },
};
