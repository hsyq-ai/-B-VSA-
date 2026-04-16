const toBool = (value: unknown, fallback = false): boolean => {
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
};

export const allowPartyLocalFallback = toBool(
  import.meta.env.VITE_ENABLE_PARTY_LOCAL_FALLBACK,
  false,
);
