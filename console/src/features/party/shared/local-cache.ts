export const loadLocalList = <T>(storageKey: string): T[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as T[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveLocalList = <T>(storageKey: string, items: T[]): void => {
  if (typeof window === "undefined") return;
  localStorage.setItem(storageKey, JSON.stringify(items));
};
