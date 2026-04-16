import {
  type IAgentScopeRuntimeWebUIMessage,
  type IAgentScopeRuntimeWebUISession,
} from "@agentscope-ai/chat";
import {
  DEFAULT_CHANNEL,
  DEFAULT_SESSION_NAME,
  getDefaultUserId,
} from "./session-meta";
import { sanitizeUiMessages } from "./session-message";
import {
  type ExtendedSession,
  isLocalTimestamp,
  normalizeSessionId,
} from "./session-types";

export const SESSION_CACHE_VERSION = "v1";
export const SESSION_CACHE_MAX_SESSIONS = 80;
export const SESSION_CACHE_MAX_MESSAGES = 120;
export const RECENT_DELETE_TTL_MS = 180000;

interface SerializableSession {
  id: string;
  realId?: string;
  name?: string;
  sessionId?: string;
  userId?: string;
  channel?: string;
  createdAt?: string;
  updatedAt?: string;
  meta?: Record<string, unknown>;
  messages?: IAgentScopeRuntimeWebUIMessage[];
}

export const getSessionCacheKey = (userId = getDefaultUserId()): string =>
  `copaw_session_cache_${SESSION_CACHE_VERSION}:${userId}`;

export const persistSessionCache = (
  sessionList: IAgentScopeRuntimeWebUISession[],
): void => {
  if (typeof window === "undefined") return;
  try {
    const serializable = sessionList
      .slice(0, SESSION_CACHE_MAX_SESSIONS)
      .map((session) => {
        const current = session as ExtendedSession;
        return {
          id: current.id,
          realId: current.realId || "",
          name: current.name || DEFAULT_SESSION_NAME,
          sessionId: current.sessionId || current.id,
          userId: current.userId || getDefaultUserId(),
          channel: current.channel || DEFAULT_CHANNEL,
          createdAt: String(current.createdAt || ""),
          updatedAt: String(current.updatedAt || ""),
          meta: (current.meta || {}) as Record<string, unknown>,
          messages: ((current.messages as IAgentScopeRuntimeWebUIMessage[]) || []).slice(
            -SESSION_CACHE_MAX_MESSAGES,
          ),
        } as SerializableSession;
      });
    localStorage.setItem(
      getSessionCacheKey(),
      JSON.stringify({ ts: Date.now(), sessions: serializable }),
    );
  } catch (error) {
    console.warn("Failed to persist session cache:", error);
  }
};

export const hydrateSessionCache = (
  sessionList: IAgentScopeRuntimeWebUISession[],
): IAgentScopeRuntimeWebUISession[] => {
  if (typeof window === "undefined") return sessionList;
  if (sessionList.length > 0) return sessionList;
  try {
    const raw = localStorage.getItem(getSessionCacheKey());
    if (!raw) return sessionList;
    const parsed = JSON.parse(raw) as { sessions?: SerializableSession[] };
    const sessions = Array.isArray(parsed?.sessions) ? parsed.sessions : [];
    if (!sessions.length) return sessionList;
    return sessions
      .filter((session) => session?.id)
      .map(
        (session) =>
          ({
            id: String(session.id),
            realId: session.realId || undefined,
            name: session.name || DEFAULT_SESSION_NAME,
            sessionId: session.sessionId || session.id,
            userId: session.userId || getDefaultUserId(),
            channel: session.channel || DEFAULT_CHANNEL,
            createdAt: String(session.createdAt || ""),
            updatedAt: String(session.updatedAt || ""),
            meta: session.meta || {},
            messages: sanitizeUiMessages(
              session.messages || [],
              (session.meta || {}) as Record<string, unknown>,
            ),
          }) as ExtendedSession,
      );
  } catch (error) {
    console.warn("Failed to hydrate session cache:", error);
    return sessionList;
  }
};

export const mergeSessionMessages = (
  base: IAgentScopeRuntimeWebUIMessage[],
  incoming: IAgentScopeRuntimeWebUIMessage[],
): IAgentScopeRuntimeWebUIMessage[] => {
  const seen = new Set<string>();
  const merged: IAgentScopeRuntimeWebUIMessage[] = [];
  for (const message of [...base, ...incoming]) {
    const messageId = String((message as { id?: string }).id || "");
    const key =
      messageId ||
      JSON.stringify({
        role: (message as { role?: string }).role || "",
        type: (message as { type?: string }).type || "",
        content: (message as { content?: unknown }).content || "",
      });
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(message);
  }
  return merged;
};

