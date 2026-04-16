import {
  type IAgentScopeRuntimeWebUISession,
  type IAgentScopeRuntimeWebUISessionAPI,
  type IAgentScopeRuntimeWebUIMessage,
} from "@agentscope-ai/chat";
import api, { type ChatSpec, type Message } from "../../../api";
import {
  DEFAULT_CHANNEL,
  DEFAULT_SESSION_NAME,
  appendPartyTaskEvent,
  buildPushSessionMeta,
  getDefaultUserId,
  normalizeSessionMeta,
  upsertPartySessionMeta,
  type PartyTaskEvent,
  type PartyTaskMetaInput,
} from "../../../features/core/session/session-meta";
import {
  RECENT_DELETE_TTL_MS,
  hydrateSessionCache,
  mergeFetchedSessionList,
  mergeSessionMessages,
  persistSessionCache,
  resolveRealId,
} from "../../../features/core/session/session-cache";
import {
  buildResponseCard,
  convertMessages,
  createAssistantTextCardMessage,
  generateLocalSessionId,
  sanitizeUiMessages,
} from "../../../features/core/session/session-message";
import {
  createPushCard,
  createPushSession,
  emitPushSessionUpdated,
  findPushSessionIndex,
  mergeExistingPushSession,
} from "../../../features/core/session/session-push";
import {
  type ExtendedSession,
  isLocalTimestamp,
  normalizeSessionId,
} from "../../../features/core/session/session-types";

interface CustomWindow extends Window {
  currentSessionId?: string;
  currentUserId?: string;
  currentChannel?: string;
}

declare const window: CustomWindow;

const chatSpecToSession = (chat: ChatSpec): ExtendedSession =>
  ({
    id: chat.id,
    name: (chat as ChatSpec & { name?: string }).name || DEFAULT_SESSION_NAME,
    sessionId: chat.session_id,
    userId: chat.user_id,
    channel: chat.channel,
    messages: [],
    meta: normalizeSessionMeta((chat.meta || {}) as Record<string, unknown>) as any,
  }) as ExtendedSession;

class SessionApi implements IAgentScopeRuntimeWebUISessionAPI {
  private sessionList: IAgentScopeRuntimeWebUISession[] = [];
  private recentlyDeletedSessionIds = new Map<string, number>();

  private sessionListRequest: Promise<IAgentScopeRuntimeWebUISession[]> | null = null;

  onSessionIdResolved: ((tempId: string, realId: string) => void) | null = null;

  onSessionRemoved: ((removedId: string) => void) | null = null;

  private normalizeId(value: unknown): string {
    return normalizeSessionId(value);
  }

  private markRecentlyDeleted(...ids: Array<string | null | undefined>): void {
    const now = Date.now();
    ids.forEach((id) => {
      const normalized = this.normalizeId(id);
      if (!normalized) return;
      this.recentlyDeletedSessionIds.set(normalized, now);
    });
  }

  private cleanupRecentlyDeleted(): void {
    if (!this.recentlyDeletedSessionIds.size) return;
    const now = Date.now();
    for (const [id, ts] of this.recentlyDeletedSessionIds.entries()) {
      if (now - ts > RECENT_DELETE_TTL_MS) {
        this.recentlyDeletedSessionIds.delete(id);
      }
    }
  }

  private isRecentlyDeleted(id: unknown): boolean {
    const normalized = this.normalizeId(id);
    if (!normalized) return false;
    this.cleanupRecentlyDeleted();
    return this.recentlyDeletedSessionIds.has(normalized);
  }

  private matchesSessionByAnyId(
    session: IAgentScopeRuntimeWebUISession,
    ids: Set<string>,
  ): boolean {
    const current = session as ExtendedSession;
    return (
      ids.has(this.normalizeId(session.id)) ||
      ids.has(this.normalizeId(current.realId)) ||
      ids.has(this.normalizeId(current.sessionId))
    );
  }

  private hydrateSessionCache(): void {
    this.sessionList = hydrateSessionCache(this.sessionList);
  }

  private persistSessionCache(): void {
    persistSessionCache(this.sessionList);
  }

