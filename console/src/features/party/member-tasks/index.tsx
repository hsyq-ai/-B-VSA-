import { Card, Space, Typography } from "antd";
import dayjs from "dayjs";
import type { ReactNode } from "react";
import type { DirectiveCenterItem } from "../../../api/modules/directiveCenter";
import type { PartyAffairItem } from "../../../api/modules/partyAffairs";

const { Text } = Typography;

export type TaskType = "三会一课" | "组织生活" | "学习任务" | "主题活动" | "思想汇报";
export type TaskStatus = "待办" | "进行中" | "待审核" | "已完成" | "已逾期";
export type TaskPriority = "高" | "中" | "低";

export interface TaskItem {
  id: string;
  title: string;
  type: TaskType;
  status: TaskStatus;
  deadline: string;
  source: string;
  priority: TaskPriority;
  score?: number;
  completedAt?: string;
}

export interface LearningPlan {
  id: string;
  title: string;
  progress: number;
  totalHours: number;
  completedHours: number;
  status: "进行中" | "已完成" | "未开始";
}

export interface GrowthMoment {
  title: string;
  desc: string;
}

export interface ReminderItem {
  title: string;
  desc: string;
  tone: string;
}

export function OfficialStatCard({
  title,
  value,
  description,
  accent,
  icon,
}: {
  title: string;
  value: string | number;
  description: string;
  accent: string;
  icon: ReactNode;
}) {
  return (
    <Card
      bordered={false}
      styles={{ body: { padding: 20 } }}
      style={{
        height: "100%",
        borderRadius: 24,
        background: "linear-gradient(180deg, #fffdfc 0%, #fff8f6 100%)",
        border: "1px solid rgba(127,29,29,0.08)",
        boxShadow: "0 16px 36px rgba(127,29,29,0.08)",
      }}
    >
      <Space direction="vertical" size={14} style={{ width: "100%" }}>
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 16,
            background: `${accent}14`,
            color: accent,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon}
        </div>
        <div>
          <Text style={{ color: "#7f1d1d", fontWeight: 700, fontSize: 13 }}>{title}</Text>
          <div
            style={{
              marginTop: 8,
              fontSize: 30,
              fontWeight: 800,
              lineHeight: 1.1,
              color: "#1f2937",
            }}
          >
            {value}
          </div>
          <Text style={{ display: "block", marginTop: 6, color: "#7c6f67", fontSize: 12 }}>
            {description}
          </Text>
        </div>
      </Space>
    </Card>
  );
}

export function QuickNavCard({
  title,
  description,
  accent,
  icon,
  onClick,
}: {
  title: string;
  description: string;
  accent: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <Card
      hoverable
      bordered={false}
      onClick={onClick}
      styles={{ body: { padding: 18 } }}
      style={{
        height: "100%",
        borderRadius: 20,
        background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(255,250,248,0.98) 100%)",
        border: "1px solid rgba(127,29,29,0.08)",
        boxShadow: "0 14px 30px rgba(127,29,29,0.06)",
      }}
    >
      <Space direction="vertical" size={14} style={{ width: "100%" }}>
        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: `${accent}14`,
            color: accent,
          }}
        >
          {icon}
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1f2937" }}>{title}</div>
          <Text style={{ color: "#7c6f67", fontSize: 12, lineHeight: 1.7 }}>{description}</Text>
        </div>
      </Space>
    </Card>
  );
}

export const statusPalette: Record<TaskStatus, { bg: string; color: string; border: string }> = {
  待办: { bg: "#fef3c7", color: "#92400e", border: "#f59e0b" },
  进行中: { bg: "#fee2e2", color: "#b91c1c", border: "#ef4444" },
  待审核: { bg: "#fce7f3", color: "#be185d", border: "#ec4899" },
  已完成: { bg: "#dcfce7", color: "#166534", border: "#22c55e" },
  已逾期: { bg: "#fef2f2", color: "#991b1b", border: "#dc2626" },
};

export const priorityPalette: Record<TaskPriority, { bg: string; color: string }> = {
  高: { bg: "#7f1d1d", color: "#ffffff" },
  中: { bg: "#fff1f2", color: "#be123c" },
  低: { bg: "#f5f5f4", color: "#57534e" },
};

const statusWeight: Record<TaskStatus, number> = {
  已逾期: 0,
  待办: 1,
  进行中: 2,
  待审核: 3,
  已完成: 4,
};

