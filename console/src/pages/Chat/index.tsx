import {
  AgentScopeRuntimeWebUI,
  IAgentScopeRuntimeWebUIOptions,
} from "@agentscope-ai/chat";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Modal, Progress, Result } from "antd";
import { ExclamationCircleOutlined, SettingOutlined } from "@ant-design/icons";
import { Maximize2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import sessionApi, { createAssistantTextCardMessage } from "./sessionApi";
import defaultConfig, { getDefaultConfig } from "./OptionsPanel/defaultConfig";
import Weather from "./Weather";
import { getApiToken, getApiUrl } from "../../api/config";
import { providerApi } from "../../api/modules/provider";
import { authApi } from "../../api/modules/auth";
import { agentOsApi } from "../../api/modules/agentOs";
import ModelSelector from "./ModelSelector";
import VoiceInputButton from "../../components/VoiceInputButton";
import {
  getWelcomeMessage,
  getGuideText,
  type UserInfo,
} from "../../utils/userGreetings";
import styles from "./index.module.less";

interface CustomWindow extends Window {
  currentSessionId?: string;
  currentUserId?: string;
  currentChannel?: string;
}

declare const window: CustomWindow;

function buildModelError(): Response {
  return new Response(
    JSON.stringify({
      error: "Model not configured",
      message: "Please configure a model first",
    }),
    { status: 400, headers: { "Content-Type": "application/json" } },
  );
}

const SCENE_STORAGE = "copaw_scene_start_v1";
const SCENE_PENDING_STORAGE = "copaw_scene_pending_v1";

interface SceneStartPayload {
  key: string;
  label?: string;
  triggerKey?: string;
  sessionName?: string;
  prompt?: string;
  context?: Record<string, unknown>;
  skill?: string;
  templateType?: string;
  agentKey?: string;
  runtimeProfile?: string;
  ts?: number;
}

interface ScenePendingPayload {
  id: string;
  prompt: string;
  processingText?: string;
  ts?: number;
}

const normalizeSceneValue = (value: unknown): string => String(value ?? "").trim();

const parseStoredScene = (): SceneStartPayload | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SCENE_STORAGE);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as SceneStartPayload;
  } catch {
    return null;
  }
};

const parseStoredScenePending = (): ScenePendingPayload | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SCENE_PENDING_STORAGE);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as ScenePendingPayload;
  } catch {
    return null;
  }
};

const buildSceneBootstrapMessage = (scene: SceneStartPayload): string => {
  const title =
    normalizeSceneValue(scene.sessionName) ||
    normalizeSceneValue(scene.label) ||
    normalizeSceneValue(scene.triggerKey) ||
    "场景会话";
  const skill = normalizeSceneValue(scene.skill);
  if (skill === "employee_agent_link") {
    return `已打开「${title}」，正在连接对应数字分身，请稍候查看协同回复。`;
  }
  if (skill === "department_agent_link") {
    return `已打开「${title}」，正在汇总部门联动结果，请稍候查看最新进展。`;
  }
  if (skill === "expert_agent_link") {
    return `已打开「${title}」，正在挂载数字专家上下文，请稍候查看首条专业回复。`;
  }
  return `已打开「${title}」，你可以继续在此处理当前场景任务。`;
};

type EmbedLogTone = "info" | "success" | "warning" | "error";

interface EmbedProgressLog {
  id: string;
  stage: string;
  title: string;
  detail: string;
  tone: EmbedLogTone;
  ts: number;
}

const EMBED_STAGE_PERCENT: Record<string, number> = {
  mounting: 12,
  accepted: 16,
  request_received: 22,
  command_routing: 24,
  preparing_context: 32,
  loading_memory: 42,
  agent_ready: 54,
  session_loaded: 62,
  agent_thinking: 72,
  first_response: 82,
  finalizing: 92,
  completed: 100,
  failed: 14,
  cancelled: 14,
};

const EMBED_STAGE_TITLE: Record<string, string> = {
  mounting: "会话容器连接中",
  accepted: "后端已接收请求",
  request_received: "请求进入执行通道",
  command_routing: "正在切换命令执行路径",
  preparing_context: "正在装载任务上下文",
  loading_memory: "正在加载档案与记忆",
  agent_ready: "智能体实例已就绪",
  session_loaded: "会话历史已恢复",
  agent_thinking: "模型正在分析任务",
  first_response: "正在生成首轮结果",
  finalizing: "正在整理并写回结果",
  completed: "执行完成",
  failed: "执行失败",
  cancelled: "执行已取消",
  timeout_short: "已连接执行链路",
  timeout_medium: "执行耗时较长",
  timeout_long: "任务已转为长耗时处理",
  message: "输出摘要已更新",
  external_status: "正在准备任务",
};

const EMBED_STAGE_LOG_TITLE: Record<string, string> = {
  mounting: "建立会话连接",
  accepted: "请求已被后端接收",
  request_received: "请求进入智能体执行通道",
  command_routing: "切换到命令执行路径",
  preparing_context: "装载任务上下文",
  loading_memory: "加载档案与记忆",
  agent_ready: "初始化智能体实例",
  session_loaded: "恢复会话历史与状态",
  agent_thinking: "分析任务并规划执行路径",
  first_response: "开始生成回复内容",
  finalizing: "整理并写回会话结果",
  completed: "会话处理完成",
  failed: "会话处理失败",
  cancelled: "会话处理已取消",
  timeout_short: "等待首个阶段反馈",
  timeout_medium: "任务仍在持续执行",
  timeout_long: "任务转入长耗时处理",
  message: "回复摘要更新",
  external_status: "准备任务上下文",
};

const clampEmbedPercent = (value: number) => Math.max(10, Math.min(100, Math.round(value)));

const extractSseFrames = (buffer: string) => {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const frames: string[] = [];
  let rest = normalized;
  let boundary = rest.indexOf("\n\n");
  while (boundary >= 0) {
    frames.push(rest.slice(0, boundary));
    rest = rest.slice(boundary + 2);
    boundary = rest.indexOf("\n\n");
  }
  return { frames, rest };
};

const parseSseFrame = (frame: string): { event: string; payload: any } | null => {
  const lines = frame.split("\n");
  let event = "message";
  const dataLines: string[] = [];
  lines.forEach((line) => {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim() || "message";
      return;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  });
  const raw = dataLines.join("\n").trim();
  if (!raw) return null;
  try {
    return { event, payload: JSON.parse(raw) };
  } catch {
    return { event, payload: { text: raw } };
  }
};

const formatEmbedElapsed = (ms: number) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}分${String(seconds).padStart(2, "0")}秒` : `${seconds}秒`;
};

const normalizeEmbedText = (value: unknown): string =>
  String(value ?? "")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/[`*_#>~-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s,，。；;：:、]+/, "")
    .trim();

const getEmbedSignalLength = (value: string) =>
  normalizeEmbedText(value).replace(/[^0-9A-Za-z\u4e00-\u9fa5]/g, "").length;

const isMeaningfulEmbedSummary = (value: unknown): boolean => {
  const normalized = normalizeEmbedText(value);
  if (!normalized) return false;
  const signalLength = getEmbedSignalLength(normalized);
  if (signalLength >= 12) return true;
  return signalLength >= 8 && /[，。；;：:!?！？、 ]/.test(normalized);
};

const joinEmbedDetail = (summary: string, detail: string) => {
  if (!summary) return detail;
  if (!detail) return summary;
  if (detail.includes(summary)) return detail;
  if (summary.includes(detail)) return summary;
  return /[。！？!?]$/.test(summary) ? `${summary}${detail}` : `${summary}。${detail}`;
};

type EmbedProgressStatus = "active" | "success" | "warning" | "error";

const resolveEmbedLogTone = (stage: string, status?: string): EmbedLogTone => {
  if (status === "error" || stage === "failed" || stage === "cancelled") return "error";
  if (status === "success" || stage === "completed") return "success";
  if (stage.startsWith("timeout")) return "warning";
  return "info";
};

const resolveEmbedStageTitle = (stage: string): string => EMBED_STAGE_TITLE[stage] || "执行状态更新";

const resolveEmbedLogTitle = (stage: string): string =>
  EMBED_STAGE_LOG_TITLE[stage] || EMBED_STAGE_TITLE[stage] || "执行状态更新";

const resolveEmbedStageDetail = (
  stage: string,
  summary?: string,
  detail?: string,
): string => {
  const normalizedSummary = normalizeEmbedText(summary);
  const normalizedDetail = normalizeEmbedText(detail);
  if (normalizedSummary && normalizedDetail) {
    return joinEmbedDetail(normalizedSummary, normalizedDetail);
  }
  if (normalizedDetail) return normalizedDetail;
  if (normalizedSummary) return normalizedSummary;
  return EMBED_STAGE_TITLE[stage] || "正在处理中...";
};

