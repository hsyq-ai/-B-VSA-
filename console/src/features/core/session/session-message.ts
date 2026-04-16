import {
  type IAgentScopeRuntimeWebUIMessage,
  type IAgentScopeRuntimeWebUISession,
} from "@agentscope-ai/chat";
import { getApiToken, getApiUrl } from "../../../api/config";
import type { Message } from "../../../api";
import {
  type ContentItem,
  type OutputMessage,
} from "./session-types";

const ROLE_TOOL = "tool";
const ROLE_USER = "user";
const ROLE_ASSISTANT = "assistant";
const TYPE_PLUGIN_CALL_OUTPUT = "plugin_call_output";
const CARD_RESPONSE = "AgentScopeRuntimeResponseCard";
const EMBED_FALLBACK_MARKER = "copaw-embed-fallback";

const normalizePrompt = (text: string): string =>
  String(text || "")
    .toLowerCase()
    .replace(/[\s\r\n]+/g, "")
    .replace(/[，。！？、:：;；,.!?]/g, "")
    .trim();

const toPromptList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    : [];

const buildHiddenPromptHistory = (
  meta?: Record<string, unknown> | null,
): string[] => {
  const merged = [
    ...toPromptList(meta?.hidden_prompt_history),
    String(meta?.hidden_user_prompt || "").trim(),
    String(meta?.scene_prompt || "").trim(),
  ].filter(Boolean);

  const seen = new Set<string>();
  const result: string[] = [];
  merged.forEach((item) => {
    const normalized = normalizePrompt(item);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    result.push(item);
  });
  return result;
};

const isSecretaryInstructionText = (text: string): boolean => {
  const normalized = normalizePrompt(text);
  if (!normalized) return false;
  return (
    (normalized.includes("红智秘书") &&
      normalized.includes("请主动向用户打招呼")) ||
    (normalized.includes("红智秘书") &&
      normalized.includes("不要输出提示词本身")) ||
    (normalized.startsWith("你是") &&
      normalized.includes("红智秘书") &&
      normalized.includes("最后追问用户当前最想先推进的事项"))
  );
};

const isGenericSceneInstructionText = (text: string): boolean => {
  const normalized = normalizePrompt(text);
  if (!normalized) return false;
  return (
    (normalized.startsWith("你是") &&
      (normalized.includes("数字分身") ||
        normalized.includes("红智秘书") ||
        normalized.includes("助手"))) ||
    (normalized.includes("请直接以") && normalized.includes("数字分身")) ||
    (normalized.includes("不要欢迎") && normalized.includes("不要把我当成")) ||
    (normalized.startsWith("请汇总【") &&
      normalized.includes("阻塞风险") &&
      normalized.includes("下一步建议")) ||
    (normalized.startsWith("请作为") &&
      (normalized.includes("助手") ||
        normalized.includes("制定") ||
        normalized.includes("提供"))) ||
    (normalized.startsWith("我是") &&
      normalized.includes("不是") &&
      normalized.includes("数字分身")) ||
    normalized.includes("不要输出提示词本身")
  );
};

const PROCESS_LEAD_HINTS = [
  "我来帮你",
  "我来为你",
  "让我先",
  "我先",
  "先查看",
  "先查",
  "我理解你想",
  "好的让我",
  "好的我先",
  "收到我先",
  "正在查看",
  "正在查找",
  "正在读取",
];

const PROCESS_ACTION_HINTS = [
  "查看",
  "查找",
  "读取",
  "检索",
  "相关记录",
  "相关档案",
  "记忆",
  "资料",
  "信息",
  "最新情况",
  "当前状态",
];

const BOOTSTRAP_STATUS_HINTS = [
  "正在挂载数字专家上下文",
  "正在同步数字专家上下文并生成首条专业回复",
  "正在同步员工分身上下文并生成首条场景内容",
  "正在同步任务上下文恢复阶段进展与消息流",
  "请稍候查看首条专业回复",
  "请稍候查看首条协同回复",
  "请稍候查看最新进展",
  "红智秘书正在唤醒中",
  "红智秘书正在继续处理上次唤醒任务",
];

