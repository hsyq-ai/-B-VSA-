import { request } from "../request";

const base = "/party/activity-collab";

export type ActivityCollabType =
  | "主题党日"
  | "组织生活会"
  | "志愿服务"
  | "理论学习"
  | "宣讲活动"
  | "群团联建";

export type ActivityCollabStatus = "待发布" | "报名中" | "进行中" | "待复盘" | "已归档";
export type ActivityCollabReminderStatus = "未提醒" | "已提醒" | "持续催办";
export type ActivityCollabReceiptStatus = "待回执" | "回执中" | "已完成";

export interface ActivityCollabItem {
  id: string;
  title: string;
  activity_type: ActivityCollabType;
  status: ActivityCollabStatus;
  organizer?: string;
  target_branch?: string;
  location?: string;
  start_at?: string;
  end_at?: string;
  participants_planned?: number;
  participants_confirmed?: number;
  reminder_status: ActivityCollabReminderStatus;
  receipt_status: ActivityCollabReceiptStatus;
  summary?: string;
  created_at?: string;
  updated_at?: string;
  last_push_at?: string;
  last_push_target_count?: number;
  last_reminder_at?: string;
  last_receipt_request_at?: string;
  last_receipt_completed_at?: string;
}

interface ActivityCollabListResponse {
  items?: ActivityCollabItem[];
}

export interface ActivityCollabDispatchTarget {
  user_id: string;
  name: string;
  department?: string;
  position?: string;
  duplicate?: boolean;
  route_result?: string;
  detail?: string;
}

export interface ActivityCollabDispatchResponse {
  ok: boolean;
  item: ActivityCollabItem;
  dispatch: {
    action: string;
    intent: string;
    trace_id: string;
    conversation_key: string;
    session_id: string;
    target_count: number;
    routed_count: number;
    duplicate_count: number;
    targets: ActivityCollabDispatchTarget[];
    failed_targets?: ActivityCollabDispatchTarget[];
  };
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
  data: ActivityCollabItem[] | ActivityCollabListResponse,
): ActivityCollabItem[] => {
  if (Array.isArray(data)) return data;
  return Array.isArray(data?.items) ? data.items : [];
};

export const activityCollabApi = {
  async list(params: Record<string, string | number | boolean> = {}) {
    const search = buildSearch(params);
    const res = await request<ActivityCollabItem[] | ActivityCollabListResponse>(
      `${base}${search ? `?${search}` : ""}`,
    );
    return normalizeList(res);
  },
  detail: (id: string) => request<ActivityCollabItem>(`${base}/${encodeURIComponent(id)}`),
  create: (payload: Omit<ActivityCollabItem, "id" | "created_at" | "updated_at">) =>
    request<ActivityCollabItem>(base, { method: "POST", body: JSON.stringify(payload) }),
  update: (
    id: string,
    payload: Partial<Omit<ActivityCollabItem, "id" | "created_at" | "updated_at">>,
  ) =>
    request<ActivityCollabItem>(`${base}/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  sendReminder: (id: string) =>
    request<ActivityCollabDispatchResponse>(`${base}/${encodeURIComponent(id)}/send-reminder`, {
      method: "POST",
    }),
  sendReceiptRequest: (id: string) =>
    request<ActivityCollabDispatchResponse>(
      `${base}/${encodeURIComponent(id)}/send-receipt-request`,
      {
        method: "POST",
      },
    ),
  completeReceipt: (id: string) =>
    request<ActivityCollabDispatchResponse>(`${base}/${encodeURIComponent(id)}/complete-receipt`, {
      method: "POST",
    }),
  exportReport: (params: Record<string, string | number | boolean> = {}) => {
    const search = buildSearch(params);
    return request<string>(`${base}/export/file${search ? `?${search}` : ""}`);
  },
};