const formatEmbedLogTime = (ts: number) => {
  if (!ts) return "";
  const date = new Date(ts);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;
};

const resolveEmbedStatusMeta = (status: EmbedProgressStatus) => {
  if (status === "success") {
    return {
      label: "已完成",
      color: "#166534",
      background: "rgba(220, 252, 231, 0.9)",
      border: "#bbf7d0",
    };
  }
  if (status === "error") {
    return {
      label: "失败",
      color: "#991b1b",
      background: "rgba(254, 226, 226, 0.9)",
      border: "#fecaca",
    };
  }
  if (status === "warning") {
    return {
      label: "需关注",
      color: "#92400e",
      background: "rgba(254, 243, 199, 0.9)",
      border: "#fde68a",
    };
  }
  return {
    label: "处理中",
    color: "#1d4ed8",
    background: "rgba(219, 234, 254, 0.9)",
    border: "#bfdbfe",
  };
};

const resolveEmbedHeroMeta = (status: EmbedProgressStatus) => {
  if (status === "success") {
    return {
      badge: "已完成",
      hint: "本轮会话结果已经生成，可以继续查看完整回复。",
      accent: "#16a34a",
      accentSoft: "rgba(22, 163, 74, 0.16)",
      cardBackground: "linear-gradient(135deg, rgba(240, 253, 244, 0.98) 0%, rgba(220, 252, 231, 0.86) 100%)",
      cardBorder: "rgba(134, 239, 172, 0.9)",
    };
  }
  if (status === "error") {
    return {
      badge: "处理失败",
      hint: "执行链路出现异常，可稍后重试或回到会话查看详情。",
      accent: "#dc2626",
      accentSoft: "rgba(220, 38, 38, 0.14)",
      cardBackground: "linear-gradient(135deg, rgba(254, 242, 242, 0.98) 0%, rgba(254, 226, 226, 0.88) 100%)",
      cardBorder: "rgba(252, 165, 165, 0.9)",
    };
  }
  if (status === "warning") {
    return {
      badge: "持续处理中",
      hint: "任务仍在执行中，通常发生在复杂推理、工具调用或长耗时处理阶段。",
      accent: "#d97706",
      accentSoft: "rgba(217, 119, 6, 0.14)",
      cardBackground: "linear-gradient(135deg, rgba(255, 251, 235, 0.98) 0%, rgba(254, 243, 199, 0.9) 100%)",
      cardBorder: "rgba(252, 211, 77, 0.9)",
    };
  }
  return {
    badge: "思考中",
    hint: "系统正在持续思考、规划步骤并等待新的执行结果返回。",
    accent: "#2563eb",
    accentSoft: "rgba(37, 99, 235, 0.14)",
    cardBackground: "linear-gradient(135deg, rgba(239, 246, 255, 0.98) 0%, rgba(219, 234, 254, 0.9) 100%)",
    cardBorder: "rgba(147, 197, 253, 0.95)",
  };
};

const resolveEmbedLogMeta = (tone: EmbedLogTone, isLatest: boolean) => {
  if (tone === "success") {
    return {
      dot: "#16a34a",
      badgeLabel: "已完成",
      badgeColor: "#166534",
      badgeBackground: "rgba(220, 252, 231, 0.95)",
      border: "#bbf7d0",
      background: "#f0fdf4",
      line: "rgba(34, 197, 94, 0.35)",
    };
  }
  if (tone === "error") {
    return {
      dot: "#dc2626",
      badgeLabel: "失败",
      badgeColor: "#991b1b",
      badgeBackground: "rgba(254, 226, 226, 0.95)",
      border: "#fecaca",
      background: "#fef2f2",
      line: "rgba(248, 113, 113, 0.35)",
    };
  }
  if (tone === "warning") {
    return {
      dot: "#d97706",
      badgeLabel: "关注",
      badgeColor: "#92400e",
      badgeBackground: "rgba(254, 243, 199, 0.95)",
      border: "#fde68a",
      background: "#fffbeb",
      line: "rgba(251, 191, 36, 0.35)",
    };
  }
  return {
    dot: "#2563eb",
    badgeLabel: isLatest ? "进行中" : "已记录",
    badgeColor: isLatest ? "#1d4ed8" : "#475569",
    badgeBackground: isLatest ? "rgba(219, 234, 254, 0.95)" : "rgba(241, 245, 249, 0.95)",
    border: isLatest ? "#bfdbfe" : "#e2e8f0",
    background: isLatest ? "#eff6ff" : "#f8fafc",
    line: isLatest ? "rgba(96, 165, 250, 0.5)" : "rgba(203, 213, 225, 0.65)",
  };
};

const EMBED_RESPONSE_CARD = "AgentScopeRuntimeResponseCard";
const EMBED_FALLBACK_MARKER = "copaw-embed-fallback";

const createEmbedFallbackMessage = (text: string) =>
  createAssistantTextCardMessage(text, {
    [EMBED_FALLBACK_MARKER]: true,
  });

const isEmbedFallbackFlag = (value: unknown): boolean => value === true || value === "true";

const getDirectEmbedOutputs = (message: any): any[] => {
  if (Array.isArray(message?.output)) return message.output;
  if (Array.isArray(message?.data?.output)) return message.data.output;
  return [];
};

const hasEmbedFallbackInOutputs = (outputs: any[] = []): boolean =>
  outputs.some(
    (outputMessage: any) =>
      isEmbedFallbackFlag(outputMessage?.metadata?.[EMBED_FALLBACK_MARKER]) ||
      isEmbedFallbackFlag(outputMessage?.data?.copawEmbedFallback),
  );

const isEmbedFallbackMessage = (message: any): boolean => {
  if (isEmbedFallbackFlag(message?.metadata?.[EMBED_FALLBACK_MARKER])) {
    return true;
  }
  if (hasEmbedFallbackInOutputs(getDirectEmbedOutputs(message))) {
    return true;
  }
  if (!Array.isArray(message?.cards)) return false;
  return message.cards.some((card: any) => {
    if (isEmbedFallbackFlag(card?.data?.copawEmbedFallback)) return true;
    if (!Array.isArray(card?.data?.output)) return false;
    return hasEmbedFallbackInOutputs(card.data.output);
  });
};

const stripEmbedFallbackMessages = (messages: any[] = []) =>
  messages.filter((message) => !isEmbedFallbackMessage(message));

const withEmbedFallbackMessage = (messages: any[] = [], text: string) => {
  const cleaned = stripEmbedFallbackMessages(messages);
  const normalized = String(text || "").trim();
  if (!normalized) return cleaned;
  const fallbackMessage = createEmbedFallbackMessage(normalized);
  if (!fallbackMessage) return cleaned;
  return [...cleaned, fallbackMessage];
};

const collectEmbedTextItems = (node: unknown, bucket: string[]) => {
  if (!Array.isArray(node)) return;
  node.forEach((item) => {
    if (item && typeof item === "object" && (item as Record<string, unknown>).type === "text") {
      const text = normalizeEmbedText((item as Record<string, unknown>).text);
      if (text) bucket.push(text);
    }
  });
};

const collectEmbedOutputTexts = (outputs: any[] = [], bucket: string[]) => {
  outputs.forEach((outputMessage: any) => {
    const text = extractEmbedOutputMessageText(outputMessage);
    if (text) bucket.push(text);
  });
};

const extractEmbedOutputMessageText = (message: any): string => {
  const parts: string[] = [];
  collectEmbedTextItems(message?.content, parts);
  return normalizeEmbedText(parts.join("\n"));
};

const extractEmbedUiMessageText = (message: any): string => {
  const parts: string[] = [];
  collectEmbedTextItems(message?.content, parts);
  collectEmbedOutputTexts(getDirectEmbedOutputs(message), parts);
  if (Array.isArray(message?.cards)) {
    message.cards.forEach((card: any) => {
      if (card?.code !== EMBED_RESPONSE_CARD || !Array.isArray(card?.data?.output)) return;
      collectEmbedOutputTexts(card.data.output, parts);
    });
  }
  return normalizeEmbedText(parts.join("\n"));
};

const resolveEmbedMessageRole = (message: any): string => {
  const directOutputs = getDirectEmbedOutputs(message);
  const cardOutputRole = Array.isArray(message?.cards)
    ? message.cards
        .flatMap((card: any) => (Array.isArray(card?.data?.output) ? card.data.output : []))
        .find((item: any) => item?.role)?.role
    : "";
  return String(
    message?.role ||
      message?.message?.role ||
      message?.data?.role ||
      directOutputs.find((item: any) => item?.role)?.role ||
      cardOutputRole ||
      "",
  ).toLowerCase();
};