  private mergeMessages(
    base: IAgentScopeRuntimeWebUIMessage[],
    incoming: IAgentScopeRuntimeWebUIMessage[],
  ): IAgentScopeRuntimeWebUIMessage[] {
    return mergeSessionMessages(base, incoming);
  }

  private findSessionByAnyId(id: unknown): ExtendedSession | undefined {
    this.hydrateSessionCache();
    const normalized = this.normalizeId(id);
    if (!normalized) return undefined;
    return this.sessionList.find((session) =>
      this.matchesSessionByAnyId(session, new Set([normalized])),
    ) as ExtendedSession | undefined;
  }

  private emitPushSessionUpdated(sessionId: string): void {
    emitPushSessionUpdated(sessionId);
  }

  clearSessionsMatching(
    matcher: (session: ExtendedSession) => boolean,
  ): ExtendedSession[] {
    this.hydrateSessionCache();
    this.sessionList = this.sessionList.filter(
      (session) => !matcher(session as ExtendedSession),
    );
    this.persistSessionCache();
    return [...this.sessionList] as ExtendedSession[];
  }

  async removeSessionsMatching(
    matcher: (session: ExtendedSession) => boolean,
  ): Promise<ExtendedSession[]> {
    const sessions = (await this.getSessionList()) as ExtendedSession[];
    const targets = sessions.filter((session) => matcher(session));
    for (const session of targets) {
      await this.removeSession({ id: session.id } as any);
    }
    return [...this.sessionList] as ExtendedSession[];
  }

  private findPushSessionIndex(
    sourceUserId: string,
    conversationKey?: string,
    pushSessionId?: string,
    pushChatId?: string,
  ): number {
    return findPushSessionIndex(
      this.sessionList,
      sourceUserId,
      conversationKey,
      pushSessionId,
      pushChatId,
    );
  }

  private createEmptySession(sessionId: string): ExtendedSession {
    window.currentSessionId = sessionId;
    window.currentUserId = getDefaultUserId();
    window.currentChannel = DEFAULT_CHANNEL;
    return {
      id: sessionId,
      name: DEFAULT_SESSION_NAME,
      sessionId,
      userId: getDefaultUserId(),
      channel: DEFAULT_CHANNEL,
      messages: [],
      meta: {},
    } as ExtendedSession;
  }

  private ensureSessionRecord(sessionId: string, meta?: Record<string, unknown>): ExtendedSession {
    this.hydrateSessionCache();
    const normalized = this.normalizeId(sessionId);
    const existing = this.findSessionByAnyId(normalized);
    if (existing) return existing;
    const created = this.createEmptySession(normalized || generateLocalSessionId(this.sessionList));
    created.meta = normalizeSessionMeta(meta || {}) as any;
    this.sessionList.unshift(created);
    this.persistSessionCache();
    return created;
  }

  private updateWindowVariables(session: ExtendedSession): void {
    window.currentSessionId = session.sessionId || "";
    window.currentUserId = session.userId || getDefaultUserId();
    window.currentChannel = session.channel || DEFAULT_CHANNEL;
  }

  private getLocalSession(sessionId: string): IAgentScopeRuntimeWebUISession {
    const local = this.findSessionByAnyId(sessionId);
    if (local) {
      local.messages = sanitizeUiMessages(
        (local.messages as IAgentScopeRuntimeWebUIMessage[]) || [],
        (local.meta || {}) as Record<string, unknown>,
      );
      this.updateWindowVariables(local);
      return local;
    }
    return this.createEmptySession(sessionId);
  }

  getSessionMeta(sessionId: string): Record<string, unknown> {
    const session = this.findSessionByAnyId(sessionId);
    return (session?.meta as Record<string, unknown>) || {};
  }

  peekSession(sessionId: string): ExtendedSession | undefined {
    return this.findSessionByAnyId(sessionId);
  }

  upsertPartySessionMeta(sessionId: string, patch: PartyTaskMetaInput): Record<string, unknown> {
    const session = this.ensureSessionRecord(sessionId);
    const nextMeta = upsertPartySessionMeta({
      baseMeta: (session.meta || {}) as Record<string, unknown>,
      patch,
    });
    session.meta = nextMeta as any;
    this.persistSessionCache();
    return nextMeta;
  }

