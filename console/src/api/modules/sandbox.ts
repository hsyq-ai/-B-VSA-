import { request } from "../request";
import type { SandboxOverviewResponse } from "../types";

export const sandboxApi = {
  getOverview: () => request<SandboxOverviewResponse>("/sandbox/overview"),
  getSandboxOverview: () => request<SandboxOverviewResponse>("/sandbox/overview"),
};