const isBootstrapStatusText = (text: string): boolean => {
  const normalized = normalizePrompt(text);
  if (!normalized) return false;
  if (
    normalized.startsWith(normalizePrompt("已打开「")) &&
    normalized.includes(normalizePrompt("请稍候查看"))
  ) {
    return true;
  }
  return BOOTSTRAP_STATUS_HINTS.some((hint) =>
    normalized.includes(normalizePrompt(hint)),
  );
};

const isProcessNarrationText = (text: string): boolean => {
  const normalized = normalizePrompt(text);
  if (!normalized) return false;
  if (
    isSecretaryInstructionText(text) ||
    isGenericSceneInstructionText(text) ||
    isBootstrapStatusText(text)
  ) {
    return true;
  }
  const leadMatched = PROCESS_LEAD_HINTS.some((hint) =>
    normalized.includes(normalizePrompt(hint)),
  );
  if (!leadMatched) return false;
  return PROCESS_ACTION_HINTS.some((hint) =>
    normalized.includes(normalizePrompt(hint)),
  );
};

const withAccessToken = (url: string): string => {
  const token = getApiToken();
  if (!url || !token) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}access_token=${encodeURIComponent(token)}`;
};

const FILE_MARKER_PREFIX = "[[COPAW_FILES:";
const FILE_MARKER_SUFFIX = ":COPAW_FILES]]";

const LOCAL_FILE_PATH_REGEX = new RegExp(
  String.raw`(?:~\/|\.\.?\/|\/)[^\s<>"'` + "`" + String.raw`]+?\.(?:docx|pdf|pptx|xlsx|png|jpg|jpeg|md|txt)`,
  "gi",
);
const FILE_URL_REGEX = /file:\/\/\/[^\s"'<>]+/gi;

interface FileMarkerItem {
  path?: string;
  name: string;
  url: string;
  kind: "download" | "image";
  size?: number;
  generatedAt?: number;
}

const normalizeCandidatePath = (value: string): string => {
  let v = String(value || "").trim();
  v = v.replace(/^`+|`+$/g, "");
  return v.replace(/[),.;]+$/g, "").trim();
};

const toLocalPath = (fileUrl: string): string => {
  const cleaned = fileUrl.replace(/^file:\/\//i, "");
  try {
    return decodeURIComponent(cleaned);
  } catch {
    return cleaned;
  }
};

const extractLocalPathsFromText = (text: string): string[] => {
  if (!text) return [];
  const matches = [
    ...(text.match(FILE_URL_REGEX) || []).map((url) => toLocalPath(url)),
    ...(text.match(LOCAL_FILE_PATH_REGEX) || []),
  ];
  const seen = new Set<string>();
  return matches
    .map((item) => normalizeCandidatePath(item))
    .filter((item) => {
      if (!item || seen.has(item)) return false;
      seen.add(item);
      return true;
    });
};

const buildLocalDownloadUrl = (path: string): string =>
  withAccessToken(
    `${getApiUrl("/chat-files/local-download")}?path=${encodeURIComponent(path)}`,
  );

const buildFileMarker = (files: FileMarkerItem[]): string => {
  if (!files.length) return "";
  return `${FILE_MARKER_PREFIX}${encodeURIComponent(
    JSON.stringify(files),
  )}${FILE_MARKER_SUFFIX}`;
};

const appendMarkerToText = (text: string, marker: string): string => {
  if (!marker) return text;
  if (!text) return marker;
  if (text.includes(marker)) return text;
  return `${text}\n\n${marker}`;
};

const FILE_NAME_ONLY_REGEX = new RegExp(
  String.raw`[^\s<>"'` + "`" + String.raw`/\\]+?\.(?:docx|pdf|pptx|xlsx|png|jpg|jpeg|md|txt)`,
  "gi",
);
const DOWNLOAD_INTENT_REGEX =
  /(下载|下载链接|下载地址|下载入口|导出|导出为|另存为|保存为|打包|发我.*(?:文件|文档|附件)|给我.*(?:文件|文档|附件)|生成.*(?:word|pdf|docx|pptx|xlsx|txt|md)|download|export|file link|attachment)/i;
const DOWNLOAD_NEGATION_REGEX =
  /(不需要|不用|不要|别|无需).{0,8}(下载|链接|导出|文件|文档|附件|download|export)/i;

const getFileBasename = (value: string): string =>
  normalizeCandidatePath(value).split("/").pop()?.toLowerCase() || "";

const hasExplicitDownloadIntent = (text: string): boolean => {
  const raw = String(text || "").trim();
  if (!raw) return false;
  if (DOWNLOAD_NEGATION_REGEX.test(raw)) return false;
  return DOWNLOAD_INTENT_REGEX.test(raw);
};

const extractMentionedFileNames = (text: string): Set<string> => {
  const names = new Set<string>();
  if (!text) return names;
  (text.match(FILE_NAME_ONLY_REGEX) || []).forEach((item) => {
    const normalized = getFileBasename(item);
    if (normalized) names.add(normalized);
  });
  return names;
};

const finalizeMarkerFiles = (
  files: FileMarkerItem[],
  mentionedNames?: Set<string>,
): FileMarkerItem[] => {
  let filtered = [...files];
  if (mentionedNames && mentionedNames.size) {
    const mentionedOnly = filtered.filter((file) =>
      mentionedNames.has(getFileBasename(file.name)),
    );
    if (mentionedOnly.length) {
      filtered = mentionedOnly;
    }
  }

  const hasNonImage = filtered.some((file) => file.kind !== "image");
  if (hasNonImage) {
    filtered = filtered.filter((file) => file.kind !== "image");
  }

  const deduped = new Map<string, FileMarkerItem>();
  filtered.forEach((file) => {
    const key = getFileBasename(file.name);
    if (!key) return;
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, file);
      return;
    }
    const currentScore =
      (file.path ? 2 : 0) +
      (file.kind !== "image" ? 1 : 0) +
      (mentionedNames?.has(key) ? 4 : 0);
    const existingScore =
      (existing.path ? 2 : 0) +
      (existing.kind !== "image" ? 1 : 0) +
      (mentionedNames?.has(key) ? 4 : 0);
    if (currentScore > existingScore) {
      deduped.set(key, file);
    }
  });

  return Array.from(deduped.values());
};

const toOutputMessage = async (msg: Message): Promise<OutputMessage> => ({
  ...msg,
  role:
    msg.type === TYPE_PLUGIN_CALL_OUTPUT && msg.role === "system"
      ? ROLE_TOOL
      : msg.role,
  content: msg.content,
  metadata: null,
});

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function generateLocalSessionId(
  sessions: IAgentScopeRuntimeWebUISession[] = [],
): string {
  let candidate = Date.now();
  const used = new Set(sessions.map((session) => String(session.id || "")));
  while (used.has(String(candidate))) {
    candidate += 1;
  }
  return String(candidate);
}

export const extractTextFromContent = (content: unknown): string => {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return String(content || "");
  return (content as ContentItem[])
    .filter((c) => c.type === "text")
    .map((c) => c.text || "")
    .filter(Boolean)
    .join("\n");
};

const extractOutputMessageText = (message: OutputMessage): string =>
  extractTextFromContent(message.content).trim();

const isEmbedFallbackFlag = (value: unknown): boolean =>
  value === true || value === "true";

export const createAssistantTextCardMessage = (
  text: string,
  metadata?: Record<string, unknown> | null,
): IAgentScopeRuntimeWebUIMessage | null => {
  const normalizedText = String(text || "").trim();
  if (!normalizedText) return null;
  const outputMsg: OutputMessage = {
    id: generateId(),
    role: ROLE_ASSISTANT,
    type: "message",
    status: "completed",
    content: [{ type: "text", text: normalizedText, status: "completed" }],
    metadata: metadata ? { ...metadata } : null,
    sequence_number: 1,
  };
  return buildResponseCard([outputMsg], false);
};

const normalizeEmbedFallbackMessage = (
  message: IAgentScopeRuntimeWebUIMessage,
): IAgentScopeRuntimeWebUIMessage | null => {
  const directMetadata = (message as any)?.metadata;
  const directText = extractTextFromContent((message as any)?.content).trim();
  if (isEmbedFallbackFlag(directMetadata?.[EMBED_FALLBACK_MARKER])) {
    if (!directText) return null;
    return createAssistantTextCardMessage(directText, {
      [EMBED_FALLBACK_MARKER]: true,
    });
  }

  if (!Array.isArray((message as any)?.cards)) return null;

  const parts: string[] = [];
  (message as any).cards.forEach((card: any) => {
    const cardMarked = isEmbedFallbackFlag(card?.data?.copawEmbedFallback);
    if (card?.code !== CARD_RESPONSE || !Array.isArray(card?.data?.output)) return;
    card.data.output.forEach((outputMessage: any) => {
      if (
        !cardMarked &&
        !isEmbedFallbackFlag(outputMessage?.metadata?.[EMBED_FALLBACK_MARKER])
      ) {
        return;
      }
      const text = extractTextFromContent(outputMessage?.content).trim();
      if (text) parts.push(text);
    });
  });

  const normalizedText = parts.join("\n").trim();
  if (!normalizedText) return null;

  return createAssistantTextCardMessage(normalizedText, {
    [EMBED_FALLBACK_MARKER]: true,
  });
};

const matchesHiddenPromptText = (
  text: string,
  meta?: Record<string, unknown> | null,
): boolean => {
  const normalizedText = normalizePrompt(text);
  if (!normalizedText) return false;
  return buildHiddenPromptHistory(meta).some((candidate) => {
    const hidden = normalizePrompt(candidate);
    return (
      !!hidden &&
      (normalizedText === hidden ||
        normalizedText.includes(hidden) ||
        hidden.includes(normalizedText))
    );
  });
};

const extractFilesFromOutputMessage = (msg: OutputMessage): FileMarkerItem[] => {
  const collected = new Map<string, FileMarkerItem>();

  const addFile = (pathOrUrl: string, nameHint?: string) => {
    const normalizedSource = normalizeCandidatePath(pathOrUrl);
    if (!normalizedSource) return;
    const isRemoteDownload =
      /^https?:/i.test(normalizedSource) ||
      /\/api\/chat-files\/\d+\/download/i.test(normalizedSource);
    const path = isRemoteDownload ? undefined : normalizedSource;
    const url = isRemoteDownload
      ? withAccessToken(normalizedSource)
      : buildLocalDownloadUrl(normalizedSource);
    const name =
      normalizeCandidatePath(nameHint || "") ||
      (path || normalizedSource).split("/").pop() ||
      "file";
    if (!name) return;
    const lower = name.toLowerCase();
    const key = path || url;
    if (!key || collected.has(key)) return;
    collected.set(key, {
      path,
      name,
      url,
      kind:
        lower.endsWith(".png") ||
        lower.endsWith(".jpg") ||
        lower.endsWith(".jpeg")
          ? "image"
          : "download",
    });
  };

  const visit = (node: unknown) => {
    if (!node) return;
    if (typeof node === "string") {
      extractLocalPathsFromText(node).forEach((path) => addFile(path));
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node !== "object") return;
    const data = node as Record<string, unknown>;

    if (data.type === "file") {
      const fileUrl = String(data.file_url || data.url || "");
      const name = String(data.name || "");
      if (fileUrl) addFile(fileUrl, name);
    }
    if (data.type === "image") {
      const imageUrl = String(data.image_url || data.url || "");
      const name = String(data.name || "");
      if (imageUrl) addFile(imageUrl, name);
    }
    if (data.type === "data" && data.data) {
      const payload = data.data as Record<string, unknown>;
      if (typeof payload.output === "string") {
        extractLocalPathsFromText(payload.output).forEach((path) => addFile(path));
      } else {
        visit(payload.output);
      }
    }

    Object.values(data).forEach((value) => visit(value));
  };

  if (msg.role === ROLE_TOOL || msg.type === TYPE_PLUGIN_CALL_OUTPUT) {
    visit(msg.content);
  }

  return Array.from(collected.values());
};

const injectFileMarkerIntoOutputMessages = (
  outputMessages: OutputMessage[],
  allowDownloadLinks: boolean,
): OutputMessage[] => {
  if (!allowDownloadLinks) return outputMessages;
  const fileMap = new Map<string, FileMarkerItem>();
  outputMessages.forEach((msg) => {
    extractFilesFromOutputMessage(msg).forEach((file) => {
      const key = file.path || file.url;
      if (!key || fileMap.has(key)) return;
      fileMap.set(key, file);
    });
  });

  if (!fileMap.size) return outputMessages;

  const mentionedNames = new Set<string>();
  outputMessages.forEach((msg) => {
    if (msg.role !== ROLE_ASSISTANT) return;
    extractMentionedFileNames(extractTextFromContent(msg.content)).forEach((name) =>
      mentionedNames.add(name),
    );
  });

  const finalFiles = finalizeMarkerFiles(
    Array.from(fileMap.values()),
    mentionedNames,
  );
  if (!finalFiles.length) return outputMessages;

  const marker = buildFileMarker(finalFiles);
  const nextMessages: OutputMessage[] = outputMessages.map(
    (msg) =>
      ({
        ...msg,
        content: Array.isArray(msg.content)
          ? msg.content.map((item) => ({ ...item }))
          : msg.content,
      }) as OutputMessage,
  );

  for (let index = nextMessages.length - 1; index >= 0; index -= 1) {
    const msg = nextMessages[index];
    if (msg.role !== ROLE_ASSISTANT) continue;
    if (Array.isArray(msg.content)) {
      const lastText = [...msg.content]
        .reverse()
        .find((item) => item?.type === "text");
      if (lastText) {
        lastText.text = appendMarkerToText(String(lastText.text || ""), marker);
        return nextMessages;
      }
      msg.content = [
        ...msg.content,
        { type: "text", text: marker, status: "created" },
      ];
      return nextMessages;
    }
    msg.content = [
      {
        type: "text",
        text: appendMarkerToText(extractTextFromContent(msg.content), marker),
        status: "created",
      },
    ];
    return nextMessages;
  }

  const syntheticMessage = {
    id: generateId(),
    role: ROLE_ASSISTANT,
    type: "message",
    content: [{ type: "text", text: marker, status: "created" }],
    metadata: null,
  } as OutputMessage;
  nextMessages.push(syntheticMessage);
  return nextMessages;
};

const isRenderableOutputMessage = (msg: OutputMessage): boolean => {
  const role = String(msg.role || "").toLowerCase();
  const type = String(msg.type || "").toLowerCase();
  if (role === ROLE_TOOL) return false;
  if (
    type === "plugin_call" ||
    type === "plugin_call_output" ||
    type === "reasoning" ||
    type === "thinking"
  ) {
    return false;
  }
  if (
    role === ROLE_ASSISTANT &&
    isProcessNarrationText(extractTextFromContent(msg.content))
  ) {
    return false;
  }
  return true;
};

const sanitizeResponseCardOutput = (
  output: OutputMessage[],
  meta?: Record<string, unknown> | null,
): OutputMessage[] =>
  output.filter((message) => {
    if (!isRenderableOutputMessage(message)) return false;
    const text = extractOutputMessageText(message);
    if (!text) return true;
    return !(
      matchesHiddenPromptText(text, meta) ||
      isSecretaryInstructionText(text) ||
      isGenericSceneInstructionText(text)
    );
  });

export const sanitizeUiMessages = (
  messages: IAgentScopeRuntimeWebUIMessage[],
  meta?: Record<string, unknown> | null,
): IAgentScopeRuntimeWebUIMessage[] => {
  if (!Array.isArray(messages) || !messages.length) return [];

  const result: IAgentScopeRuntimeWebUIMessage[] = [];
  messages.forEach((message) => {
    const normalizedFallbackMessage = normalizeEmbedFallbackMessage(message);
    if (normalizedFallbackMessage) {
      result.push(normalizedFallbackMessage);
      return;
    }

    const hasCards = Array.isArray((message as any)?.cards);
    const directText = extractTextFromContent((message as any)?.content).trim();
    if (
      !hasCards &&
      directText &&
      (matchesHiddenPromptText(directText, meta) ||
        isSecretaryInstructionText(directText) ||
        isGenericSceneInstructionText(directText))
    ) {
      return;
    }

    if (
      !hasCards &&
      String((message as any)?.role || "").toLowerCase() === ROLE_ASSISTANT &&
      directText &&
      isProcessNarrationText(directText)
    ) {
      return;
    }

    if (!hasCards) {
      result.push(message);
      return;
    }

    const nextCards = (message as any).cards
      .map((card: any) => {
        if (card?.code !== CARD_RESPONSE || !Array.isArray(card?.data?.output)) {
          return card;
        }
        const nextOutput = sanitizeResponseCardOutput(card.data.output, meta);
        if (!nextOutput.length) return null;
        return {
          ...card,
          data: {
            ...card.data,
            output: nextOutput,
          },
        };
      })
      .filter(Boolean);

    if (!nextCards.length) return;

    result.push({
      ...(message as any),
      cards: nextCards,
    });
  });

  return result;
};

function buildUserCard(msg: Message): IAgentScopeRuntimeWebUIMessage {
  const contentItems = Array.isArray(msg.content)
    ? (msg.content as ContentItem[])
    : [{ type: "text", text: extractTextFromContent(msg.content) }];
  const normalizedContent = contentItems
    .map((item) => {
      if (item.type === "text") {
        return {
          type: "text",
          text: String(item.text || ""),
          status: "created",
        };
      }
      if (item.type === "image") {
        const imageUrl = String(
          (item as any).image_url ||
            (item as any).url ||
            (item as any).file_url ||
            "",
        );
        return {
          type: "image",
          image_url: withAccessToken(imageUrl),
          file_id: (item as any).file_id,
          name: (item as any).name,
          status: "created",
        };
      }
      if (item.type === "file") {
        const fileUrl = String((item as any).file_url || (item as any).url || "");
        return {
          type: "file",
          file_url: withAccessToken(fileUrl),
          file_id: (item as any).file_id,
          name: (item as any).name,
          size: (item as any).size,
          status: "created",
        };
      }
      return item;
    })
    .filter(Boolean);
  return {
    id: (msg.id as string) || generateId(),
    role: ROLE_USER,
    cards: [
      {
        code: "AgentScopeRuntimeRequestCard",
        data: {
          input: [
            {
              role: ROLE_USER,
              type: "message",
              content: normalizedContent.length
                ? normalizedContent
                : [{ type: "text", text: "", status: "created" }],
            },
          ],
        },
      },
    ],
  };
}

export const buildResponseCard = (
  outputMessages: OutputMessage[],
  allowDownloadLinks: boolean,
): IAgentScopeRuntimeWebUIMessage => {
  const normalizedOutput = injectFileMarkerIntoOutputMessages(
    outputMessages,
    allowDownloadLinks,
  );
  const now = Math.floor(Date.now() / 1000);
  const maxSeq = normalizedOutput.reduce(
    (max, message) => Math.max(max, message.sequence_number || 0),
    0,
  );
  return {
    id: generateId(),
    role: ROLE_ASSISTANT,
    cards: [
      {
        code: CARD_RESPONSE,
        data: {
          id: `response_${generateId()}`,
          output: normalizedOutput,
          object: "response",
          status: "completed",
          created_at: now,
          sequence_number: maxSeq + 1,
          error: null,
          completed_at: now,
          usage: null,
        },
      },
    ],
    msgStatus: "finished",
  };
};

export const convertMessages = async (
  messages: Message[],
): Promise<IAgentScopeRuntimeWebUIMessage[]> => {
  const result: IAgentScopeRuntimeWebUIMessage[] = [];
  let index = 0;
  let lastUserText = "";

  while (index < messages.length) {
    if (messages[index].role === ROLE_USER) {
      lastUserText = extractTextFromContent(messages[index].content);
      result.push(buildUserCard(messages[index]));
      index += 1;
      continue;
    }

    const outputMessages: OutputMessage[] = [];
    while (index < messages.length && messages[index].role !== ROLE_USER) {
      outputMessages.push(await toOutputMessage(messages[index]));
      index += 1;
    }
    const visibleMessages = outputMessages.filter(isRenderableOutputMessage);
    if (visibleMessages.length) {
      result.push(
        buildResponseCard(
          visibleMessages,
          hasExplicitDownloadIntent(lastUserText),
        ),
      );
    }
  }

  return result;
};
