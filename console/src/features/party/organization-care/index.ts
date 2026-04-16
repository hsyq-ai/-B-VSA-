import dayjs from "dayjs";
import type {
  CareSignalLevel,
  CareStatus,
  OrganizationCareItem,
} from "../../../api/modules/organizationCare";

const LOCAL_KEY = "copaw_organization_care_mvp_v1";

export const signalOptions: CareSignalLevel[] = ["低", "中", "高"];
export const statusOptions: CareStatus[] = ["待关怀", "跟进中", "已回访"];

export const signalToneMap: Record<CareSignalLevel, { bg: string; color: string }> = {
  高: { bg: "#fef2f2", color: "#991b1b" },
  中: { bg: "#fff7ed", color: "#c2410c" },
  低: { bg: "#f5f5f4", color: "#57534e" },
};

export interface OrganizationCareFormValues {
  employee_name: string;
  department?: string;
  signal_level: CareSignalLevel;
  care_type: string;
  owner?: string;
  care_note?: string;
  follow_up_at?: dayjs.Dayjs;
}

export interface OrganizationCareStats {
  total: number;
  highSignal: number;
  pending: number;
  revisited: number;
  dueSoon: number;
}

export interface OrganizationCareFeaturedCard {
  eyebrow: string;
  title: string;
  description: string;
}

export interface OrganizationCareDerived {
  stats: OrganizationCareStats;
  latestItem: OrganizationCareItem | null;
  featuredCards: OrganizationCareFeaturedCard[];
}

export type OrganizationCareSecretaryAction = "minutes" | "followup" | "briefing";

export const loadLocal = (): OrganizationCareItem[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OrganizationCareItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveLocal = (items: OrganizationCareItem[]) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOCAL_KEY, JSON.stringify(items));
};

export const sortByTimeDesc = (items: OrganizationCareItem[]): OrganizationCareItem[] => {
  return [...items].sort((a, b) => {
    const aTs = new Date(a.updated_at || a.created_at || 0).getTime();
    const bTs = new Date(b.updated_at || b.created_at || 0).getTime();
    return bTs - aTs;
  });
};

export const formatTime = (value?: string): string => {
  if (!value) return "-";
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts) || ts <= 0) return "-";
  return new Date(ts).toLocaleString("zh-CN", { hour12: false });
};

export const calcOrganizationCareStats = (
  items: OrganizationCareItem[],
): OrganizationCareStats => {
  const total = items.length;
  const highSignal = items.filter((item) => item.signal_level === "高").length;
  const pending = items.filter((item) => item.status !== "已回访").length;
  const revisited = items.filter((item) => item.status === "已回访").length;
  const dueSoon = items.filter((item) => {
    if (!item.follow_up_at || item.status === "已回访") return false;
    const diff = dayjs(item.follow_up_at).diff(dayjs(), "hour");
    return diff <= 48;
  }).length;
  return { total, highSignal, pending, revisited, dueSoon };
};

export const buildOrganizationCareFeaturedCards = (
  items: OrganizationCareItem[],
): OrganizationCareFeaturedCard[] => {
  const highPriority = items.find((item) => item.signal_level === "高");
  const dueSoon = items.find((item) => item.follow_up_at && item.status !== "已回访");
  return [
    {
      eyebrow: "重点关注",
      title: highPriority ? `${highPriority.employee_name} · ${highPriority.care_type}` : "当前暂无高风险预警",
      description: highPriority
        ? `建议由 ${highPriority.owner || "责任人"} 牵头，在 24 小时内完成沟通与支持动作。`
        : "当前未识别到高等级信号，可继续保持常态化关怀巡检。",
    },
    {
      eyebrow: "近期回访",
      title: dueSoon ? `${dueSoon.employee_name} 回访安排` : "暂无待执行回访节点",
      description: dueSoon
        ? `${formatTime(dueSoon.follow_up_at)} 前建议完成回访留痕，并补充后续支持计划。`
        : "提交事项时可设置回访时间，系统会辅助沉淀后续节奏。",
    },
    {
      eyebrow: "组织建议",
      title: "关怀动作以“三段式闭环”推进",
      description: "建议统一采用“预警识别—面对面沟通—回访留痕”方式，确保组织关怀既有温度也可复盘。",
    },
  ];
};

export const buildOrganizationCareDerived = (
  items: OrganizationCareItem[],
): OrganizationCareDerived => ({
  stats: calcOrganizationCareStats(items),
  latestItem: items[0] || null,
  featuredCards: buildOrganizationCareFeaturedCards(items),
});

export const getOrganizationCarePrefillValues = (
  searchParams: URLSearchParams,
): Partial<OrganizationCareFormValues> => {
  const employee = String(searchParams.get("employee") || "").trim();
  const department = String(searchParams.get("department") || "").trim();
  const care_type = String(searchParams.get("topic") || "").trim();
  const care_note = String(searchParams.get("note") || "").trim();
  const owner = String(searchParams.get("owner") || "").trim();
  if (!employee && !department && !care_type && !care_note && !owner) return {};
  return {
    ...(employee ? { employee_name: employee } : {}),
    ...(department ? { department } : {}),
    ...(care_type ? { care_type } : {}),
    ...(care_note ? { care_note } : {}),
    ...(owner ? { owner } : {}),
    signal_level: "中",
  };
};

export const buildOrganizationCareSecretaryContext = (
  action: OrganizationCareSecretaryAction,
  args: { latestItem: OrganizationCareItem | null; stats: OrganizationCareStats },
): string => {
  const latestSummary = args.latestItem
    ? `${args.latestItem.employee_name}｜${args.latestItem.care_type}｜状态：${args.latestItem.status}｜回访：${formatTime(args.latestItem.follow_up_at)}`
    : "当前暂无已登记关怀事项，请先按组织关怀机制给出通用建议。";

  if (action === "minutes") {
    return [
      "组织关怀：请基于当前台账生成一份关怀谈话纪要。",
      `重点事项：${latestSummary}`,
      `统计概览：总数 ${args.stats.total}，高风险 ${args.stats.highSignal}，待跟进 ${args.stats.pending}。`,
      "输出内容请包含：问题识别、沟通提纲、支持动作、回访节点、留痕建议。",
    ].join("\n");
  }

  if (action === "followup") {
    return [
      "组织关怀：请生成重点人员跟进单。",
      `重点事项：${latestSummary}`,
      `统计概览：48 小时内待回访 ${args.stats.dueSoon} 项。`,
      "请给出责任人动作清单、回访时间建议、风险升级条件和记录模板。",
    ].join("\n");
  }

  return [
    "组织关怀：请生成月度组织温度分析简报。",
    `最新事项：${latestSummary}`,
    `统计概览：总数 ${args.stats.total}，高风险 ${args.stats.highSignal}，已回访 ${args.stats.revisited}，待回访 ${args.stats.dueSoon}。`,
    "请输出风险结构、典型场景、组织建议和下月跟进重点。",
  ].join("\n");
};
