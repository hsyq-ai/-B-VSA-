import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Progress, Space, Tag } from "antd";
import { ArrowUpRight, Bot, Brain, ChevronDown, Clock3, MessagesSquare, Mic, MicOff, Sparkles, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getStoredLoginEpoch } from "../../AuthModal";
import {
  buildContextPrompt,
  buildInboxFollowupProcessingText,
  buildInboxFollowupPrompt,
  type InboxItem,
} from "../../../features/core/secretary/secretaryPrompts";
import { createSecretarySessionStorage } from "../../../features/core/secretary/secretarySessionStorage";
import sessionApi from "../../../pages/Chat/sessionApi";
import styles from "./FloatingAiDock.module.less";
import { getCurrentEmployeeName, resolveAiSceneMeta, type AiActionIcon, type AiSceneStatus } from "./aiSceneMeta";
import { buildPageAiContextPrompt, useCurrentPageAiContext } from "./pageAiContextBridge";
import { useVoiceSecretary } from "../../../features/core/voice/useVoiceSecretary";
import type { VoiceSecretaryResult } from "../../../features/core/voice/types";

const DOCK_OPEN_STORAGE_KEY = "copaw_ai_dock_open_v1";
const INBOX_PREVIEW_LIMIT = 3;

type FloatingDockFrameWindow = Window & {
  __copawHiddenSubmitReady?: boolean;
  currentSessionId?: string;
};

type PendingPrompt = {
  sessionId: string;
  prompt: string;
  processingText: string;
};

type DockInboxItem = InboxItem & {
  updatedAt?: string;
};

type PushEventDetail = {
  count?: number;
  messageCount?: number;
  proactiveCount?: number;
  samples?: Array<{
    text?: string;
    intentType?: string;
    source?: string;
  }>;
  proactiveEvents?: Array<{
    title?: string;
    summary?: string;
    source?: string;
    level?: string;
    urgency?: number;
    relevance?: number;
    actions?: string[];
    ts?: number;
  }>;
};

type ProactiveLevel = "strong" | "light" | "silent";

type ProactiveNotice = {
  id: string;
  title: string;
  summary: string;
  source: string;
  level: ProactiveLevel;
  count: number;
  urgency: number;
  relevance: number;
  createdAt: number;
};

type ProactiveScoreInput = {
  count: number;
  samples: Array<{
    text: string;
    intentType: string;
    source: string;
  }>;
  hour: number;
  speakingBusy: boolean;
};

type ActiveVoiceTaskHandoff = {
  taskKey: string;
  sessionId: string;
  traceId: string;
  originalText: string;
  startedAt: number;
};

const iconMap: Record<AiActionIcon, JSX.Element> = {
  sparkles: <Sparkles size={16} />,
  brain: <Brain size={16} />,
  zap: <Zap size={16} />,
  arrow: <ArrowUpRight size={16} />,
  message: <MessagesSquare size={16} />,
};

const mergeUniqueTexts = (items: Array<string | undefined>, limit: number) => {
  const next: string[] = [];
  items.forEach((item) => {
    const normalized = String(item || "").trim();
    if (!normalized || next.includes(normalized)) return;
    next.push(normalized);
  });
  return next.slice(0, limit);
};

