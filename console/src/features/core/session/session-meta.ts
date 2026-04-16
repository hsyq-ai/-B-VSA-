export const DEFAULT_CHANNEL = "console";
export const DEFAULT_SESSION_NAME = "New Chat";

export const getDefaultUserId = (): string => {
  if (typeof window === "undefined") return "default";
  return (
    sessionStorage.getItem("copaw_user_id") ||
    sessionStorage.getItem("copaw_profile_id") ||
    localStorage.getItem("copaw_user_id") ||
    localStorage.getItem("copaw_profile_id") ||
    "default"
  );
};

interface PushSource {
  source_user_id: string;
  source_user_name: string;
}

interface BuildPushSessionMetaArgs {
  baseMeta?: unknown;
  pushSource?: PushSource;
  pushConversationKey?: string;
  pushSessionId?: string;
  pushChatId?: string;
  pushTraceId?: string;
  pushIntentType?: string;
  sourceAgentId?: string;
  targetAgentId?: string;
  pushMessageId?: string;
}

export type PartyBizCategoryKey =
  | "general"
  | "directive"
  | "affairs"
  | "care"
  | "activity"
  | "learning"
  | "evaluation"
  | "ranking";

export type PartyFlowStatusKey = "unknown" | "todo" | "doing" | "done" | "review";

export interface PartyTaskEvent {
  label: string;
  status?: string;
  at?: string;
  detail?: string;
  source?: string;
}

export interface PartyTaskMetaInput {
  biz_domain?: string;
  module?: string;
  party_module?: string;
  task_id?: string;
  status?: string;
  party_item_id?: string;
  party_title?: string;
  party_status?: string;
  party_stage?: string;
  party_priority?: string;
  party_reminder_status?: string;
  party_receipt_status?: string;
  party_deadline?: string;
  trace_id?: string;
  conversation_key?: string;
  session_id?: string;
}

const PARTY_MODULE_ALIASES: Record<string, string> = {
  affairs: "party-affairs",
  "party-affair": "party-affairs",
  "party-affairs": "party-affairs",
  "directive-center": "party-directive-center",
  directives: "party-directive-center",
  directive: "party-directive-center",
  "party-directive-center": "party-directive-center",
  archive: "party-archive",
  "party-archive": "party-archive",
  "organization-care": "party-organization-care",
  care: "party-organization-care",
  "party-organization-care": "party-organization-care",
  "activity-collab": "party-activity-collab",
  activity: "party-activity-collab",
  "party-activity-collab": "party-activity-collab",
  "learning-coach": "party-learning-coach",
  learning: "party-learning-coach",
  "party-learning-coach": "party-learning-coach",
  "member-evaluation": "party-member-evaluation",
  evaluation: "party-member-evaluation",
  "party-member-evaluation": "party-member-evaluation",
  "branch-ranking": "party-branch-ranking",
  ranking: "party-branch-ranking",
  "party-branch-ranking": "party-branch-ranking",
};

const PARTY_MODULE_LABEL_MAP: Record<string, string> = {
  "party-directive-center": "指示直达",
  "party-archive": "党员风貌",
  "party-affairs": "事务中心",
  "party-organization-care": "组织关怀",
  "party-activity-collab": "活动协同",
  "party-learning-coach": "思政辅导",
  "party-member-evaluation": "党员测评",
  "party-branch-ranking": "支部评比",
};

const PARTY_CATEGORY_MAP: Record<string, { key: PartyBizCategoryKey; label: string }> = {
  "party-directive-center": { key: "directive", label: "指示" },
  "party-archive": { key: "affairs", label: "党务" },
  "party-affairs": { key: "affairs", label: "党务" },
  "party-organization-care": { key: "care", label: "关怀" },
  "party-activity-collab": { key: "activity", label: "活动" },
  "party-learning-coach": { key: "learning", label: "学习" },
  "party-member-evaluation": { key: "evaluation", label: "测评" },
  "party-branch-ranking": { key: "ranking", label: "评比" },
};

const normalizeText = (value: unknown): string => String(value || "").trim();

const toMetaRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value ? (value as Record<string, unknown>) : {};

const includesAny = (value: string, keywords: string[]): boolean => {
  const normalized = value.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
};

export const resolvePartyModuleKey = (metaOrValue: unknown): string => {
  const raw =
    typeof metaOrValue === "string"
      ? metaOrValue
      : normalizeText((metaOrValue as Record<string, unknown> | null | undefined)?.party_module) ||
        normalizeText((metaOrValue as Record<string, unknown> | null | undefined)?.module);

  const normalized = raw
    .toLowerCase()
    .replace(/[_.:/]+/g, "-")
    .replace(/\s+/g, "-")
    .trim();

  if (!normalized) return "";
  return PARTY_MODULE_ALIASES[normalized] || normalized;
};

export const isPartyMeta = (meta: Record<string, unknown>): boolean => {
  const moduleKey = resolvePartyModuleKey(meta);
  if (normalizeText(meta.biz_domain) === "party") return true;
  if (moduleKey.startsWith("party-")) return true;
  return Object.keys(meta).some((key) => key.startsWith("party_"));
};

export const resolvePartyModuleLabel = (meta: Record<string, unknown>): string => {
  const moduleKey = resolvePartyModuleKey(meta);
  if (moduleKey) return PARTY_MODULE_LABEL_MAP[moduleKey] || moduleKey;
  return normalizeText(meta.module) || normalizeText(meta.party_module) || "-";
};

