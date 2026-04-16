import { request } from "../request";

const base = "/party/organization-care";

export type CareSignalLevel = "低" | "中" | "高";
export type CareStatus = "待关怀" | "跟进中" | "已回访";

export interface OrganizationCareItem {
  id: string;
  employee_name: string;
  department?: string;
  signal_level: CareSignalLevel;
  care_type: string;
  owner?: string;
  care_note?: string;
  follow_up_at?: string;
  status: CareStatus;
  created_at?: string;
  updated_at?: string;
}

interface OrganizationCareListResponse {
  items?: OrganizationCareItem[];
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
  data: OrganizationCareItem[] | OrganizationCareListResponse,
): OrganizationCareItem[] => {
  if (Array.isArray(data)) return data;
  return Array.isArray(data?.items) ? data.items : [];
};

export const organizationCareApi = {
  async list(params: Record<string, string | number | boolean> = {}) {
    const search = buildSearch(params);
    const res = await request<OrganizationCareItem[] | OrganizationCareListResponse>(
      `${base}${search ? `?${search}` : ""}`,
    );
    return normalizeList(res);
  },
  detail: (id: string) => request<OrganizationCareItem>(`${base}/${encodeURIComponent(id)}`),
  create: (payload: Omit<OrganizationCareItem, "id" | "created_at" | "updated_at">) =>
    request<OrganizationCareItem>(base, { method: "POST", body: JSON.stringify(payload) }),
  update: (
    id: string,
    payload: Partial<Omit<OrganizationCareItem, "id" | "created_at" | "updated_at">>,
  ) =>
    request<OrganizationCareItem>(`${base}/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  exportReport: (params: Record<string, string | number | boolean> = {}) => {
    const search = buildSearch(params);
    return request<string>(`${base}/export/file${search ? `?${search}` : ""}`);
  },
};
