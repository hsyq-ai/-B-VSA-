import dayjs from "dayjs";
import type {
  LearningCoachItem,
  LearningMode,
  LearningStatus,
} from "../../../api/modules/learningCoach";

const LOCAL_KEY = "copaw_learning_coach_mvp_v1";

export const modeOptions: LearningMode[] = ["微课推送", "一对一辅导", "集中学习"];
export const statusOptions: LearningStatus[] = ["待学习", "学习中", "已完成"];

export interface LearningCoachFormValues {
  learner_name: string;
  topic: string;
  weakness_point?: string;
  mode: LearningMode;
  mentor?: string;
  score?: number;
  micro_course_title?: string;
  due_at?: dayjs.Dayjs;
}

export interface LearningCoachStats {
  total: number;
  completed: number;
  studying: number;
  avgScore: number;
  upcoming: number;
}

export interface LearningCoachFeaturedGuide {
  eyebrow: string;
  title: string;
  description: string;
}

export interface LearningCoachDerived {
  stats: LearningCoachStats;
  focusItem: LearningCoachItem | null;
  featuredGuides: LearningCoachFeaturedGuide[];
}

export type LearningCoachSecretaryAction = "memo" | "course-list" | "review";

export const loadLocal = (): LearningCoachItem[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LearningCoachItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveLocal = (items: LearningCoachItem[]) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOCAL_KEY, JSON.stringify(items));
};

export const sortByTimeDesc = (items: LearningCoachItem[]): LearningCoachItem[] => {
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

export const calcLearningCoachStats = (
  items: LearningCoachItem[],
): LearningCoachStats => {
  const total = items.length;
  const completed = items.filter((item) => item.status === "已完成").length;
  const studying = items.filter((item) => item.status === "学习中").length;
  const avgScore = total
    ? Math.round(items.reduce((sum, item) => sum + Number(item.score || 0), 0) / total)
    : 0;
  const upcoming = items.filter((item) => {
    if (!item.due_at || item.status === "已完成") return false;
    const diff = dayjs(item.due_at).diff(dayjs(), "hour");
    return diff <= 72;
  }).length;
  return { total, completed, studying, avgScore, upcoming };
};

export const buildLearningCoachFeaturedGuides = (
  items: LearningCoachItem[],
): LearningCoachFeaturedGuide[] => {
  const weakest = items.find((item) => item.weakness_point);
  const course = items.find((item) => item.micro_course_title);
  return [
    {
      eyebrow: "重点画像",
      title: weakest ? `${weakest.learner_name} · ${weakest.topic}` : "当前暂无待强化学习画像",
      description: weakest
        ? `建议围绕“${weakest.weakness_point}”制定个性化辅导方案，并结合${weakest.mode}安排推进。`
        : "可通过任务登记持续积累党员学习画像，逐步形成更精准的辅导建议。",
    },
    {
      eyebrow: "内容推荐",
      title: course ? course.micro_course_title || "已配置微课" : "待配置微课推送",
      description: course
        ? `建议与“${course.topic}”主题联动推送，形成学习内容与实践场景同频。`
        : "创建任务时可补充微课标题，让系统沉淀推荐与复盘依据。",
    },
    {
      eyebrow: "机制建议",
      title: "辅导闭环以“识别—推荐—跟踪”推进",
      description: "把薄弱点识别、个性化内容推荐和完成情况追踪统一纳入书记驾驶舱，提升思政工作的连续性与质感。",
    },
  ];
};

export const buildLearningCoachDerived = (
  items: LearningCoachItem[],
): LearningCoachDerived => ({
  stats: calcLearningCoachStats(items),
  focusItem: items.find((item) => item.status !== "已完成") || items[0] || null,
  featuredGuides: buildLearningCoachFeaturedGuides(items),
});

export const getLearningCoachPrefillValues = (
  searchParams: URLSearchParams,
): Partial<LearningCoachFormValues> => {
  const learner_name = String(searchParams.get("learner") || "").trim();
  const topic = String(searchParams.get("topic") || "").trim();
  const weakness_point = String(searchParams.get("weakness") || "").trim();
  const micro_course_title = String(searchParams.get("microCourse") || "").trim();
  const mentor = String(searchParams.get("mentor") || "").trim();
  if (!learner_name && !topic && !weakness_point && !micro_course_title && !mentor) return {};
  return {
    ...(learner_name ? { learner_name } : {}),
    ...(topic ? { topic } : {}),
    ...(weakness_point ? { weakness_point } : {}),
    ...(micro_course_title ? { micro_course_title } : {}),
    ...(mentor ? { mentor } : {}),
    mode: "微课推送",
  };
};

export const buildLearningCoachSecretaryContext = (
  action: LearningCoachSecretaryAction,
  args: { focusItem: LearningCoachItem | null; stats: LearningCoachStats },
): string => {
  const focusSummary = args.focusItem
    ? `${args.focusItem.learner_name}｜${args.focusItem.topic}｜状态：${args.focusItem.status}｜薄弱点：${args.focusItem.weakness_point || "待补充"}`
    : "当前暂无已登记辅导任务，请先按思政辅导机制给出通用建议。";

  if (action === "memo") {
    return [
      "思政辅导：请生成个性化辅导纪要。",
      `重点对象：${focusSummary}`,
      `统计概览：总任务 ${args.stats.total}，学习中 ${args.stats.studying}，72 小时内到期 ${args.stats.upcoming}。`,
      "请输出：学习画像、辅导提纲、微课建议、导师动作、完成标准。",
    ].join("\n");
  }

  if (action === "course-list") {
    return [
      "思政辅导：请生成微课推送清单。",
      `重点对象：${focusSummary}`,
      `统计概览：平均学习分 ${args.stats.avgScore}。`,
      "请给出分层课程推荐、推送节奏和完成提醒建议。",
    ].join("\n");
  }

  return [
    "思政辅导：请生成月度学习复盘。",
    `重点对象：${focusSummary}`,
    `统计概览：总任务 ${args.stats.total}，已完成 ${args.stats.completed}，学习中 ${args.stats.studying}，平均分 ${args.stats.avgScore}。`,
    "请输出：学习成效、风险点、重点对象跟进建议和下月计划。",
  ].join("\n");
};
