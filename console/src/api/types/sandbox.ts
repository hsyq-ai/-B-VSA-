export interface SandboxLastActive {
  path: string;
  timestamp: number;
  text: string;
}

export interface SandboxContainerInfo {
  container_id: string;
  name: string;
  image: string;
  role: string;
  user_id: string;
  managed: boolean;
  status: string;
  running: boolean;
  restarting: boolean;
  exit_code: number;
  started_at: string;
  finished_at: string;
  health: string;
  ports: string[];
  last_active: SandboxLastActive;
  logs_tail: string;
  working_dir: string;
}

export interface SandboxOverviewResponse {
  items: SandboxContainerInfo[];
  total: number;
}
