import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import type {
  PartyAffairItem,
  PartyAffairPriority,
  PartyAffairReceiptStatus,
  PartyAffairStatus,
  PartyAffairType,
} from "../../../api/modules/partyAffairs";
import type { SceneConfigItem } from "../../core/scene/scene-launch";
import { loadLocalList, saveLocalList } from "../shared/local-cache";

const LOCAL_KEY = "copaw_party_affairs_mvp_v2";

export const typeOptions: PartyAffairType[] = [
  "三会一课",
  "组织生活",
  "通知公告",
  "纪要归档",
];
export const priorityOptions: PartyAffairPriority[] = ["高", "中", "低"];

export interface PartyAffairFormValues {
  title: string;
  type: PartyAffairType;
  assignee_user_id?: string;
  deadline?: Dayjs;
  summary?: string;
  priority: PartyAffairPriority;
}

export interface ActiveUserOption {
  user_id: string;
  name: string;
  department?: string;
  position?: string;
}

export interface AuditDrawerState {
  open: boolean;
  title: string;
  loading: boolean;
  items: Array<{
    created_at?: string;
    status?: string;
    detail?: string;
    route_result?: string;
    trace_id?: string;
    task_id?: string;
    conversation_key?: string;
    source_user_name?: string;
  }>;
}

export const loadLocal = (): PartyAffairItem[] =>
  loadLocalList<PartyAffairItem>(LOCAL_KEY);

export const saveLocal = (items: PartyAffairItem[]): void => {
  saveLocalList(LOCAL_KEY, items);
};

export const formatTime = (value?: string): string => {
  if (!value) return "-";
  const date = dayjs(value);
  if (!date.isValid()) return "-";
  return date.format("YYYY-MM-DD HH:mm");
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

const deriveStage = (status: PartyAffairStatus, stage?: string): string => {
  if (stage) return stage;
  return status === "已办结" ? "归档完成" : status === "审批中" ? "执行中" : "待分派";
};

const deriveReceiptStatus = (
  status: PartyAffairStatus,
  receipt?: PartyAffairReceiptStatus,
): PartyAffairReceiptStatus => {
  if (receipt) return receipt;
  return status === "已办结" ? "已完成" : status === "审批中" ? "回执中" : "待回执";
};

const deriveProgress = (status: PartyAffairStatus, progress?: number): number => {
  if (typeof progress === "number") return Math.max(0, Math.min(100, progress));
  return status === "已办结" ? 100 : status === "审批中" ? 68 : 12;
};

export const normalizeItem = (item: PartyAffairItem): PartyAffairItem => {
  const status = item.status || "待处理";
  return {
    ...item,
    biz_domain: item.biz_domain || "party",
    module: item.module || "party-affairs",
    task_id: item.task_id || `party-affair-${item.id}`,
    stage: deriveStage(status, item.stage),
    priority: item.priority || "中",
    owner_role: item.owner_role || "党务专员",
    receipt_status: deriveReceiptStatus(status, item.receipt_status),
    next_action:
      item.next_action ||
      (status === "已办结" ? "查看归档材料" : "完成分派并催收回执"),
    progress_percent: deriveProgress(status, item.progress_percent),
    audit_summary:
      item.audit_summary ||
      (item.trace_id ? "已接入协同与审计链" : "等待首次任务卡投递"),
    target_department: item.target_department || "",
    conversation_key: item.conversation_key || (item.task_id ? `task:${item.task_id}` : ""),
    session_id: item.session_id || (item.task_id ? `console:task:${item.task_id}` : ""),
    trace_id: item.trace_id || "",
  };
};

export const sortByTimeDesc = (items: PartyAffairItem[]): PartyAffairItem[] => {
  return [...items].sort((a, b) => {
    const aTs = new Date(a.updated_at || a.created_at || 0).getTime();
    const bTs = new Date(b.updated_at || b.created_at || 0).getTime();
    return bTs - aTs;
  });
};

export const statusColorMap: Record<PartyAffairStatus, string> = {
  待处理: "gold",
  审批中: "processing",
  已办结: "success",
};

export const priorityColorMap: Record<PartyAffairPriority, string> = {
  高: "error",
  中: "processing",
  低: "default",
};

export const receiptColorMap: Record<PartyAffairReceiptStatus, string> = {
  待回执: "default",
  回执中: "processing",
  已完成: "success",
};

export const buildScenePrompt = (item: PartyAffairItem): string =>
  `请作为党建任务协同助手，围绕任务卡《${item.title}》输出执行方案。请覆盖：1）责任人待办拆解；2）阶段推进与提醒节奏；3）回执与归档材料清单；4）风险提示与催办话术。已知信息：类型=${item.type}；状态=${item.status}；阶段=${item.stage || "待分派"}；优先级=${item.priority || "中"}；责任人=${item.assignee || "待指定"}；目标部门=${item.target_department || "未指定"}；截止时间=${formatTime(item.deadline)}；回执状态=${item.receipt_status || "待回执"}；任务说明=${item.summary || "无"}。请先给出行动清单，再给出一段可直接发送的催办文案。`;

export const buildSceneConfig = (item: PartyAffairItem): SceneConfigItem => ({
  label: "党建任务卡",
  triggerKey: "party-affair-task-card",
  sessionName: `党建任务卡·${item.title}`,
  prompt: buildScenePrompt(item),
  context: {
    biz_domain: "party",
    module: "party-affairs",
    task_id: item.task_id || item.id,
    status: item.status,
    party_module: "party-affairs",
    party_item_id: item.id,
    party_title: item.title,
    party_status: item.status,
    party_stage: item.stage || "待分派",
    party_priority: item.priority || "中",
    party_receipt_status: item.receipt_status || "待回执",
    party_deadline: item.deadline || "",
    assignee: item.assignee || "",
    target_department: item.target_department || "",
  },
  templateType: "scene",
});
