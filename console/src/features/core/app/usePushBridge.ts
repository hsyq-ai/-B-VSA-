import { useEffect } from "react";
import { getApiUrl } from "../../../api/config";
import { getStoredToken } from "../../../components/AuthModal";

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
        if (
          !cancelled &&
          Array.isArray(data.messages) &&
          data.messages.length > 0 &&
          typeof window !== "undefined"
        ) {
          window.dispatchEvent(
            new CustomEvent("copaw-push-session-updated", {
              detail: { count: data.messages.length, ts: Date.now(), source: "messages-pull" },
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
