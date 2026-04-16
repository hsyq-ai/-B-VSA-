import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import type {
  ActivityCollabItem,
  ActivityCollabReceiptStatus,
  ActivityCollabReminderStatus,
  ActivityCollabStatus,
  ActivityCollabType,
} from "../../../api/modules/activityCollab";
import type { SceneConfigItem } from "../../core/scene/scene-launch";
import { loadLocalList, saveLocalList } from "../shared/local-cache";

const LOCAL_KEY = "copaw_party_activity_collab_v1";

export const typeOptions: ActivityCollabType[] = [
  "主题党日",
  "组织生活会",
  "志愿服务",
  "理论学习",
  "宣讲活动",
  "群团联建",
];
export const statusOptions: ActivityCollabStatus[] = [
  "待发布",
  "报名中",
  "进行中",
  "待复盘",
  "已归档",
];

export interface ActivityCollabFormValues {
  title: string;
  activity_type: ActivityCollabType;
  organizer?: string;
  target_branch?: string;
  location?: string;
  start_at?: Dayjs;
  end_at?: Dayjs;
  participants_planned?: number;
  summary?: string;
}

export const loadLocal = (): ActivityCollabItem[] =>
  loadLocalList<ActivityCollabItem>(LOCAL_KEY);

export const saveLocal = (items: ActivityCollabItem[]): void => {
  saveLocalList(LOCAL_KEY, items);
};

export const sortByTimeDesc = (items: ActivityCollabItem[]): ActivityCollabItem[] => {
  return [...items].sort((a, b) => {
    const aTs = new Date(a.updated_at || a.created_at || 0).getTime();
    const bTs = new Date(b.updated_at || b.created_at || 0).getTime();
    return bTs - aTs;
  });
};

export const formatTime = (value?: string): string => {
  if (!value) return "-";
  const current = dayjs(value);
  if (!current.isValid()) return "-";
  return current.format("YYYY-MM-DD HH:mm");
};

export const getErrorText = (error: unknown, fallback: string): string => {
  if (!(error instanceof Error) || !error.message) return fallback;
  const detailMatch = error.message.match(/"detail":"([^"]+)"/);
  if (detailMatch?.[1]) return detailMatch[1];
  const normalized = error.message
    .replace(/^Request failed:\s*\d+\s+[A-Za-z ]+\s*-\s*/, "")
    .trim();
  return normalized || fallback;
};

export const statusColorMap: Record<ActivityCollabStatus, string> = {
  待发布: "default",
  报名中: "processing",
  进行中: "gold",
  待复盘: "purple",
  已归档: "success",
};

export const reminderColorMap: Record<ActivityCollabReminderStatus, string> = {
  未提醒: "default",
  已提醒: "blue",
  持续催办: "volcano",
};

export const receiptColorMap: Record<ActivityCollabReceiptStatus, string> = {
  待回执: "default",
  回执中: "processing",
  已完成: "success",
};

export const buildScenePrompt = (item: ActivityCollabItem): string =>
  `请作为党建活动协同助手，围绕活动《${item.title}》输出一份可执行协同方案。请覆盖：1）通知对象与分工建议；2）报名、提醒、签到、回执的推进节奏；3）当前风险与催办话术；4）活动结束后的复盘与沉淀项。已知信息：活动类型=${item.activity_type}；当前状态=${item.status}；组织人=${item.organizer || "未指定"}；目标支部=${item.target_branch || "未指定"}；地点=${item.location || "待定"}；开始时间=${formatTime(item.start_at)}；结束时间=${formatTime(item.end_at)}；计划人数=${item.participants_planned ?? 0}；已确认人数=${item.participants_confirmed ?? 0}；提醒状态=${item.reminder_status}；回执状态=${item.receipt_status}；补充说明=${item.summary || "无"}。请先给出执行清单，再补充一段可直接发送的通知模板。`;

export const buildSceneConfig = (item: ActivityCollabItem): SceneConfigItem => ({
  label: "活动协同",
  triggerKey: "party-activity-collab",
  sessionName: `活动协同·${item.title}`,
  prompt: buildScenePrompt(item),
  context: {
    biz_domain: "party",
    module: "activity-collab",
    task_id: item.id,
    status: item.status,
    party_module: "activity-collab",
    party_item_id: item.id,
    party_title: item.title,
    party_status: item.status,
    party_reminder_status: item.reminder_status,
    party_receipt_status: item.receipt_status,
    party_deadline: item.end_at || item.start_at || "",
    activity_type: item.activity_type,
    organizer: item.organizer || "",
    target_branch: item.target_branch || "",
    location: item.location || "",
    participants_planned: String(item.participants_planned ?? 0),
    participants_confirmed: String(item.participants_confirmed ?? 0),
  },
  templateType: "scene",
});

export const focusFallbackItems: ActivityCollabItem[] = [
  {
    id: "focus-1",
    title: "四月主题党日组织通知与报名收集",
    activity_type: "主题党日",
    status: "报名中",
    organizer: "组织委员",
    target_branch: "第一党支部",
    location: "党员活动室",
    start_at: "2026-04-15T09:00:00+08:00",
    end_at: "2026-04-15T11:00:00+08:00",
    participants_planned: 32,
    participants_confirmed: 18,
    reminder_status: "已提醒",
    receipt_status: "回执中",
    summary: "建议分批催办未回执人员，并提前同步签到话术。",
  },
  {
    id: "focus-2",
    title: "志愿服务签到与照片回收",
    activity_type: "志愿服务",
    status: "进行中",
    organizer: "青年委员",
    target_branch: "联合党支部",
    location: "社区服务站",
    participants_planned: 20,
    participants_confirmed: 14,
    reminder_status: "持续催办",
    receipt_status: "待回执",
    summary: "重点跟进签到回执、活动照片和志愿服务时长。",
  },
  {
    id: "focus-3",
    title: "理论学习复盘材料沉淀",
    activity_type: "理论学习",
    status: "待复盘",
    organizer: "宣传委员",
    target_branch: "第二党支部",
    location: "线上会议室",
    participants_planned: 40,
    participants_confirmed: 40,
    reminder_status: "已提醒",
    receipt_status: "回执中",
    summary: "建议尽快沉淀签到表、心得摘要和下次活动建议。",
  },
];