const countAssistantMessages = (messages: any[] = []) =>
  messages.filter((item: any) => {
    const role = resolveEmbedMessageRole(item);
    return (role === "assistant" || role === "system") && Boolean(extractEmbedUiMessageText(item));
  }).length;

const extractLatestEmbedAssistantPreview = (messages: any[] = []): string => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const item = messages[index];
    const role = resolveEmbedMessageRole(item);
    if (role !== "assistant" && role !== "system") continue;
    const text = extractEmbedUiMessageText(item);
    if (!text) continue;
    if (isMeaningfulEmbedSummary(text)) {
      return text.slice(0, 220);
    }
  }
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const item = messages[index];
    const role = resolveEmbedMessageRole(item);
    if (role !== "assistant" && role !== "system") continue;
    const text = extractEmbedUiMessageText(item);
    if (text) return text.slice(0, 220);
  }
  return "";
};

const resolveAutoEmbedProcessingText = (meta?: Record<string, unknown> | null): string => {
  const scene = String(meta?.scene || "").trim();
  if (scene === "secretary-home") {
    return "红智秘书正在唤醒中...";
  }
  const skill = String(meta?.scene_skill || "").trim();
  if (skill === "expert_agent_link") {
    return "正在同步数字专家上下文并生成首条专业回复...";
  }
  if (skill === "employee_agent_link") {
    return "正在同步员工分身上下文并生成首条场景内容...";
  }
  if (skill === "department_agent_link") {
    return "正在汇总部门联动结果，请稍候查看最新进展...";
  }
  if (String(meta?.followup_job_id || "").trim()) {
    return "正在同步任务上下文、恢复阶段进展与消息流...";
  }
  return "任务指令已下发，正在生成会话内容...";
};

