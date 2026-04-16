import { useEffect } from "react";
import { getApiUrl } from "../../../api/config";
import { getStoredToken } from "../../../components/AuthModal";

type PulledPushMessage = {
  text?: string;
  intent_type?: string;
  intentType?: string;
  source_user_name?: string;
  sourceUserName?: string;
  source_agent_id?: string;
  sourceAgentId?: string;
  [key: string]: unknown;
};

type PulledProactiveEvent = {
  title?: string;
  summary?: string;
  source?: string;
  level?: string;
  urgency?: number;
  relevance?: number;
  actions?: string[];
  ts?: number;
  [key: string]: unknown;
};

const normalizePushSample = (raw: unknown) => {
  if (!raw) return { text: "", intentType: "", source: "" };
  if (typeof raw === "string") {
    return { text: raw.trim(), intentType: "", source: "" };
  }
  if (typeof raw !== "object") return { text: String(raw), intentType: "", source: "" };
  const msg = raw as PulledPushMessage;
  return {
    text: String(msg.text || "").trim(),
    intentType: String(msg.intent_type || msg.intentType || "").trim(),
    source: String(msg.source_user_name || msg.sourceUserName || msg.source_agent_id || msg.sourceAgentId || "").trim(),
  };
};

const normalizeProactiveEvent = (raw: unknown) => {
  if (!raw || typeof raw !== "object") return null;
  const event = raw as PulledProactiveEvent;
  const title = String(event.title || "主动提醒").trim() || "主动提醒";
  const summary = String(event.summary || "").trim();
  const source = String(event.source || "系统").trim() || "系统";
  const level = String(event.level || "light").trim().toLowerCase() || "light";
  return {
    title,
    summary,
    source,
    level,
    urgency: Number(event.urgency || 0),
    relevance: Number(event.relevance || 0),
    actions: Array.isArray(event.actions) ? event.actions : [],
    ts: Number(event.ts || Date.now()),
  };
};

export const usePushBridge = (authed: boolean, isAdmin: boolean): void => {
  useEffect(() => {
    if (!authed || isAdmin) return;

    let cancelled = false;
    let timer: number | null = null;

    const syncPushMessages = async () => {
      const token = getStoredToken();
      if (!token) return;
      try {
        const response = await fetch(getApiUrl("/messages/pull"), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return;
        const data = (await response.json().catch(() => ({}))) as { messages?: unknown[] };
        let proactiveEvents: Array<Record<string, unknown>> = [];
        try {
          const proactiveResponse = await fetch(getApiUrl("/vsa/proactive-events/pull"), {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (proactiveResponse.ok) {
            const proactiveData = (await proactiveResponse.json().catch(() => ({}))) as { events?: unknown[] };
            if (Array.isArray(proactiveData.events)) {
              proactiveEvents = proactiveData.events
                .map((item) => normalizeProactiveEvent(item))
                .filter(Boolean) as Array<Record<string, unknown>>;
            }
          }
        } catch {
          // ignore proactive pull transient failures
        }
        const messageCount = Array.isArray(data.messages) ? data.messages.length : 0;
        const proactiveCount = proactiveEvents.length;
        if (
          !cancelled &&
          (messageCount > 0 || proactiveCount > 0) &&
          typeof window !== "undefined"
        ) {
          const samples = (data.messages || [])
            .slice(0, 5)
            .map((item) => normalizePushSample(item))
            .filter((item) => item.text || item.intentType || item.source);
          window.dispatchEvent(
            new CustomEvent("copaw-push-session-updated", {
              detail: {
                count: messageCount + proactiveCount,
                messageCount,
                proactiveCount,
                ts: Date.now(),
                source: "messages-pull",
                samples,
                proactiveEvents,
              },
            }),
          );
        }
      } catch {
        // ignore transient pull failures
      }
    };

    void syncPushMessages();
    timer = window.setInterval(() => {
      void syncPushMessages();
    }, 15000);

    const handleFocus = () => {
      void syncPushMessages();
    };
    window.addEventListener("focus", handleFocus);

    return () => {
      cancelled = true;
      if (timer !== null) {
        window.clearInterval(timer);
      }
      window.removeEventListener("focus", handleFocus);
    };
  }, [authed, isAdmin]);
};
