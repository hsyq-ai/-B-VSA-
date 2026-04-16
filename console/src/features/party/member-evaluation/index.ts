import type {
  CandidateStatus,
  EvaluationLevel,
  MemberEvaluationItem,
} from "../../../api/modules/memberEvaluation";

const LOCAL_KEY = "copaw_member_evaluation_mvp_v1";

export const levelOptions: EvaluationLevel[] = ["优秀", "合格", "一般"];
export const candidateStatusOptions: CandidateStatus[] = ["未入选", "候选中", "已推荐"];

export const levelColorMap: Record<EvaluationLevel, string> = {
  优秀: "success",
  合格: "processing",
  一般: "default",
};

export const candidateStatusColorMap: Record<CandidateStatus, string> = {
  未入选: "default",
  候选中: "processing",
  已推荐: "success",
};

export interface MemberEvaluationFormValues {
  member_name: string;
  branch_name: string;
  level: EvaluationLevel;
  score: number;
  reviewer?: string;
  remark?: string;
}

export interface MemberEvaluationStats {
  total: number;
  avgScore: number;
  pendingReview: number;
  excellent: number;
}

export interface BranchSnapshotItem {
  branch: string;
  avg: number;
  count: number;
}

export interface MemberEvaluationCandidateItem extends MemberEvaluationItem {
  candidate_status: CandidateStatus;
  candidate_rank: number;
  candidate_reason: string;
}

export interface MemberEvaluationDerived {
  excellentList: MemberEvaluationItem[];
  candidateList: MemberEvaluationCandidateItem[];
  stats: MemberEvaluationStats;
  branchSnapshot: BranchSnapshotItem[];
  topMember: MemberEvaluationItem | null;
  topBranch: BranchSnapshotItem | null;
}

export type MemberEvaluationSecretaryAction = "pioneer" | "compare" | "growth";

export const loadLocal = (): MemberEvaluationItem[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MemberEvaluationItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveLocal = (items: MemberEvaluationItem[]) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOCAL_KEY, JSON.stringify(items));
};

export const sortByScore = (items: MemberEvaluationItem[]): MemberEvaluationItem[] => {
  return [...items].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
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

export const resolveCandidateStatus = (
  record: MemberEvaluationItem,
): CandidateStatus => {
  return (record.candidate_status || (record.level === "优秀" ? "候选中" : "未入选")) as CandidateStatus;
};

export const buildBranchSnapshot = (
  items: MemberEvaluationItem[],
): BranchSnapshotItem[] => {
  const map = new Map<string, { count: number; total: number }>();
  items.forEach((item) => {
    const prev = map.get(item.branch_name) || { count: 0, total: 0 };
    map.set(item.branch_name, { count: prev.count + 1, total: prev.total + item.score });
  });
  return [...map.entries()]
    .map(([branch, info]) => ({
      branch,
      avg: Math.round(info.total / info.count),
      count: info.count,
    }))
    .sort((a, b) => b.avg - a.avg);
};

export const buildCandidateList = (
  excellentList: MemberEvaluationItem[],
): MemberEvaluationCandidateItem[] => {
  return excellentList
    .map((item, index) => ({
      ...item,
      candidate_status: resolveCandidateStatus(item),
      candidate_rank: item.candidate_rank || index + 1,
      candidate_reason:
        item.candidate_reason || `测评分数 ${item.score} 分，建议纳入优秀候选观察清单。`,
    }))
    .sort((a, b) =>
      b.score !== a.score ? b.score - a.score : a.candidate_rank - b.candidate_rank,
    );
};

export const calcMemberEvaluationStats = (
  items: MemberEvaluationItem[],
  excellentCount: number,
): MemberEvaluationStats => {
  const total = items.length;
  const avgScore = total
    ? Math.round(items.reduce((sum, item) => sum + item.score, 0) / total)
    : 0;
  const pendingReview = items.filter((item) => !item.reviewer).length;
  return { total, avgScore, pendingReview, excellent: excellentCount };
};

export const buildMemberEvaluationDerived = (
  items: MemberEvaluationItem[],
): MemberEvaluationDerived => {
  const excellentList = items.filter((item) => item.level === "优秀");
  const candidateList = buildCandidateList(excellentList);
  const branchSnapshot = buildBranchSnapshot(items);
  return {
    excellentList,
    candidateList,
    stats: calcMemberEvaluationStats(items, excellentList.length),
    branchSnapshot,
    topMember: items[0] || null,
    topBranch: branchSnapshot[0] || null,
  };
};

export const buildMemberEvaluationSecretaryContext = (
  action: MemberEvaluationSecretaryAction,
  args: {
    topMember: MemberEvaluationItem | null;
    topBranch: BranchSnapshotItem | null;
    candidateList: MemberEvaluationCandidateItem[];
    stats: MemberEvaluationStats;
  },
): string => {
  const topMemberSummary = args.topMember
    ? `${args.topMember.member_name}｜${args.topMember.branch_name}｜${args.topMember.score} 分｜等级：${args.topMember.level}`
    : "当前暂无测评样本，请先按测评机制给出通用建议。";
  const topBranchSummary = args.topBranch
    ? `${args.topBranch.branch}｜均分 ${args.topBranch.avg}｜样本 ${args.topBranch.count}`
    : "暂无支部横向对标结果。";

  if (action === "pioneer") {
    return [
      "党员测评：请生成先锋示范名单建议。",
      `最佳个人：${topMemberSummary}`,
      `优秀候选数：${args.candidateList.length}，优秀党员：${args.stats.excellent}。`,
      "请输出候选名单、推荐理由、示范场景和公示注意事项。",
    ].join("\n");
  }

  if (action === "compare") {
    return [
      "党员测评：请生成支部测评对比简报。",
      `领先支部：${topBranchSummary}`,
      `统计概览：总样本 ${args.stats.total}，平均分 ${args.stats.avgScore}，待补评审 ${args.stats.pendingReview}。`,
      "请输出支部横向对比、亮点问题、建议动作和汇报口径。",
    ].join("\n");
  }

  return [
    "党员测评：请生成成长跟进提醒。",
    `最佳个人：${topMemberSummary}`,
    `统计概览：总样本 ${args.stats.total}，待补评审 ${args.stats.pendingReview}。`,
    "请输出需要补充评语、需要成长辅导和需要持续观察的对象建议。",
  ].join("\n");
};
