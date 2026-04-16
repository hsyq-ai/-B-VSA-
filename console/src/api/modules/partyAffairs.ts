import { request } from "../request";

const base = "/party/affairs";

export type PartyAffairType = "三会一课" | "组织生活" | "通知公告" | "纪要归档";
export type PartyAffairStatus = "待处理" | "审批中" | "已办结";
export type PartyAffairPriority = "高" | "中" | "低";
export type PartyAffairReceiptStatus = "待回执" | "回执中" | "已完成";

export interface PartyAffairItem {
  id: string;
  title: string;
  type: PartyAffairType;
  status: PartyAffairStatus;
  assignee?: string;
  assignee_user_id?: string;
  target_department?: string;
  deadline?: string;
  summary?: string;
  biz_domain?: string;
  module?: string;
  task_id?: string;
  stage?: string;
  priority?: PartyAffairPriority;
  owner_role?: string;
  receipt_status?: PartyAffairReceiptStatus;
  next_action?: string;
  progress_percent?: number;
  conversation_key?: string;
  session_id?: string;
  trace_id?: string;
  audit_summary?: string;
  last_push_at?: string;
  last_push_target_count?: number;
  last_push_target_names?: string;
  created_at?: string;
  updated_at?: string;
}

export interface PartyAffairDispatchTarget {
  user_id: string;
  name: string;
  department?: string;
  position?: string;
  duplicate?: boolean;
  route_result?: string;
  detail?: string;
}

export interface PartyAffairDispatchResponse {
  ok: boolean;
  item: PartyAffairItem;
  dispatch: {
    action: string;
    intent: string;
    trace_id: string;
    conversation_key: string;
    session_id: string;
    target_count: number;
    routed_count: number;
    duplicate_count: number;
    targets: PartyAffairDispatchTarget[];
    failed_targets: PartyAffairDispatchTarget[];
  };
}

interface PartyAffairListResponse {
  items?: PartyAffairItem[];
}

const buildSearch = (params: Record<string, string | number | boolean> = {}) => {
  return new URLSearchParams(
    Object.entries(params).reduce<Record<string, string>>((acc, [k, v]) => {
      acc[k] = String(v);
      return acc;
    }, {}),
  ).toString();
};

const normalizeList = (data: PartyAffairItem[] | PartyAffairListResponse): PartyAffairItem[] => {
  if (Array.isArray(data)) return data;
  return Array.isArray(data?.items) ? data.items : [];
};

export const partyAffairsApi = {
  async list(params: Record<string, string | number | boolean> = {}) {
    const search = buildSearch(params);
    const res = await request<PartyAffairItem[] | PartyAffairListResponse>(
      `${base}${search ? `?${search}` : ""}`,
    );
    return normalizeList(res);
  },
  detail: (id: string) => request<PartyAffairItem>(`${base}/${encodeURIComponent(id)}`),
  create: (payload: Omit<PartyAffairItem, "id" | "created_at" | "updated_at">) =>
    request<PartyAffairItem>(base, { method: "POST", body: JSON.stringify(payload) }),
  update: (
    id: string,
    payload: Partial<Omit<PartyAffairItem, "id" | "created_at" | "updated_at">>,
  ) =>
    request<PartyAffairItem>(`${base}/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  dispatchTaskCard: (id: string) =>
    request<PartyAffairDispatchResponse>(`${base}/${encodeURIComponent(id)}/dispatch-task-card`, {
      method: "POST",
    }),
  completeTaskCard: (id: string) =>
    request<PartyAffairDispatchResponse>(`${base}/${encodeURIComponent(id)}/complete-task-card`, {
      method: "POST",
    }),
  exportReport: (params: Record<string, string | number | boolean> = {}) => {
    const search = buildSearch(params);
    return request<string>(`${base}/export/file${search ? `?${search}` : ""}`);
  },
};
