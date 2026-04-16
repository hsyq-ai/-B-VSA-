export interface ExpertCenterSkillTemplate {
  trigger_key: string;
  display_name: string;
  skill?: string;
  enabled?: boolean;
  department?: string;
}

export interface ExpertCenterSkillRules {
  default: string[];
  departments: Record<string, string[]>;
}

export interface ExpertCenterSkillRulesResponse {
  rules: ExpertCenterSkillRules;
  templates: ExpertCenterSkillTemplate[];
}

export interface ExpertCenterSkillResolveResponse {
  triggers: string[];
}
