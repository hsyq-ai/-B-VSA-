import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, Col, DatePicker, Empty, Form, Input, List, Modal, Row, Select, Space, Tabs, Tag, Typography, message } from "antd";
import { 
  Sparkles, 
  MessageSquare, 
  LayoutDashboard, 
  Send, 
  History, 
  Zap, 
  ShieldCheck, 
  Users, 
  Compass,
  ArrowRight,
  RefreshCw,
  Bell,
  Maximize2,
  Minimize2
} from "lucide-react";
import type { Dayjs } from "dayjs";
import sessionApi from "../Chat/sessionApi";
import { agentOsApi } from "../../api/modules/agentOs";
import { partyAffairsApi, type PartyAffairItem } from "../../api/modules/partyAffairs";
import { getStoredLoginEpoch } from "../../components/AuthModal";
import { useNavigate } from "react-router-dom";
import {
  type InboxItem,
  buildContextPrompt,
  buildDepartmentProcessingText,
  buildDepartmentPrompt,
  buildDispatchProcessingText,
  buildDispatchPrompt,
  buildHiddenPromptHistory,
  buildPartyDispatchProcessingText,
  buildPartyDispatchPrompt,
  buildInboxFollowupProcessingText,
  buildInboxFollowupPrompt,
  buildInboxNoticeProcessingText,
  buildInboxNoticePrompt,
  buildSecretaryWelcomePrompt,
  collectDepartmentsFromUsers,
} from "../../features/core/secretary/secretaryPrompts";
import { createSecretarySessionStorage } from "../../features/core/secretary/secretarySessionStorage";

const { Paragraph, Text, Title } = Typography;

const NUMERIC_SESSION_ID_REGEX = /^\d+$/;

interface SecretaryFrameWindow extends Window {
  currentSessionId?: string;
  __copawHiddenSubmitReady?: boolean;
}

interface DispatchFormValues {
  target_user_id: string;
  topic: string;
  content: string;
  dispatch_mode?: "notify" | "task-card";
  priority?: "高" | "中" | "低";
  deadline?: Dayjs;
}

interface PartyTemplateEntry {
  key: string;
  label: string;
  description: string;
  goal: string;
  deliverables: string[];
  dispatchTopic?: string;
  dispatchMode?: "notify" | "task-card";
  path?: string;
  query?: Record<string, string | undefined>;
}

const sortTaskCards = (items: PartyAffairItem[]) =>
  [...items].sort((left, right) => {
    const leftTs = new Date(left.updated_at || left.created_at || 0).getTime();
    const rightTs = new Date(right.updated_at || right.created_at || 0).getTime();
    return rightTs - leftTs;
  });

const resolveTaskBadgeColor = (value?: string) => {
  if (String(value || "").includes("完成")) return "success";
  if (String(value || "").includes("回执") || String(value || "").includes("跟进") || String(value || "").includes("执行")) {
    return "processing";
  }
  if (String(value || "").includes("待")) return "warning";
  return "default";
};

