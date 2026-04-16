export interface DashboardSkillTemplate {
  trigger_key: string;
  display_name: string;
  skill?: string;
  enabled?: boolean;
}

export interface DashboardSkillRules {
  default: string[];
  departments: Record<string, string[]>;
}

export interface DashboardSkillRulesResponse {
  rules: DashboardSkillRules;
  templates: DashboardSkillTemplate[];
}

export interface DashboardSkillResolveResponse {
  triggers: string[];
}
