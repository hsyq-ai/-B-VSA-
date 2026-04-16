export * from "./types";

export { request } from "./request";

export { getApiUrl, getApiToken } from "./config";

import { rootApi } from "./modules/root";
import { channelApi } from "./modules/channel";
import { heartbeatApi } from "./modules/heartbeat";
import { cronJobApi } from "./modules/cronjob";
import { chatApi, sessionApi } from "./modules/chat";
import { envApi } from "./modules/env";
import { providerApi } from "./modules/provider";
import { skillApi } from "./modules/skill";
import { agentApi } from "./modules/agent";
import { workspaceApi } from "./modules/workspace";
import { localModelApi } from "./modules/localModel";
import { ollamaModelApi } from "./modules/ollamaModel";
import { mcpApi } from "./modules/mcp";
import { tokenUsageApi } from "./modules/tokenUsage";
import { toolsApi } from "./modules/tools";
import { securityApi } from "./modules/security";
import { authApi } from "./modules/auth";
import { promptTemplateApi } from "./modules/promptTemplates";
import { dashboardSkillApi } from "./modules/dashboardSkills";
import { expertCenterSkillApi } from "./modules/expertCenterSkills";
import { platformLearningApi } from "./modules/platformLearning";
import { agentOsApi } from "./modules/agentOs";
import { sandboxApi } from "./modules/sandbox";

export const api = {
  // Root
  ...rootApi,

  // Channels
  ...channelApi,

  // Heartbeat
  ...heartbeatApi,

  // Cron Jobs
  ...cronJobApi,

  // Chats
  ...chatApi,

  // Sessions（Legacy aliases）
  ...sessionApi,

  // Environment Variables
  ...envApi,

  // Providers
  ...providerApi,

  // Agent
  ...agentApi,

  // Skills
  ...skillApi,

  // Workspace
  ...workspaceApi,

  // Local Models
  ...localModelApi,

  // Ollama Models
  ...ollamaModelApi,

  // MCP Clients
  ...mcpApi,

  // Token Usage
  ...tokenUsageApi,
  // Tools
  ...toolsApi,

  // Security
  ...securityApi,

  // Auth
  ...authApi,

  // Prompt Templates
  ...promptTemplateApi,

  // Dashboard Skills
  ...dashboardSkillApi,

  // Expert Center Skills
  ...expertCenterSkillApi,

  // Platform Learning
  ...platformLearningApi,

  // Agent OS
  ...agentOsApi,

  // Sandbox
  ...sandboxApi,
};

export default api;
