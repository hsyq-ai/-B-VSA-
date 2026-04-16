import { useEffect, useMemo, useRef, useState } from "react";

export interface PageAiContextPayload {
  path: string;
  source: string;
  title?: string;
  summary?: string;
  insights?: string[];
  tags?: string[];
  quickPrompts?: string[];
  promptContext?: string;
  ts?: number;
}

type PageAiContextEventDetail =
  | {
      type: "publish";
      payload: PageAiContextPayload;
    }
  | {
      type: "clear";
      path?: string;
    };

const PAGE_AI_CONTEXT_EVENT = "copaw-page-ai-context";
const PAGE_AI_CONTEXT_STORAGE_KEY = "copaw_page_ai_context_v1";

const normalizePath = (path?: string) => String(path || "").trim().split("?")[0] || "";

const parseStoredPageAiContext = (): PageAiContextPayload | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PAGE_AI_CONTEXT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const path = normalizePath((parsed as PageAiContextPayload).path);
    if (!path) return null;
    return {
      ...(parsed as PageAiContextPayload),
      path,
    };
  } catch {
    return null;
  }
};

const emitPageAiContextEvent = (detail: PageAiContextEventDetail) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<PageAiContextEventDetail>(PAGE_AI_CONTEXT_EVENT, { detail }));
};

export const publishPageAiContext = (payload: PageAiContextPayload) => {
  if (typeof window === "undefined") return;
  const nextPayload: PageAiContextPayload = {
    ...payload,
    path: normalizePath(payload.path),
    ts: payload.ts || Date.now(),
  };
  if (!nextPayload.path) return;
  sessionStorage.setItem(PAGE_AI_CONTEXT_STORAGE_KEY, JSON.stringify(nextPayload));
  emitPageAiContextEvent({ type: "publish", payload: nextPayload });
};

export const clearPageAiContext = (path?: string) => {
  if (typeof window === "undefined") return;
  const normalizedPath = normalizePath(path);
  const stored = parseStoredPageAiContext();
  if (!normalizedPath || normalizePath(stored?.path) === normalizedPath) {
    sessionStorage.removeItem(PAGE_AI_CONTEXT_STORAGE_KEY);
  }
  emitPageAiContextEvent({ type: "clear", path: normalizedPath || undefined });
};

export const readStoredPageAiContext = (path?: string): PageAiContextPayload | null => {
  const stored = parseStoredPageAiContext();
  const normalizedPath = normalizePath(path);
  if (!stored) return null;
  if (normalizedPath && normalizePath(stored.path) !== normalizedPath) return null;
  return stored;
};

export const buildPageAiContextPrompt = (payload: PageAiContextPayload | null | undefined): string => {
  if (!payload) return "";
  const sections: string[] = [];
  const summary = String(payload.summary || "").trim();
  if (summary) {
    sections.push(`当前页面实时摘要：${summary}`);
  }
  const insights = Array.isArray(payload.insights)
    ? payload.insights.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  if (insights.length) {
    sections.push(`当前页面补充观察：\n${insights.map((item) => `- ${item}`).join("\n")}`);
  }
  const promptContext = String(payload.promptContext || "").trim();
  if (promptContext) {
    sections.push(`当前页面实时数据：\n${promptContext}`);
  }
  return sections.join("\n");
};

export const usePageAiContextSync = (payload: PageAiContextPayload | null) => {
  const cleanupPathRef = useRef("");

  useEffect(() => {
    if (!payload) return;
    publishPageAiContext(payload);
  }, [payload]);

  useEffect(() => {
    const nextPath = normalizePath(payload?.path);
    cleanupPathRef.current = nextPath;
    return () => {
      if (cleanupPathRef.current) {
        clearPageAiContext(cleanupPathRef.current);
      }
    };
  }, [payload?.path]);
};

export const useCurrentPageAiContext = (currentPath: string) => {
  const normalizedCurrentPath = useMemo(() => normalizePath(currentPath), [currentPath]);
  const [pageContext, setPageContext] = useState<PageAiContextPayload | null>(() => readStoredPageAiContext(normalizedCurrentPath));

  useEffect(() => {
    setPageContext(readStoredPageAiContext(normalizedCurrentPath));
  }, [normalizedCurrentPath]);

  useEffect(() => {
    const handleContextChange = (event: Event) => {
      const detail = (event as CustomEvent<PageAiContextEventDetail>).detail;
      if (!detail) return;
      if (detail.type === "publish") {
        if (normalizePath(detail.payload.path) === normalizedCurrentPath) {
          setPageContext(detail.payload);
        }
        return;
      }
      if (!detail.path || normalizePath(detail.path) === normalizedCurrentPath) {
        setPageContext(null);
      }
    };

    window.addEventListener(PAGE_AI_CONTEXT_EVENT, handleContextChange as EventListener);
    return () => {
      window.removeEventListener(PAGE_AI_CONTEXT_EVENT, handleContextChange as EventListener);
    };
  }, [normalizedCurrentPath]);

  return pageContext && normalizePath(pageContext.path) === normalizedCurrentPath ? pageContext : null;
};
