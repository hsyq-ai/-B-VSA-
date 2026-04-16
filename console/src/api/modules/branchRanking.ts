import { request } from "../request";

const base = "/party/branch-ranking";

export type BranchRankingStatus = "参评中" | "已评定";

export interface BranchRankingItem {
  id: string;
  branch_name: string;
  score: number;
  candidate_count?: number;
  recommendation?: string;
  status: BranchRankingStatus;
  created_at?: string;
  updated_at?: string;
}

interface BranchRankingListResponse {
  items?: BranchRankingItem[];
}

const buildSearch = (params: Record<string, string | number | boolean> = {}) => {
  return new URLSearchParams(
    Object.entries(params).reduce<Record<string, string>>((acc, [k, v]) => {
      acc[k] = String(v);
      return acc;
    }, {}),
  ).toString();
};

const normalizeList = (data: BranchRankingItem[] | BranchRankingListResponse): BranchRankingItem[] => {
  if (Array.isArray(data)) return data;
  return Array.isArray(data?.items) ? data.items : [];
};

export const branchRankingApi = {
  async list(params: Record<string, string | number | boolean> = {}) {
    const search = buildSearch(params);
    const res = await request<BranchRankingItem[] | BranchRankingListResponse>(
      `${base}${search ? `?${search}` : ""}`,
    );
    return normalizeList(res);
  },
  detail: (id: string) => request<BranchRankingItem>(`${base}/${encodeURIComponent(id)}`),
  create: (payload: Omit<BranchRankingItem, "id" | "created_at" | "updated_at">) =>
    request<BranchRankingItem>(base, { method: "POST", body: JSON.stringify(payload) }),
  update: (
    id: string,
    payload: Partial<Omit<BranchRankingItem, "id" | "created_at" | "updated_at">>,
  ) =>
    request<BranchRankingItem>(`${base}/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  exportReport: (params: Record<string, string | number | boolean> = {}) => {
    const search = buildSearch(params);
    return request<string>(`${base}/export/file${search ? `?${search}` : ""}`);
  },
};
