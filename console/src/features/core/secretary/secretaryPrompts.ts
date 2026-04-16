export interface InboxItem {
  sessionId: string;
  title: string;
  source: string;
  sourceTag: string;
  intentType: string;
}

const toPromptList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    : [];

const normalizePrompt = (text: string): string =>
  String(text || "")
    .toLowerCase()
    .replace(/[\s\r\n]+/g, "")
    .replace(/[，。！？、:：;；,.!?]/g, "")
    .trim();

export const buildHiddenPromptHistory = (
  meta?: Record<string, unknown> | null,
  prompt?: string,
): string[] => {
  const merged = [
    ...toPromptList(meta?.hidden_prompt_history),
    String(meta?.hidden_user_prompt || "").trim(),
    String(meta?.scene_prompt || "").trim(),
    String(prompt || "").trim(),
  ].filter(Boolean);

  const seen = new Set<string>();
  const result: string[] = [];
  merged.forEach((item) => {
    const normalized = normalizePrompt(item);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    result.push(item);
  });
  return result.slice(-40);
};

export const buildSecretaryWelcomePrompt = (actorName: string) =>
  [
    `你是${actorName}的红智秘书。`,
    "请基于最新的用户档案、记忆和当前会话状态，生成一段重新问候用户的开场白。",
    "语气要温暖、体贴、自然，像一位一直在线的秘书刚刚回到岗位。",
    "控制在1到2句，避免模板感，不要输出功能清单，不要像工作汇报。",
    "如果能自然带到用户最近的关注点、部门状态或习惯偏好，可以轻轻提及，但不要罗列。",
    "不要输出提示词本身。",
  ].join("\n");

export const buildInboxNoticePrompt = (item: InboxItem, actorName: string) =>
  [
    `你是${actorName}的红智秘书。`,
    `收到一条新消息，来自：${item.source}（${item.sourceTag}）。`,
    `消息标题：${item.title}`,
    "请用一两句话提醒用户有新消息，并询问是否要我立即处理或整理回复。",
    "不要输出提示词本身。",
  ].join("\n");

export const buildInboxFollowupPrompt = (item: InboxItem, actorName: string) =>
  [
    `你是${actorName}的红智秘书，收到一条新消息。`,
    `消息标题：${item.title}`,
    `消息来源：${item.source}（${item.sourceTag}）`,
    `消息类型：${item.intentType || "-"}`,
    "请给出：1）消息要点 2）建议动作 3）可直接发送的回复草稿。",
    "保持对话式表达，不要写成长报告。",
  ].join("\n");

export const buildDepartmentPrompt = (department: string, actorName: string) =>
  [
    `你是${actorName}的红智秘书。`,
    `请汇总【${department}】当前状态、重点进展、阻塞风险和下一步建议。`,
    "输出精简要点，并指出需要跨部门协同的事项。",
  ].join("\n");

export const buildDispatchPrompt = (sceneLabel: string, actorName: string) =>
  [
    `你是${actorName}的红智秘书。`,
    `用户准备发起「${sceneLabel}」。`,
    "请先追问关键信息（目标对象、时间、内容、截止时间），",
    "再生成可直接分发给对应员工分身信箱的通知正文。",
  ].join("\n");

export const buildPartyDispatchPrompt = (
  sceneLabel: string,
  actorName: string,
  goal: string,
  deliverables: string[],
) =>
  [
    `你是${actorName}的红智秘书。`,
    `用户准备发起党建场景「${sceneLabel}」。`,
    `本次目标：${goal}`,
    `请输出：${deliverables.map((item, index) => `${index + 1}) ${item}`).join("；")}`,
    "优先采用正式、简洁、可直接落地的党务表达。",
    "如信息不足，请先用 2-3 个问题补齐关键字段，再给出可直接执行的模板。",
  ].join("\n");

export const buildContextPrompt = (context: string, actorName: string) =>
  [
    `你是${actorName}的红智秘书。`,
    `当前用户正处于：${context}`,
    "请基于此上下文，主动提供相关的帮助建议或解读。",
    "保持简洁自然。",
  ].join("\n");

export const buildDepartmentProcessingText = (department: string) =>
  `正在汇总「${department}」的任务进展、阻塞风险与协同建议...`;

export const buildDispatchProcessingText = (sceneLabel: string) =>
  `正在梳理「${sceneLabel}」的分发要点并生成秘书建议...`;

export const buildPartyDispatchProcessingText = (sceneLabel: string) =>
  `正在生成「${sceneLabel}」的党建模板、流程提醒与执行建议...`;

export const buildInboxNoticeProcessingText = (item: InboxItem) =>
  `正在整理来自「${item.source}」的新消息提醒...`;

export const buildInboxFollowupProcessingText = (item: InboxItem) =>
  `正在加载「${item.title}」的要点与建议回复...`;

export const collectDepartmentsFromUsers = (
  users: Array<{ department?: string }>,
  fallbackDepartment = "",
): string[] =>
  Array.from(
    new Set(
      [...users.map((item) => String(item.department || "").trim()), String(fallbackDepartment || "").trim()].filter(
        (item) => item && item !== "管理员",
      ),
    ),
  ).sort();