const toTimestamp = (value?: string | number | null) => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    if (value > 1_000_000_000_000) return value;
    if (value > 1_000_000_000) return value * 1000;
    return value;
  }
  const normalized = String(value || "").trim();
  if (!normalized) return 0;
  const asNumber = Number(normalized);
  if (Number.isFinite(asNumber) && asNumber > 0) {
    if (asNumber > 1_000_000_000_000) return asNumber;
    if (asNumber > 1_000_000_000) return asNumber * 1000;
  }
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getRelativeTimeLabel = (value?: string | number | null) => {
  const timestamp = toTimestamp(value);
  if (!timestamp) return "刚刚更新";
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return "刚刚更新";
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))} 分钟前更新`;
  if (diff < 86_400_000) return `${Math.max(1, Math.floor(diff / 3_600_000))} 小时前更新`;
  return `${Math.max(1, Math.floor(diff / 86_400_000))} 天前更新`;
};

const resolveStatusMeta = (status: AiSceneStatus | "processing") => {
  switch (status) {
    case "processing":
      return { color: "#f97316", label: "正在为你处理事务" };
    case "warning":
      return { color: "#ef4444", label: "当前事务建议优先处理" };
    case "chatting":
      return { color: "#2563eb", label: "最近会话可继续承接" };
    case "suggesting":
      return { color: "#7c3aed", label: "已准备好下一步建议" };
    case "aware":
    default:
      return { color: "#4f46e5", label: "已接住当前页面上下文" };
  }
};

const getStoredDockOpen = () => {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(DOCK_OPEN_STORAGE_KEY) === "1";
};

const getCurrentUserId = () => {
  if (typeof window === "undefined") return "default";
  return String(sessionStorage.getItem("copaw_user_id") || localStorage.getItem("copaw_user_id") || "default").trim() || "default";
};

const resolveInboxSourceTag = (meta: Record<string, unknown>) => {
  const sourceAgentId = String(meta.source_agent_id || "");
  if (sourceAgentId.startsWith("so:")) return "数字专家";
  if (sourceAgentId.startsWith("pia:")) return "虚拟员工";
  if (meta.push_source_user_id) return "员工";
  return "系统";
};

const PROACTIVE_URGENT_PATTERN = /(紧急|马上|尽快|超时|告警|失败|异常|逾期|截止|立刻|asap)/i;
const PROACTIVE_BOSS_PATTERN = /(总裁|总经理|董事长|领导|老板|张总|李总|王总|刘总)/i;

const clampScore = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const scoreProactiveLevel = (input: ProactiveScoreInput): { level: ProactiveLevel; urgency: number; relevance: number } => {
  let urgency = input.count >= 3 ? 3 : input.count >= 1 ? 2 : 1;
  let relevance = input.count >= 1 ? 2 : 1;

  input.samples.forEach((item) => {
    if (PROACTIVE_URGENT_PATTERN.test(item.text)) {
      urgency += 2;
    }
    if (item.intentType.includes("task") || item.intentType.includes("notify")) {
      urgency += 1;
      relevance += 1;
    }
    if (PROACTIVE_BOSS_PATTERN.test(item.source) || PROACTIVE_BOSS_PATTERN.test(item.text)) {
      relevance += 2;
    }
  });

  let disturbanceCost = 0;
  if (input.hour < 8 || input.hour >= 22) {
    disturbanceCost += 2;
  }
  if (input.speakingBusy) {
    disturbanceCost += 2;
  }

  urgency = clampScore(urgency, 1, 5);
  relevance = clampScore(relevance, 1, 5);
  const decisionScore = urgency * 1.2 + relevance - disturbanceCost;

  if (decisionScore >= 6) return { level: "strong", urgency, relevance };
  if (decisionScore >= 3) return { level: "light", urgency, relevance };
  return { level: "silent", urgency, relevance };
};

const buildDockInboxItems = (sessions: any[]): DockInboxItem[] =>
  (sessions || [])
    .filter((session) => {
      const meta = (session as any).meta || {};
      return Boolean(
        meta.push_source_user_id ||
          meta.push_conversation_key ||
          String((session as any).name || "").includes("系统推送") ||
          String(meta.source_agent_id || "").startsWith("so:") ||
          String(meta.source_agent_id || "").startsWith("pia:"),
      );
    })
    .map((session) => {
      const meta = ((session as any).meta || {}) as Record<string, unknown>;
      return {
        sessionId: String((session as any).id || ""),
        title: String((session as any).name || "新消息"),
        source: String(meta.push_source_user_name || "系统"),
        sourceTag: resolveInboxSourceTag(meta),
        intentType: String(meta.push_intent_type || ""),
        updatedAt: String((session as any).updated_at || ""),
      };
    })
    .filter((item) => item.sessionId);

interface FloatingAiDockProps {
  selectedKey: string;
  currentPath: string;
}

export default function FloatingAiDock({ selectedKey, currentPath }: FloatingAiDockProps) {
  const navigate = useNavigate();
  const currentUserName = getCurrentEmployeeName();
  const currentUserId = getCurrentUserId();
  const pageContext = useCurrentPageAiContext(currentPath);
  // --- 语音秘书：直接在Dock中管理，不弹窗 ---
  const [voiceActive, setVoiceActive] = useState(false);
  const {
    supported: voiceSupported,
    connected: voiceConnected,
    active: voiceListening,
    activate: voiceActivate,
    deactivate: voiceDeactivate,
    status: voiceStatus,
    error: voiceError,
    lastResult: voiceLastResult,
    start: voiceStart,
    stop: voiceStop,
    notifyProactive: voiceNotifyProactive,
  } = useVoiceSecretary({ enabled: voiceActive, userId: currentUserId, userName: currentUserName });
  // voiceSupported 供未来 Dock 内语音按钮使用
  void voiceSupported;

  const handleToggleVoice = useCallback(async () => {
    if (voiceActive) {
      // 关闭语音：先停掉连接
      await voiceStop();
      setVoiceActive(false);
    } else {
      // 开启语音：先建立连接，连接成功后由用户再次点击激活拾音
      setVoiceActive(true);
      void voiceStart();
    }
  }, [voiceActive, voiceStart, voiceStop]);
  // handleToggleVoice 供未来 Dock 内语音按钮使用
  void handleToggleVoice;

  useEffect(() => {
    if (voiceError && !voiceConnected) {
      setVoiceActive(false);
    }
  }, [voiceError, voiceConnected]);

  const voiceStatusLabel = useMemo(() => {
    if (!voiceActive) return "语音秘书";
    if (!voiceConnected) return "连接中...";
    if (!voiceListening) return "点击唤醒";
    switch (voiceStatus) {
      case "connecting": return "连接中...";
      case "listening": return "正在听...";
      case "processing": return "处理中...";
      case "speaking": return "播报中...";
      case "idle": return "待命中";
      case "error": return "异常";
      default: return "待命中";
    }
  }, [voiceActive, voiceConnected, voiceListening, voiceStatus]);

  const scene = useMemo(
    () => resolveAiSceneMeta({ selectedKey, currentPath, currentUserName }),
    [currentPath, currentUserName, selectedKey],
  );
  const secretaryStorage = useMemo(() => createSecretarySessionStorage(currentUserId), [currentUserId]);
  const mergedTitle = pageContext?.title || scene.title;
  const mergedTags = useMemo(() => mergeUniqueTexts([...scene.tags, ...(pageContext?.tags || [])], 6), [pageContext, scene]);
  const mergedInsights = useMemo(() => mergeUniqueTexts([...(pageContext?.insights || []), ...scene.insights], 6), [pageContext, scene]);
  const liveContextPrompt = useMemo(() => buildPageAiContextPrompt(pageContext), [pageContext]);
  const secondaryActions = useMemo(() => scene.secondaryActions || [], [scene.secondaryActions]);
  const focusSummary = String(pageContext?.summary || "").trim();
  const contextUpdatedLabel = useMemo(() => getRelativeTimeLabel(pageContext?.ts), [pageContext?.ts]);

  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const secretarySessionIdRef = useRef("");
  const loadedSecretarySessionIdRef = useRef("");
  const pendingPromptRef = useRef<PendingPrompt | null>(null);
  const pendingProcessingStatusRef = useRef("");
  const handoffRetryTimerRef = useRef<number | null>(null);
  const frameLoadingTimerRef = useRef<number | null>(null);
  const handledVoiceTaskKeyRef = useRef("");
  const activeVoiceTaskRef = useRef<ActiveVoiceTaskHandoff | null>(null);
  const voiceTaskStatusTimerRef = useRef<number | null>(null);
  const proactiveRemindTimerRef = useRef<number | null>(null);

  const [panelOpen, setPanelOpen] = useState<boolean>(getStoredDockOpen);
  const [feedExpanded, setFeedExpanded] = useState(false);
  const [chatSrc, setChatSrc] = useState("");
  const [frameReady, setFrameReady] = useState(false);
  const [frameLoading, setFrameLoading] = useState(false);
  const [loadingPercent, setLoadingPercent] = useState(18);
  const [processingText, setProcessingText] = useState("");
  const [loadingInbox, setLoadingInbox] = useState(false);
  const [inboxItems, setInboxItems] = useState<DockInboxItem[]>([]);
  const [unreadPushCount, setUnreadPushCount] = useState(0);
  const [latestPushCount, setLatestPushCount] = useState(0);
  const [proactiveNotice, setProactiveNotice] = useState<ProactiveNotice | null>(null);
  const statusMeta = useMemo(() => {
    if (processingText && /未完成|失败|错误|重试/.test(processingText)) {
      return { color: "#ef4444", label: "当前请求未完成" };
    }
    return resolveStatusMeta(processingText ? "processing" : scene.status);
  }, [processingText, scene.status]);

  const latestInboxItems = useMemo(() => inboxItems.slice(0, INBOX_PREVIEW_LIMIT), [inboxItems]);

  const getEffectiveLoginEpoch = useCallback(() => {
    return String(getStoredLoginEpoch() || (window as any).currentLoginEpoch || "dock").trim() || "dock";
  }, []);

  const stopHandoffRetryLoop = useCallback(() => {
    if (handoffRetryTimerRef.current) {
      window.clearInterval(handoffRetryTimerRef.current);
      handoffRetryTimerRef.current = null;
    }
  }, []);

  const syncChatFrameReady = useCallback(() => {
    const targetWindow = frameRef.current?.contentWindow as FloatingDockFrameWindow | null | undefined;
    const ready = Boolean(targetWindow?.__copawHiddenSubmitReady);
    if (!ready) return false;
    const resolvedId = String(
      targetWindow?.currentSessionId || loadedSecretarySessionIdRef.current || secretarySessionIdRef.current || "",
    ).trim();
    if (resolvedId) loadedSecretarySessionIdRef.current = resolvedId;
    setFrameReady(true);
    return true;
  }, []);

  const emitProcessingStatus = useCallback((text: string) => {
    const targetWindow = frameRef.current?.contentWindow as FloatingDockFrameWindow | null | undefined;
    if (!targetWindow) return false;
    const nextText = String(text || "").trim();
    if (nextText && !targetWindow.__copawHiddenSubmitReady) return false;
    targetWindow.dispatchEvent(
      new CustomEvent("copaw-processing-status", {
        detail: {
          visible: Boolean(nextText),
          text: nextText,
        },
      }),
    );
    return true;
  }, []);

  const emitHiddenSubmit = useCallback((sessionId: string, prompt: string, nextProcessingText = "") => {
    const targetWindow = frameRef.current?.contentWindow as FloatingDockFrameWindow | null | undefined;
    const normalizedSessionId = String(sessionId || "").trim();
    if (!targetWindow || !normalizedSessionId) return false;
    targetWindow.currentSessionId = normalizedSessionId;
    if (!targetWindow.__copawHiddenSubmitReady) return false;
    targetWindow.dispatchEvent(
      new CustomEvent("copaw-hidden-submit", {
        detail: {
          id: normalizedSessionId,
          prompt,
          allowExistingMessages: true,
          processingText: nextProcessingText,
        },
      }),
    );
    loadedSecretarySessionIdRef.current = normalizedSessionId;
    setFrameReady(true);
    return true;
  }, []);

  const flushPendingProcessingStatus = useCallback(() => {
    const text = String(pendingProcessingStatusRef.current || "").trim();
    if (!text) return true;
    if (!emitProcessingStatus(text)) return false;
    pendingProcessingStatusRef.current = "";
    return true;
  }, [emitProcessingStatus]);

  const flushPendingPrompt = useCallback(() => {
    const pending = pendingPromptRef.current;
    if (!pending) return true;
    if (!emitHiddenSubmit(pending.sessionId, pending.prompt, pending.processingText)) return false;
    pendingPromptRef.current = null;
    stopHandoffRetryLoop();
    return true;
  }, [emitHiddenSubmit, stopHandoffRetryLoop]);

  const ensureHandoffRetryLoop = useCallback(() => {
    if (handoffRetryTimerRef.current) return;
    handoffRetryTimerRef.current = window.setInterval(() => {
      syncChatFrameReady();
      flushPendingProcessingStatus();
      flushPendingPrompt();
      if (!pendingPromptRef.current && !pendingProcessingStatusRef.current) {
        stopHandoffRetryLoop();
      }
    }, 180);
  }, [flushPendingProcessingStatus, flushPendingPrompt, stopHandoffRetryLoop, syncChatFrameReady]);

  const persistSecretarySessionId = useCallback(
    (sessionId: string) => {
      secretaryStorage.persistSecretarySessionId(sessionId, getEffectiveLoginEpoch());
    },
    [getEffectiveLoginEpoch, secretaryStorage],
  );

  const setSecretarySession = useCallback(
    (sessionId: string, forceReload = false) => {
      const existing = sessionApi.peekSession(sessionId) as any;
      const nextId = String(existing?.id || existing?.sessionId || sessionId || "").trim() || sessionId;
      const nextSrcBase = `/app/workspace-embed/${encodeURIComponent(nextId)}?secretary=1&simple=1`;
      const nextSrc = forceReload ? `${nextSrcBase}&t=${Date.now()}` : nextSrcBase;
      if (!forceReload && secretarySessionIdRef.current === nextId && chatSrc.startsWith(nextSrcBase)) {
        return nextId;
      }
      secretarySessionIdRef.current = nextId;
      loadedSecretarySessionIdRef.current = "";
      persistSecretarySessionId(nextId);
      setFrameReady(false);
      setFrameLoading(true);
      setLoadingPercent(18);
      setChatSrc(nextSrc);
      return nextId;
    },
    [chatSrc, persistSecretarySessionId],
  );

  const ensureSecretarySession = useCallback(async () => {
    const currentSessionId = String(secretarySessionIdRef.current || "").trim();
    if (currentSessionId) {
      if (!chatSrc) setSecretarySession(currentSessionId);
      return currentSessionId;
    }

    const loginEpoch = getEffectiveLoginEpoch();
    const storedId = secretaryStorage.getStoredSecretarySessionId(loginEpoch) || secretaryStorage.getStoredSecretarySessionId();
    if (storedId) {
      setSecretarySession(storedId);
      return storedId;
    }

    const sessions = await sessionApi.createSession({
      name: "红智秘书会话",
      meta: {
        scene: "secretary-home",
        scene_label: "红智秘书",
        locked_session_name: true,
        session_display_name: "红智秘书会话",
        secretary_bootstrap: true,
        secretary_bootstrap_dispatched: false,
        secretary_mode: "floating-dock",
        secretary_last_seen_date: new Date().toISOString().slice(0, 10),
        secretary_login_epoch: loginEpoch,
      },
    } as any);
    const nextId = String(sessions?.[0]?.id || "").trim();
    if (!nextId) {
      throw new Error("Failed to initialize floating secretary session");
    }
    setSecretarySession(nextId, true);
    return nextId;
  }, [chatSrc, getEffectiveLoginEpoch, secretaryStorage, setSecretarySession]);

  const queueSecretaryPrompt = useCallback(
    async (prompt: string, nextProcessingText: string) => {
      const normalizedPrompt = String(prompt || "").trim();
      if (!normalizedPrompt) return "";
      setPanelOpen(true);
      const sessionId = await ensureSecretarySession();
      pendingPromptRef.current = {
        sessionId,
        prompt: normalizedPrompt,
        processingText: nextProcessingText,
      };
      pendingProcessingStatusRef.current = nextProcessingText;
      setProcessingText(nextProcessingText);
      ensureHandoffRetryLoop();
      syncChatFrameReady();
      flushPendingProcessingStatus();
      flushPendingPrompt();
      return sessionId;
    },
    [ensureHandoffRetryLoop, ensureSecretarySession, flushPendingProcessingStatus, flushPendingPrompt, syncChatFrameReady],
  );

  const composeSecretaryPrompt = useCallback(
    (request: string, options?: { userRequest?: boolean }) => {
      const normalizedRequest = String(request || "").trim();
      if (!normalizedRequest) return "";
      const context = [mergedTitle, scene.description, ...mergedInsights].join("；");
      return [
        buildContextPrompt(context, currentUserName),
        liveContextPrompt,
        options?.userRequest === false ? normalizedRequest : `用户补充诉求：${normalizedRequest}`,
        "请先结合当前页面上下文给出最直接的判断，再给出 2 到 3 条可执行动作。",
      ]
        .filter(Boolean)
        .join("\n");
    },
    [currentUserName, liveContextPrompt, mergedInsights, mergedTitle, scene.description],
  );

  const handoffVoiceTaskToSecretary = useCallback(
    async (result: VoiceSecretaryResult | null) => {
      if (!result) return;
      const routeResult = String(result.routeResult || result.route_result || result.screen?.routeResult || "").trim();
      if (!routeResult || routeResult === "vsa_handled" || routeResult === "ignored" || routeResult === "error") {
        return;
      }
      const originalText = String(result.screen?.originalText || "").trim() || String(result.spoken || "").trim();
      if (!originalText) {
        return;
      }
      const traceId = String(result.traceId || result.trace_id || result.screen?.traceId || "").trim();
      const taskKey = [traceId, routeResult, originalText].join("|");
      if (!taskKey || handledVoiceTaskKeyRef.current === taskKey) {
        return;
      }
      handledVoiceTaskKeyRef.current = taskKey;

      if (voiceTaskStatusTimerRef.current) {
        window.clearTimeout(voiceTaskStatusTimerRef.current);
        voiceTaskStatusTimerRef.current = null;
      }

      const takeoverText = "语音任务已接管，正在同步到红智秘书会话...";
      pendingProcessingStatusRef.current = takeoverText;
      setProcessingText(takeoverText);
      setPanelOpen(true);
      ensureHandoffRetryLoop();
      syncChatFrameReady();
      flushPendingProcessingStatus();

      const voiceTaskPrompt = composeSecretaryPrompt(
        [
          "以下是语音秘书转交的任务，请直接执行，不要只复述。",
          `语音原话：${originalText}`,
          `路由结果：${routeResult}`,
          traceId ? `追踪ID：${traceId}` : "",
          "请在会话中输出：1）执行了什么 2）执行结果或产出 3）若无法完成，说明阻塞和下一步建议。",
        ]
          .filter(Boolean)
          .join("\n"),
        { userRequest: false },
      );

      try {
        const sessionId = await queueSecretaryPrompt(voiceTaskPrompt, "语音任务执行中，红智秘书正在处理...");
        activeVoiceTaskRef.current = {
          taskKey,
          sessionId: String(sessionId || secretarySessionIdRef.current || "").trim(),
          traceId,
          originalText,
          startedAt: Date.now(),
        };
      } catch (error) {
        console.error("[FloatingAiDock] voice task handoff failed:", error);
        activeVoiceTaskRef.current = null;
        setProcessingText("语音任务转交失败，请稍后重试");
      }
    },
    [
      composeSecretaryPrompt,
      ensureHandoffRetryLoop,
      flushPendingProcessingStatus,
      queueSecretaryPrompt,
      syncChatFrameReady,
    ],
  );

  useEffect(() => {
    void handoffVoiceTaskToSecretary(voiceLastResult);
  }, [handoffVoiceTaskToSecretary, voiceLastResult]);

  const loadInbox = useCallback(async () => {
    setLoadingInbox(true);
    try {
      const list = await sessionApi.getSessionList();
      setInboxItems(buildDockInboxItems(list as any[]));
    } catch (error) {
      console.error("[FloatingAiDock] load inbox failed:", error);
    } finally {
      setLoadingInbox(false);
    }
  }, []);

  const emitProactiveVoiceReminder = useCallback(
    (notice: ProactiveNotice) => {
      if (!voiceActive || !voiceConnected || notice.level === "silent") return;
      voiceNotifyProactive({
        title: notice.title,
        summary: notice.summary,
        source: notice.source,
        level: notice.level,
        urgency: notice.urgency,
        relevance: notice.relevance,
        actions: ["立即处理", "稍后提醒", "静默归档"],
      });
    },
    [voiceActive, voiceConnected, voiceNotifyProactive],
  );

  const showProactiveNotice = useCallback(
    (detail: PushEventDetail) => {
      const proactiveEvents = Array.isArray(detail.proactiveEvents) ? detail.proactiveEvents : [];
      if (proactiveEvents.length > 0) {
        const raw = proactiveEvents[0] || {};
        const notice: ProactiveNotice = {
          id: `proactive-${Date.now()}`,
          title: String(raw.title || "主动提醒").trim() || "主动提醒",
          summary: String(raw.summary || "").trim() || "你有一条新的主动提醒。",
          source: String(raw.source || "系统").trim() || "系统",
          level: (["strong", "light", "silent"].includes(String(raw.level || "").trim().toLowerCase())
            ? String(raw.level || "").trim().toLowerCase()
            : "light") as ProactiveLevel,
          count: Math.max(1, proactiveEvents.length),
          urgency: Math.max(1, Math.min(5, Number(raw.urgency || 3))),
          relevance: Math.max(1, Math.min(5, Number(raw.relevance || 3))),
          createdAt: Number(raw.ts || Date.now()),
        };
        if (notice.level === "silent") {
          setProcessingText("收到新的主动提醒，已静默汇总");
          setProactiveNotice(null);
          return;
        }
        setProactiveNotice(notice);
        emitProactiveVoiceReminder(notice);
        return;
      }

      const safeCount = Math.max(1, Number(detail.count || 1));
      const samples = Array.isArray(detail.samples)
        ? detail.samples.map((item) => ({
            text: String(item?.text || "").trim(),
            intentType: String(item?.intentType || "").trim().toLowerCase(),
            source: String(item?.source || "").trim(),
          }))
        : [];
      const hour = new Date().getHours();
      const speakingBusy = voiceStatus === "processing" || voiceStatus === "speaking";
      const scoreResult = scoreProactiveLevel({
        count: safeCount,
        samples,
        hour,
        speakingBusy,
      });
      const firstText = samples.find((item) => item.text)?.text || "";
      const summary =
        firstText ||
        (safeCount > 1
          ? `刚收到 ${safeCount} 条新消息，建议优先处理。`
          : "刚收到 1 条新消息，是否现在交给秘书处理？");
      const notice: ProactiveNotice = {
        id: `proactive-${Date.now()}`,
        title: safeCount > 1 ? "收到多条新消息" : "收到新消息",
        summary,
        source: "消息中心",
        level: scoreResult.level,
        count: safeCount,
        urgency: scoreResult.urgency,
        relevance: scoreResult.relevance,
        createdAt: Date.now(),
      };
      if (notice.level === "silent") {
        setProcessingText(`收到 ${safeCount} 条新消息，已静默汇总`);
        setProactiveNotice(null);
        return;
      }
      setProactiveNotice(notice);
      emitProactiveVoiceReminder(notice);
    },
    [emitProactiveVoiceReminder, voiceStatus],
  );

  const handleSnoozeProactiveNotice = useCallback(() => {
    const current = proactiveNotice;
    if (!current) return;
    if (proactiveRemindTimerRef.current) {
      window.clearTimeout(proactiveRemindTimerRef.current);
      proactiveRemindTimerRef.current = null;
    }
    const remindText = "已设置稍后提醒，10 分钟后再提醒你。";
    setProcessingText(remindText);
    setProactiveNotice(null);
    proactiveRemindTimerRef.current = window.setTimeout(() => {
      const resumed: ProactiveNotice = {
        ...current,
        id: `proactive-${Date.now()}`,
        summary: `这是稍后提醒：你还有 ${current.count} 条消息待处理。`,
        level: "light",
        createdAt: Date.now(),
      };
      setProactiveNotice(resumed);
      emitProactiveVoiceReminder(resumed);
    }, 10 * 60 * 1000);
  }, [emitProactiveVoiceReminder, proactiveNotice]);

  const handleDismissProactiveNotice = useCallback(() => {
    setProactiveNotice(null);
    setProcessingText("已静默归档本次提醒");
  }, []);

  const handleProcessProactiveNotice = useCallback(() => {
    const target = latestInboxItems[0];
    if (!target) {
      setProactiveNotice(null);
      setProcessingText("暂无可处理消息，已归档提醒");
      return;
    }
    setProactiveNotice(null);
    void queueSecretaryPrompt(
      buildInboxFollowupPrompt(target, currentUserName),
      buildInboxFollowupProcessingText(target),
    );
  }, [currentUserName, latestInboxItems, queueSecretaryPrompt]);

  const openPanel = useCallback(() => {
    setPanelOpen(true);
    setUnreadPushCount(0);
    setLatestPushCount(0);
  }, []);

  const handleOpenInbox = useCallback(() => {
    setUnreadPushCount(0);
    setLatestPushCount(0);
    navigate("/app/inbox");
  }, [navigate]);

  const handleOpenWorkspace = useCallback(
    (sessionId: string) => {
      if (!sessionId) return;
      setUnreadPushCount(0);
      navigate(`/app/workspace/${encodeURIComponent(sessionId)}`);
    },
    [navigate],
  );

  const handleProcessInboxItem = useCallback(
    (item: DockInboxItem) => {
      void queueSecretaryPrompt(
        buildInboxFollowupPrompt(item, currentUserName),
        buildInboxFollowupProcessingText(item),
      );
    },
    [currentUserName, queueSecretaryPrompt],
  );

  const handleDigestLatestMessages = useCallback(() => {
    const items = latestInboxItems;
    if (!items.length) {
      void queueSecretaryPrompt(
        composeSecretaryPrompt("请结合当前页面和最近会话，判断我现在最应该优先处理的事项。", { userRequest: false }),
        "红智秘书正在梳理当前最值得优先处理的事项...",
      );
      return;
    }
    const prompt = [
      "请先处理我最近收到的消息，并像秘书一样帮我做优先级判断。",
      ...items.map(
        (item, index) =>
          `${index + 1}. 标题：${item.title}；来源：${item.source}（${item.sourceTag}）；消息类型：${item.intentType || "未标注"}；更新时间：${item.updatedAt || "未知"}`,
      ),
      "请输出：1）优先级排序 2）每条消息建议动作 3）如需要回复，给出可直接使用的简短回复建议。",
    ].join("\n");
    void queueSecretaryPrompt(
      composeSecretaryPrompt(prompt, { userRequest: false }),
      "红智秘书正在整理最新消息优先级与建议动作...",
    );
  }, [composeSecretaryPrompt, latestInboxItems, queueSecretaryPrompt]);

  const handleSummarizeTodo = useCallback(() => {
    void queueSecretaryPrompt(
      composeSecretaryPrompt("请结合最近会话、当前页面和最新消息，总结我今天待处理的事项，并按优先级排序。", { userRequest: false }),
      "红智秘书正在汇总今天待处理事项...",
    );
  }, [composeSecretaryPrompt, queueSecretaryPrompt]);

  const handleBuildTodayPlan = useCallback(() => {
    void queueSecretaryPrompt(
      composeSecretaryPrompt("请结合最近会话、当前页面和最新消息，生成我今天的行动安排，包含顺序、时间建议与检查点。", { userRequest: false }),
      "红智秘书正在生成今日行动安排...",
    );
  }, [composeSecretaryPrompt, queueSecretaryPrompt]);

  const extraEntrances = useMemo(() => {
    const fixed = [
      { key: "to-employee-center", label: "员工中心", path: "/app/employee-center" },
      { key: "to-expert-center", label: "专家中心", path: "/app/expert-center" },
    ];
    const merged = [...secondaryActions, ...fixed.map((item) => ({ ...item, mode: "navigate" as const, icon: "arrow" as const }))];
    const seen = new Set<string>();
    return merged.filter((action) => {
      const sign = `${action.key}-${action.path || ""}`;
      if (seen.has(sign)) return false;
      seen.add(sign);
      return Boolean(action.path);
    }).slice(0, 4);
  }, [secondaryActions]);

  const quickTaskButtons = useMemo(
    () => [
      {
        key: "latest-messages",
        label: latestInboxItems.length ? `处理 ${latestInboxItems.length} 条消息` : "处理最新消息",
        description: latestInboxItems[0]?.title || "优先级排序并生成可直接使用的回复建议",
        onClick: handleDigestLatestMessages,
        icon: <MessagesSquare size={14} />,
      },
      {
        key: "summary-todo",
        label: "判断当前优先级",
        description: "结合页面、最近会话和消息，先收敛最该推进的事项",
        onClick: handleSummarizeTodo,
        icon: <Brain size={14} />,
      },
      {
        key: "today-plan",
        label: "生成今日安排",
        description: "整理执行顺序、时间建议与检查点",
        onClick: handleBuildTodayPlan,
        icon: <Sparkles size={14} />,
      },
    ],
    [handleBuildTodayPlan, handleDigestLatestMessages, handleSummarizeTodo, latestInboxItems],
  );

  const avatarTip = processingText
    ? processingText
    : unreadPushCount > 0
      ? `刚收到 ${unreadPushCount} 条新消息，点开可直接交给秘书处理`
      : panelOpen
        ? "已切换到原生会话窗口"
        : "点开即可继续会话、交办任务与处理消息";
  const avatarBadge = unreadPushCount > 0 ? `${Math.min(99, unreadPushCount)}` : processingText ? "..." : scene.status === "warning" ? "!" : "AI";

  useEffect(() => {
    localStorage.setItem(DOCK_OPEN_STORAGE_KEY, panelOpen ? "1" : "0");
    if (panelOpen) {
      void ensureSecretarySession();
    }
  }, [ensureSecretarySession, panelOpen]);

  useEffect(() => {
    if (!chatSrc) return;
    if (frameLoadingTimerRef.current) {
      window.clearInterval(frameLoadingTimerRef.current);
      frameLoadingTimerRef.current = null;
    }
    frameLoadingTimerRef.current = window.setInterval(() => {
      setLoadingPercent((prev) => (prev >= 88 ? prev : prev + 7));
    }, 180);
    return () => {
      if (frameLoadingTimerRef.current) {
        window.clearInterval(frameLoadingTimerRef.current);
        frameLoadingTimerRef.current = null;
      }
    };
  }, [chatSrc]);

  useEffect(() => {
    return () => {
      stopHandoffRetryLoop();
      if (frameLoadingTimerRef.current) {
        window.clearInterval(frameLoadingTimerRef.current);
      }
      if (voiceTaskStatusTimerRef.current) {
        window.clearTimeout(voiceTaskStatusTimerRef.current);
      }
      if (proactiveRemindTimerRef.current) {
        window.clearTimeout(proactiveRemindTimerRef.current);
      }
    };
  }, [stopHandoffRetryLoop]);

  useEffect(() => {
    void loadInbox();
    const handlePushUpdated = (event: Event) => {
      const detail = ((event as CustomEvent<PushEventDetail>)?.detail || {}) as PushEventDetail;
      const messageCount = Math.max(0, Number(detail.messageCount ?? detail.count ?? 0));
      const proactiveCount = Math.max(0, Number(detail.proactiveCount || 0));
      if (messageCount > 0) {
        setUnreadPushCount((prev) => Math.min(99, prev + messageCount));
      }
      if (messageCount > 0 || proactiveCount > 0) {
        setLatestPushCount(messageCount + proactiveCount);
      }
      setFeedExpanded(true);
      void loadInbox();
      showProactiveNotice(detail);
    };
    window.addEventListener("copaw-push-session-updated", handlePushUpdated);
    return () => {
      window.removeEventListener("copaw-push-session-updated", handlePushUpdated);
    };
  }, [loadInbox, showProactiveNotice]);

  useEffect(() => {
    const handleFrameMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      if (event.origin && event.origin !== window.location.origin) return;
      const payload = (event.data || {}) as Record<string, unknown>;
      const messageType = String(payload.type || "").trim();

      if (messageType === "copaw-embed-ready") {
        const readySessionId = String(
          payload.sessionId || secretarySessionIdRef.current || loadedSecretarySessionIdRef.current || "",
        ).trim();
        if (readySessionId) {
          loadedSecretarySessionIdRef.current = readySessionId;
        }
        setFrameReady(true);
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

      if (completedSessionId) {
        loadedSecretarySessionIdRef.current = completedSessionId;
      }
      pendingPromptRef.current = null;
      pendingProcessingStatusRef.current = "";
      setFrameReady(true);
      stopHandoffRetryLoop();
      const activeVoiceTask = activeVoiceTaskRef.current;
      const isVoiceTaskResult =
        Boolean(activeVoiceTask) &&
        (!activeVoiceTask?.sessionId || !completedSessionId || activeVoiceTask.sessionId === completedSessionId);
      if (isVoiceTaskResult) {
        activeVoiceTaskRef.current = null;
        if (ok) {
          const doneText = "语音任务执行完成，结果已同步到会话区";
          setProcessingText(doneText);
          emitProcessingStatus("");
          if (voiceTaskStatusTimerRef.current) {
            window.clearTimeout(voiceTaskStatusTimerRef.current);
          }
          voiceTaskStatusTimerRef.current = window.setTimeout(() => {
            setProcessingText("");
            voiceTaskStatusTimerRef.current = null;
          }, 2200);
        } else {
          setProcessingText(errorText || summary || "语音任务执行失败，请稍后重试");
        }
      } else {
        setProcessingText(ok ? "" : errorText || summary || "当前请求未完成，请稍后重试");
      }
      void loadInbox();
    };

    window.addEventListener("message", handleFrameMessage);
    return () => {
      window.removeEventListener("message", handleFrameMessage);
      stopHandoffRetryLoop();
      if (voiceTaskStatusTimerRef.current) {
        window.clearTimeout(voiceTaskStatusTimerRef.current);
      }
    };
  }, [
    chatSrc,
    emitProcessingStatus,
    ensureHandoffRetryLoop,
    flushPendingProcessingStatus,
    flushPendingPrompt,
    loadInbox,
    stopHandoffRetryLoop,
  ]);

  return (
    <div className={styles.dockRoot}>
      {panelOpen ? (
        <div className={styles.panel}>
          <div className={styles.panelBody}>
            <div className={styles.topBar}>
              <div className={styles.topBarMain}>
                <div className={styles.brandRow}>
                  <h3 className={styles.panelTitle}>红智秘书</h3>
                  <Tag color="processing" style={{ marginInlineEnd: 0, borderRadius: 999 }}>
                    <Sparkles size={12} style={{ marginRight: 6 }} />
                    {scene.badge}
                  </Tag>
                  {latestPushCount > 0 ? <Tag color="red" style={{ marginInlineEnd: 0, borderRadius: 999 }}>新消息 {latestPushCount}</Tag> : null}
                </div>
                <div className={styles.statusBar}>
                  <div className={styles.statusText} style={{ color: statusMeta.color }}>
                    <span className={styles.statusDot} style={{ color: statusMeta.color, background: statusMeta.color }} />
                    {statusMeta.label}
                  </div>
                  <div className={styles.topBarMeta}>
                    <Clock3 size={13} />
                    <span>{contextUpdatedLabel}</span>
                    <span>·</span>
                    <span>{frameReady ? "秘书在线" : frameLoading ? "会话恢复中" : "待命中"}</span>
                  </div>
                </div>
              </div>
              <Space size={[8, 8]} wrap className={styles.topActions}>
                <Button size="small" onClick={() => navigate("/app/secretary")} icon={<ArrowUpRight size={14} />}>
                  主会场
                </Button>
                <Badge count={unreadPushCount} size="small" overflowCount={99}>
                  <Button size="small" onClick={handleOpenInbox} icon={<MessagesSquare size={14} />}>
                    通知
                  </Button>
                </Badge>
                <Button size="small" onClick={() => setPanelOpen(false)} icon={<ChevronDown size={14} />}>
                  收起
                </Button>
              </Space>
            </div>

            <div className={styles.quickActionBar}>
              {quickTaskButtons.map((item) => (
                <button key={item.key} type="button" className={styles.quickActionButton} onClick={item.onClick}>
                  <span className={styles.quickActionIcon}>{item.icon}</span>
                  <span className={styles.quickActionText}>
                    <span className={styles.quickActionLabel}>{item.label}</span>
                  </span>
                </button>
              ))}
            </div>

            <div className={styles.chatWrap}>
              <div className={styles.chatToolbar}>
                <div className={styles.chatToolbarLeft}>
                  <div className={styles.chatTitle}>原生会话</div>
                  <div className={styles.chatInlineMeta}>
                    <span>{frameReady ? "在线" : frameLoading ? "恢复中" : "待命"}</span>
                    {processingText ? (
                      <>
                        <span>·</span>
                        <span className={styles.chatInlineProcessing}>{processingText}</span>
                      </>
                    ) : null}
                  </div>
                </div>
                <Space size={[8, 8]} wrap>
                  {latestInboxItems.length ? <Tag color="purple" style={{ marginInlineEnd: 0, borderRadius: 999 }}>最新消息 {latestInboxItems.length}</Tag> : null}
                  <Tag color={frameReady ? "success" : "processing"} style={{ marginInlineEnd: 0, borderRadius: 999 }}>
                    {frameReady ? "已接入" : frameLoading ? "恢复中" : "待命"}
                  </Tag>
                </Space>
              </div>

              <div className={styles.chatFrameShell}>
                <div className={styles.chatFrameCard}>
                  {frameLoading ? (
                    <div className={styles.chatLoading}>
                      <div className={styles.chatLoadingTitle}>正在恢复秘书会话</div>
                      <div className={styles.chatLoadingText}>我正在同步最近会话、当前页上下文和快捷处理能力。</div>
                      <Progress percent={loadingPercent} size="small" showInfo={false} strokeColor={{ from: "#60a5fa", to: "#2563eb" }} trailColor="#dbeafe" status="active" />
                    </div>
                  ) : null}
                  {!chatSrc && !frameLoading ? (
                    <div className={styles.chatEmpty}>
                      <div className={styles.chatEmptyTitle}>秘书会话待命中</div>
                      <div className={styles.chatEmptyText}>点击恢复后即可直接继续上一段任务，消息和当前页上下文会一并带入。</div>
                      <Button type="primary" size="small" onClick={() => void ensureSecretarySession()}>
                        恢复最近会话
                      </Button>
                    </div>
                  ) : null}
                  {chatSrc ? (
                    <iframe
                      ref={frameRef}
                      src={chatSrc}
                      title="红智秘书会话窗"
                      className={styles.chatFrame}
                      onLoad={() => {
                        if (frameLoadingTimerRef.current) {
                          window.clearInterval(frameLoadingTimerRef.current);
                          frameLoadingTimerRef.current = null;
                        }
                        setLoadingPercent(100);
                        window.setTimeout(() => setFrameLoading(false), 240);
                        syncChatFrameReady();
                        ensureHandoffRetryLoop();
                      }}
                    />
                  ) : null}
                </div>
              </div>
            </div>

            <div className={styles.feedSection}>
              <button type="button" className={styles.feedToggle} onClick={() => setFeedExpanded((prev) => !prev)}>
                <span>
                  更多消息与上下文
                  <span className={styles.feedToggleMeta}>{loadingInbox ? "同步中..." : `${inboxItems.length} 条消息`}</span>
                </span>
                <ChevronDown size={16} className={`${styles.feedChevron} ${feedExpanded ? styles.feedChevronOpen : ""}`.trim()} />
              </button>

              {feedExpanded ? (
                <div className={styles.feedBody}>
                  {proactiveNotice ? (
                    <div className={styles.feedBlock}>
                      <div className={styles.feedBlockHeader}>
                        <span className={styles.feedBlockTitle}>主动提醒</span>
                        <Space size={[8, 8]} wrap>
                          <Tag color={proactiveNotice.level === "strong" ? "red" : proactiveNotice.level === "light" ? "gold" : "default"} style={{ marginInlineEnd: 0, borderRadius: 999 }}>
                            {proactiveNotice.level === "strong" ? "强提醒" : proactiveNotice.level === "light" ? "轻提醒" : "静默"}
                          </Tag>
                          <Tag style={{ marginInlineEnd: 0, borderRadius: 999 }}>紧急度 {proactiveNotice.urgency}</Tag>
                          <Tag style={{ marginInlineEnd: 0, borderRadius: 999 }}>相关度 {proactiveNotice.relevance}</Tag>
                          <Tag style={{ marginInlineEnd: 0, borderRadius: 999 }}>{getRelativeTimeLabel(proactiveNotice.createdAt)}</Tag>
                        </Space>
                      </div>
                      <div className={styles.inboxItemCard}>
                        <div className={styles.inboxItemTop}>
                          <div className={styles.inboxItemTitle}>{proactiveNotice.title}</div>
                          <Tag style={{ marginInlineEnd: 0, borderRadius: 999 }}>{proactiveNotice.source}</Tag>
                        </div>
                        <div className={styles.inboxItemMeta}>{proactiveNotice.summary}</div>
                        <div className={styles.inboxItemActions}>
                          <Button size="small" type="primary" onClick={handleProcessProactiveNotice}>
                            立即处理
                          </Button>
                          <Button size="small" onClick={handleSnoozeProactiveNotice}>
                            稍后提醒
                          </Button>
                          <Button size="small" onClick={handleDismissProactiveNotice}>
                            静默归档
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className={styles.feedBlock}>
                    <div className={styles.feedBlockHeader}>
                      <span className={styles.feedBlockTitle}>最新消息</span>
                      <Space size={[8, 8]} wrap>
                        {unreadPushCount > 0 ? <Tag color="red" style={{ marginInlineEnd: 0, borderRadius: 999 }}>未查看 {unreadPushCount}</Tag> : null}
                        <Button size="small" onClick={handleOpenInbox}>查看全部</Button>
                      </Space>
                    </div>
                    {latestInboxItems.length ? (
                      <div className={styles.inboxList}>
                        {latestInboxItems.map((item) => (
                          <div key={item.sessionId} className={styles.inboxItemCard}>
                            <div className={styles.inboxItemTop}>
                              <div className={styles.inboxItemTitle}>{item.title}</div>
                              <Tag style={{ marginInlineEnd: 0, borderRadius: 999 }}>{item.sourceTag}</Tag>
                            </div>
                            <div className={styles.inboxItemMeta}>
                              <span>{item.source}</span>
                              <span>·</span>
                              <span>{item.intentType || "普通消息"}</span>
                              <span>·</span>
                              <span>{getRelativeTimeLabel(item.updatedAt)}</span>
                            </div>
                            <div className={styles.inboxItemActions}>
                              <Button size="small" type="primary" onClick={() => handleProcessInboxItem(item)}>
                                交给秘书处理
                              </Button>
                              <Button size="small" onClick={() => handleOpenWorkspace(item.sessionId)}>
                                去查看
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className={styles.emptyHint}>暂无新消息，新的员工、PIA、SO 推送会在这里出现。</div>
                    )}
                  </div>

                  <div className={styles.feedGrid}>
                    <div className={styles.feedBlock}>
                      <div className={styles.feedBlockHeader}>
                        <span className={styles.feedBlockTitle}>更多入口</span>
                      </div>
                      <div className={styles.entryList}>
                        {extraEntrances.map((action) => (
                          <Button key={action.key} size="small" onClick={() => action.path && navigate(action.path)} icon={iconMap[action.icon || "arrow"]}>
                            {action.label}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <div className={styles.feedBlock}>
                      <div className={styles.feedBlockHeader}>
                        <span className={styles.feedBlockTitle}>当前页上下文</span>
                      </div>
                      {focusSummary ? <div className={styles.focusText}>{focusSummary}</div> : <div className={styles.emptyHint}>当前页暂无额外焦点摘要。</div>}
                      {mergedTags.length ? (
                        <div className={styles.tagList}>
                          {mergedTags.map((tag) => (
                            <Tag key={tag} style={{ marginInlineEnd: 0, borderRadius: 999, background: "#fff", color: "#4f46e5", borderColor: "#c7d2fe" }}>
                              {tag}
                            </Tag>
                          ))}
                        </div>
                      ) : null}
                      {mergedInsights.length ? (
                        <div className={styles.insightList}>
                          {mergedInsights.slice(0, 3).map((item) => (
                            <div key={item} className={styles.insightItem}>
                              <span className={styles.insightBullet} />
                              <span>{item}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* 语音秘书不再弹窗，直接在按钮上控制 */}
      <div className={styles.avatarStack}>
        <div className={styles.avatarTip}>{avatarTip}</div>
        <div className={styles.avatarActionList}>
          <div className={styles.avatarActionItem}>
            <button
              type="button"
              className={styles.avatarButton}
              onClick={() => {
                if (panelOpen) {
                  setPanelOpen(false);
                  return;
                }
                if (chatSrc) {
                  setFrameReady(false);
                  setFrameLoading(true);
                  setLoadingPercent(18);
                }
                openPanel();
              }}
              aria-label="打开 AI 秘书窗口"
            >
              <span className={styles.avatarGlow} />
              <span className={styles.avatarRing} />
              <span className={styles.avatarCore}>
                <Bot size={24} />
              </span>
              <span className={`${styles.avatarBadge} ${unreadPushCount > 0 ? styles.avatarBadgeAlert : ""}`.trim()}>{avatarBadge}</span>
            </button>
            <div className={styles.avatarActionCaption}>文字秘书</div>
          </div>

          <div className={styles.avatarActionItem}>
            <button
              type="button"
              className={`${styles.avatarButton} ${voiceActive ? styles.voiceAvatarButtonActive : ""}`.trim()}
              onClick={() => {
                if (!voiceActive) {
                  // 一次点击即连接并唤醒
                  setVoiceActive(true);
                  voiceActivate();
                  void voiceStart();
                } else if (!voiceListening) {
                  // 已连接但未激活 → 唤醒拾音
                  voiceActivate();
                } else {
                  // 已激活 → 休眠（不断开连接）
                  voiceDeactivate();
                }
              }}
              aria-label={!voiceActive ? "开启语音秘书" : voiceListening ? "休眠语音秘书" : "唤醒语音秘书"}
            >
              <span className={`${styles.avatarGlow} ${voiceActive ? styles.voiceAvatarGlowActive : ""}`} />
              <span className={`${styles.avatarRing} ${styles.voiceAvatarRing} ${voiceActive ? styles.voiceAvatarRingActive : ""}`} />
              <span className={`${styles.avatarCore} ${styles.voiceAvatarCore} ${voiceActive ? styles.voiceAvatarCoreActive : ""}`}>
                {!voiceActive ? <MicOff size={22} /> : voiceListening ? <Mic size={22} /> : <MicOff size={22} />}
              </span>
              {voiceActive && (
                <span className={styles.voiceStatusDot}>
                  <span className={`statusDotInner statusDot${voiceStatus[0].toUpperCase() + voiceStatus.slice(1)}`} />
                </span>
              )}
            </button>
            <div className={`${styles.avatarActionCaption} ${styles.voiceAvatarCaption}`}>
              {voiceStatusLabel}
            </div>
          </div>
        </div>
        <div className={styles.avatarLabel}>红智秘书在线</div>
      </div>
    </div>
  );
}
