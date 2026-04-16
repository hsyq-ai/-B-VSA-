import dayjs from "dayjs";
import type {
  DirectiveCenterItem,
  DirectiveStatus,
} from "../../../api/modules/directiveCenter";
import {
  formatTime,
  loadLocal,
  saveLocal,
  sortByPublishAt,
  statusOptions,
} from "../directive-center";

const drawerSeparator = "\n\n执行反馈：";

export { formatTime, loadLocal, saveLocal, sortByPublishAt, statusOptions };

export interface FeedbackValues {
  status: DirectiveStatus;
  feedback: string;
}

export interface MemberDirectiveStats {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  urgent: number;
}

export const statusToneMap: Record<DirectiveStatus, { bg: string; color: string }> = {
  待响应: { bg: "#fef2f2", color: "#b91c1c" },
  分析中: { bg: "#eff6ff", color: "#1d4ed8" },
  已完成: { bg: "#ecfdf5", color: "#15803d" },
};

export const resolveDeadline = (
  item: DirectiveCenterItem,
): dayjs.Dayjs | null => {
  const publishAt = dayjs(item.publish_at);
  if (!publishAt.isValid()) return null;
  return publishAt.add(item.sla === "T+1" ? 1 : 3, "day");
};

export const splitSummary = (summary?: string): { origin: string; feedback: string } => {
  if (!summary) return { origin: "", feedback: "" };
  const index = summary.indexOf(drawerSeparator);
  if (index === -1) {
    return { origin: summary.replace(/^要求说明：/, "").trim(), feedback: "" };
  }
  return {
    origin: summary.slice(0, index).replace(/^要求说明：/, "").trim(),
    feedback: summary.slice(index + drawerSeparator.length).trim(),
  };
};

export const composeSummary = (origin: string, feedback: string): string => {
  return [
    origin.trim() ? `要求说明：${origin.trim()}` : "",
    feedback.trim() ? `执行反馈：${feedback.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
};

export const calcMemberDirectiveStats = (
  items: DirectiveCenterItem[],
): MemberDirectiveStats => {
  const total = items.length;
  const pending = items.filter((item) => item.status === "待响应").length;
  const processing = items.filter((item) => item.status === "分析中").length;
  const completed = items.filter((item) => item.status === "已完成").length;
  const urgent = items.filter((item) => {
    if (item.status === "已完成") return false;
    const deadline = resolveDeadline(item);
    return deadline ? deadline.diff(dayjs(), "hour") <= 24 : false;
  }).length;
  return { total, pending, processing, completed, urgent };
};

export const buildMemberDirectiveGuidanceCards = (
  focusDirective: DirectiveCenterItem | null,
  stats: MemberDirectiveStats,
): Array<{ title: string; value: string; description: string }> => [
  {
    title: "当前优先事项",
    value: focusDirective ? focusDirective.title : "暂无待办指示",
    description: focusDirective
      ? `${formatTime(resolveDeadline(focusDirective)?.toISOString())} 前建议完成阅读确认与阶段反馈。`
      : "当前没有待处理指示，可返回任务中枢查看其他事项。",
  },
  {
    title: "执行提醒",
    value: `${stats.pending} 项待响应`,
    description: "先明确要求、再推进动作、最后提交反馈，确保个人执行留痕清晰。",
  },
  {
    title: "闭环结果",
    value: `${stats.completed} 项已完成`,
    description: "完成后的事项会沉淀为个人执行记录，便于后续成长与复盘。",
  },
];
