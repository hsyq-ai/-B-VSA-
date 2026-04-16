import { request } from "../request";
import type {
  ResearchExperimentJobBusinessStatePayload,
  ResearchExperimentJobCreatePayload,
  ResearchExperimentJobListResponse,
  ResearchExperimentJobResponse,
} from "../types";

export const researchExperimentApi = {
  list: (mineOnly = true) => {
    const search = new URLSearchParams({ mine_only: String(mineOnly) });
    return request<ResearchExperimentJobListResponse>(
      `/research/experiment-jobs?${search.toString()}`,
    );
  },

  create: (payload: ResearchExperimentJobCreatePayload) =>
    request<ResearchExperimentJobResponse>("/research/experiment-jobs", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  get: (jobId: string) =>
    request<ResearchExperimentJobResponse>(`/research/experiment-jobs/${encodeURIComponent(jobId)}`),

  run: (jobId: string) =>
    request<ResearchExperimentJobResponse>(
      `/research/experiment-jobs/${encodeURIComponent(jobId)}/run`,
      {
        method: "POST",
      },
    ),

  updateBusinessState: (jobId: string, payload: ResearchExperimentJobBusinessStatePayload) =>
    request<ResearchExperimentJobResponse>(
      `/research/experiment-jobs/${encodeURIComponent(jobId)}/business-state`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),

  remove: (jobId: string) =>
    request<ResearchExperimentJobResponse>(`/research/experiment-jobs/${encodeURIComponent(jobId)}`, {
      method: "DELETE",
    }),
};
