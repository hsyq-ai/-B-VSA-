declare const BASE_URL: string;
declare const TOKEN: string;

/**
 * Get the full API URL with /api prefix
 * @param path - API path (e.g., "/models", "/skills")
 * @returns Full API URL (e.g., "http://localhost:8088/api/models" or "/api/models")
 */
export function getApiUrl(path: string): string {
  let base = BASE_URL || "";
  if (typeof window !== "undefined") {
    const protocol = window.location.protocol;
    if (protocol === "https:" && base.startsWith("http://")) {
      // Avoid mixed-content blocking by forcing same-origin HTTPS.
      base = window.location.origin;
    }
  }
  const apiPrefix = "/api";
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${apiPrefix}${normalizedPath}`;
}

/**
 * Get the API token
 * @returns API token string or empty string
 */
export function getApiToken(): string {
  if (typeof TOKEN !== "undefined" && TOKEN) {
    return TOKEN;
  }
  if (typeof window !== "undefined") {
    const sessionToken = sessionStorage.getItem("copaw_token");
    if (sessionToken) return sessionToken;
    return localStorage.getItem("copaw_token") || "";
  }
  return "";
}
