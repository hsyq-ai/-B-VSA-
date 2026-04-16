import type {
  BranchRankingItem,
  BranchRankingStatus,
} from "../../../api/modules/branchRanking";

const LOCAL_KEY = "copaw_branch_ranking_mvp_v1";

export const statusOptions: BranchRankingStatus[] = ["参评中", "已评定"];

export interface BranchRankingFormValues {
  branch_name: string;
  score: number;
  candidate_count?: number;
  recommendation?: string;
}

export interface BranchRankingStats {
  total: number;
  avgScore: number;
  candidateTotal: number;
  rated: number;
}

export interface BranchRankingDerived {
  stats: BranchRankingStats;
  excellentBranch: BranchRankingItem | null;
  topThree: BranchRankingItem[];
}

export type BranchRankingSecretaryAction = "excellent" | "talent" | "improvement";

export const loadLocal = (): BranchRankingItem[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as BranchRankingItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveLocal = (items: BranchRankingItem[]) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOCAL_KEY, JSON.stringify(items));
};

export const sortByScore = (items: BranchRankingItem[]): BranchRankingItem[] => {
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

export const calcBranchRankingStats = (
  items: BranchRankingItem[],
): BranchRankingStats => {
  const total = items.length;
  const avgScore = total
    ? Math.round(items.reduce((sum, item) => sum + item.score, 0) / total)
    : 0;
  const candidateTotal = items.reduce(
    (sum, item) => sum + Number(item.candidate_count || 0),
    0,
  );
  const rated = items.filter((item) => item.status === "已评定").length;
  return { total, avgScore, candidateTotal, rated };
};

export const buildBranchRankingDerived = (
  items: BranchRankingItem[],
): BranchRankingDerived => ({
  stats: calcBranchRankingStats(items),
  excellentBranch: items[0] || null,
  topThree: items.slice(0, 3),
});

export const buildBranchRankingSecretaryContext = (
  action: BranchRankingSecretaryAction,
  args: {
    excellentBranch: BranchRankingItem | null;
    topThree: BranchRankingItem[];
    stats: BranchRankingStats;
  },
): string => {
  const excellentSummary = args.excellentBranch
    ? `${args.excellentBranch.branch_name}｜${args.excellentBranch.score} 分｜建议提拔 ${Number(args.excellentBranch.candidate_count || 0)} 人`
    : "当前暂无评比样本，请先按支部评比机制给出通用建议。";
  const topThreeSummary = args.topThree.length
    ? args.topThree.map((item) => `${item.branch_name}(${item.score}分)`).join("、")
    : "暂无前列梯队。";

  if (action === "excellent") {
    return [
      "支部评比：请生成先进支部建议名单。",
      `当前领跑：${excellentSummary}`,
      `前列梯队：${topThreeSummary}`,
      "请输出推荐名单、先进理由、经验复制建议和通报口径。",
    ].join("\n");
  }

  if (action === "talent") {
    return [
      "支部评比：请生成干部储备观察简报。",
      `当前领跑：${excellentSummary}`,
      `统计概览：参评支部 ${args.stats.total}，建议提拔总数 ${args.stats.candidateTotal}。`,
      "请输出重点支部、潜在干部来源、培养建议和后续观察点。",
    ].join("\n");
  }

  return [
    "支部评比：请生成后进支部辅导建议。",
    `前列梯队：${topThreeSummary}`,
    `统计概览：参评支部 ${args.stats.total}，已评定 ${args.stats.rated}，平均分 ${args.stats.avgScore}。`,
    "请输出整改思路、帮带机制、重点指标和阶段性复盘建议。",
  ].join("\n");
};