export const resolveRealId = (
  sessionList: IAgentScopeRuntimeWebUISession[],
  tempSessionId: string,
): { list: IAgentScopeRuntimeWebUISession[]; realId: string | null } => {
  const realSession = sessionList.find(
    (session) => (session as ExtendedSession).sessionId === tempSessionId,
  );
  if (!realSession) return { list: sessionList, realId: null };

  const current = realSession as ExtendedSession;
  const realId =
    normalizeSessionId(current.realId) ||
    (normalizeSessionId(realSession.id) !== normalizeSessionId(tempSessionId)
      ? normalizeSessionId(realSession.id)
      : "");
  if (!realId) {
    return { list: sessionList, realId: null };
  }

  current.realId = realId;
  realSession.id = tempSessionId;
  return {
    list: [realSession, ...sessionList.filter((session) => session !== realSession)],
    realId,
  };
};

export const mergeFetchedSessionList = (args: {
  incomingSessions: ExtendedSession[];
  existingSessions: IAgentScopeRuntimeWebUISession[];
  isRecentlyDeleted: (id: string) => boolean;
}): ExtendedSession[] => {
  const { incomingSessions, existingSessions, isRecentlyDeleted } = args;

  const merged = incomingSessions.map((session) => {
    const incoming = session as ExtendedSession;
    const existing = existingSessions.find(
      (candidate) =>
        (candidate as ExtendedSession).sessionId === incoming.sessionId,
    ) as ExtendedSession | undefined;
    if (!existing) return incoming;

    const incomingBackendId = normalizeSessionId(incoming.id);
    const existingId = normalizeSessionId(existing.id);
    const shouldKeepLocalId =
      isLocalTimestamp(existingId) &&
      !!incomingBackendId &&
      incomingBackendId !== existingId;
    const mergedMeta = {
      ...((incoming.meta || {}) as Record<string, unknown>),
      ...((existing.meta || {}) as Record<string, unknown>),
    };
    const keepExistingName =
      Boolean(mergedMeta.locked_session_name) &&
      String(existing.name || "").trim().length > 0;

    return {
      ...incoming,
      name: keepExistingName
        ? existing.name
        : incoming.name || existing.name || DEFAULT_SESSION_NAME,
      id: shouldKeepLocalId ? existing.id : incoming.id,
      realId:
        existing.realId ||
        (shouldKeepLocalId ? incomingBackendId : incoming.realId),
      meta: mergedMeta,
      messages: mergeSessionMessages(
        (incoming.messages as IAgentScopeRuntimeWebUIMessage[]) || [],
        (existing.messages as IAgentScopeRuntimeWebUIMessage[]) || [],
      ),
    } as ExtendedSession;
  });

  const backendIds = new Set(merged.map((session) => session.sessionId));
  const localOnly = existingSessions.filter((session) => {
    const current = session as ExtendedSession;
    const sessionId = current.sessionId;
    const meta = (current.meta || {}) as Record<string, unknown>;
    const isPushSession = Boolean(meta.push_source_user_id);
    const isLocal =
      isLocalTimestamp(String(session.id || "")) &&
      !current.realId &&
      !backendIds.has(sessionId);
    if (isLocal) return true;
    if (isPushSession && !backendIds.has(sessionId)) return true;
    return false;
  }) as ExtendedSession[];

  const deduped: ExtendedSession[] = [];
  const seenIds = new Set<string>();
  [...localOnly, ...merged].forEach((session) => {
    const ids = [
      normalizeSessionId(session.id),
      normalizeSessionId(session.realId),
      normalizeSessionId(session.sessionId),
    ].filter(Boolean);
    if (!ids.length) return;
    if (ids.some((id) => isRecentlyDeleted(id))) return;
    if (ids.some((id) => seenIds.has(id))) return;
    ids.forEach((id) => seenIds.add(id));
    deduped.push(session);
  });

  return deduped;
};
