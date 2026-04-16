import {
  type IAgentScopeRuntimeWebUIMessage,
  type IAgentScopeRuntimeWebUISession,
} from "@agentscope-ai/chat";
import {
  DEFAULT_CHANNEL,
  DEFAULT_SESSION_NAME,
  getDefaultUserId,
} from "./session-meta";
import {
  buildResponseCard,
  generateId,
  sanitizeUiMessages,
} from "./session-message";
import type { ExtendedSession, OutputMessage } from "./session-types";

export const emitPushSessionUpdated = (sessionId: string): void => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("copaw-push-session-updated", {
      detail: { sessionId, ts: Date.now() },
    }),
  );
};

export const findPushSessionIndex = (
  sessionList: IAgentScopeRuntimeWebUISession[],
  sourceUserId: string,
  conversationKey?: string,
  pushSessionId?: string,
  pushChatId?: string,
): number =>
  sessionList.findIndex((session) => {
    const meta = ((session as ExtendedSession).meta || {}) as Record<string, unknown>;
    if (conversationKey) {
      return (
        String(meta.push_conversation_key || "") === String(conversationKey || "")
      );
    }
    if (pushSessionId) {
      return String(meta.push_session_id || "") === String(pushSessionId || "");
    }
    if (pushChatId) {
      const chatMatch =
        String(meta.push_chat_id || "") === String(pushChatId || "");
      const sessionMatch =
        String((session as ExtendedSession).sessionId || "") === String(pushChatId || "");
      return chatMatch || sessionMatch;
    }
    return String(meta.push_source_user_id || "") === String(sourceUserId || "");
  });

export const createPushCard = (
  pushMessage?: string,
): IAgentScopeRuntimeWebUIMessage | null => {
  if (!pushMessage) return null;
  const outputMessage: OutputMessage = {
    id: generateId(),
    role: "assistant",
    type: "message",
    status: "completed",
    content: [
      {
        type: "text",
        text: pushMessage,
        status: "completed",
      },
    ],
    metadata: null,
    sequence_number: 1,
  };
  return buildResponseCard([outputMessage], false);
};

export const mergeExistingPushSession = (args: {
  existing: ExtendedSession;
  name?: string;
  meta: Record<string, unknown>;
  pushCard: IAgentScopeRuntimeWebUIMessage | null;
}): ExtendedSession => {
  const { existing, name, meta, pushCard } = args;
  const mergedMeta = {
    ...(existing.meta || {}),
    ...meta,
  };
  const mergedMessages = [
    ...((existing.messages as IAgentScopeRuntimeWebUIMessage[]) || []),
    ...(pushCard ? [pushCard] : []),
  ];
  return {
    ...existing,
    name: name || existing.name || DEFAULT_SESSION_NAME,
    meta: mergedMeta,
    messages: sanitizeUiMessages(mergedMessages, mergedMeta),
  };
};

export const createPushSession = (args: {
  id: string;
  name?: string;
  pushSessionId?: string;
  pushChatId?: string;
  messages: IAgentScopeRuntimeWebUIMessage[];
  meta: Record<string, unknown>;
}): ExtendedSession => {
  const { id, name, pushSessionId, pushChatId, messages, meta } = args;
  return {
    id,
    name: name || DEFAULT_SESSION_NAME,
    sessionId: pushSessionId || id,
    realId: pushChatId
      ? String(pushChatId)
      : pushSessionId
        ? String(id || "")
        : undefined,
    userId: getDefaultUserId(),
    channel: DEFAULT_CHANNEL,
    messages: sanitizeUiMessages(messages, meta),
    meta,
  } as ExtendedSession;
};