const priorityWeight: Record<TaskPriority, number> = {
  高: 0,
  中: 1,
  低: 2,
};

export const sectionCardStyle = {
  borderRadius: 24,
  border: "1px solid rgba(127,29,29,0.08)",
  boxShadow: "0 18px 40px rgba(127,29,29,0.07)",
  background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(255,250,248,0.98) 100%)",
} as const;

export const softPanelStyle = {
  borderRadius: 18,
  border: "1px solid rgba(127,29,29,0.08)",
  background: "linear-gradient(180deg, rgba(255,248,246,0.96) 0%, rgba(255,255,255,0.98) 100%)",
} as const;

const toTaskType = (value: string): TaskType => {
  if (
    value === "三会一课" ||
    value === "组织生活" ||
    value === "学习任务" ||
    value === "主题活动" ||
    value === "思想汇报"
  ) {
    return value;
  }
  return "组织生活";
};

export const parseDaysToDeadline = (deadline: string): number => {
  const parsed = dayjs(deadline);
  if (!parsed.isValid()) return Number.POSITIVE_INFINITY;
  return parsed.startOf("day").diff(dayjs().startOf("day"), "day");
};

const normalizeTask = (task: TaskItem): TaskItem => {
  const days = parseDaysToDeadline(task.deadline);
  if (
    (task.status === "待办" || task.status === "进行中" || task.status === "待审核") &&
    Number.isFinite(days) &&
    days < 0
  ) {
    return { ...task, status: "已逾期" };
  }
  return task;
};

const mapPartyStatus = (status: string): TaskStatus => {
  switch (status) {
    case "待处理":
      return "待办";
    case "审批中":
      return "待审核";
    case "已办结":
      return "已完成";
    default:
      return "待办";
  }
};

const mapDirectiveStatus = (status: string): TaskStatus => {
  switch (status) {
    case "待响应":
      return "待办";
    case "分析中":
      return "进行中";
    case "已完成":
      return "已完成";
    default:
      return "待办";
  }
};

export const getTaskTargetPath = (task: TaskItem): string => {
  if (task.source === "上级指示") return "/app/member/directives";
  if (task.type === "学习任务") return "/app/member/learning";
  if (task.type === "主题活动") return "/app/member/activity";
  return "/app/member/affairs";
};