  appendPartyTaskEvent(sessionId: string, event: PartyTaskEvent): Record<string, unknown> {
    const session = this.ensureSessionRecord(sessionId);
    const nextMeta = appendPartyTaskEvent(
      (session.meta || {}) as Record<string, unknown>,
      event,
    );
    session.meta = nextMeta as any;
    this.persistSessionCache();
    return nextMeta;
  }

  getRealIdForSession(sessionId: string): string | null {
    const session = this.findSessionByAnyId(sessionId);
    return session?.realId ?? null;
  }

  async getSessionList() {
    this.hydrateSessionCache();
    if (this.sessionListRequest) {
      if (this.sessionList.length > 0) {
        return [...this.sessionList];
      }
      return this.sessionListRequest;
    }

    this.sessionListRequest = (async () => {
      try {
        const chats = await api.listChats();
        const incomingSessions = chats
          .filter((chat) => chat.id && chat.id !== "undefined" && chat.id !== "null")
          .filter(
            (chat) =>
              !this.isRecentlyDeleted(chat.id) &&
              !this.isRecentlyDeleted(chat.session_id),
          )
          .map(chatSpecToSession)
          .reverse();

        this.sessionList = mergeFetchedSessionList({
          incomingSessions,
          existingSessions: this.sessionList,
          isRecentlyDeleted: (id) => this.isRecentlyDeleted(id),
        });
        this.persistSessionCache();
        return [...this.sessionList];
      } catch (error) {
        console.warn("Failed to refresh sessions, using cached list:", error);
        if (!this.sessionList.length) {
          this.hydrateSessionCache();
        }
        return [...this.sessionList];
      } finally {
        this.sessionListRequest = null;
      }
    })();

    return this.sessionListRequest;
  }

