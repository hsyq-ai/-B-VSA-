interface SecretarySessionStorageApi {
  secretaryBootstrappedEpochKey: string;
  secretaryInboxSeenKey: string;
  secretarySessionStorageKey: string;
  secretaryWelcomeEpochKey: string;
  clearStoredSecretarySessionId: (epoch?: string) => void;
  clearStoredSecretaryWelcomeEpoch: () => void;
  getSecretarySessionStorageKeyByEpoch: (epoch: string) => string;
  getStoredSecretarySessionId: (epoch?: string) => string;
  getStoredSecretaryWelcomeEpoch: () => string;
  persistSecretarySessionId: (sessionId: string, epoch?: string) => void;
  persistSecretaryWelcomeEpoch: (epoch: string) => void;
}

export const createSecretarySessionStorage = (userId: string): SecretarySessionStorageApi => {
  const normalizedUserId = String(userId || "default").trim() || "default";
  const secretaryBootstrappedEpochKey = `copaw_secretary_bootstrapped_epoch_${normalizedUserId}`;
  const secretarySessionStorageKey = `copaw_secretary_session_${normalizedUserId}`;
  const secretaryWelcomeEpochKey = `copaw_secretary_welcome_epoch_${normalizedUserId}`;
  const secretaryInboxSeenKey = `copaw_secretary_inbox_seen_${normalizedUserId}`;

  const getSecretarySessionStorageKeyByEpoch = (epoch: string) =>
    `copaw_secretary_session_${normalizedUserId}_${String(epoch || "").trim()}`;

  const persistSecretarySessionId = (sessionId: string, epoch?: string) => {
    if (typeof window === "undefined") return;
    const nextId = String(sessionId || "").trim();
    if (!nextId) return;
    sessionStorage.setItem(secretarySessionStorageKey, nextId);
    localStorage.setItem(secretarySessionStorageKey, nextId);
    const loginEpoch = String(epoch || "").trim();
    if (!loginEpoch) return;
    const scopedKey = getSecretarySessionStorageKeyByEpoch(loginEpoch);
    sessionStorage.setItem(scopedKey, nextId);
    localStorage.setItem(scopedKey, nextId);
  };

  const clearStoredSecretarySessionId = (epoch?: string) => {
    if (typeof window === "undefined") return;
    sessionStorage.removeItem(secretarySessionStorageKey);
    localStorage.removeItem(secretarySessionStorageKey);
    const loginEpoch = String(epoch || "").trim();
    if (!loginEpoch) return;
    const scopedKey = getSecretarySessionStorageKeyByEpoch(loginEpoch);
    sessionStorage.removeItem(scopedKey);
    localStorage.removeItem(scopedKey);
  };

  const getStoredSecretarySessionId = (epoch?: string): string => {
    if (typeof window === "undefined") return "";
    const loginEpoch = String(epoch || "").trim();
    const globalStored =
      sessionStorage.getItem(secretarySessionStorageKey) ||
      localStorage.getItem(secretarySessionStorageKey) ||
      "";
    if (!loginEpoch) return globalStored;
    const scopedKey = getSecretarySessionStorageKeyByEpoch(loginEpoch);
    const scoped = sessionStorage.getItem(scopedKey) || localStorage.getItem(scopedKey) || "";
    return scoped || globalStored;
  };

  const getStoredSecretaryWelcomeEpoch = (): string => {
    if (typeof window === "undefined") return "";
    return (
      sessionStorage.getItem(secretaryWelcomeEpochKey) ||
      localStorage.getItem(secretaryWelcomeEpochKey) ||
      ""
    );
  };

  const persistSecretaryWelcomeEpoch = (epoch: string) => {
    if (typeof window === "undefined") return;
    const nextEpoch = String(epoch || "").trim();
    if (!nextEpoch) return;
    sessionStorage.setItem(secretaryWelcomeEpochKey, nextEpoch);
    localStorage.setItem(secretaryWelcomeEpochKey, nextEpoch);
  };

  const clearStoredSecretaryWelcomeEpoch = () => {
    if (typeof window === "undefined") return;
    sessionStorage.removeItem(secretaryWelcomeEpochKey);
    localStorage.removeItem(secretaryWelcomeEpochKey);
  };

  return {
    secretaryBootstrappedEpochKey,
    secretaryInboxSeenKey,
    secretarySessionStorageKey,
    secretaryWelcomeEpochKey,
    clearStoredSecretarySessionId,
    clearStoredSecretaryWelcomeEpoch,
    getSecretarySessionStorageKeyByEpoch,
    getStoredSecretarySessionId,
    getStoredSecretaryWelcomeEpoch,
    persistSecretarySessionId,
    persistSecretaryWelcomeEpoch,
  };
};