export default function EmployeeSecretary() {
  const navigate = useNavigate();
  const [loadingInbox, setLoadingInbox] = useState(false);
  const [inboxItems, setInboxItems] = useState<InboxItem[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [activeUsers, setActiveUsers] = useState<Array<{ user_id: string; name: string; department?: string; position?: string }>>([]);
  const [dispatchVisible, setDispatchVisible] = useState(false);
  const [dispatchSubmitting, setDispatchSubmitting] = useState(false);
  const [dispatchTopic, setDispatchTopic] = useState("");
  const [chatSrc, setChatSrc] = useState("");
  const [chatTitle, setChatTitle] = useState("红智秘书会话");
  const [chatFrameReady, setChatFrameReady] = useState(false);
  const [secretaryStatusText, setSecretaryStatusText] = useState("");
  const [taskCards, setTaskCards] = useState<PartyAffairItem[]>([]);
  const [loadingTaskCards, setLoadingTaskCards] = useState(false);
  const [showDepartmentBoard, setShowDepartmentBoard] = useState(false);
  const [chatFocused, setChatFocused] = useState(false);

  // 提前获取 userId，用于后续的 key 生成
  const userId =
    sessionStorage.getItem("copaw_user_id") ||
    localStorage.getItem("copaw_user_id") ||
    "default";

  const secretaryStorage = useMemo(() => createSecretarySessionStorage(userId), [userId]);
  const { secretaryBootstrappedEpochKey, secretaryInboxSeenKey } = secretaryStorage;
  const secretaryBootstrappedEpochRef = useRef(
    sessionStorage.getItem(secretaryBootstrappedEpochKey) || ""
  );
  const pendingProcessingStatusRef = useRef("");
  const pendingPromptRef = useRef<{
    key: string;
    prompt: string;
    meta: Record<string, unknown>;
    sessionId: string;
    processingText?: string;
  } | null>(null);
  const secretarySessionIdRef = useRef<string | null>(null);
  const loadedSecretarySessionIdRef = useRef("");
  const chatFrameRef = useRef<HTMLIFrameElement | null>(null);
  const handoffRetryTimerRef = useRef<number | null>(null);
  const inboxSeenRef = useRef<Set<string>>(new Set());
  const [dispatchForm] = Form.useForm<DispatchFormValues>();
  const dispatchMode = Form.useWatch("dispatch_mode", dispatchForm);

  const rawName =
    sessionStorage.getItem("copaw_user_name") ||
    localStorage.getItem("copaw_user_name") ||
    "当前员工";
  const department =
    sessionStorage.getItem("copaw_department") ||
    localStorage.getItem("copaw_department") ||
    "";
  const actorName = (() => {
    const name = String(rawName || "").trim();
    if (String(department).trim() !== "总裁办" || !name) return rawName;
    if (name.endsWith("总")) return name;
    const surname = name.slice(0, 1);
    return surname ? `${surname}总` : name;
  })();

  const getCurrentLoginEpoch = () =>
    String(getStoredLoginEpoch() || (window as any).currentLoginEpoch || "").trim();

  const getEffectiveLoginEpoch = () => {
    const current = getCurrentLoginEpoch();
    if (current) return current;
    const cached = String(secretaryBootstrappedEpochRef.current || "").trim();
    if (cached) return cached;
    const generated = String(Date.now());
    secretaryBootstrappedEpochRef.current = generated;
    sessionStorage.setItem(secretaryBootstrappedEpochKey, generated);
    return generated;
  };

  const persistSecretarySessionId = (sessionId: string, epoch?: string) => {
    secretaryStorage.persistSecretarySessionId(
      sessionId,
      String(epoch || getEffectiveLoginEpoch() || "").trim(),
    );
  };

  const clearStoredSecretarySessionId = (epoch?: string) => {
    secretaryStorage.clearStoredSecretarySessionId(epoch);
  };

  const getStoredSecretarySessionId = (epoch?: string) =>
    secretaryStorage.getStoredSecretarySessionId(epoch);

  const getStoredSecretaryWelcomeEpoch = () =>
    secretaryStorage.getStoredSecretaryWelcomeEpoch();

  const persistSecretaryWelcomeEpoch = (epoch: string) => {
    secretaryStorage.persistSecretaryWelcomeEpoch(epoch);
  };

  const clearStoredSecretaryWelcomeEpoch = () => {
    secretaryStorage.clearStoredSecretaryWelcomeEpoch();
  };

  const logSecretaryDebug = (event: string, payload?: Record<string, unknown>) => {
    console.info(`[Secretary] ${event}`, payload || {});
  };

  const getSecretarySessionSnapshot = (sessionId: string, loginEpoch: string) => {
    const session = sessionApi.peekSession(sessionId);
    const meta = (sessionApi.getSessionMeta(sessionId) || {}) as Record<string, unknown>;
    const sessionEpoch = String(meta.secretary_login_epoch || "");
    const loginMatches = !loginEpoch || !sessionEpoch || sessionEpoch === loginEpoch;
    const messages = Array.isArray((session as any)?.messages) ? (session as any).messages : [];
    const messageCount = messages.length;
    const assistantMessageCount = messages.filter((item: any) => {
      const role = String(item?.role || item?.message?.role || item?.data?.role || "").toLowerCase();
      return role === "assistant" || role === "system";
    }).length;
    const bootstrapConsumed = Boolean(meta.secretary_bootstrap_consumed);
    const bootstrapDispatched = Boolean(meta.secretary_bootstrap_dispatched);
    const bootstrapCompleted = Boolean(meta.secretary_bootstrap_completed);
    const lastTriggerAt = Number(meta.secretary_last_trigger_at || 0);
    const recentlyTriggered = lastTriggerAt > 0 && Date.now() - lastTriggerAt < 90000;
    const inFlight = loginMatches && bootstrapConsumed && recentlyTriggered && assistantMessageCount === 0;
    const awakened = loginMatches && (assistantMessageCount > 0 || bootstrapCompleted);
    return {
      session,
      meta,
      sessionEpoch,
      loginMatches,
      messageCount,
      assistantMessageCount,
      bootstrapConsumed,
      bootstrapDispatched,
      bootstrapCompleted,
      lastTriggerAt,
      recentlyTriggered,
      inFlight,
      awakened,
      realId: String((session as any)?.realId || ""),
      sessionId: String((session as any)?.id || sessionId || ""),
    };
  };

  const resolveSecretarySessionAliases = (sessionId: string): Set<string> => {
    const normalized = String(sessionId || "").trim();
    const aliases = new Set<string>(normalized ? [normalized] : []);
    const session = sessionApi.peekSession(normalized) as any;
    [session?.id, session?.realId, session?.sessionId].forEach((value) => {
      const next = String(value || "").trim();
      if (next) aliases.add(next);
    });
    return aliases;
  };

  const isSameSecretarySession = (left: string, right: string): boolean => {
    const leftAliases = resolveSecretarySessionAliases(left);
    const rightAliases = resolveSecretarySessionAliases(right);
    if (!leftAliases.size || !rightAliases.size) return false;
    for (const candidate of leftAliases) {
      if (rightAliases.has(candidate)) return true;
    }
    return false;
  };

  const dispatchActions = useMemo(
    () => [
      { key: "contact-collab", label: "协同任务" },
      { key: "contact-event", label: "活动事项" },
      { key: "contact-meeting", label: "会议通知" },
      { key: "contact-vote", label: "投票" },
    ],
    [],
  );

  const partyQuickEntries = useMemo<Array<{ key: string; label: string; description: string; path: string; query: Record<string, any> }>>(
    () => [
      {
        key: "party-directive-center",
        label: "指示直达",
        description: "查看上级精神传达、执行转化与文稿建议",
        path: "/app/party/directive-center",
        query: {},
      },
      {
        key: "party-archive",
        label: "党员风貌",
        description: "查看党员画像、先锋示范与纪实留痕",
        path: "/app/party/archive",
        query: {},
      },
      {
        key: "party-affairs",
        label: "事务中心",
        description: "统一发起和跟踪会议、通知与党务事项",
        path: "/app/party/party-affairs",
        query: {},
      },
      {
        key: "party-member-evaluation",
        label: "党员测评",
        description: "查看测评结果、先锋对象与成长建议",
        path: "/app/party/member-evaluation",
        query: {},
      },
      {
        key: "party-branch-ranking",
        label: "支部评比",
        description: "查看支部排名、梯队分布与储备建议",
        path: "/app/party/branch-ranking",
        query: {},
      },
      {
        key: "party-care",
        label: "组织关怀",
        description: "快速发起重点人员关怀与回访闭环",
        path: "/app/party/organization-care",
        query: {
          employee: actorName,
          department,
          topic: "秘书触发：一线员工关怀跟进",
          owner: actorName,
        },
      },
      {
        key: "party-coach",
        label: "思政辅导",
        description: "快速发起学习辅导与微课跟踪任务",
        path: "/app/party/learning-coach",
        query: {
          learner: actorName,
          topic: "秘书触发：政策学习巩固",
          weakness: "近期政策条款理解需要强化",
          mentor: actorName,
        },
      },
    ],
    [actorName, department],
  );

  const partyTemplateEntries = useMemo<PartyTemplateEntry[]>(
    () => [
      {
        key: "party-life",
        label: "三会一课 / 组织生活",
        description: "生成通知、议程与纪要模板，适合书记一键发起。",
        goal: "快速形成正式的会议通知、议程安排与会后纪要骨架。",
        deliverables: ["需补充的关键信息", "可直接发送的通知正文", "会议议程与纪要结构"],
        dispatchTopic: "三会一课 / 组织生活安排",
        dispatchMode: "task-card",
      },
      {
        key: "party-notice",
        label: "党务通知与纪要",
        description: "沉淀通知口径、执行要求和归档纪要。",
        goal: "生成正式的党务通知，并同步给出执行要求和纪要留痕建议。",
        deliverables: ["通知标题与正文", "执行要求清单", "纪要归档建议"],
        dispatchTopic: "党务通知与纪要",
        dispatchMode: "notify",
      },
      {
        key: "party-activity-receipt",
        label: "活动报名回执催办",
        description: "覆盖报名、回执、催办和复盘提醒。",
        goal: "为党建活动生成报名通知、回执催办话术和节奏提醒。",
        deliverables: ["活动通知模板", "回执催办话术", "执行节奏提醒"],
        dispatchTopic: "活动报名回执与催办",
        dispatchMode: "task-card",
      },
      {
        key: "party-care-followup",
        label: "组织关怀跟进",
        description: "把重点人员观察、谈话纪要和回访动作收进闭环。",
        goal: "先梳理关怀重点，再引导进入组织关怀页完成登记。",
        deliverables: ["关怀观察要点", "谈话提纲", "回访动作建议"],
        path: "/app/party/organization-care",
        query: {
          employee: actorName,
          department,
          topic: "秘书触发：重点关怀跟进",
          owner: actorName,
        },
      },
      {
        key: "party-learning",
        label: "思政学习辅导",
        description: "生成学习计划、微课推荐和复盘提纲。",
        goal: "为党员生成伴随式学习辅导建议，并引导进入学习辅导页沉淀任务。",
        deliverables: ["学习计划骨架", "微课/政策材料建议", "学习复盘提纲"],
        path: "/app/party/learning-coach",
        query: {
          learner: actorName,
          topic: "秘书触发：主题教育学习辅导",
          weakness: "近期政策理解需要强化",
          mentor: actorName,
        },
      },
      {
        key: "party-evaluation",
        label: "党员测评建议",
        description: "生成评语摘要、先锋候选建议与成长提醒。",
        goal: "给出党员测评的评语框架、先锋示范建议和后续成长提醒。",
        deliverables: ["测评评语模板", "先锋示范建议", "成长跟进动作"],
        path: "/app/party/member-evaluation",
      },
      {
        key: "party-ranking",
        label: "支部评比研判",
        description: "生成先进支部建议名单、后进辅导提示和干部储备观察。",
        goal: "帮助书记快速形成支部评比结论与梯队观察意见。",
        deliverables: ["评比结论摘要", "先进支部建议名单", "后进支部改进建议"],
        path: "/app/party/branch-ranking",
      },
      {
        key: "party-directive-report",
        label: "政策解读 / 企业分析",
        description: "请求政策解读、企业画像和分析文稿建议。",
        goal: "把上级精神与企业实际结合，生成解读和企业特征化成文建议。",
        deliverables: ["政策解读要点", "企业画像结构", "报告成文提纲"],
        path: "/app/party/directive-center",
      },
    ],
    [actorName, department],
  );

  const recentTaskCards = useMemo(() => sortTaskCards(taskCards).slice(0, 5), [taskCards]);

  const researchQuickEntries = useMemo(
    () => [
      {
        key: "research-experiment-create",
        label: "创建科研实验任务",
        path: "/app/research-experiment",
        query: {
          action: "create",
          title: "秘书触发：探索固态电池新型电解质",
          goal: "整理当前最新的文献并总结关键路线",
        },
      },
      {
        key: "research-data-analysis",
        label: "发起数据分析任务",
        path: "/app/workspace",
        query: {
          scene: "dashboard-research-data",
        },
      },
    ],
    [],
  );

  const openPartyQuickEntry = (entry: { path: string; query: Record<string, any> }) => {
    const params = new URLSearchParams(
      Object.entries(entry.query).reduce<Record<string, string>>((acc, [k, v]) => {
        const value = String(v || "").trim();
        if (value) acc[k] = value;
        return acc;
      }, {}),
    ).toString();
    navigate(`${entry.path}${params ? `?${params}` : ""}`);
  };

  const loadTaskCards = useCallback(async () => {
    setLoadingTaskCards(true);
    try {
      const list = await partyAffairsApi.list({ biz_domain: "party" });
      setTaskCards(sortTaskCards(list).slice(0, 8));
    } catch (err) {
      console.warn("Failed to load secretary task cards:", err);
      setTaskCards([]);
    } finally {
      setLoadingTaskCards(false);
    }
  }, []);

  const openDispatchModal = (
    topicLabel: string,
    options?: { dispatchMode?: "notify" | "task-card" },
  ) => {
    setDispatchTopic(topicLabel);
    dispatchForm.setFieldsValue({
      topic: topicLabel,
      content: "",
      target_user_id: undefined,
      dispatch_mode: options?.dispatchMode || (topicLabel === "协同任务" || topicLabel === "活动事项" ? "task-card" : "notify"),
      priority: "中",
      deadline: undefined,
    });
    setDispatchVisible(true);
  };

  const handlePartyTemplate = async (entry: PartyTemplateEntry) => {
    await runSecretaryTask(
      buildPartyDispatchPrompt(entry.label, actorName, entry.goal, entry.deliverables),
      { secretary_party_template: entry.key },
      buildPartyDispatchProcessingText(entry.label),
    );
    if (entry.dispatchTopic) {
      openDispatchModal(entry.dispatchTopic, { dispatchMode: entry.dispatchMode });
      return;
    }
    if (entry.path) {
      openPartyQuickEntry({ path: entry.path, query: entry.query || {} });
    }
  };

  const warmSecretarySessions = async (): Promise<any[]> => {
    try {
      return await sessionApi.getSessionList();
    } catch (err) {
      console.warn("Failed to warm secretary session list:", err);
      return [];
    }
  };

  const isMatchingSecretarySession = (session: any, loginEpoch: string) => {
    if (!session) return false;
    const meta = ((session as any).meta || {}) as Record<string, unknown>;
    if (String(meta.scene || "") !== "secretary-home") return false;
    if (!loginEpoch) return true;
    return String(meta.secretary_login_epoch || "") === loginEpoch;
  };

  const getPreferredSecretarySessionId = (session: any, fallback = "") =>
    String((session as any)?.realId || (session as any)?.id || fallback || "").trim();

  const pickSecretaryCandidate = (
    sessions: any[],
    loginEpoch: string,
    storedId: string,
  ) =>
    [...sessions]
      .filter((session) => isMatchingSecretarySession(session, loginEpoch))
      .sort((left, right) => {
        const score = (session: any) => {
          const ids = [
            String((session as any)?.id || ""),
            String((session as any)?.realId || ""),
            String((session as any)?.sessionId || ""),
          ];
          const preferredId =
            String((session as any)?.realId || (session as any)?.id || (session as any)?.sessionId || "");
          const snapshot = getSecretarySessionSnapshot(preferredId, loginEpoch);
          let value = ids.includes(storedId) ? 100 : 0;
          if (snapshot.awakened) value += 400;
          if (snapshot.bootstrapConsumed) value += 120;
          value += snapshot.messageCount * 5;
          if ((session as any)?.realId) value += 40;
          if (!NUMERIC_SESSION_ID_REGEX.test(String((session as any)?.id || ""))) value += 20;
          return value;
        };
        return score(right) - score(left);
      })[0];

  const setSecretarySession = (sessionId: string, forceReload = false) => {
    const existing = sessionApi.peekSession(sessionId);
    const nextId =
      String((existing as any)?.id || (existing as any)?.sessionId || sessionId || "").trim() ||
      sessionId;
    const loginEpoch = getEffectiveLoginEpoch();
    const nextSrcBase = `/app/workspace-embed/${encodeURIComponent(nextId)}?secretary=1`;
    const nextSrc = forceReload ? `${nextSrcBase}&t=${Date.now()}` : nextSrcBase;

    logSecretaryDebug("set-session", {
      requestedId: sessionId,
      resolvedId: nextId,
      forceReload,
      currentId: secretarySessionIdRef.current || "",
      hasChatSrc: Boolean(chatSrc),
      hasRealId: Boolean((existing as any)?.realId),
    });

    if (!forceReload && secretarySessionIdRef.current === nextId && chatSrc.startsWith(nextSrcBase)) {
      return;
    }

    secretarySessionIdRef.current = nextId;
    loadedSecretarySessionIdRef.current = "";
    stopHandoffRetryLoop();
    persistSecretarySessionId(nextId, loginEpoch);
    setChatTitle("红智秘书会话");
    setChatFrameReady(false);
    setChatSrc(nextSrc);
  };

  const findExistingSecretarySession = async (
    loginEpoch: string,
  ): Promise<string | null> => {
    const stored = getStoredSecretarySessionId(loginEpoch);
    const sessions = await warmSecretarySessions();
    const epochSessions = [...sessions].filter((session) =>
      isMatchingSecretarySession(session, loginEpoch),
    );

    const resolveFromStored = () => {
      if (!stored) return "";
      const ids = new Set(
        [
          String(stored || "").trim(),
          String((sessionApi.peekSession(stored) as any)?.id || "").trim(),
          String((sessionApi.peekSession(stored) as any)?.realId || "").trim(),
          String((sessionApi.peekSession(stored) as any)?.sessionId || "").trim(),
        ].filter(Boolean),
      );
      const matched = epochSessions.find((session: any) => {
        const sid = String(session?.id || "").trim();
        const rid = String(session?.realId || "").trim();
        const ssid = String(session?.sessionId || "").trim();
        return ids.has(sid) || ids.has(rid) || ids.has(ssid);
      }) as any;
      return String(matched?.realId || matched?.id || "").trim();
    };

    if (stored) {
      const storedId = resolveFromStored();
      if (storedId) {
        logSecretaryDebug("find-existing:stored", {
          storedId: stored,
          resolvedId: storedId,
          loginEpoch,
        });
        return storedId;
      }
      clearStoredSecretarySessionId(loginEpoch);
      logSecretaryDebug("find-existing:stored-stale", { storedId: stored, loginEpoch });
    }

    const preferredCandidate = pickSecretaryCandidate(
      [...epochSessions],
      loginEpoch,
      "",
    );
    if (!preferredCandidate) return null;

    const nextId = getPreferredSecretarySessionId(preferredCandidate, "");
    if (!nextId) return null;

    const snapshot = getSecretarySessionSnapshot(nextId, loginEpoch);
    logSecretaryDebug("find-existing:preferred", {
      nextId,
      loginEpoch,
      awakened: snapshot.awakened,
      messageCount: snapshot.messageCount,
      bootstrapConsumed: snapshot.bootstrapConsumed,
      bootstrapDispatched: snapshot.bootstrapDispatched,
      sessionEpoch: snapshot.sessionEpoch,
    });
    return nextId;
  };

  const syncChatFrameReady = () => {
    const targetWindow = chatFrameRef.current?.contentWindow as SecretaryFrameWindow | null | undefined;
    const ready = Boolean(targetWindow?.__copawHiddenSubmitReady);
    if (!ready) return false;
    const resolvedId = String(
      targetWindow?.currentSessionId || loadedSecretarySessionIdRef.current || secretarySessionIdRef.current || "",
    ).trim();
    if (resolvedId) {
      loadedSecretarySessionIdRef.current = resolvedId;
    }
    setChatFrameReady(true);
    return true;
  };

  const stopHandoffRetryLoop = () => {
    if (handoffRetryTimerRef.current) {
      window.clearInterval(handoffRetryTimerRef.current);
      handoffRetryTimerRef.current = null;
    }
  };

  const ensureHandoffRetryLoop = () => {
    if (handoffRetryTimerRef.current) return;
    handoffRetryTimerRef.current = window.setInterval(() => {
      syncChatFrameReady();
      flushPendingProcessingStatus();
      flushPendingPrompt();
      if (!pendingPromptRef.current && !pendingProcessingStatusRef.current) {
        stopHandoffRetryLoop();
      }
    }, 160);
  };

  const setSecretaryProcessingStatus = (
    text: string,
    options: { handoff?: boolean } = {},
  ) => {
    const nextText = String(text || "").trim();
    const shouldHandoff = options.handoff !== false;
    pendingProcessingStatusRef.current = nextText && shouldHandoff ? nextText : "";
    setSecretaryStatusText(nextText);
    if (nextText && shouldHandoff) {
      ensureHandoffRetryLoop();
      return;
    }
    emitProcessingStatus("");
    if (!pendingPromptRef.current) {
      stopHandoffRetryLoop();
    }
  };

  const clearSecretaryProcessingStatus = () => {
    setSecretaryProcessingStatus("", { handoff: false });
  };

  const flushPendingProcessingStatus = () => {
    const text = String(pendingProcessingStatusRef.current || "").trim();
    if (!text) return true;
    if (!emitProcessingStatus(text)) return false;
    pendingProcessingStatusRef.current = "";
    setSecretaryStatusText("");
    if (!pendingPromptRef.current) {
      stopHandoffRetryLoop();
    }
    return true;
  };

  const ensureSecretarySession = async (): Promise<string> => {
    if (secretarySessionIdRef.current) return secretarySessionIdRef.current;
    const loginEpoch = getEffectiveLoginEpoch();
    const existingId = await findExistingSecretarySession(loginEpoch);
    if (existingId) {
      logSecretaryDebug("ensure-session:reuse", { existingId, loginEpoch });
      setSecretarySession(existingId);
      return existingId;
    }

    setSecretaryProcessingStatus("红智秘书正在唤醒中...");
    const result = await sessionApi.createSession({
      name: "红智秘书会话",
      meta: {
        scene: "secretary-home",
        scene_label: "红智秘书",
        locked_session_name: true,
        session_display_name: "红智秘书会话",
        secretary_bootstrap: true,
        secretary_bootstrap_dispatched: false,
        secretary_mode: "welcome",
        secretary_last_seen_date: new Date().toISOString().slice(0, 10),
        secretary_login_epoch: loginEpoch,
      },
    } as any);
    const nextId = String(result?.[0]?.id || "");
    if (!nextId) {
      throw new Error("Failed to initialize secretary session");
    }
    logSecretaryDebug("ensure-session:create", { nextId, loginEpoch });
    setSecretarySession(nextId, true);
    return nextId;
  };

  const runSecretaryTask = async (
    prompt: string,
    meta: Record<string, unknown> = {},
    processingText = "红智秘书正在处理当前请求...",
  ): Promise<boolean> => {
    setSecretaryProcessingStatus(processingText);
    return dispatchSecretaryPrompt(prompt, meta);
  };

  const ensureSecretaryWelcomeForLogin = async () => {
    const sessionId = await ensureSecretarySession();
    const loginEpoch = getEffectiveLoginEpoch();

    const snapshot = getSecretarySessionSnapshot(sessionId, loginEpoch);
    logSecretaryDebug("ensure-welcome:check", {
      sessionId,
      loginEpoch,
      awakened: snapshot.awakened,
      messageCount: snapshot.messageCount,
      bootstrapConsumed: snapshot.bootstrapConsumed,
      sessionEpoch: snapshot.sessionEpoch,
    });

    if (snapshot.awakened) {
      const sceneContext = sessionStorage.getItem("copaw_secretary_scene_context");
      if (sceneContext) {
        sessionStorage.removeItem("copaw_secretary_scene_context");
        await runSecretaryTask(
          buildContextPrompt(sceneContext, actorName),
          {
            ...snapshot.meta,
            scene_context_applied: true,
          },
          "红智秘书正在理解当前上下文...",
        );
      } else {
        persistSecretaryWelcomeEpoch(loginEpoch);
        clearSecretaryProcessingStatus();
      }
      return;
    }

    if (snapshot.inFlight) {
      setSecretaryProcessingStatus("红智秘书正在继续处理上次唤醒任务...");
      return;
    }

    const meta = sessionApi.getSessionMeta(sessionId) || {};
    const today = new Date().toISOString().slice(0, 10);
    const dispatched = await runSecretaryTask(
      buildSecretaryWelcomePrompt(actorName),
      {
        secretary_last_seen_date: today,
        secretary_welcome_ts: Date.now(),
        secretary_login_epoch: loginEpoch,
        secretary_bootstrap_dispatched: true,
        ...meta,
      },
      "红智秘书正在唤醒中...",
    );
    if (!dispatched) {
      throw new Error("Failed to bootstrap secretary welcome prompt");
    }
    clearStoredSecretaryWelcomeEpoch();
  };

  const emitHiddenSubmit = (sessionId: string, prompt: string, processingText = "") => {
    const frame = chatFrameRef.current;
    const targetWindow = frame?.contentWindow as SecretaryFrameWindow | null | undefined;
    const normalizedSessionId = String(sessionId || "").trim();
    if (!targetWindow || !normalizedSessionId) return false;
    const loadedId = String(loadedSecretarySessionIdRef.current || "").trim();
    if (loadedId && !isSameSecretarySession(loadedId, normalizedSessionId)) {
      logSecretaryDebug("prompt:block-session-mismatch", {
        loadedId,
        pendingId: normalizedSessionId,
        loadedAliases: Array.from(resolveSecretarySessionAliases(loadedId)),
        pendingAliases: Array.from(resolveSecretarySessionAliases(normalizedSessionId)),
      });
      return false;
    }
    targetWindow.currentSessionId = normalizedSessionId;
    if (!targetWindow.__copawHiddenSubmitReady) return false;
    targetWindow.dispatchEvent(
      new CustomEvent("copaw-hidden-submit", {
        detail: {
          id: normalizedSessionId,
          prompt,
          allowExistingMessages: true,
          processingText,
        },
      }),
    );
    loadedSecretarySessionIdRef.current = normalizedSessionId;
    setChatFrameReady(true);
    return true;
  };

  const emitProcessingStatus = (text: string) => {
    const frame = chatFrameRef.current;
    const targetWindow = frame?.contentWindow as SecretaryFrameWindow | null | undefined;
    if (!targetWindow) return false;
    const nextText = String(text || "").trim();
    if (nextText && !targetWindow.__copawHiddenSubmitReady) return false;
    targetWindow.dispatchEvent(
      new CustomEvent("copaw-processing-status", {
        detail: {
          text: nextText,
          visible: Boolean(nextText),
        },
      }),
    );
    return true;
  };

  const dispatchSecretaryPrompt = async (
    prompt: string,
    meta: Record<string, unknown> = {},
  ): Promise<boolean> => {
    const sessionId = await ensureSecretarySession();
    const promptKey = `${sessionId}::${prompt}`;
    if (pendingPromptRef.current?.key === promptKey) {
      logSecretaryDebug("prompt:deduped", { sessionId, promptLength: prompt.length });
      return true;
    }

    const existingMeta = sessionApi.getSessionMeta(sessionId) || {};
    const processingText =
      String(pendingProcessingStatusRef.current || secretaryStatusText || "").trim();

    await sessionApi.updateSession({
      id: sessionId,
      name: "红智秘书会话",
      meta: {
        ...existingMeta,
        locked_session_name: true,
        session_display_name: "红智秘书会话",
        hidden_user_prompt: prompt,
        scene_prompt: prompt,
        hidden_prompt_history: buildHiddenPromptHistory(existingMeta, prompt),
        ...meta,
      },
    } as any);

    pendingPromptRef.current = { key: promptKey, prompt, meta, sessionId, processingText };
    logSecretaryDebug("prompt:queued", {
      sessionId,
      promptLength: prompt.length,
      processingText,
      metaKeys: Object.keys(meta || {}),
    });

    try {
      void sessionApi.getSessionList();
      setSecretarySession(sessionId);
      ensureHandoffRetryLoop();
      flushPendingPrompt();
      return true;
    } catch (err) {
      console.error("[Secretary] prompt dispatch failed:", err);
      if (pendingPromptRef.current?.key === promptKey) {
        pendingPromptRef.current = null;
      }
      if (processingText) {
        setSecretaryProcessingStatus("红智秘书暂未响应，请稍后重试", { handoff: false });
      }
      return false;
    }
  };

  const markPromptDispatched = async (pending: NonNullable<typeof pendingPromptRef.current>) => {
    try {
      const latestMeta = sessionApi.getSessionMeta(pending.sessionId) || {};
      await sessionApi.updateSession({
        id: pending.sessionId,
        meta: {
          ...latestMeta,
          secretary_bootstrap_dispatched: true,
          secretary_bootstrap_consumed: true,
          secretary_bootstrap_completed: false,
          secretary_last_trigger_at: Date.now(),
        },
      } as any);
      void sessionApi.getSessionList();
    } catch (err) {
      console.warn("[Secretary] failed to mark prompt as dispatched:", err);
    }
  };

  const flushPendingPrompt = () => {
    const pending = pendingPromptRef.current;
    if (!pending) return true;
    syncChatFrameReady();
    if (!emitHiddenSubmit(pending.sessionId, pending.prompt, pending.processingText || "")) {
      return false;
    }
    pendingPromptRef.current = null;
    void markPromptDispatched(pending);
    if (!pendingProcessingStatusRef.current) {
      stopHandoffRetryLoop();
    }
    return true;
  };

  const loadInbox = async () => {
    setLoadingInbox(true);
    try {
      const list = await sessionApi.getSessionList();
      const rows: InboxItem[] = (list || [])
        .filter((s) => {
          const meta = (s as any).meta || {};
          const name = String((s as any).name || "");
          const srcId = String(meta.push_source_user_id || "");
          // 排除自沟通消息（source == current user 且标题包含 ↔）
          if (srcId && name.includes("↔") && srcId === userId) return false;
          return Boolean(
            meta.push_source_user_id ||
              meta.push_conversation_key ||
              name.includes("系统推送") ||
              String(meta.source_agent_id || "").startsWith("so:") ||
              String(meta.source_agent_id || "").startsWith("pia:"),
          );
        })
        .map((s) => {
          const meta = (s as any).meta || {};
          const sourceAgentId = String(meta.source_agent_id || "");
          const sourceName = String(meta.push_source_user_name || "系统");
          const sourceTag = sourceAgentId.startsWith("so:")
            ? "数字专家"
            : sourceAgentId.startsWith("pia:")
              ? "虚拟员工"
              : meta.push_source_user_id
                ? "员工"
                : "系统";
          return {
            sessionId: String((s as any).id || ""),
            title: String((s as any).name || "新消息"),
            source: sourceName,
            sourceTag,
            intentType: String(meta.push_intent_type || ""),
          };
        });
      setInboxItems(rows);
      void notifyInboxItems(rows);
    } catch (err) {
      console.error(err);
      message.error("加载消息看板失败");
    } finally {
      setLoadingInbox(false);
    }
  };

  const loadActiveUsers = async () => {
    try {
      const res = await agentOsApi.listActiveUsers();
      const items = Array.isArray(res?.items) ? res.items : [];
      setActiveUsers(items);
      setDepartments(collectDepartmentsFromUsers(items, department));
    } catch (err) {
      console.warn("load active users failed", err);
      setActiveUsers([]);
      setDepartments(collectDepartmentsFromUsers([], department));
    }
  };

  useEffect(() => {
    void loadInbox();
    void loadActiveUsers();
    hydrateInboxSeen();
  }, []);

  useEffect(() => {
    const loginEpoch = getEffectiveLoginEpoch();
    secretaryBootstrappedEpochRef.current = loginEpoch;
    sessionStorage.setItem(secretaryBootstrappedEpochKey, loginEpoch);

    const storedSessionId = getStoredSecretarySessionId(loginEpoch);
    const storedWelcomeEpoch = getStoredSecretaryWelcomeEpoch();
    const welcomeAlreadyDone = storedWelcomeEpoch === loginEpoch;

    logSecretaryDebug("mount:restore-check", {
      loginEpoch,
      storedSessionId,
      storedWelcomeEpoch,
      welcomeAlreadyDone,
    });

    void (async () => {
      try {
        const existingId = await findExistingSecretarySession(loginEpoch);
        if (existingId) {
          clearSecretaryProcessingStatus();
          const snapshot = getSecretarySessionSnapshot(existingId, loginEpoch);
          logSecretaryDebug("mount:reuse-existing", {
            existingId,
            awakened: snapshot.awakened,
            messageCount: snapshot.messageCount,
            bootstrapConsumed: snapshot.bootstrapConsumed,
            bootstrapDispatched: snapshot.bootstrapDispatched,
            welcomeAlreadyDone,
          });
          setSecretarySession(existingId);
          persistSecretarySessionId(existingId, loginEpoch);
          if (snapshot.awakened) {
            persistSecretaryWelcomeEpoch(loginEpoch);
            clearSecretaryProcessingStatus();
            return;
          }
          if (welcomeAlreadyDone && snapshot.inFlight) {
            setSecretaryProcessingStatus("红智秘书正在继续处理上次唤醒任务...");
            return;
          }
          await ensureSecretaryWelcomeForLogin();
          return;
        }

        if (storedSessionId) {
          clearStoredSecretarySessionId(loginEpoch);
        }
        logSecretaryDebug("mount:bootstrap", { loginEpoch, welcomeAlreadyDone });
        await ensureSecretaryWelcomeForLogin();
      } catch (err) {
        console.error("[Secretary] mount bootstrap failed:", err);
        setSecretaryProcessingStatus("秘书会话初始化失败，请刷新重试", { handoff: false });
      }
    })();
  }, [actorName, userId]);

  useEffect(() => {
    const handleFrameMessage = (event: MessageEvent) => {
      if (event.source !== chatFrameRef.current?.contentWindow) return;
      if (event.origin && event.origin !== window.location.origin) return;
      const payload = (event.data || {}) as Record<string, unknown>;
      const messageType = String(payload.type || "").trim();

      if (messageType === "copaw-embed-focus-request") {
        setChatFocused(true);
        window.setTimeout(() => {
          document.getElementById("secretary-chat-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 80);
        return;
      }

      if (messageType === "copaw-embed-ready") {
        const readySessionId = String(
          payload.sessionId || secretarySessionIdRef.current || loadedSecretarySessionIdRef.current || "",
        ).trim();
        if (readySessionId) {
          loadedSecretarySessionIdRef.current = readySessionId;
        }
        logSecretaryDebug("iframe:ready", {
          sessionId: readySessionId,
          chatSrc,
        });
        setChatFrameReady(true);
        flushPendingProcessingStatus();
        flushPendingPrompt();
        if (pendingPromptRef.current || pendingProcessingStatusRef.current) {
          ensureHandoffRetryLoop();
        } else {
          stopHandoffRetryLoop();
        }
        return;
      }

      if (messageType !== "copaw-embed-result") return;

      const completedSessionId = String(
        payload.sessionId || secretarySessionIdRef.current || loadedSecretarySessionIdRef.current || "",
      ).trim();
      const ok = payload.ok !== false;
      const summary = String(payload.summary || "").trim();
      const errorText = String(payload.error || "").trim();

      setChatFrameReady(true);
      if (!completedSessionId) {
        if (ok) {
          clearSecretaryProcessingStatus();
        } else {
          setSecretaryProcessingStatus(errorText || "红智秘书暂未完成当前请求，请稍后重试", { handoff: false });
        }
        return;
      }

      void (async () => {
        try {
          await sessionApi.getSessionList();
          const refreshedSession = await sessionApi.getSession(completedSessionId);
          const refreshedMessages = Array.isArray((refreshedSession as any)?.messages)
            ? (refreshedSession as any).messages
            : [];
          const assistantMessageCount = refreshedMessages.filter((item: any) => {
            const role = String(item?.role || item?.message?.role || item?.data?.role || "").toLowerCase();
            return role === "assistant" || role === "system";
          }).length;
          const latestMeta = sessionApi.getSessionMeta(completedSessionId) || {};

          await sessionApi.updateSession({
            id: completedSessionId,
            messages: refreshedMessages,
            meta: {
              ...latestMeta,
              secretary_bootstrap_completed:
                ok && assistantMessageCount > 0
                  ? true
                  : Boolean((latestMeta as Record<string, unknown>).secretary_bootstrap_completed),
              secretary_last_result_at: Date.now(),
            },
          } as any);
          void sessionApi.getSessionList();

          if (ok && assistantMessageCount > 0) {
            persistSecretaryWelcomeEpoch(getEffectiveLoginEpoch());
            clearSecretaryProcessingStatus();
            return;
          }

          if (ok) {
            setSecretaryProcessingStatus(
              summary || "红智秘书仍在整理结果，请稍候查看会话内容...",
              { handoff: false },
            );
            return;
          }

          clearStoredSecretaryWelcomeEpoch();
          setSecretaryProcessingStatus(errorText || "红智秘书暂未完成当前请求，请稍后重试", {
            handoff: false,
          });
        } catch (err) {
          console.error("[Secretary] failed to finalize embed result:", err);
          if (!ok) {
            clearStoredSecretaryWelcomeEpoch();
            setSecretaryProcessingStatus(errorText || "红智秘书暂未完成当前请求，请稍后重试", {
              handoff: false,
            });
          }
        }
      })();
    };

    window.addEventListener("message", handleFrameMessage);
    return () => {
      window.removeEventListener("message", handleFrameMessage);
      stopHandoffRetryLoop();
    };
  }, [chatSrc]);

  useEffect(() => {
    void loadTaskCards();
  }, [loadTaskCards]);

  useEffect(() => {
    if (!chatSrc) return;
    const timer = window.setInterval(() => {
      void loadInbox();
      void loadTaskCards();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [chatSrc, loadTaskCards]);

  const submitDispatch = async (values: DispatchFormValues) => {
    setDispatchSubmitting(true);
    try {
      if (values.dispatch_mode === "task-card") {
        const target = activeUsers.find((item) => item.user_id === values.target_user_id);
        const created = await partyAffairsApi.create({
          title: values.topic.trim(),
          type: "通知公告",
          status: "待处理",
          assignee: target?.name || "",
          assignee_user_id: values.target_user_id,
          target_department: target?.department || "",
          deadline: values.deadline?.toISOString() || "",
          summary: values.content.trim(),
          priority: values.priority || "中",
          owner_role: actorName || "红智秘书",
          stage: "待分派",
          receipt_status: "待回执",
          next_action: "等待任务卡投递",
          progress_percent: 10,
          biz_domain: "party",
          module: "party-affairs",
        });
        const dispatch = await partyAffairsApi.dispatchTaskCard(created.id);
        const count = Number(dispatch.dispatch?.target_count || 0);
        const secretarySessionId = String(secretarySessionIdRef.current || "").trim();
        if (secretarySessionId) {
          sessionApi.upsertPartySessionMeta(secretarySessionId, {
            biz_domain: "party",
            module: "party-affairs",
            party_module: "party-affairs",
            task_id: created.task_id || created.id,
            party_item_id: created.id,
            party_title: created.title,
            party_status: dispatch.item.status || created.status,
            party_stage: dispatch.item.stage || created.stage,
            party_priority: dispatch.item.priority || created.priority,
            party_receipt_status: dispatch.item.receipt_status || created.receipt_status,
            party_deadline: dispatch.item.deadline || created.deadline,
            trace_id: dispatch.dispatch?.trace_id || created.trace_id,
            conversation_key: dispatch.dispatch?.conversation_key || created.conversation_key,
            session_id: dispatch.dispatch?.session_id || created.session_id,
          });
          sessionApi.appendPartyTaskEvent(secretarySessionId, {
            label: "任务卡已投递",
            status: dispatch.item.stage || dispatch.item.status || "待分派",
            detail: `${created.title} 已投递给 ${count} 位成员`,
            source: "secretary",
          });
        }
        await loadTaskCards();
        message.success(`党建任务卡已生成并投递给 ${count} 位成员`);
      } else {
        await agentOsApi.sendCollabRequest({
          target_user_id: values.target_user_id,
          topic: values.topic,
          content: values.content,
        });
        message.success("通知已投递到员工分身信箱");
      }
      setDispatchVisible(false);
      dispatchForm.resetFields();
    } catch (err) {
      console.error(err);
      message.error(err instanceof Error ? err.message : "投递失败，请稍后重试");
    } finally {
      setDispatchSubmitting(false);
    }
  };

  const hydrateInboxSeen = () => {
    try {
      const raw = localStorage.getItem(secretaryInboxSeenKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as string[];
      if (Array.isArray(parsed)) {
        inboxSeenRef.current = new Set(parsed);
      }
    } catch (err) {
      console.warn("Failed to hydrate inbox seen cache", err);
    }
  };

  const persistInboxSeen = () => {
    const list = Array.from(inboxSeenRef.current).slice(-200);
    localStorage.setItem(secretaryInboxSeenKey, JSON.stringify(list));
  };

  const notifyInboxItems = async (items: InboxItem[]) => {
    if (!items.length) return;
    const unseen = items.filter((item) => !inboxSeenRef.current.has(item.sessionId));
    if (!unseen.length) return;
    unseen.forEach((item) => inboxSeenRef.current.add(item.sessionId));
    persistInboxSeen();

    for (const item of unseen) {
      await runSecretaryTask(
        buildInboxNoticePrompt(item, actorName),
        {
          secretary_inbox_notice: item.sessionId,
        },
        buildInboxNoticeProcessingText(item),
      );
    }
  };

  const resolveDispatchDescription = (label: string) => {
    if (label === "协同任务") return "下发任务、约定节点、提醒跟进";
    if (label === "活动事项") return "同步活动安排与执行要求";
    if (label === "会议通知") return "通知会议时间、准备事项";
    return "发起意见征集与投票确认";
  };

  const handleDispatchAction = async (item: { key: string; label: string }) => {
    await runSecretaryTask(
      buildDispatchPrompt(item.label, actorName),
      { secretary_dispatch_type: item.key },
      buildDispatchProcessingText(item.label),
    );
    openDispatchModal(item.label);
  };

  const statusSummaryText =
    secretaryStatusText ||
    (chatFrameReady ? "已进入工作态，可直接在主会话区处理事务。" : "正在恢复秘书工作台，请稍候...");
  const pendingTaskCount = recentTaskCards.filter(
    (item) => !String(item.stage || item.status || "").includes("完成"),
  ).length;
  const departmentPreview = departments.slice(0, 6);
  const sidePanelBodyHeight = "calc(100vh - 360px)";

  return (
    <Space className="lux-shell" direction="vertical" size={16} style={{ width: "100%", padding: "4px" }}>
      <Card
        bordered={false}
        styles={{
          body: {
            padding: "18px 22px",
            background: "linear-gradient(135deg, #eff6ff 0%, #f5f3ff 55%, #fff7ed 100%)",
            borderRadius: 24,
          },
        }}
      >
        <Row gutter={[16, 16]} align="middle">
          <Col flex="auto">
            <Space align="start" size={14}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 12px 24px rgba(79,70,229,0.18)",
                }}
              >
                <Sparkles size={22} color="#fff" />
              </div>
              <Space direction="vertical" size={6} style={{ width: "100%" }}>
                <Space wrap size={8}>
                  <Title level={3} style={{ margin: 0, color: "#0f172a", fontWeight: 800 }}>
                    红智秘书
                  </Title>
                  <Tag color={chatFrameReady ? "processing" : "default"} style={{ marginInlineEnd: 0, borderRadius: 999 }}>
                    {chatFrameReady ? "工作态" : "唤醒中"}
                  </Tag>
                </Space>
                <Paragraph style={{ margin: 0, color: "#475569", lineHeight: 1.8 }}>
                  {statusSummaryText}
                </Paragraph>
                <Space wrap size={[8, 8]}>
                  <Tag color="blue" style={{ marginInlineEnd: 0, borderRadius: 999 }}>当前会话 · {chatTitle}</Tag>
                  <Tag color="cyan" style={{ marginInlineEnd: 0, borderRadius: 999 }}>在线成员 · {activeUsers.length}</Tag>
                  <Tag color="red" style={{ marginInlineEnd: 0, borderRadius: 999 }}>待办任务卡 · {pendingTaskCount}</Tag>
                  <Tag color="purple" style={{ marginInlineEnd: 0, borderRadius: 999 }}>消息看板 · {inboxItems.length}</Tag>
                </Space>
              </Space>
            </Space>
          </Col>
          <Col>
            <Space wrap>
              <Button type="primary" onClick={() => void handleDispatchAction({ key: "contact-collab", label: "协同任务" })}>
                协同任务
              </Button>
              <Button onClick={() => navigate("/app/party/party-affairs")}>党建事务</Button>
              <Button onClick={() => setShowDepartmentBoard((value) => !value)}>
                {showDepartmentBoard ? "收起部门看板" : "展开部门看板"}
              </Button>
              <Button
                type={chatFocused ? "default" : "primary"}
                ghost={!chatFocused}
                icon={chatFocused ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                onClick={() => setChatFocused((value) => !value)}
              >
                {chatFocused ? "退出专注" : "专注会话"}
              </Button>
              <Button onClick={() => navigate("/app/sessions")}>会话中心</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Row gutter={[16, 16]} align="top">
        <Col xs={24} xl={chatFocused ? 24 : 17} xxl={chatFocused ? 24 : 18}>
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Card
              id="secretary-chat-card"
              title={<Space><MessageSquare size={18} color="#6366f1" /> <span style={{ fontWeight: 700 }}>任务会话区</span></Space>}
              extra={
                <Space size={8} wrap>
                  <Text type="secondary" style={{ fontSize: 12 }}>工作态主窗口 · 实时流式响应</Text>
                  <Button
                    size="small"
                    type={chatFocused ? "default" : "primary"}
                    icon={chatFocused ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                    onClick={() => setChatFocused((value) => !value)}
                  >
                    {chatFocused ? "退出专注" : "专注会话"}
                  </Button>
                </Space>
              }
              style={{ borderRadius: 20, border: "1px solid #e2e8f0", overflow: "hidden", background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)" }}
              styles={{ body: { padding: 0 } }}
            >
              <div style={{ padding: "12px 18px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
                <Space size={8} wrap>
                  <Tag color="blue" style={{ marginInlineEnd: 0, borderRadius: 999 }}>当前会话</Tag>
                  <Text style={{ fontSize: 13, color: "#334155", fontWeight: 600 }}>{chatTitle}</Text>
                  <Tag color={chatFrameReady ? "success" : "processing"} style={{ marginInlineEnd: 0, borderRadius: 999 }}>
                    {chatFrameReady ? "已连接" : "准备中"}
                  </Tag>
                  {chatFocused ? <Tag color="gold" style={{ marginInlineEnd: 0, borderRadius: 999 }}>专注模式</Tag> : null}
                </Space>
              </div>
              {chatSrc ? (
                <div style={{ padding: "16px 16px 18px", background: "#f1f5f9" }}>
                  <div style={{ borderRadius: 16, overflow: "hidden", boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)", border: "1px solid #dbe2ea", background: "#fff" }}>
                    <iframe
                      src={chatSrc}
                      title="红智秘书会话"
                      ref={chatFrameRef}
                      onLoad={() => {
                        logSecretaryDebug("iframe:onload", {
                          sessionId: secretarySessionIdRef.current || "",
                          chatSrc,
                        });
                        loadedSecretarySessionIdRef.current = String(secretarySessionIdRef.current || "").trim();
                        syncChatFrameReady();
                        if (pendingPromptRef.current || pendingProcessingStatusRef.current) {
                          ensureHandoffRetryLoop();
                        }
                      }}
                      style={{
                        width: "100%",
                        height: chatFocused ? "calc(100vh - 220px)" : "calc(100vh - 270px)",
                        minHeight: chatFocused ? 820 : 720,
                        maxHeight: chatFocused ? 1280 : 980,
                        border: "none",
                        visibility: chatFrameReady ? "visible" : "hidden",
                        background: "#fff",
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div style={{ minHeight: 520, display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc" }}>
                  <Empty description={secretaryStatusText || "正在初始化秘书会话..."} />
                </div>
              )}
            </Card>

            <Card
              size="small"
              title={<Space><LayoutDashboard size={18} color="#6366f1" /> <span style={{ fontWeight: 700 }}>部门协同看板</span></Space>}
              extra={
                <Button type="text" size="small" onClick={() => setShowDepartmentBoard((value) => !value)}>
                  {showDepartmentBoard ? "收起" : "展开"}
                </Button>
              }
              style={{ borderRadius: 20, border: "1px solid #f1f5f9" }}
              styles={{ body: { padding: "14px 16px 16px" } }}
            >
              {showDepartmentBoard ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
                    gap: 12,
                  }}
                >
                  {departments.length ? (
                    departments.map((dept, index) => (
                      <button
                        key={dept}
                        type="button"
                        onClick={() =>
                          void runSecretaryTask(
                            buildDepartmentPrompt(dept, actorName),
                            { secretary_department: dept },
                            buildDepartmentProcessingText(dept),
                          )
                        }
                        style={{
                          border: "1px solid #f1f5f9",
                          borderRadius: 16,
                          background: "#fff",
                          padding: "16px 12px",
                          textAlign: "center",
                          cursor: "pointer",
                          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                          boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 8,
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = "translateY(-2px)";
                          e.currentTarget.style.boxShadow = "0 10px 15px -3px rgba(0,0,0,0.05)";
                          e.currentTarget.style.borderColor = "#6366f1";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = "translateY(0)";
                          e.currentTarget.style.boxShadow = "0 1px 2px rgba(0,0,0,0.02)";
                          e.currentTarget.style.borderColor = "#f1f5f9";
                        }}
                      >
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 10,
                            background: index % 3 === 0 ? "#eff6ff" : index % 3 === 1 ? "#fff7ed" : "#f0fdf4",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: index % 3 === 0 ? "#3b82f6" : index % 3 === 1 ? "#f97316" : "#22c55e",
                          }}
                        >
                          <Users size={18} />
                        </div>
                        <Text strong style={{ fontSize: 14, color: "#1e293b" }}>
                          {dept}
                        </Text>
                      </button>
                    ))
                  ) : (
                    <div style={{ gridColumn: "1/-1", padding: "20px 0", textAlign: "center" }}>
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无可用部门数据" />
                    </div>
                  )}
                </div>
              ) : (
                <Space direction="vertical" size={10} style={{ width: "100%" }}>
                  <Text type="secondary" style={{ lineHeight: 1.8 }}>
                    部门看板已收纳到主会话区下方，避免首屏被门户信息挤占；需要时再展开查看进展与协同建议。
                  </Text>
                  <Space wrap size={[8, 8]}>
                    {departmentPreview.length ? (
                      departmentPreview.map((dept) => (
                        <Tag key={dept} style={{ marginInlineEnd: 0, borderRadius: 999, background: "#f8fafc", borderColor: "#e2e8f0", color: "#334155" }}>
                          {dept}
                        </Tag>
                      ))
                    ) : (
                      <Text type="secondary">暂无可用部门数据</Text>
                    )}
                  </Space>
                </Space>
              )}
            </Card>
          </Space>
        </Col>
        {!chatFocused ? (
          <Col xs={24} xl={7} xxl={6}>
          <div style={{ position: "sticky", top: 20 }}>
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
              <Card
                size="small"
                title={<Space><Compass size={18} color="#6366f1" /> <span style={{ fontWeight: 700 }}>辅助工具台</span></Space>}
                style={{ borderRadius: 20, border: "1px solid #f1f5f9" }}
                styles={{ body: { padding: "14px 16px" } }}
              >
                <Space direction="vertical" size={10} style={{ width: "100%" }}>
                  <Text style={{ color: "#475569", lineHeight: 1.8 }}>{statusSummaryText}</Text>
                  <Space wrap size={[8, 8]}>
                    <Tag color="red" style={{ marginInlineEnd: 0, borderRadius: 999 }}>党建待办 {pendingTaskCount}</Tag>
                    <Tag color="purple" style={{ marginInlineEnd: 0, borderRadius: 999 }}>新消息 {inboxItems.length}</Tag>
                    <Tag color="cyan" style={{ marginInlineEnd: 0, borderRadius: 999 }}>部门 {departments.length}</Tag>
                  </Space>
                </Space>
              </Card>

              <Card
                size="small"
                style={{ borderRadius: 20, border: "1px solid #f1f5f9" }}
                styles={{ body: { padding: 0 } }}
              >
                <Tabs
                  defaultActiveKey="dispatch"
                  size="small"
                  items={[
                    {
                      key: "dispatch",
                      label: "协同",
                      children: (
                        <div style={{ padding: 16, maxHeight: sidePanelBodyHeight, overflowY: "auto", overflowX: "hidden" }}>
                          <Space direction="vertical" size={12} style={{ width: "100%" }}>
                            <Card
                              size="small"
                              title={<Space><Send size={16} color="#6366f1" /> <span style={{ fontWeight: 700 }}>消息分发</span></Space>}
                              style={{ borderRadius: 16, border: "1px solid #f1f5f9" }}
                              styles={{ body: { padding: "12px 14px" } }}
                            >
                              <Space direction="vertical" size={10} style={{ width: "100%" }}>
                                {dispatchActions.map((item, index) => (
                                  <button
                                    key={item.key}
                                    type="button"
                                    onClick={() => void handleDispatchAction(item)}
                                    style={{
                                      width: "100%",
                                      border: "1px solid #f1f5f9",
                                      borderRadius: 14,
                                      background: index % 2 === 0 ? "#f8fafc" : "#fff",
                                      padding: "12px 16px",
                                      textAlign: "left",
                                      cursor: "pointer",
                                      transition: "all 0.2s",
                                      display: "flex",
                                      justifyContent: "space-between",
                                      alignItems: "center",
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.borderColor = "#6366f1";
                                      e.currentTarget.style.background = "rgba(99,102,241,0.02)";
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.borderColor = "#f1f5f9";
                                      e.currentTarget.style.background = index % 2 === 0 ? "#f8fafc" : "#fff";
                                    }}
                                  >
                                    <Space direction="vertical" size={2}>
                                      <Text strong style={{ fontSize: 14, color: "#1e293b" }}>{item.label}</Text>
                                      <Text type="secondary" style={{ fontSize: 11 }}>{resolveDispatchDescription(item.label)}</Text>
                                    </Space>
                                    <ArrowRight size={14} color="#64748b" />
                                  </button>
                                ))}
                              </Space>
                            </Card>

                            <Card
                              size="small"
                              title={<Space><Zap size={16} color="#f59e0b" /> <span style={{ fontWeight: 700 }}>科研入口</span></Space>}
                              style={{ borderRadius: 16, border: "1px solid #f1f5f9" }}
                              styles={{ body: { padding: "12px 14px" } }}
                            >
                              <Space direction="vertical" size={8} style={{ width: "100%" }}>
                                {researchQuickEntries.map((entry) => (
                                  <button
                                    key={entry.key}
                                    type="button"
                                    onClick={() => openPartyQuickEntry(entry)}
                                    style={{
                                      width: "100%",
                                      border: "1px solid #f1f5f9",
                                      borderRadius: 12,
                                      background: "#fff",
                                      padding: "10px 14px",
                                      textAlign: "left",
                                      cursor: "pointer",
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 10,
                                      transition: "all 0.2s",
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.borderColor = "#f59e0b";
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.borderColor = "#f1f5f9";
                                    }}
                                  >
                                    <div style={{ background: "#fef3c7", padding: 6, borderRadius: 8 }}>
                                      <Zap size={14} color="#d97706" />
                                    </div>
                                    <Text strong style={{ fontSize: 13 }}>{entry.label}</Text>
                                  </button>
                                ))}
                              </Space>
                            </Card>
                          </Space>
                        </div>
                      ),
                    },
                    {
                      key: "party",
                      label: "党建",
                      children: (
                        <div style={{ padding: 16, maxHeight: sidePanelBodyHeight, overflowY: "auto", overflowX: "hidden" }}>
                          <Space direction="vertical" size={12} style={{ width: "100%" }}>
                            <Card
                              size="small"
                              title={<Space><ShieldCheck size={16} color="#ef4444" /> <span style={{ fontWeight: 700 }}>党建模板分发</span></Space>}
                              extra={<Text type="secondary" style={{ fontSize: 12 }}>高频党建动作一键起草</Text>}
                              style={{ borderRadius: 16, border: "1px solid #f1f5f9", background: "linear-gradient(180deg, #ffffff 0%, #fff7f7 100%)" }}
                              styles={{ body: { padding: "12px 14px" } }}
                            >
                              <Space direction="vertical" size={8} style={{ width: "100%" }}>
                                {partyTemplateEntries.map((entry, index) => (
                                  <button
                                    key={entry.key}
                                    type="button"
                                    onClick={() => void handlePartyTemplate(entry)}
                                    style={{
                                      width: "100%",
                                      border: "1px solid #f1f5f9",
                                      borderRadius: 14,
                                      background: index % 2 === 0 ? "#fff" : "#fffaf5",
                                      padding: "12px 14px",
                                      textAlign: "left",
                                      cursor: "pointer",
                                      display: "flex",
                                      alignItems: "flex-start",
                                      justifyContent: "space-between",
                                      gap: 10,
                                      transition: "all 0.2s",
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.borderColor = "#ef4444";
                                      e.currentTarget.style.transform = "translateY(-1px)";
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.borderColor = "#f1f5f9";
                                      e.currentTarget.style.transform = "translateY(0)";
                                    }}
                                  >
                                    <Space direction="vertical" size={2} style={{ width: "100%" }}>
                                      <Text strong style={{ fontSize: 13, color: "#1e293b" }}>{entry.label}</Text>
                                      <Text type="secondary" style={{ fontSize: 11, lineHeight: 1.6 }}>{entry.description}</Text>
                                    </Space>
                                    <ArrowRight size={14} color="#64748b" />
                                  </button>
                                ))}
                              </Space>
                            </Card>

                            <Card
                              size="small"
                              title={<Space><Bell size={16} color="#2563eb" /> <span style={{ fontWeight: 700 }}>党建任务卡</span></Space>}
                              extra={<Button type="text" size="small" icon={<RefreshCw size={12} />} onClick={() => void loadTaskCards()} loading={loadingTaskCards}>刷新</Button>}
                              style={{ borderRadius: 16, border: "1px solid #f1f5f9" }}
                              styles={{ body: { padding: "12px 14px" } }}
                            >
                              {recentTaskCards.length ? (
                                <Space direction="vertical" size={10} style={{ width: "100%" }}>
                                  {recentTaskCards.map((item) => (
                                    <Card key={item.id} size="small" bordered={false} style={{ borderRadius: 16, background: "#f8fafc" }}>
                                      <Space direction="vertical" size={8} style={{ width: "100%" }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                                          <Space direction="vertical" size={2} style={{ flex: 1 }}>
                                            <Text strong style={{ color: "#0f172a", fontSize: 13 }}>{item.title}</Text>
                                            <Text type="secondary" style={{ fontSize: 11 }}>
                                              {item.assignee || "待指派"}{item.target_department ? ` · ${item.target_department}` : ""}
                                            </Text>
                                          </Space>
                                          <Tag color={resolveTaskBadgeColor(item.stage || item.status)} style={{ marginInlineEnd: 0, borderRadius: 999 }}>
                                            {item.stage || item.status || "待办"}
                                          </Tag>
                                        </div>
                                        <Space size={6} wrap>
                                          <Tag color={resolveTaskBadgeColor(item.receipt_status)} style={{ marginInlineEnd: 0, borderRadius: 999 }}>
                                            {item.receipt_status || "待回执"}
                                          </Tag>
                                          <Tag color={resolveTaskBadgeColor(item.status)} style={{ marginInlineEnd: 0, borderRadius: 999 }}>
                                            {item.status || "待处理"}
                                          </Tag>
                                          <Text type="secondary" style={{ fontSize: 11 }}>进度 {Number(item.progress_percent || 0)}%</Text>
                                        </Space>
                                        <div style={{ height: 6, borderRadius: 999, background: "#e2e8f0", overflow: "hidden" }}>
                                          <div style={{ width: `${Math.max(0, Math.min(Number(item.progress_percent || 0), 100))}%`, height: "100%", background: "linear-gradient(90deg, #ef4444, #f97316)" }} />
                                        </div>
                                        <Text type="secondary" style={{ fontSize: 11, lineHeight: 1.6 }}>
                                          {item.next_action || item.summary || "进入事务中心查看详情、回执和后续动作。"}
                                        </Text>
                                        <Space size={8} wrap>
                                          <Button size="small" type="primary" ghost onClick={() => navigate("/app/party/party-affairs")}>进入事务中心</Button>
                                          {item.session_id ? (
                                            <Button size="small" onClick={() => navigate(`/app/workspace/${item.session_id}`)}>查看会话</Button>
                                          ) : null}
                                        </Space>
                                      </Space>
                                    </Card>
                                  ))}
                                </Space>
                              ) : (
                                <div style={{ padding: 12 }}>
                                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={loadingTaskCards ? "正在加载任务卡..." : "暂无党建任务卡"} />
                                </div>
                              )}
                            </Card>

                            <Card
                              size="small"
                              title={<Space><ShieldCheck size={16} color="#ef4444" /> <span style={{ fontWeight: 700 }}>书记驾驶舱</span></Space>}
                              extra={<Text type="secondary" style={{ fontSize: 12 }}>全部模块一键直达</Text>}
                              style={{ borderRadius: 16, border: "1px solid #f1f5f9", background: "linear-gradient(180deg, #ffffff 0%, #fff7f7 100%)" }}
                              styles={{ body: { padding: "12px 14px" } }}
                            >
                              <Space direction="vertical" size={8} style={{ width: "100%" }}>
                                {partyQuickEntries.map((entry, index) => (
                                  <button
                                    key={entry.key}
                                    type="button"
                                    onClick={() => openPartyQuickEntry(entry)}
                                    style={{
                                      width: "100%",
                                      border: "1px solid #f1f5f9",
                                      borderRadius: 14,
                                      background: index % 2 === 0 ? "#fff" : "#fffaf5",
                                      padding: "12px 14px",
                                      textAlign: "left",
                                      cursor: "pointer",
                                      display: "flex",
                                      alignItems: "flex-start",
                                      gap: 10,
                                      transition: "all 0.2s",
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.borderColor = "#ef4444";
                                      e.currentTarget.style.transform = "translateY(-1px)";
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.borderColor = "#f1f5f9";
                                      e.currentTarget.style.transform = "translateY(0)";
                                    }}
                                  >
                                    <div style={{ background: index < 2 ? "#fee2e2" : index < 5 ? "#fff7ed" : "#f5f3ff", padding: 6, borderRadius: 8 }}>
                                      <ShieldCheck size={14} color={index < 2 ? "#dc2626" : index < 5 ? "#c2410c" : "#7c3aed"} />
                                    </div>
                                    <Space direction="vertical" size={2} style={{ width: "100%" }}>
                                      <Text strong style={{ fontSize: 13, color: "#1e293b" }}>{entry.label}</Text>
                                      <Text type="secondary" style={{ fontSize: 11, lineHeight: 1.6 }}>{entry.description}</Text>
                                    </Space>
                                  </button>
                                ))}
                              </Space>
                            </Card>
                          </Space>
                        </div>
                      ),
                    },
                    {
                      key: "inbox",
                      label: "消息",
                      children: (
                        <div style={{ padding: 16, maxHeight: sidePanelBodyHeight, overflowY: "auto", overflowX: "hidden" }}>
                          <Card
                            size="small"
                            title={<Space><History size={16} color="#6366f1" /> <span style={{ fontWeight: 700 }}>消息看板</span></Space>}
                            extra={<Button type="text" size="small" icon={<RefreshCw size={12} />} onClick={() => void loadInbox()} loading={loadingInbox}>刷新</Button>}
                            style={{ borderRadius: 16, border: "1px solid #f1f5f9" }}
                            styles={{ body: { padding: 0 } }}
                          >
                            {inboxItems.length ? (
                              <List
                                size="small"
                                dataSource={inboxItems}
                                renderItem={(item) => (
                                  <List.Item
                                    style={{ padding: "12px 16px", borderBottom: "1px solid #f1f5f9" }}
                                    actions={[
                                      <Button
                                        key="load"
                                        size="small"
                                        type="primary"
                                        ghost
                                        style={{ borderRadius: 8 }}
                                        onClick={() =>
                                          void runSecretaryTask(
                                            buildInboxFollowupPrompt(item, actorName),
                                            {
                                              secretary_message_session: item.sessionId,
                                              secretary_message_source: item.source,
                                              secretary_message_type: item.intentType || item.sourceTag,
                                            },
                                            buildInboxFollowupProcessingText(item),
                                          )
                                        }
                                      >
                                        加载
                                      </Button>,
                                    ]}
                                  >
                                    <Space direction="vertical" size={2}>
                                      <Text strong style={{ fontSize: 13 }}>{item.title}</Text>
                                      <Space size={4} wrap>
                                        <Tag style={{ fontSize: 10, lineHeight: "16px", padding: "0 4px", borderRadius: 4 }}>{item.sourceTag}</Tag>
                                        <Text type="secondary" style={{ fontSize: 11 }}>{item.source}</Text>
                                      </Space>
                                    </Space>
                                  </List.Item>
                                )}
                              />
                            ) : (
                              <div style={{ padding: 24, textAlign: "center" }}>
                                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无新消息" />
                              </div>
                            )}
                          </Card>
                        </div>
                      ),
                    },
                  ]}
                />
              </Card>
            </Space>
          </div>
          </Col>
        ) : null}
      </Row>

      <Modal
        title={`分发入口 · ${dispatchTopic || "消息分发"}`}
        open={dispatchVisible}
        onCancel={() => setDispatchVisible(false)}
        onOk={() => dispatchForm.submit()}
        confirmLoading={dispatchSubmitting}
        okText={dispatchMode === "task-card" ? "生成并投递任务卡" : "确认投递"}
        cancelText="取消"
      >
        <Form<DispatchFormValues>
          form={dispatchForm}
          layout="vertical"
          onFinish={(values) => void submitDispatch(values)}
        >
          <Form.Item label="分发模式" name="dispatch_mode" initialValue="notify">
            <Select
              options={[
                { label: "普通通知", value: "notify" },
                { label: "党建任务卡", value: "task-card" },
              ]}
            />
          </Form.Item>
          <Form.Item
            label="目标员工"
            name="target_user_id"
            rules={[{ required: true, message: "请选择目标员工" }]}
          >
            <Select
              placeholder="选择要通知的员工分身"
              showSearch
              optionFilterProp="label"
              options={activeUsers.map((user) => ({
                label: `${user.name || user.user_id}${user.department ? ` · ${user.department}` : ""}`,
                value: String(user.user_id),
              }))}
            />
          </Form.Item>
          <Form.Item
            label="主题 / 任务卡标题"
            name="topic"
            rules={[{ required: true, message: "请输入主题" }]}
          >
            <Input placeholder="例如：会议通知 / 协同任务 / 党建任务卡" />
          </Form.Item>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {dispatchMode === "task-card" ? (
              <Form.Item label="截止时间" name="deadline" style={{ marginBottom: 0 }}>
                <DatePicker showTime style={{ width: "100%" }} />
              </Form.Item>
            ) : (
              <div />
            )}
            {dispatchMode === "task-card" ? (
              <Form.Item label="优先级" name="priority" initialValue="中" style={{ marginBottom: 0 }}>
                <Select
                  options={[
                    { label: "高", value: "高" },
                    { label: "中", value: "中" },
                    { label: "低", value: "低" },
                  ]}
                />
              </Form.Item>
            ) : (
              <div />
            )}
          </div>
          <Form.Item
            label={dispatchMode === "task-card" ? "任务说明" : "通知内容"}
            name="content"
            rules={[{ required: true, message: "请输入内容" }]}
          >
            <Input.TextArea
              rows={4}
              placeholder={
                dispatchMode === "task-card"
                  ? "填写任务背景、目标、回执要求和协同说明"
                  : "填写要投递给员工分身的内容"
              }
            />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