export const sortTasks = (items: TaskItem[]): TaskItem[] =>
  [...items].sort((a, b) => {
    const statusDiff = statusWeight[a.status] - statusWeight[b.status];
    if (statusDiff !== 0) return statusDiff;
    const priorityDiff = priorityWeight[a.priority] - priorityWeight[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return parseDaysToDeadline(a.deadline) - parseDaysToDeadline(b.deadline);
  });

export const transformPartyTask = (task: PartyAffairItem): TaskItem =>
  normalizeTask({
    id: task.id,
    title: task.title,
    type: toTaskType(task.type),
    status: mapPartyStatus(task.status),
    deadline: task.deadline || "未设置",
    source: task.target_department || "党支部",
    priority: task.type === "三会一课" ? "高" : "中",
    score: 10,
  });

export const transformDirectiveTask = (directive: DirectiveCenterItem): TaskItem =>
  normalizeTask({
    id: directive.id,
    title: directive.title,
    type: "组织生活",
    status: mapDirectiveStatus(directive.status),
    deadline: directive.publish_at
      ? dayjs(directive.publish_at)
          .add(directive.sla === "T+1" ? 1 : 3, "day")
          .format("YYYY-MM-DD")
      : "未设置",
    source: "上级指示",
    priority: "高",
    score: 15,
  });

export const getDemoTasks = (): TaskItem[] => {
  const demoTasks: TaskItem[] = [
    {
      id: "1",
      title: "4 月主题党日学习材料阅读",
      type: "学习任务",
      status: "待办",
      deadline: "2026-04-05",
      source: "第一党支部",
      priority: "高",
      score: 10,
    },
    {
      id: "2",
      title: "提交季度思想汇报",
      type: "思想汇报",
      status: "进行中",
      deadline: "2026-04-10",
      source: "支部书记",
      priority: "高",
      score: 20,
    },
    {
      id: "3",
      title: "参加党员志愿服务活动",
      type: "主题活动",
      status: "待办",
      deadline: "2026-04-15",
      source: "组织委员",
      priority: "中",
      score: 15,
    },
    {
      id: "4",
      title: "完善党员档案信息",
      type: "组织生活",
      status: "已完成",
      deadline: "2026-03-28",
      source: "党委办公室",
      priority: "中",
      score: 8,
      completedAt: "2026-03-25",
    },
    {
      id: "5",
      title: "学习党的二十大精神专题测验",
      type: "学习任务",
      status: "待审核",
      deadline: "2026-04-03",
      source: "政治指导员",
      priority: "高",
      score: 12,
    },
  ];

  return demoTasks.map(normalizeTask);
};

export const getDemoLearningPlans = (): LearningPlan[] => [
  {
    id: "l1",
    title: "党的基本理论系统学习",
    progress: 65,
    totalHours: 40,
    completedHours: 26,
    status: "进行中",
  },
  {
    id: "l2",
    title: "党史专题学习",
    progress: 100,
    totalHours: 20,
    completedHours: 20,
    status: "已完成",
  },
  {
    id: "l3",
    title: "新时代新思想专题",
    progress: 30,
    totalHours: 30,
    completedHours: 9,
    status: "进行中",
  },
];

export const calcTaskStats = (tasks: TaskItem[]) => {
  const todo = tasks.filter((item) => item.status === "待办").length;
  const doing = tasks.filter(
    (item) => item.status === "进行中" || item.status === "待审核",
  ).length;
  const done = tasks.filter((item) => item.status === "已完成").length;
  const overdue = tasks.filter((item) => item.status === "已逾期").length;
  const totalScore = tasks
    .filter((item) => item.status === "已完成")
    .reduce((sum, item) => sum + (item.score || 0), 0);
  const completionRate = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;
  return { todo, doing, done, overdue, totalScore, completionRate };
};

export const calcOverallLearningProgress = (plans: LearningPlan[]): number => {
  if (!plans.length) return 0;
  return Math.round(plans.reduce((sum, item) => sum + item.progress, 0) / plans.length);
};

export const buildGrowthMoments = (
  tasks: TaskItem[],
  learningPlans: LearningPlan[],
): GrowthMoment[] => {
  const completed = tasks
    .filter((item) => item.status === "已完成")
    .slice(0, 2)
    .map((item) => ({
      title: item.title,
      desc: `任务已办结，获得 ${item.score || 0} 积分，归档于个人成长记录。`,
    }));

  const learning = learningPlans
    .filter((item) => item.progress > 0)
    .slice(0, 2)
    .map((item) => ({
      title: item.title,
      desc: `当前学习进度 ${item.progress}%，已完成 ${item.completedHours}/${item.totalHours} 学时。`,
    }));

  return [...completed, ...learning].slice(0, 4);
};

export const buildReminders = (args: {
  focusTask?: TaskItem;
  overallLearningProgress: number;
  overdue: number;
}): ReminderItem[] => {
  const reminderList: ReminderItem[] = [];

  if (args.overdue > 0) {
    reminderList.push({
      title: `存在 ${args.overdue} 项逾期事项`,
      desc: "建议优先进入指示事项或组织事务处理，避免影响本周考核。",
      tone: "#b91c1c",
    });
  }

  if (args.focusTask) {
    reminderList.push({
      title: "今日优先办理",
      desc: `${args.focusTask.title}，截止 ${args.focusTask.deadline}。建议在今日下班前完成关键动作。`,
      tone: "#9a3412",
    });
  }

  reminderList.push({
    title: "学习进度建议",
    desc:
      args.overallLearningProgress < 80
        ? "当前学习进度未达预期，建议优先回学习中心补齐本周学时。"
        : "当前学习进度良好，可继续巩固专题学习成果。",
    tone: "#7c2d12",
  });

  return reminderList.slice(0, 3);
};

export const buildActivityItems = (tasks: TaskItem[]): TaskItem[] => {
  const activityTasks = tasks.filter((item) => item.type === "主题活动").slice(0, 3);
  if (activityTasks.length > 0) return activityTasks;
  return [
    {
      id: "demo-activity-1",
      title: "党员志愿服务集中行动",
      type: "主题活动",
      status: "待办",
      deadline: "2026-04-18",
      source: "组织委员",
      priority: "中",
    },
    {
      id: "demo-activity-2",
      title: "主题党日集中研学",
      type: "主题活动",
      status: "待办",
      deadline: "2026-04-22",
      source: "宣传委员",
      priority: "中",
    },
  ];
};
