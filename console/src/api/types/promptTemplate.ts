export interface PromptTemplate {
  id: string;
  trigger_key: string;
  display_name: string;
  prompt_text: string;
  skill?: string;
  session_name?: string;
  template_type?: "scene" | "skill";
  category?: string;
  agent_key?: string;
  agent_name?: string;
  source?: string;
  version?: number;
  runtime_profile?: "standard" | "isolated";
  expert_profile?: string;
  enabled: boolean;
  updated_at?: number;
}

export interface PromptTemplateListResponse {
  items: PromptTemplate[];
  total: number;
}

export interface PromptTemplateResolveResponse {
  found: boolean;
  template: PromptTemplate | null;
}

export interface DigitalEmployeeTemplateItem {
  id: string;
  trigger_key: string;
  display_name: string;
  session_name?: string;
  skill?: string;
  runtime_profile?: "standard" | "isolated";
}

export interface DigitalEmployeeGroup {
  agent_key: string;
  agent_name: string;
  templates: DigitalEmployeeTemplateItem[];
}

export interface DigitalEmployeeListResponse {
  items: DigitalEmployeeGroup[];
  total: number;
}

export interface PromptTemplateScanFinding {
  rule_id: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  description: string;
  snippet: string;
}

export interface PromptTemplateScanResponse {
  risk_level: "HIGH" | "MEDIUM" | "LOW";
  findings: PromptTemplateScanFinding[];
  recommend_runtime_profile: "standard" | "isolated";
  require_approval: boolean;
}