export const resolvePartyBizCategory = (
  meta: Record<string, unknown>,
): { key: PartyBizCategoryKey; label: string } => {
  if (!isPartyMeta(meta)) {
    return { key: "general", label: "通用" };
  }
  const moduleKey = resolvePartyModuleKey(meta);
  return PARTY_CATEGORY_MAP[moduleKey] || { key: "affairs", label: "党务" };
};

export const resolvePartyFlowStatus = (meta: Record<string, unknown>): string => {
  const explicit = normalizeText(meta.party_flow_status);
  if (explicit) return explicit;

  const source = [
    normalizeText(meta.party_stage),
    normalizeText(meta.party_status),
    normalizeText(meta.status),
    normalizeText(meta.party_receipt_status),
  ]
    .filter(Boolean)
    .join(" | ");

  if (!source) return "-";
  if (includesAny(source, ["待复核", "审批中", "复核", "待审批", "待评审"])) return "待复核";
  if (includesAny(source, ["已完成", "已办结", "已回访", "已评定", "closed", "completed", "done"])) {
    return "已完成";
  }
  if (includesAny(source, ["待处理", "待关怀", "待学习", "待分派", "待回执", "未开始", "todo", "pending"])) {
    return "待办";
  }
  if (includesAny(source, ["跟进中", "学习中", "参评中", "执行中", "进行中", "处理中", "回执中", "催办", "processing", "in-progress", "in_progress"])) {
    return "执行中";
  }
  return source;
};

export const resolvePartyFlowStatusKey = (status: string): PartyFlowStatusKey => {
  if (status === "待办") return "todo";
  if (status === "执行中") return "doing";
  if (status === "已完成") return "done";
  if (status === "待复核") return "review";
  return "unknown";
};

export const upsertPartySessionMeta = (args: {
  baseMeta?: unknown;
  patch?: PartyTaskMetaInput | Record<string, unknown>;
}): Record<string, unknown> => {
  const merged: Record<string, unknown> = {
    ...toMetaRecord(args.baseMeta),
    ...toMetaRecord(args.patch),
  };

  if (!isPartyMeta(merged)) {
    return merged;
  }

  const moduleKey = resolvePartyModuleKey(merged);
  const category = resolvePartyBizCategory(merged);
  const flowStatus = resolvePartyFlowStatus(merged);

  merged.biz_domain = "party";
  if (moduleKey) {
    merged.module = moduleKey;
    merged.party_module = moduleKey;
  }
  merged.party_category = category.label;
  merged.party_flow_status = flowStatus;
  if (!normalizeText(merged.status)) {
    merged.status = normalizeText(merged.party_status) || normalizeText(merged.party_stage) || flowStatus;
  }
  if (!normalizeText(merged.task_id) && normalizeText(merged.party_item_id)) {
    merged.task_id = normalizeText(merged.party_item_id);
  }
  if (!normalizeText(merged.party_title) && normalizeText(merged.title)) {
    merged.party_title = normalizeText(merged.title);
  }

  return merged;
};

export const appendPartyTaskEvent = (
  meta: Record<string, unknown>,
  event: PartyTaskEvent,
): Record<string, unknown> => {
  const normalized = upsertPartySessionMeta({ baseMeta: meta, patch: meta });
  const nextEvent: PartyTaskEvent = {
    label: normalizeText(event.label) || "流程更新",
    status: normalizeText(event.status) || undefined,
    detail: normalizeText(event.detail) || undefined,
    source: normalizeText(event.source) || undefined,
    at: normalizeText(event.at) || new Date().toISOString(),
  };
  const history = Array.isArray(normalized.party_task_events)
    ? (normalized.party_task_events as PartyTaskEvent[])
    : [];
  normalized.party_task_events = [...history, nextEvent].slice(-20);
  return normalized;
};

export const normalizeSessionMeta = (meta?: Record<string, unknown> | null): Record<string, unknown> => {
  const base = toMetaRecord(meta);
  if (!isPartyMeta(base)) return base;
  return upsertPartySessionMeta({ baseMeta: base, patch: base });
};

export const buildPushSessionMeta = ({
  baseMeta,
  pushSource,
  pushConversationKey,
  pushSessionId,
  pushChatId,
  pushTraceId,
  pushIntentType,
  sourceAgentId,
  targetAgentId,
  pushMessageId,
}: BuildPushSessionMetaArgs): Record<string, unknown> => {
  const meta: Record<string, unknown> = {
    ...(typeof baseMeta === "object" && baseMeta ? (baseMeta as Record<string, unknown>) : {}),
  };

  if (pushSource?.source_user_id) {
    meta.push_source_user_id = pushSource.source_user_id;
    meta.push_source_user_name = pushSource.source_user_name || "";
  }
  if (pushConversationKey) meta.push_conversation_key = pushConversationKey;
  if (pushSessionId) meta.push_session_id = pushSessionId;
  if (pushChatId) meta.push_chat_id = pushChatId;
  if (pushTraceId) meta.push_trace_id = pushTraceId;
  if (pushIntentType) meta.push_intent_type = pushIntentType;
  if (sourceAgentId) meta.source_agent_id = sourceAgentId;
  if (targetAgentId) meta.target_agent_id = targetAgentId;
  if (pushMessageId) meta.push_message_id = pushMessageId;

  return normalizeSessionMeta(meta);
};
