import { request } from "../request";

const base = "/party/directive-center";

export type DirectiveSla = "T+1" | "T+3";
export type DirectiveStatus = "待响应" | "分析中" | "已完成";

export interface DirectiveCenterItem {
  id: string;
  title: string;
  publish_at: string;
  sla: DirectiveSla;
  status: DirectiveStatus;
  summary?: string;
  enterprise_report_title?: string;
  created_at?: string;
  updated_at?: string;
}

interface DirectiveCenterListResponse {
  items?: DirectiveCenterItem[];
}

const buildSearch = (params: Record<string, string | number | boolean> = {}) => {
  return new URLSearchParams(
    Object.entries(params).reduce<Record<string, string>>((acc, [k, v]) => {
      acc[k] = String(v);
      return acc;
    }, {}),
  ).toString();
};

const normalizeList = (data: DirectiveCenterItem[] | DirectiveCenterListResponse): DirectiveCenterItem[] => {
  if (Array.isArray(data)) return data;
  return Array.isArray(data?.items) ? data.items : [];
};

export const directiveCenterApi = {
  async list(params: Record<string, string | number | boolean> = {}) {
    const search = buildSearch(params);
    const res = await request<DirectiveCenterItem[] | DirectiveCenterListResponse>(
      `${base}${search ? `?${search}` : ""}`,
    );
    return normalizeList(res);
  },
  detail: (id: string) => request<DirectiveCenterItem>(`${base}/${encodeURIComponent(id)}`),
  create: (payload: Omit<DirectiveCenterItem, "id" | "created_at" | "updated_at">) =>
    request<DirectiveCenterItem>(base, { method: "POST", body: JSON.stringify(payload) }),
  update: (
    id: string,
    payload: Partial<Omit<DirectiveCenterItem, "id" | "created_at" | "updated_at">>,
  ) =>
    request<DirectiveCenterItem>(`${base}/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  exportReport: (params: Record<string, string | number | boolean> = {}) => {
    const search = buildSearch(params);
    return request<string>(`${base}/export/file${search ? `?${search}` : ""}`);
  },
};
