import { request } from "../request";

const base = "/party/directive-news";

export interface DirectiveNewsWindowItem {
  channel_key: string;
  article_id?: string;
  title: string;
  source: string;
  origin_url?: string;
  published_at?: string;
  summary?: string;
  digest?: string;
  level?: string;
  policy_type?: string;
  suggestion?: string;
  document_label?: string;
  sync_status?: string;
  synced_at?: string;
  sync_error?: string;
}

export interface DirectiveNewsArticleItem {
  id: string;
  channel_key: string;
  title: string;
  source: string;
  origin_url?: string;
  published_at?: string;
  fetched_at?: string;
  summary?: string;
  digest?: string;
  description?: string;
  content_text?: string;
  level?: string;
  policy_type?: string;
  suggestion?: string;
  document_label?: string;
  sync_status?: string;
  synced_at?: string;
}

interface DirectiveNewsWindowsResponse {
  windows?: DirectiveNewsWindowItem[];
  synced_at?: string;
}

interface DirectiveNewsArticlesResponse {
  items?: DirectiveNewsArticleItem[];
  channel?: string;
}

interface DirectiveNewsPromoteResponse {
  item?: unknown;
  duplicate?: boolean;
}

const buildSearch = (params: Record<string, string | number | boolean> = {}) => {
  return new URLSearchParams(
    Object.entries(params).reduce<Record<string, string>>((acc, [key, value]) => {
      acc[key] = String(value);
      return acc;
    }, {}),
  ).toString();
};

export const directiveNewsApi = {
  async listWindows() {
    const res = await request<DirectiveNewsWindowsResponse>(`${base}/windows`);
    return {
      windows: Array.isArray(res?.windows) ? res.windows : [],
      synced_at: res?.synced_at || "",
    };
  },
  async listArticles(params: { channel?: string; limit?: number } = {}) {
    const search = buildSearch(params as Record<string, string | number | boolean>);
    const res = await request<DirectiveNewsArticlesResponse>(
      `${base}/articles${search ? `?${search}` : ""}`,
    );
    return Array.isArray(res?.items) ? res.items : [];
  },
  sync: (payload: { channel?: string; force?: boolean } = {}) =>
    request<DirectiveNewsWindowsResponse>(`${base}/sync`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  promote: (articleId: string) =>
    request<DirectiveNewsPromoteResponse>(`${base}/articles/${encodeURIComponent(articleId)}/promote`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
};