export default function ChatPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { chatId } = useParams<{ chatId: string }>();
  const [showModelPrompt, setShowModelPrompt] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [loadingUserInfo, setLoadingUserInfo] = useState(true);
  const [archivedContext, setArchivedContext] = useState<{
    user_profile?: string;
    public_memory?: string;
  }>({});

  const isComposingRef = useRef(false);
  const sceneBootstrapRef = useRef("");

  const lastSessionIdRef = useRef<string | null>(null);
  const chatIdRef = useRef(chatId);
  const navigateRef = useRef(navigate);
  const currentPath = location.pathname;
  const isWorkspaceEmbed =
    currentPath === "/app/workspace-embed" || currentPath.startsWith("/app/workspace-embed/");
  const isEmployeeWorkspace =
    currentPath === "/app/workspace" || currentPath.startsWith("/app/workspace/");
  const query = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const isSecretaryEmbed = isWorkspaceEmbed && query.get("secretary") === "1";
  const isTaskEmbed = isWorkspaceEmbed && Boolean(query.get("task"));
  const isSimpleEmbed = isWorkspaceEmbed && (query.get("simple") === "1" || isSecretaryEmbed || isTaskEmbed);
  const storedRole = (sessionStorage.getItem("copaw_role") || localStorage.getItem("copaw_role") || "").trim();
  const isAdminView = storedRole === "admin";
  const headerTheme = useMemo(
    () =>
      isAdminView
        ? {
            ...defaultConfig.theme,
            rightHeader: <ModelSelector />,
          }
        : {
            ...defaultConfig.theme,
            leftHeader: {
              ...defaultConfig.theme.leftHeader,
              title: "",
            },
            rightHeader: undefined,
          },
    [isAdminView],
  );
  const [embedProcessingText, setEmbedProcessingText] = useState("");
  const [embedProgressTitle, setEmbedProgressTitle] = useState("");
  const [embedProgressPercent, setEmbedProgressPercent] = useState(10);
  const [embedProgressLogs, setEmbedProgressLogs] = useState<EmbedProgressLog[]>([]);
  const [embedProgressStatus, setEmbedProgressStatus] = useState<EmbedProgressStatus>("active");
  const [embedElapsedMs, setEmbedElapsedMs] = useState(0);
  const [embedResultPreview, setEmbedResultPreview] = useState("");
  const [chatRenderVersion, setChatRenderVersion] = useState(0);
  const recentEmbedSubmitRef = useRef<{ key: string; ts: number } | null>(null);
  const embedAutoBootstrapRef = useRef("");
  const embedProgressStartedAtRef = useRef(0);
  const embedProgressStageRef = useRef("idle");
  const embedRequestTokenRef = useRef(0);
  const embedResetTimerRef = useRef<number | null>(null);
  const embedTimeoutMarksRef = useRef<{ short?: boolean; medium?: boolean; long?: boolean }>({});
  const buildChatRoute = useCallback(
    (sessionId?: string | null) => {
      const nextId = String(sessionId || "").trim();
      if (isWorkspaceEmbed) {
        return nextId
          ? `/app/workspace-embed/${nextId}${location.search}`
          : `/app/workspace-embed${location.search}`;
      }
      if (isEmployeeWorkspace) {
        return nextId ? `/app/workspace/${nextId}` : "/app/workspace";
      }
      return nextId ? `/chat/${nextId}` : "/chat";
    },
    [isEmployeeWorkspace, isWorkspaceEmbed, location.search],
  );
  chatIdRef.current = chatId;
  navigateRef.current = navigate;

  const postEmbedMessageToParent = useCallback(
    (payload: Record<string, unknown>) => {
      if (!isWorkspaceEmbed) return;
      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage(payload, window.location.origin);
        }
      } catch (error) {
        console.debug("[Chat] failed to notify parent window:", error);
      }
    },
    [isWorkspaceEmbed],
  );
  const requestSecretaryEmbedFocus = useCallback(() => {
    if (!isSecretaryEmbed) return;
    postEmbedMessageToParent({ type: "copaw-embed-focus-request" });
  }, [isSecretaryEmbed, postEmbedMessageToParent]);

  const clearEmbedResetTimer = useCallback(() => {
    if (embedResetTimerRef.current) {
      window.clearTimeout(embedResetTimerRef.current);
      embedResetTimerRef.current = null;
    }
  }, []);

  const resetEmbedProgress = useCallback(
    (delay = 0) => {
      clearEmbedResetTimer();
      const run = () => {
        embedProgressStartedAtRef.current = 0;
        embedProgressStageRef.current = "idle";
        embedTimeoutMarksRef.current = {};
        setEmbedElapsedMs(0);
        setEmbedProcessingText("");
        setEmbedProgressTitle("");
        setEmbedProgressPercent(10);
        setEmbedProgressLogs([]);
        setEmbedProgressStatus("active");
        setEmbedResultPreview("");
      };
      if (delay > 0) {
        embedResetTimerRef.current = window.setTimeout(run, delay);
        return;
      }
      run();
    },
    [clearEmbedResetTimer],
  );

  const appendEmbedLog = useCallback(
    (stage: string, title: string, detail: string, tone: EmbedLogTone) => {
      const nextTitle = normalizeEmbedText(title);
      const nextDetail = normalizeEmbedText(detail) || nextTitle;
      if (!nextTitle && !nextDetail) return;
      setEmbedProgressLogs((prev) => {
        let existingIndex = -1;
        for (let index = prev.length - 1; index >= 0; index -= 1) {
          if (prev[index].stage === stage) {
            existingIndex = index;
            break;
          }
        }
        const existing = existingIndex >= 0 ? prev[existingIndex] : null;
        if (
          existing &&
          existing.title === nextTitle &&
          existing.detail === nextDetail &&
          existing.tone === tone
        ) {
          return prev;
        }
        const nextItem = {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          stage,
          title: nextTitle,
          detail: nextDetail,
          tone,
          ts: Date.now(),
        };
        const base = existingIndex >= 0 ? prev.filter((_, index) => index !== existingIndex) : prev;
        return [...base.slice(-7), nextItem];
      });
    },
    [],
  );

  const beginEmbedProgress = useCallback(
    (stage: string, detail: string, summary?: string, percent?: number) => {
      clearEmbedResetTimer();
      embedProgressStartedAtRef.current = Date.now();
      embedProgressStageRef.current = stage;
      embedTimeoutMarksRef.current = {};
      const title = resolveEmbedStageTitle(stage);
      const logTitle = resolveEmbedLogTitle(stage);
      const nextDetail = resolveEmbedStageDetail(stage, summary, detail);
      const tone = resolveEmbedLogTone(stage, "active");
      setEmbedElapsedMs(0);
      setEmbedResultPreview("");
      setEmbedProcessingText(nextDetail);
      setEmbedProgressTitle(title);
      setEmbedProgressPercent(clampEmbedPercent(percent ?? EMBED_STAGE_PERCENT[stage] ?? 12));
      setEmbedProgressStatus("active");
      setEmbedProgressLogs([
        {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          stage,
          title: logTitle,
          detail: nextDetail,
          tone,
          ts: Date.now(),
        },
      ]);
    },
    [clearEmbedResetTimer],
  );

  const syncEmbedProgress = useCallback(
    (
      stage: string,
      options: {
        summary?: string;
        detail?: string;
        percent?: number;
        status?: EmbedProgressStatus;
        appendLog?: boolean;
      } = {},
    ) => {
      const status =
        options.status ||
        (stage === "completed"
          ? "success"
          : stage === "failed" || stage === "cancelled"
            ? "error"
            : stage.startsWith("timeout")
              ? "warning"
              : "active");
      const title = resolveEmbedStageTitle(stage);
      const logTitle = resolveEmbedLogTitle(stage);
      const detail = resolveEmbedStageDetail(stage, options.summary, options.detail);
      const tone = resolveEmbedLogTone(stage, status);
      const targetPercent = clampEmbedPercent(
        options.percent ?? EMBED_STAGE_PERCENT[stage] ?? EMBED_STAGE_PERCENT.mounting,
      );
      embedProgressStageRef.current = stage;
      if (!embedProgressStartedAtRef.current) {
        embedProgressStartedAtRef.current = Date.now();
      }
      setEmbedProcessingText(detail);
      setEmbedProgressTitle(title);
      setEmbedProgressStatus(status);
      setEmbedProgressPercent((prev) =>
        stage === "failed" || stage === "cancelled" ? targetPercent : Math.max(prev, targetPercent),
      );
      if (options.appendLog !== false) {
        appendEmbedLog(stage, logTitle, detail, tone);
      }
    },
    [appendEmbedLog],
  );

  const runEmbedPrompt = useCallback(
    async (sessionId: string, prompt: string, processingText?: string) => {
      const normalizedSessionId = String(sessionId || "").trim();
      const normalizedPrompt = String(prompt || "").trim();
      if (!normalizedSessionId || !normalizedPrompt) return;

      const dedupeKey = `${normalizedSessionId}::${normalizedPrompt}`;
      const now = Date.now();
      if (
        recentEmbedSubmitRef.current &&
        recentEmbedSubmitRef.current.key === dedupeKey &&
        now - recentEmbedSubmitRef.current.ts < 6000
      ) {
        return;
      }
      recentEmbedSubmitRef.current = { key: dedupeKey, ts: now };

      const requestToken = Date.now();
      embedRequestTokenRef.current = requestToken;
      beginEmbedProgress(
        "mounting",
        String(processingText || "正在处理中...").trim() || "正在处理中...",
      );

      const profileId =
        sessionStorage.getItem("copaw_profile_id") ||
        localStorage.getItem("copaw_profile_id") ||
        sessionStorage.getItem("copaw_user_id") ||
        localStorage.getItem("copaw_user_id") ||
        window.currentUserId ||
        "default";

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      const token = getApiToken();
      if (token) headers.Authorization = `Bearer ${token}`;

      const archivedContext = (window as any).copaw_archived_context || {};
      const sessionMeta = sessionApi.getSessionMeta(normalizedSessionId) || {};
      const requestBody: Record<string, unknown> = {
        input: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: normalizedPrompt,
              },
            ],
          },
        ],
        session_id: normalizedSessionId,
        user_id: profileId,
        channel: String(window.currentChannel || "console"),
        stream: true,
        copaw_embed_progress: true,
        memory_scope: {
          profile_id: profileId,
          allow_public: true,
          allow_private: true,
        },
      };

      if (Object.keys(sessionMeta).length) {
        requestBody.session_meta = sessionMeta;
      }

      if (archivedContext.user_profile || archivedContext.public_memory) {
        requestBody.context = {
          user_profile: archivedContext.user_profile || "",
          public_memory: archivedContext.public_memory || "",
        };
      }

      let finalPayload: any = null;
      let finalError = "";
      let latestSummary = "";

      try {
        const response = await fetch(getApiUrl("/agent/process"), {
          method: "POST",
          headers,
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          throw new Error((await response.text()) || `Agent request failed: ${response.status}`);
        }

        if (response.body) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder("utf-8");
          let buffer = "";

          const handleFrame = (frame: string) => {
            const parsed = parseSseFrame(frame);
            if (!parsed || embedRequestTokenRef.current !== requestToken) return;
            const payload = (parsed.payload || {}) as Record<string, any>;
            if (parsed.event === "phase") {
              const stage = String(payload.stage || "accepted").trim() || "accepted";
              const summary = normalizeEmbedText(payload.summary || "");
              const detail = normalizeEmbedText(payload.detail || "");
              if (summary && isMeaningfulEmbedSummary(summary)) {
                latestSummary = summary;
              }
              syncEmbedProgress(stage, {
                summary,
                detail,
                percent:
                  typeof payload.percent === "number" ? Number(payload.percent) : undefined,
                status:
                  payload.status === "success" || payload.status === "error"
                    ? payload.status
                    : stage.startsWith("timeout")
                      ? "warning"
                      : "active",
              });
              return;
            }
            if (parsed.event === "message") {
              const summary = normalizeEmbedText(payload.summary || payload.text || "");
              if (!summary || !isMeaningfulEmbedSummary(summary)) return;
              latestSummary = summary;
              appendEmbedLog("message", resolveEmbedLogTitle("message"), summary, "info");
              return;
            }
            if (parsed.event === "error") {
              finalError = String(payload.message || payload.error || "流式执行失败").trim();
              syncEmbedProgress("failed", {
                detail: finalError,
                status: "error",
              });
              return;
            }
            if (parsed.event === "done") {
              finalPayload = payload;
            }
          };

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const extracted = extractSseFrames(buffer);
            buffer = extracted.rest;
            extracted.frames.forEach(handleFrame);
          }
          buffer += decoder.decode();
          const tail = extractSseFrames(buffer);
          tail.frames.forEach(handleFrame);
          const remaining = String(tail.rest || "").trim();
          if (remaining) {
            handleFrame(remaining);
          }
        } else {
          await response.text();
        }

        await sessionApi.getSessionList();
        const refreshedSession = await sessionApi.getSession(normalizedSessionId);
        const rawRefreshedMessages = Array.isArray((refreshedSession as any)?.messages)
          ? (refreshedSession as any).messages
          : [];
        const refreshedMessages = stripEmbedFallbackMessages(rawRefreshedMessages);
        let assistantMessageCount = countAssistantMessages(refreshedMessages);
        let resultPreview = extractLatestEmbedAssistantPreview(refreshedMessages);
        const latestMeta = sessionApi.getSessionMeta(normalizedSessionId) || {};
        const nextMeta = {
          ...latestMeta,
          embed_last_result_at: Date.now(),
        };

        if (embedRequestTokenRef.current !== requestToken) return;

        if (finalPayload?.ok === false || finalError) {
          await sessionApi.updateSession({
            id: normalizedSessionId,
            messages: refreshedMessages,
            meta: nextMeta,
          } as any);
          setChatRenderVersion((prev) => prev + 1);
          const errorText =
            finalError || String(finalPayload?.error || finalPayload?.message || "处理失败，请稍后重试").trim();
          syncEmbedProgress("failed", {
            detail: errorText,
            status: "error",
          });
          postEmbedMessageToParent({
            type: "copaw-embed-result",
            sessionId: normalizedSessionId,
            ok: false,
            error: errorText,
            assistantMessageCount,
          });
          resetEmbedProgress(2800);
          return;
        }

        const finalSummary = normalizeEmbedText(finalPayload?.summary || latestSummary || "");
        const backendMessageCount = Number(finalPayload?.message_count || 0);
        let resolvedResult = resultPreview || finalSummary;
        let fallbackResult = "";
        let nextMessages = refreshedMessages;

        if (assistantMessageCount === 0) {
          fallbackResult =
            (resolvedResult && isMeaningfulEmbedSummary(resolvedResult) && resolvedResult) ||
            (backendMessageCount > 0
              ? "执行链路已完成，已收到系统回复，但当前回复未命中会话渲染规则。你可以继续追问，我会基于现有上下文继续处理。"
              : "执行链路已完成，但本次未生成可展示回复。请补充更具体的问题后重试。");
          nextMessages = withEmbedFallbackMessage(refreshedMessages, fallbackResult);
          assistantMessageCount = countAssistantMessages(nextMessages);
          resultPreview = extractLatestEmbedAssistantPreview(nextMessages) || fallbackResult.slice(0, 220);
          resolvedResult = resultPreview || finalSummary || fallbackResult;
        }

        await sessionApi.updateSession({
          id: normalizedSessionId,
          messages: nextMessages,
          meta: nextMeta,
        } as any);
        setChatRenderVersion((prev) => prev + 1);

        const completedDetail =
          fallbackResult ||
          (resolvedResult && isMeaningfulEmbedSummary(resolvedResult)
            ? resolvedResult
            : assistantMessageCount > 0
              ? "执行结果已写回会话，可继续查看完整回复。"
              : "执行链路已完成，但暂未读取到可展示结果。");

        if (resultPreview) {
          setEmbedResultPreview(resultPreview);
          appendEmbedLog("final_result", "会话结果已同步", resultPreview, "success");
        }

        syncEmbedProgress("completed", {
          summary: resolvedResult,
          detail: completedDetail,
          percent: 100,
          status: "success",
        });
        postEmbedMessageToParent({
          type: "copaw-embed-result",
          sessionId: normalizedSessionId,
          ok: true,
          summary: resolvedResult,
          assistantMessageCount,
        });
        resetEmbedProgress(1800);
      } catch (error) {
        recentEmbedSubmitRef.current = null;
        if (embedRequestTokenRef.current !== requestToken) return;
        const errorText = error instanceof Error ? error.message : "处理失败，请稍后重试";
        console.error("[Chat] embed prompt failed:", error);
        syncEmbedProgress("failed", {
          detail: errorText,
          status: "error",
        });
        postEmbedMessageToParent({
          type: "copaw-embed-result",
          sessionId: normalizedSessionId,
          ok: false,
          error: errorText,
        });
        resetEmbedProgress(2800);
      }
    },
    [
      appendEmbedLog,
      beginEmbedProgress,
      postEmbedMessageToParent,
      resetEmbedProgress,
      syncEmbedProgress,
    ],
  );

  useEffect(() => {
    if (!isWorkspaceEmbed || !embedProcessingText) return;
    const timer = window.setInterval(() => {
      const startedAt = embedProgressStartedAtRef.current;
      if (!startedAt) return;
      const elapsed = Date.now() - startedAt;
      setEmbedElapsedMs(elapsed);
      const stage = embedProgressStageRef.current;
      const terminal = stage === "completed" || stage === "failed" || stage === "cancelled";
      if (terminal) return;
      if (elapsed >= 45000 && !embedTimeoutMarksRef.current.long) {
        embedTimeoutMarksRef.current.long = true;
        syncEmbedProgress("timeout_long", {
          detail: "执行时间较长，任务仍在后台继续，结果写回后会自动刷新。",
          percent: 94,
          status: "warning",
        });
        return;
      }
      if (elapsed >= 20000 && !embedTimeoutMarksRef.current.medium) {
        embedTimeoutMarksRef.current.medium = true;
        syncEmbedProgress("timeout_medium", {
          detail: "模型仍在分析或执行工具，当前任务较复杂，请稍候。",
          percent: 88,
          status: "warning",
        });
        return;
      }
      if (elapsed >= 8000 && !embedTimeoutMarksRef.current.short) {
        embedTimeoutMarksRef.current.short = true;
        syncEmbedProgress("timeout_short", {
          detail: "请求已经发出，正在等待会话链路返回首个阶段结果。",
          percent: 78,
          status: "warning",
        });
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [embedProcessingText, isWorkspaceEmbed, syncEmbedProgress]);

  useEffect(() => {
    const handleCompositionStart = () => {
      isComposingRef.current = true;
    };

    const handleCompositionEnd = () => {
      setTimeout(() => {
        isComposingRef.current = false;
      }, 150);
    };

    const handleKeyPress = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target?.tagName === "TEXTAREA" && e.key === "Enter" && !e.shiftKey) {
        if (isComposingRef.current || (e as any).isComposing) {
          e.stopPropagation();
          e.stopImmediatePropagation();
          return false;
        }
      }
    };

    document.addEventListener("compositionstart", handleCompositionStart, true);
    document.addEventListener("compositionend", handleCompositionEnd, true);
    document.addEventListener("keypress", handleKeyPress, true);

    return () => {
      document.removeEventListener(
        "compositionstart",
        handleCompositionStart,
        true,
      );
      document.removeEventListener(
        "compositionend",
        handleCompositionEnd,
        true,
      );
      document.removeEventListener("keypress", handleKeyPress, true);
    };
  }, []);

  // 获取用户档案状态
  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        setLoadingUserInfo(true);
        // 同时获取用户基本信息和档案状态
        const [userResponse, profileStatusResponse] = await Promise.all([
          authApi.getMe(),
          authApi.getProfileStatus()
        ]);
        
        const userInfoData: UserInfo = {
          name: userResponse.name,
          department: userResponse.department,
          hasCompleteProfile: profileStatusResponse.hasCompleteProfile
        };
        
        setUserInfo(userInfoData);
        
        // 从 window 对象读取预加载的档案上下文
        const archivedContext = (window as any).copaw_archived_context;
        if (archivedContext) {
          setArchivedContext({
            user_profile: archivedContext.user_profile || "",
            public_memory: archivedContext.public_memory || "",
          });
          console.log('[Chat] 已加载档案上下文:', {
            hasUserProfile: !!archivedContext.user_profile,
            hasPublicMemory: !!archivedContext.public_memory,
          });
        }
        
        // 如果档案不完整，跳转到档案编辑页面
        if (!profileStatusResponse.hasCompleteProfile) {
          navigate("/profile", { replace: true });
        }
      } catch (error) {
        console.error('获取用户信息失败:', error);
        // 如果获取失败，使用默认值
        setUserInfo({
          name: '用户',
          hasCompleteProfile: false
        });
      } finally {
        setLoadingUserInfo(false);
      }
    };
    
    fetchUserInfo();
  }, []);

  useEffect(() => {
    sessionApi.onSessionIdResolved = (tempId, realId) => {
      if (chatIdRef.current === tempId) {
        lastSessionIdRef.current = realId;
        navigateRef.current(buildChatRoute(realId), { replace: true });
      }
    };

    sessionApi.onSessionRemoved = (removedId) => {
      if (chatIdRef.current === removedId) {
        lastSessionIdRef.current = null;
        if (!isWorkspaceEmbed) {
          navigateRef.current(buildChatRoute(), { replace: true });
        }
      }
    };

    return () => {
      sessionApi.onSessionIdResolved = null;
      sessionApi.onSessionRemoved = null;
    };
  }, [buildChatRoute, isWorkspaceEmbed]);

  useEffect(() => {
    if (!isWorkspaceEmbed) return;

    (window as any).__copawHiddenSubmitReady = true;
    postEmbedMessageToParent({
      type: "copaw-embed-ready",
      sessionId: String(chatIdRef.current || window.currentSessionId || "").trim(),
    });

    const handleHiddenSubmit = (evt: Event) => {
      const detail = (evt as CustomEvent).detail || {};
      const targetId = String(detail.id || chatIdRef.current || window.currentSessionId || "").trim();
      const prompt = String(detail.prompt || "").trim();
      if (!targetId || !prompt) return;
      void runEmbedPrompt(targetId, prompt, String(detail.processingText || "").trim());
    };

    const handleProcessingStatus = (evt: Event) => {
      const detail = (evt as CustomEvent).detail || {};
      const visible = detail.visible !== false;
      const text = String(detail.text || "").trim();
      if (!visible || !text) {
        resetEmbedProgress();
        return;
      }
      beginEmbedProgress("external_status", text, EMBED_STAGE_TITLE.external_status, 12);
    };

    window.addEventListener("copaw-hidden-submit", handleHiddenSubmit as EventListener);
    window.addEventListener("copaw-processing-status", handleProcessingStatus as EventListener);

    return () => {
      (window as any).__copawHiddenSubmitReady = false;
      window.removeEventListener("copaw-hidden-submit", handleHiddenSubmit as EventListener);
      window.removeEventListener("copaw-processing-status", handleProcessingStatus as EventListener);
    };
  }, [beginEmbedProgress, isWorkspaceEmbed, postEmbedMessageToParent, resetEmbedProgress, runEmbedPrompt]);

  useEffect(() => {
    if (!isWorkspaceEmbed) return;
    const currentId = String(chatId || "").trim();
    if (!currentId) return;

    const pending = parseStoredScenePending();
    const pendingId = String(pending?.id || "").trim();
    const pendingPrompt = String(pending?.prompt || "").trim();
    if (pendingId && pendingPrompt && pendingId === currentId) {
      sessionStorage.removeItem(SCENE_PENDING_STORAGE);
      embedAutoBootstrapRef.current = `${currentId}::${normalizeEmbedText(pendingPrompt)}`;
      void runEmbedPrompt(
        currentId,
        pendingPrompt,
        String(pending?.processingText || "任务指令已下发，正在生成会话内容...").trim(),
      );
      return;
    }

    const localSession = sessionApi.peekSession(currentId) as any;
    const meta = (sessionApi.getSessionMeta(currentId) || {}) as Record<string, unknown>;
    const prompt = String(meta.hidden_user_prompt || meta.scene_prompt || "").trim();
    const messages = Array.isArray(localSession?.messages) ? localSession.messages : [];
    if (!prompt || countAssistantMessages(messages) > 0) {
      return;
    }

    const autoKey = `${currentId}::${normalizeEmbedText(prompt)}`;
    if (embedAutoBootstrapRef.current === autoKey) {
      return;
    }
    embedAutoBootstrapRef.current = autoKey;
    void runEmbedPrompt(currentId, prompt, resolveAutoEmbedProcessingText(meta));
  }, [chatId, isWorkspaceEmbed, runEmbedPrompt]);

  const getSessionListWrapped = useCallback(async () => {
    const sessions = await sessionApi.getSessionList();
    const currentChatId = chatIdRef.current;

    if (currentChatId) {
      const idx = sessions.findIndex((s) => {
        const ext = s as any;
        return (
          String(s.id || "") === currentChatId ||
          String(ext?.realId || "") === currentChatId ||
          String(ext?.sessionId || "") === currentChatId
        );
      });
      if (idx > 0) {
        return [
          sessions[idx],
          ...sessions.slice(0, idx),
          ...sessions.slice(idx + 1),
        ];
      }
    }

    return sessions;
  }, []);

  const getSessionWrapped = useCallback(
    async (sessionId: string) => {
      const currentChatId = chatIdRef.current;

      if (
        sessionId &&
        sessionId !== lastSessionIdRef.current &&
        sessionId !== currentChatId
      ) {
        const urlId = sessionApi.getRealIdForSession(sessionId) ?? sessionId;
        lastSessionIdRef.current = urlId;
        navigateRef.current(buildChatRoute(urlId), { replace: true });
      }

      return sessionApi.getSession(sessionId);
    },
    [buildChatRoute],
  );

  const createSessionWrapped = useCallback(
    async (session: any) => {
      const result = await sessionApi.createSession(session);
      const newSessionId = result[0]?.id;
      if (newSessionId) {
        lastSessionIdRef.current = newSessionId;
        navigateRef.current(buildChatRoute(newSessionId), { replace: true });
      }
      return result;
    },
    [buildChatRoute],
  );

  const wrappedSessionApi = useMemo(
    () => ({
      getSessionList: getSessionListWrapped,
      getSession: getSessionWrapped,
      createSession: createSessionWrapped,
      updateSession: sessionApi.updateSession.bind(sessionApi),
      removeSession: sessionApi.removeSession.bind(sessionApi),
    }),
    [createSessionWrapped, getSessionListWrapped, getSessionWrapped],
  );

  const ensureUploadSessionId = useCallback(async (): Promise<string> => {
    const existingSessionId = String(
      window.currentSessionId || chatIdRef.current || lastSessionIdRef.current || "",
    ).trim();
    if (existingSessionId && existingSessionId !== "undefined" && existingSessionId !== "null") {
      return existingSessionId;
    }

    const created = await createSessionWrapped({ name: "新会话" });
    const createdSessionId = String(
      created?.[0]?.id || window.currentSessionId || lastSessionIdRef.current || "",
    ).trim();
    if (!createdSessionId) {
      throw new Error("创建会话失败，请刷新页面后重试");
    }
    return createdSessionId;
  }, [createSessionWrapped]);

  const uploadChatAttachment = useCallback(
    async (options: any) => {
      const file = (options?.file as File) || (options?.file?.originFileObj as File);
      if (!file) {
        options?.onError?.(new Error("未选择文件"));
        return;
      }

      try {
        options?.onProgress?.({ percent: 10 });
        const sessionId = await ensureUploadSessionId();
        const formData = new FormData();
        formData.append("session_id", sessionId);
        formData.append("file", file);

        const headers: Record<string, string> = {};
        const token = getApiToken();
        if (token) headers.Authorization = `Bearer ${token}`;

        const response = await fetch(getApiUrl("/chat-files/upload"), {
          method: "POST",
          headers,
          body: formData,
        });

        if (!response.ok) {
          throw new Error((await response.text()) || `上传失败：${response.status}`);
        }

        const result = await response.json();
        options?.onProgress?.({ percent: 100 });
        options?.onSuccess?.(result, file);
      } catch (error) {
        options?.onError?.(error instanceof Error ? error : new Error("上传失败"));
      }
    },
    [ensureUploadSessionId],
  );

  const senderEnhancements = useMemo(
    () => ({
      attachments: {
        multiple: true,
        customRequest: uploadChatAttachment,
      },
      morePrefixActions: (
        <>
          <VoiceInputButton />
          {isSecretaryEmbed ? (
            <Button
              type="text"
              size="small"
              aria-label="放大会话区"
              title="放大会话区"
              onClick={requestSecretaryEmbedFocus}
              style={{ marginLeft: 6 }}
            >
              <Maximize2 size={18} />
            </Button>
          ) : null}
        </>
      ),
      disclaimer: isSimpleEmbed ? "" : undefined,
      scalable: !isSimpleEmbed,
    }),
    [isSecretaryEmbed, isSimpleEmbed, requestSecretaryEmbedFocus, uploadChatAttachment],
  );

  useEffect(() => {
    if (!isEmployeeWorkspace || chatId) return;

    const searchParams = new URLSearchParams(location.search);
    const sceneKey = normalizeSceneValue(searchParams.get("scene"));
    if (!sceneKey) return;

    const storedScene = parseStoredScene();
    if (!storedScene || normalizeSceneValue(storedScene.key) !== sceneKey) {
      return;
    }

    const sceneToken = `${sceneKey}:${normalizeSceneValue(storedScene.ts)}`;
    if (sceneBootstrapRef.current === sceneToken) return;
    sceneBootstrapRef.current = sceneToken;

    let cancelled = false;

    void (async () => {
      const sceneName =
        normalizeSceneValue(storedScene.sessionName) ||
        normalizeSceneValue(storedScene.label) ||
        "场景会话";
      const sceneLabel = normalizeSceneValue(storedScene.label) || sceneName;
      const sceneContext =
        storedScene.context && typeof storedScene.context === "object"
          ? storedScene.context
          : {};
      const storedSceneSkill = normalizeSceneValue(storedScene.skill);
      const sceneSkill =
        storedSceneSkill === "expert_agent_link"
          ? normalizeSceneValue((sceneContext as Record<string, unknown>).expert_template_skill)
          : storedSceneSkill;
      const scenePrompt = normalizeSceneValue(storedScene.prompt);
      const partyModule = normalizeSceneValue(
        (sceneContext as Record<string, unknown>).party_module,
      );
      const sessionMeta = {
        scene_key: sceneKey,
        scene_label: sceneLabel,
        scene_trigger_key:
          normalizeSceneValue(storedScene.triggerKey) || sceneKey,
        scene_prompt: scenePrompt,
        hidden_user_prompt: scenePrompt,
        hidden_prompt_history: scenePrompt ? [scenePrompt] : [],
        scene_context: sceneContext,
        scene_skill: sceneSkill,
        scene_template_type:
          normalizeSceneValue(storedScene.templateType) || "scene",
        scene_agent_key: normalizeSceneValue(storedScene.agentKey),
        scene_runtime_profile:
          normalizeSceneValue(storedScene.runtimeProfile) || "standard",
        biz_domain:
          normalizeSceneValue((sceneContext as Record<string, unknown>).biz_domain) ||
          (partyModule ? "party" : ""),
        module:
          normalizeSceneValue((sceneContext as Record<string, unknown>).module) ||
          partyModule,
        task_id:
          normalizeSceneValue((sceneContext as Record<string, unknown>).task_id) ||
          normalizeSceneValue((sceneContext as Record<string, unknown>).party_item_id),
        status:
          normalizeSceneValue((sceneContext as Record<string, unknown>).status) ||
          normalizeSceneValue((sceneContext as Record<string, unknown>).party_status),
        party_module: partyModule,
        party_item_id: normalizeSceneValue(
          (sceneContext as Record<string, unknown>).party_item_id,
        ),
        party_title: normalizeSceneValue(
          (sceneContext as Record<string, unknown>).party_title,
        ),
        party_status: normalizeSceneValue(
          (sceneContext as Record<string, unknown>).party_status,
        ),
        party_stage: normalizeSceneValue(
          (sceneContext as Record<string, unknown>).party_stage,
        ),
        party_priority: normalizeSceneValue(
          (sceneContext as Record<string, unknown>).party_priority,
        ),
        party_reminder_status: normalizeSceneValue(
          (sceneContext as Record<string, unknown>).party_reminder_status,
        ),
        party_receipt_status: normalizeSceneValue(
          (sceneContext as Record<string, unknown>).party_receipt_status,
        ),
        party_deadline: normalizeSceneValue(
          (sceneContext as Record<string, unknown>).party_deadline,
        ),
        locked_session_name: true,
        session_display_name: sceneName,
        scene_bootstrap_status: "initializing",
      };

      const created = await createSessionWrapped({
        name: sceneName,
        pushMessage: buildSceneBootstrapMessage(storedScene),
        meta: sessionMeta,
      } as any);
      const nextId = normalizeSceneValue(created?.[0]?.id);
      if (!nextId || cancelled) return;

      await sessionApi.updateSession({
        id: nextId,
        name: sceneName,
        meta: sessionMeta,
      } as any);

      const isSceneLinkSkill =
        sceneSkill === "employee_agent_link" ||
        sceneSkill === "department_agent_link" ||
        sceneSkill === "expert_agent_link";

      if (isSceneLinkSkill) {
        const launch = await agentOsApi.launchSceneLink({
          scene_key:
            normalizeSceneValue(storedScene.triggerKey) || sceneKey,
          scene_label: sceneLabel,
          scene_skill: sceneSkill,
          scene_prompt: scenePrompt,
          scene_session_id: nextId,
          scene_context:
            storedScene.context && typeof storedScene.context === "object"
              ? storedScene.context
              : {},
          allow_cross_user: true,
        });
        if (cancelled) return;
        const latestMeta = sessionApi.getSessionMeta(nextId) || {};
        await sessionApi.updateSession({
          id: nextId,
          name: sceneName,
          meta: {
            ...latestMeta,
            push_session_id: normalizeSceneValue(launch.session_id),
            push_conversation_key: normalizeSceneValue(launch.conversation_key),
            trace_id: normalizeSceneValue(launch.trace_id),
            room_id: normalizeSceneValue(launch.room_id),
            scene_target_count: Number(launch.target_count || 0),
            scene_bootstrap_status: "launched",
          },
        } as any);
        void sessionApi.getSessionList();
      } else {
        const latestMeta = sessionApi.getSessionMeta(nextId) || {};
        await sessionApi.updateSession({
          id: nextId,
          name: sceneName,
          meta: {
            ...latestMeta,
            scene_bootstrap_status: "ready",
          },
        } as any);
      }

      sessionStorage.removeItem(SCENE_STORAGE);
    })().catch((error) => {
      sceneBootstrapRef.current = "";
      console.error("[Chat] scene bootstrap failed:", error);
    });

    return () => {
      cancelled = true;
    };
  }, [chatId, createSessionWrapped, isEmployeeWorkspace, location.search]);

  const customFetch = useCallback(
    async (data: {
      input: any[];
      biz_params?: any;
      signal?: AbortSignal;
    }): Promise<Response> => {
      try {
        const activeModels = await providerApi.getActiveModels();
        if (
          !activeModels?.active_llm?.provider_id ||
          !activeModels?.active_llm?.model
        ) {
          setShowModelPrompt(true);
          return buildModelError();
        }
      } catch {
        setShowModelPrompt(true);
        return buildModelError();
      }

      const { input, biz_params } = data;
      const session = input[input.length - 1]?.session || {};
      const profileId =
        localStorage.getItem("copaw_profile_id") ||
        window.currentUserId ||
        session?.user_id ||
        "default";
      const currentSessionId = String(window.currentSessionId || session?.session_id || "").trim();
      const sessionMeta = currentSessionId ? sessionApi.getSessionMeta(currentSessionId) || {} : {};

      const requestBody: any = {
        input: input.slice(-1),
        session_id: currentSessionId,
        user_id: profileId,
        channel: window.currentChannel || session?.channel || "console",
        stream: true,
        memory_scope: {
          profile_id: profileId,
          allow_public: true,
          allow_private: true,
        },
        ...biz_params,
      };

      if (Object.keys(sessionMeta).length) {
        requestBody.session_meta = sessionMeta;
      }

      if (archivedContext.user_profile || archivedContext.public_memory) {
        requestBody.context = {
          user_profile: archivedContext.user_profile || "",
          public_memory: archivedContext.public_memory || "",
        };
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      const token = getApiToken();
      if (token) headers.Authorization = `Bearer ${token}`;

      return fetch(defaultConfig?.api?.baseURL || getApiUrl("/agent/process"), {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        signal: data.signal,
      });
    },
    [archivedContext],
  );

  const options = useMemo(() => {
    // 如果还在加载用户信息，使用默认配置
    if (loadingUserInfo || !userInfo) {
      const defaultConfigWithLoading = getDefaultConfig(t);
      return {
        ...defaultConfigWithLoading,
        theme: headerTheme,
        sender: {
          ...(defaultConfigWithLoading as any)?.sender,
          ...senderEnhancements,
          beforeSubmit: async () => {
            if (isComposingRef.current) return false;
            return true;
          },
        },
        session: { multiple: !isSimpleEmbed, api: wrappedSessionApi },
        api: {
          ...defaultConfig.api,
          fetch: customFetch,
          cancel(data: { session_id: string }) {
            console.log(data);
          },
        },
        customToolRenderConfig: {
          "weather search mock": Weather,
        },
      } as unknown as IAgentScopeRuntimeWebUIOptions;
    }

    // 根据用户信息生成个性化配置
    const personalizedWelcome = getWelcomeMessage(userInfo);
    const guideText = getGuideText(userInfo.hasCompleteProfile);
    
    const i18nConfig = getDefaultConfig(t);
    
    // 修改 welcome 配置结构
    const welcomeConfig = {
      ...i18nConfig.welcome,
      greeting: personalizedWelcome,
      description: guideText,
    };

    const handleBeforeSubmit = async () => {
      if (isComposingRef.current) return false;
      return true;
    };

    return {
      ...i18nConfig,
      welcome: welcomeConfig,
      theme: headerTheme,
      sender: {
        ...(i18nConfig as any)?.sender,
        ...senderEnhancements,
        beforeSubmit: handleBeforeSubmit,
      },
      session: { multiple: !isSimpleEmbed, api: wrappedSessionApi },
      api: {
        ...defaultConfig.api,
        fetch: customFetch,
        cancel(data: { session_id: string }) {
          console.log(data);
        },
      },
      customToolRenderConfig: {
        "weather search mock": Weather,
      },
    } as unknown as IAgentScopeRuntimeWebUIOptions;
  }, [wrappedSessionApi, customFetch, t, loadingUserInfo, userInfo, isSimpleEmbed, senderEnhancements, headerTheme]);

  const recentEmbedLogs = embedProgressLogs.slice(-5);
  const currentEmbedLog = recentEmbedLogs[recentEmbedLogs.length - 1] || null;
  const embedStatusMeta = resolveEmbedStatusMeta(embedProgressStatus);
  const embedHeroMeta = resolveEmbedHeroMeta(embedProgressStatus);
  const embedHeroPulseActive = embedProgressStatus === "active" || embedProgressStatus === "warning";
  const embedResolvedPreview =
    embedResultPreview ||
    (embedProgressStatus === "success" && isMeaningfulEmbedSummary(embedProcessingText)
      ? embedProcessingText
      : "");

  const chatShellClassName = [
    styles.chatShell,
    !isAdminView ? styles.chatShellUser : "",
    isWorkspaceEmbed ? styles.chatShellEmbed : styles.chatShellPage,
    isSimpleEmbed ? styles.chatShellSimpleEmbed : "",
    isSecretaryEmbed ? styles.chatShellSecretaryEmbed : "",
    isTaskEmbed ? styles.chatShellTaskEmbed : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={chatShellClassName}>
      {isWorkspaceEmbed && embedProcessingText ? (
        isSimpleEmbed ? (
          <div
            style={{
              padding: "8px 12px 10px",
              borderBottom: "1px solid rgba(226, 232, 240, 0.88)",
              background: "rgba(255, 255, 255, 0.92)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <div style={{ minWidth: 0, flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    flex: "0 0 auto",
                    background: embedStatusMeta.color,
                    boxShadow: `0 0 0 5px ${embedStatusMeta.background}`,
                    animation: embedHeroPulseActive ? "copawEmbedPulse 1.8s ease-out infinite" : "none",
                  }}
                />
                <div
                  style={{
                    minWidth: 0,
                    fontSize: 12,
                    lineHeight: 1.5,
                    color: "#334155",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {embedProcessingText}
                </div>
              </div>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  height: 22,
                  padding: "0 8px",
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 700,
                  color: embedStatusMeta.color,
                  background: embedStatusMeta.background,
                  border: `1px solid ${embedStatusMeta.border}`,
                  flex: "0 0 auto",
                }}
              >
                {embedStatusMeta.label}
              </span>
            </div>
            <Progress
              percent={embedProgressPercent}
              size="small"
              showInfo={false}
              strokeColor={{ from: "#60a5fa", to: "#2563eb" }}
              trailColor="#dbeafe"
              status={embedProgressStatus === "error" ? "exception" : embedProgressStatus === "success" ? "success" : "active"}
              style={{ marginTop: 8, marginBottom: 0 }}
            />
          </div>
        ) : (
          <div
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid #e2e8f0",
              background: "linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)",
            }}
          >
            <div
              style={{
                border: "1px solid #dbeafe",
                background: "linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%)",
                borderRadius: 16,
                padding: "14px",
                boxShadow: "0 10px 26px rgba(59, 130, 246, 0.08)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 12,
                  marginBottom: 10,
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#1e3a8a" }}>
                      {isTaskEmbed ? "任务会话正在同步" : isSecretaryEmbed ? "秘书会话正在处理" : "会话正在处理"}
                    </div>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        height: 22,
                        padding: "0 8px",
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 700,
                        color: embedStatusMeta.color,
                        background: embedStatusMeta.background,
                        border: `1px solid ${embedStatusMeta.border}`,
                      }}
                    >
                      {embedStatusMeta.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", marginTop: 6 }}>
                    {embedProgressTitle || EMBED_STAGE_TITLE.mounting}
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 4, lineHeight: 1.6 }}>
                    {embedProcessingText}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 20, lineHeight: 1, color: "#2563eb", fontWeight: 800 }}>
                    {Math.max(12, Math.round(embedProgressPercent))}%
                  </div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>
                    已耗时 {formatEmbedElapsed(embedElapsedMs)}
                  </div>
                </div>
              </div>
              <Progress
                percent={embedProgressPercent}
                size="small"
                showInfo={false}
                strokeColor={{ from: "#60a5fa", to: "#2563eb" }}
                trailColor="#dbeafe"
                status={embedProgressStatus === "error" ? "exception" : embedProgressStatus === "success" ? "success" : "active"}
              />
              <>
                <div
                  style={{
                    marginTop: 12,
                    borderRadius: 16,
                    border: `1px solid ${embedHeroMeta.cardBorder}`,
                    background: embedHeroMeta.cardBackground,
                    padding: "14px 14px 14px 16px",
                    boxShadow: "0 12px 26px rgba(15, 23, 42, 0.06)",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      inset: "auto -32px -42px auto",
                      width: 120,
                      height: 120,
                      borderRadius: 999,
                      background: embedHeroMeta.accentSoft,
                      filter: "blur(8px)",
                    }}
                  />
                  <div style={{ position: "relative", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: embedHeroMeta.accent, letterSpacing: 0.3 }}>
                          当前阶段
                        </div>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            height: 22,
                            padding: "0 8px",
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 700,
                            color: embedHeroMeta.accent,
                            background: "rgba(255,255,255,0.72)",
                            border: `1px solid ${embedHeroMeta.cardBorder}`,
                          }}
                        >
                          {embedHeroMeta.badge}
                        </span>
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a", marginTop: 6 }}>
                        {currentEmbedLog?.title || embedProgressTitle || EMBED_STAGE_TITLE.mounting}
                      </div>
                      <div style={{ fontSize: 12, color: "#334155", marginTop: 6, lineHeight: 1.72 }}>
                        {currentEmbedLog?.detail || embedProcessingText}
                      </div>
                      <div style={{ fontSize: 11, color: "#64748b", marginTop: 8, lineHeight: 1.6 }}>
                        {embedHeroMeta.hint}
                      </div>
                    </div>
                    <div style={{ position: "relative", width: 42, height: 42, flexShrink: 0, marginTop: 2 }}>
                      {embedHeroPulseActive ? (
                        <span
                          style={{
                            position: "absolute",
                            inset: 0,
                            borderRadius: 999,
                            background: embedHeroMeta.accent,
                            opacity: 0.22,
                            animation: "copawEmbedPulse 1.8s ease-out infinite",
                          }}
                        />
                      ) : null}
                      <span
                        style={{
                          position: "absolute",
                          inset: 8,
                          borderRadius: 999,
                          background: embedHeroMeta.accent,
                          boxShadow: `0 0 0 7px ${embedHeroMeta.accentSoft}`,
                          animation: embedHeroPulseActive ? "copawEmbedFloat 1.8s ease-in-out infinite" : "none",
                        }}
                      />
                    </div>
                  </div>
                </div>
                {embedResolvedPreview ? (
                  <div
                    style={{
                      marginTop: 12,
                      borderRadius: 14,
                      border: "1px solid rgba(191, 219, 254, 0.95)",
                      background: "rgba(255,255,255,0.96)",
                      padding: "12px 14px",
                      boxShadow: "0 8px 20px rgba(15, 23, 42, 0.05)",
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#1d4ed8", marginBottom: 6 }}>
                      最新结果预览
                    </div>
                    <div style={{ fontSize: 12, color: "#334155", lineHeight: 1.72 }}>
                      {embedResolvedPreview}
                    </div>
                  </div>
                ) : null}
                {recentEmbedLogs.length ? (
                  <div style={{ marginTop: 14 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        marginBottom: 10,
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>执行时间线</div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>最近 {recentEmbedLogs.length} 个阶段节点</div>
                    </div>
                    <div
                      style={{
                        borderRadius: 14,
                        border: "1px solid rgba(219, 234, 254, 0.9)",
                        background: "rgba(255,255,255,0.9)",
                        padding: "12px 12px 10px",
                        maxHeight: 280,
                        overflowY: "auto",
                      }}
                    >
                      {recentEmbedLogs.map((log: EmbedProgressLog, index: number) => {
                        const isLatest = index === recentEmbedLogs.length - 1;
                        const logMeta = resolveEmbedLogMeta(log.tone, isLatest);
                        const isLastNode = index === recentEmbedLogs.length - 1;
                        return (
                          <div
                            key={log.id}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "34px minmax(0, 1fr)",
                              gap: 12,
                              alignItems: "stretch",
                            }}
                          >
                            <div style={{ position: "relative", display: "flex", justifyContent: "center" }}>
                              {!isLastNode ? (
                                <div
                                  style={{
                                    position: "absolute",
                                    top: 24,
                                    bottom: -12,
                                    width: 2,
                                    borderRadius: 999,
                                    background: logMeta.line,
                                  }}
                                />
                              ) : null}
                              <div
                                style={{
                                  position: "relative",
                                  zIndex: 1,
                                  width: 22,
                                  height: 22,
                                  borderRadius: 999,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  marginTop: 2,
                                  background: isLatest ? logMeta.dot : "#ffffff",
                                  border: `2px solid ${logMeta.dot}`,
                                  color: isLatest ? "#ffffff" : logMeta.dot,
                                  fontSize: 11,
                                  fontWeight: 800,
                                  boxShadow: isLatest ? `0 0 0 6px ${logMeta.line}` : "none",
                                }}
                              >
                                {index + 1}
                              </div>
                            </div>
                            <div
                              style={{
                                padding: "0 0 14px",
                                minWidth: 0,
                              }}
                            >
                              <div
                                style={{
                                  borderRadius: 12,
                                  border: `1px solid ${logMeta.border}`,
                                  background: logMeta.background,
                                  padding: "10px 12px",
                                  boxShadow: isLatest ? "0 10px 20px rgba(37, 99, 235, 0.08)" : "none",
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", minWidth: 0 }}>
                                    {log.title}
                                  </div>
                                  <span
                                    style={{
                                      flexShrink: 0,
                                      display: "inline-flex",
                                      alignItems: "center",
                                      height: 22,
                                      padding: "0 8px",
                                      borderRadius: 999,
                                      fontSize: 11,
                                      fontWeight: 700,
                                      color: logMeta.badgeColor,
                                      background: logMeta.badgeBackground,
                                    }}
                                  >
                                    {logMeta.badgeLabel}
                                  </span>
                                </div>
                                <div style={{ fontSize: 12, color: "#475569", marginTop: 5, lineHeight: 1.68 }}>
                                  {log.detail}
                                </div>
                                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 7 }}>
                                  {formatEmbedLogTime(log.ts)}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </>
            </div>
          </div>
        )
      ) : null}
      <div className={styles.runtimeViewport}>
        <AgentScopeRuntimeWebUI key={chatRenderVersion} options={options} />
      </div>

      <Modal open={showModelPrompt} closable={false} footer={null} width={480}>
        <Result
          icon={<ExclamationCircleOutlined style={{ color: "#faad14" }} />}
          title={t("modelConfig.promptTitle")}
          subTitle={t("modelConfig.promptMessage")}
          extra={[
            <Button key="skip" onClick={() => setShowModelPrompt(false)}>
              {t("modelConfig.skipButton")}
            </Button>,
            <Button
              key="configure"
              type="primary"
              icon={<SettingOutlined />}
              onClick={() => {
                setShowModelPrompt(false);
                navigate("/models");
              }}
            >
              {t("modelConfig.configureButton")}
            </Button>,
          ]}
        />
      </Modal>
    </div>
  );
}
