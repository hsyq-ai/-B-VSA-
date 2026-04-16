export type ActiveLlmCache = {
  provider_id: string;
  model: string;
};

const ACTIVE_LLM_STORAGE = "copaw_active_llm_v1";

const readRaw = (): string | null => {
  if (typeof sessionStorage === "undefined") return null;
  try {
    return sessionStorage.getItem(ACTIVE_LLM_STORAGE);
  } catch {
    return null;
  }
};

export const readCachedActiveLlm = (): ActiveLlmCache | null => {
  const raw = readRaw();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ActiveLlmCache> | null;
    if (!parsed) return null;
    if (typeof parsed.provider_id !== "string") return null;
    if (typeof parsed.model !== "string") return null;
    if (!parsed.provider_id || !parsed.model) return null;
    return { provider_id: parsed.provider_id, model: parsed.model };
  } catch {
    return null;
  }
};

export const writeCachedActiveLlm = (active?: ActiveLlmCache | null): void => {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (!active || !active.provider_id || !active.model) {
      sessionStorage.removeItem(ACTIVE_LLM_STORAGE);
      return;
    }
    sessionStorage.setItem(ACTIVE_LLM_STORAGE, JSON.stringify(active));
  } catch {
    // ignore storage errors
  }
};