  async getSession(sessionId: string) {
    this.hydrateSessionCache();

    if (isLocalTimestamp(sessionId)) {
      const fromList = this.findSessionByAnyId(sessionId);

      if (fromList?.realId) {
        const resolvedRealId = this.normalizeId(fromList.realId);
        if (resolvedRealId && !isLocalTimestamp(resolvedRealId)) {
          try {
            const chatHistory = await api.getChat(resolvedRealId);
            const session: ExtendedSession = {
              id: sessionId,
              name: fromList.name || DEFAULT_SESSION_NAME,
              sessionId: fromList.sessionId || sessionId,
              userId: fromList.userId || getDefaultUserId(),
              channel: fromList.channel || DEFAULT_CHANNEL,
              messages: sanitizeUiMessages(
                await convertMessages(chatHistory.messages || []),
                (fromList.meta || {}) as Record<string, unknown>,
              ),
              meta: fromList.meta || {},
              realId: resolvedRealId,
            };
            this.updateWindowVariables(session);
            return session;
          } catch (error) {
            console.warn(
              "Failed to load chat history by resolved realId, fallback to local session:",
              error,
            );
          }
        } else {
          fromList.realId = undefined;
          this.persistSessionCache();
        }
      }

      if (fromList?.messages?.length) {
        const sanitizedLocalMessages = sanitizeUiMessages(
          (fromList.messages as IAgentScopeRuntimeWebUIMessage[]) || [],
          (fromList.meta || {}) as Record<string, unknown>,
        );
        fromList.messages = sanitizedLocalMessages;
        if (sanitizedLocalMessages.length > 0) {
          this.updateWindowVariables(fromList);
          return fromList;
        }
      }

      for (let attempts = 0; attempts < 20; attempts += 1) {
        const current = this.sessionList.find((session) => session.id === sessionId) as
          | ExtendedSession
          | undefined;
        if (current?.realId) break;
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 120);
        });
        try {
          await this.getSessionList();
        } catch {
          // ignore transient refresh failures during realId polling
        }
      }

      const refreshed = this.sessionList.find((session) => session.id === sessionId) as
        | ExtendedSession
        | undefined;
      if (refreshed?.realId) {
        const resolvedRealId = this.normalizeId(refreshed.realId);
        if (resolvedRealId && !isLocalTimestamp(resolvedRealId)) {
          try {
            const chatHistory = await api.getChat(resolvedRealId);
            const session: ExtendedSession = {
              id: sessionId,
              name: refreshed.name || DEFAULT_SESSION_NAME,
              sessionId: refreshed.sessionId || sessionId,
              userId: refreshed.userId || getDefaultUserId(),
              channel: refreshed.channel || DEFAULT_CHANNEL,
              messages: sanitizeUiMessages(
                await convertMessages(chatHistory.messages || []),
                (refreshed.meta || {}) as Record<string, unknown>,
              ),
              meta: refreshed.meta || {},
              realId: resolvedRealId,
            };
            this.updateWindowVariables(session);
            return session;
          } catch (error) {
            console.warn(
              "Failed to load chat history after realId refresh, fallback to local session:",
              error,
            );
          }
        } else {
          refreshed.realId = undefined;
          this.persistSessionCache();
        }
      }

      return this.getLocalSession(sessionId);
    }

    if (!sessionId || sessionId === "undefined" || sessionId === "null") {
      return this.createEmptySession(Date.now().toString());
    }

    const fromList = this.findSessionByAnyId(sessionId);

    let chatHistory: { messages?: Message[] } | null = null;
    try {
      chatHistory = await api.getChat(sessionId);
    } catch (error) {
      console.warn("Failed to load chat history, fallback to local session:", error);
      this.sessionList = this.sessionList.filter(
        (session) =>
          !this.matchesSessionByAnyId(session, new Set([this.normalizeId(sessionId)])),
      );
      return this.getLocalSession(sessionId);
    }

    const backendMessages = await convertMessages(chatHistory?.messages || []);
    const mergedMessages = this.mergeMessages(
      backendMessages,
      (fromList?.messages as IAgentScopeRuntimeWebUIMessage[]) || [],
    );
    const session: ExtendedSession = {
      id: sessionId,
      name: fromList?.name || sessionId,
      sessionId: fromList?.sessionId || sessionId,
      userId: fromList?.userId || getDefaultUserId(),
      channel: fromList?.channel || DEFAULT_CHANNEL,
      messages: sanitizeUiMessages(
        mergedMessages,
        (fromList?.meta || {}) as Record<string, unknown>,
      ),
      meta: fromList?.meta || {},
    };

    this.updateWindowVariables(session);
    return session;
  }

  async updateSession(session: Partial<IAgentScopeRuntimeWebUISession>) {
    const incomingId = this.normalizeId(session.id);
    const index = this.sessionList.findIndex((candidate) =>
      this.matchesSessionByAnyId(candidate, new Set([incomingId])),
    );

    if (index > -1) {
      const existing = this.sessionList[index] as ExtendedSession;
      const matchedByAlias =
        incomingId &&
        incomingId !== this.normalizeId(existing.id) &&
        this.matchesSessionByAnyId(existing, new Set([incomingId]));
      const mergedMeta = normalizeSessionMeta({
        ...((existing.meta || {}) as Record<string, unknown>),
        ...((((session as any).meta || {}) as Record<string, unknown>) || {}),
      });
      this.sessionList[index] = {
        ...existing,
        ...session,
        id: matchedByAlias ? existing.id : session.id || existing.id,
        realId:
          matchedByAlias && !existing.realId && !isLocalTimestamp(incomingId)
            ? incomingId
            : existing.realId,
        messages: sanitizeUiMessages(
          ((session.messages as IAgentScopeRuntimeWebUIMessage[]) ||
            (existing.messages as IAgentScopeRuntimeWebUIMessage[]) ||
            []) as IAgentScopeRuntimeWebUIMessage[],
          mergedMeta,
        ),
        meta: mergedMeta,
      } as ExtendedSession;

      const updated = this.sessionList[index] as ExtendedSession;
      if (isLocalTimestamp(String(updated.id || "")) && !updated.realId) {
        const tempId = String(updated.id || "");
        this.getSessionList().then(() => {
          const { list, realId } = resolveRealId(this.sessionList, tempId);
          this.sessionList = list;
          if (realId) {
            this.onSessionIdResolved?.(tempId, realId);
          }
        });
      }
      this.persistSessionCache();
    } else {
      const tempId = String(session.id || "");
      await this.getSessionList().then(() => {
        const { list, realId } = resolveRealId(this.sessionList, tempId);
        this.sessionList = list;
        if (realId) {
          this.onSessionIdResolved?.(tempId, realId);
        }
      });
      this.persistSessionCache();
    }

    return [...this.sessionList];
  }

  async createSession(
    session: Partial<IAgentScopeRuntimeWebUISession> & {
      pushMessage?: string;
      pushSource?: { source_user_id: string; source_user_name: string };
      pushSessionId?: string;
      pushConversationKey?: string;
      pushChatId?: string;
      pushTraceId?: string;
      pushIntentType?: string;
      sourceAgentId?: string;
      targetAgentId?: string;
      pushMessageId?: string;
    },
  ) {
    const {
      pushMessage,
      pushSource,
      pushSessionId,
      pushConversationKey,
      pushChatId,
      pushTraceId,
      pushIntentType,
      sourceAgentId,
      targetAgentId,
      pushMessageId,
      ...rest
    } = session;
    rest.id = rest.id || pushChatId || generateLocalSessionId(this.sessionList);

    let messages: IAgentScopeRuntimeWebUIMessage[] = rest.messages ?? [];
    const pushCard = createPushCard(pushMessage);
    if (pushCard) {
      messages = [pushCard];
    }

    const meta = buildPushSessionMeta({
      baseMeta: (rest as any).meta,
      pushSource,
      pushConversationKey,
      pushSessionId,
      pushChatId,
      pushTraceId,
      pushIntentType,
      sourceAgentId,
      targetAgentId,
      pushMessageId,
    });

    const existingIndex = this.findPushSessionIndex(
      pushSource?.source_user_id || "",
      pushConversationKey,
      pushSessionId,
      pushChatId || String(rest.id || ""),
    );
    if (existingIndex > -1) {
      const existing = this.sessionList[existingIndex] as ExtendedSession;
      const updated = mergeExistingPushSession({
        existing,
        name: rest.name as string | undefined,
        meta,
        pushCard,
      });
      this.sessionList.splice(existingIndex, 1);
      this.sessionList.unshift(updated);
      this.updateWindowVariables(updated);
      if (pushCard) this.emitPushSessionUpdated(String(updated.id || ""));
      this.persistSessionCache();
      return [...this.sessionList];
    }

    const extended = createPushSession({
      id: String(rest.id || ""),
      name: rest.name as string | undefined,
      pushSessionId,
      pushChatId,
      messages,
      meta,
    });
    this.updateWindowVariables(extended);
    this.sessionList.unshift(extended);
    if (pushCard) this.emitPushSessionUpdated(String(extended.id || ""));
    this.persistSessionCache();
    return [...this.sessionList];
  }

  async removeSession(session: Partial<IAgentScopeRuntimeWebUISession>) {
    const inputIds = [
      this.normalizeId((session as any)?.id),
      this.normalizeId((session as any)?.realId),
      this.normalizeId((session as any)?.sessionId),
      this.normalizeId((session as any)?.session_id),
    ].filter(Boolean);
    if (!inputIds.length) return [...this.sessionList];

    const inputIdSet = new Set(inputIds);
    const targetIds = new Set<string>(inputIds);

    const existing = this.sessionList.find((candidate) =>
      this.matchesSessionByAnyId(candidate, inputIdSet),
    ) as ExtendedSession | undefined;
    if (existing) {
      const realId = this.normalizeId(existing.realId);
      const existingId = this.normalizeId(existing.id);
      const sessionKey = this.normalizeId(existing.sessionId);
      if (realId) targetIds.add(realId);
      if (existingId) targetIds.add(existingId);
      if (sessionKey) targetIds.add(sessionKey);
    }

    this.markRecentlyDeleted(...Array.from(targetIds));
    this.sessionList = this.sessionList.filter(
      (candidate) => !this.matchesSessionByAnyId(candidate, targetIds),
    );

    targetIds.forEach((id) => this.onSessionRemoved?.(id));
    this.persistSessionCache();

    const deleteId =
      this.normalizeId(existing?.realId) ||
      Array.from(targetIds).find((id) => id && !isLocalTimestamp(id)) ||
      null;
    if (deleteId) {
      try {
        await api.deleteChat(deleteId);
      } catch (error) {
        console.warn(
          "Failed to delete chat from backend, removing locally:",
          error,
        );
      }
    }

    return [...this.sessionList];
  }
}

export { createAssistantTextCardMessage, buildResponseCard };
export default new SessionApi();
