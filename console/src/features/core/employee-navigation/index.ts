const EMPLOYEE_NAV_KEY_STORAGE = "copaw_employee_nav_key_v1";

const PATH_TO_KEY: Record<string, string> = {
  "/channels": "channels",
  "/admin/channels": "channels",
  "/sessions": "sessions",
  "/admin/sessions": "sessions",
  "/cron-jobs": "cron-jobs",
  "/admin/cron-jobs": "cron-jobs",
  "/heartbeat": "heartbeat",
  "/admin/heartbeat": "heartbeat",
  "/skills": "skills",
  "/admin/skills": "skills",
  "/tools": "tools",
  "/admin/tools": "tools",
  "/mcp": "mcp",
  "/admin/mcp": "mcp",
  "/workspace": "workspace",
  "/admin/workspace": "workspace",
  "/models": "models",
  "/admin/models": "models",
  "/environments": "environments",
  "/admin/environments": "environments",
  "/agent-config": "agent-config",
  "/admin/agent-config": "agent-config",
  "/security": "security",
  "/admin/security": "security",
  "/token-usage": "token-usage",
  "/admin/token-usage": "token-usage",
  "/manager": "archive-manager",
  "/admin/manager": "archive-manager",
  "/archive": "archive-employees",
  "/admin/archive": "archive-employees",
  "/prompt-templates": "prompt-templates",
  "/admin/prompt-templates": "prompt-templates",
  "/digital-expert-templates": "digital-expert-templates",
  "/admin/digital-expert-templates": "digital-expert-templates",
  "/dashboard-skill-templates": "dashboard-skill-templates",
  "/admin/dashboard-skill-templates": "dashboard-skill-templates",
  "/expert-center-skill-templates": "expert-center-skill-templates",
  "/admin/expert-center-skill-templates": "expert-center-skill-templates",
  "/platform-learning": "platform-learning",
  "/admin/platform-learning": "platform-learning",
  "/admin/rooms": "agent-os-rooms",
  "/admin/traces": "agent-os-traces",
  "/admin/artifacts": "agent-os-artifacts",
  "/admin/evals": "agent-os-evals",
};

export const EMPLOYEE_KEY_TO_PATH: Record<string, string> = {
  "secretary-home": "/app/secretary",
  "automation-workbench": "/app/research-experiment",
  "notice-sessions": "/app/sessions",
  "expert-center": "/app/expert-center",
  "employee-center": "/app/employee-center",
  "party-affairs": "/app/party/party-affairs",
  "party-activity-collab": "/app/party/activity-collab",
  "party-organization-care": "/app/party/organization-care",
  "party-learning-coach": "/app/party/learning-coach",
  "party-member-evaluation": "/app/party/member-evaluation",
  "party-branch-ranking": "/app/party/branch-ranking",
  "party-directive-center": "/app/party/directive-center",
  "member-tasks": "/app/member/tasks",
  "member-directives": "/app/member/directives",
  "member-learning": "/app/member/learning",
  "member-growth": "/app/member/growth",
  "member-activity": "/app/member/activity",
  "member-support": "/app/member/support",
  "member-affairs": "/app/member/affairs",
  "party-archive": "/app/party/archive",
};

export const getStoredEmployeeNavKey = (): string => {
  if (typeof window === "undefined") return "";
  return (
    sessionStorage.getItem(EMPLOYEE_NAV_KEY_STORAGE) ||
    localStorage.getItem(EMPLOYEE_NAV_KEY_STORAGE) ||
    ""
  );
};

export const persistEmployeeNavKey = (key: string): void => {
  if (typeof window === "undefined") return;
  const nextKey = String(key || "").trim();
  if (!nextKey) return;
  sessionStorage.setItem(EMPLOYEE_NAV_KEY_STORAGE, nextKey);
  localStorage.setItem(EMPLOYEE_NAV_KEY_STORAGE, nextKey);
};

export const resolveConsoleNavKey = (path: string): string => {
  if (path.startsWith("/app/secretary")) return "secretary-home";
  if (path.startsWith("/app/research-experiment")) return "automation-workbench";
  if (path.startsWith("/app/sessions") || path.startsWith("/app/inbox")) return "notice-sessions";
  if (path.startsWith("/app/member/tasks")) return "member-tasks";
  if (path.startsWith("/app/member/directives")) return "member-directives";
  if (path.startsWith("/app/member/learning")) return "member-learning";
  if (path.startsWith("/app/member/growth")) return "member-growth";
  if (path.startsWith("/app/member/activity")) return "member-activity";
  if (path.startsWith("/app/member/support")) return "member-support";
  if (path.startsWith("/app/member/affairs")) return "member-affairs";
  if (path.startsWith("/app/party/party-affairs")) return "party-affairs";
  if (path.startsWith("/app/party/organization-care")) return "party-organization-care";
  if (path.startsWith("/app/party/activity-collab")) return "party-activity-collab";
  if (path.startsWith("/app/party/learning-coach")) return "party-learning-coach";
  if (path.startsWith("/app/party/member-evaluation")) return "party-member-evaluation";
  if (path.startsWith("/app/party/branch-ranking")) return "party-branch-ranking";
  if (path.startsWith("/app/party/directive-center")) return "party-directive-center";
  if (path.startsWith("/app/party/archive")) return "party-archive";
  if (path.startsWith("/app/profile") || path.startsWith("/app/settings")) {
    return getStoredEmployeeNavKey() || "automation-workbench";
  }
  if (
    path.startsWith("/app/expert/") ||
    path.startsWith("/app/employee/") ||
    path.startsWith("/app/workspace")
  ) {
    return getStoredEmployeeNavKey() || "automation-workbench";
  }
  if (path.startsWith("/admin/chat") || path.startsWith("/chat")) return "chat";
  if (path.startsWith("/profile") || path.startsWith("/admin/profile")) return "chat";
  return PATH_TO_KEY[path] || "chat";
};
