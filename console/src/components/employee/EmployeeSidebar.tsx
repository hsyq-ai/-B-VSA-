import { Layout, Menu, Button, type MenuProps } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Brain,
  PanelLeftClose,
  PanelLeftOpen,
  MessagesSquare,
  ClipboardList,
  ClipboardCheck,
  ClipboardCheck as ClipboardCheckIcon,
  LayoutDashboard,
  FileText,
  HeartHandshake,
  Building2,
  UsersRound,
  Bot,
  Zap,
  Target,
  ShieldCheck,
  BookOpen,
  Trophy,
  Calendar,
} from "lucide-react";
import { authApi, type AdminUserRow } from "../../api/modules/auth";
import { agentOsApi } from "../../api/modules/agentOs";
import { promptTemplateApi } from "../../api/modules/promptTemplates";
import { expertCenterSkillApi } from "../../api/modules/expertCenterSkills";
import styles from "../../layouts/index.module.less";
import {
  EMPLOYEE_KEY_TO_PATH,
  persistEmployeeNavKey,
} from "../../features/core/employee-navigation";
import { type SceneConfigItem, launchScene } from "../../features/core/scene/scene-launch";

const { Sider } = Layout;

const DEFAULT_OPEN_KEYS = [
  "contact-center-group",
  "employee-avatar-group",
  "digital-expert-group",
  "dashboard-group",
  "research-plan-group",
  "research-tools-group",
  "party-supervision-group-v2",
  "party-governance-group-v2",
  "party-collab-care-group-v2",
  "member-workbench-group",
  "member-learning-group",
  "member-collab-group",
];

const normalizeMenuLabel = (value: unknown): string =>
  String(value ?? "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const logSidebarDebug = (event: string, payload?: Record<string, unknown>) => {
  console.info(`[EmployeeSidebar] ${event}`, payload || {});
};

const buildNavLabel = (title: string, _subtitle?: string) => (
  <div style={{ display: "flex", alignItems: "center", minHeight: 28 }}>
    <span style={{ fontWeight: 600 }}>{title}</span>
  </div>
);

const BASE_SCENES: Record<string, SceneConfigItem> = {
  "dashboard-doc": {
    label: "公文写作",
    triggerKey: "dashboard-doc",
    sessionName: "公文写作",
  },
  "dashboard-party": {
    label: "党建学习",
    triggerKey: "dashboard-party",
    sessionName: "党建学习",
  },
  "dashboard-psy": {
    label: "心理辅导",
    triggerKey: "dashboard-psy",
    sessionName: "心理辅导",
  },
  "dashboard-research-assistant": {
    label: "科研助理",
    triggerKey: "dashboard-research-assistant",
    sessionName: "科研助理",
  },
  "dashboard-paper-review": {
    label: "论文解读",
    triggerKey: "dashboard-paper-review",
    sessionName: "论文解读",
  },
  "dashboard-research-topic": {
    label: "选题研判",
    triggerKey: "dashboard-research-topic",
    sessionName: "选题研判",
    skill: "file_reader",
    templateType: "scene",
  },
  "dashboard-research-quality": {
    label: "质量评估",
    triggerKey: "dashboard-research-quality",
    sessionName: "质量评估",
    skill: "file_reader",
    templateType: "scene",
  },
  "dashboard-research-brainstorm": {
    label: "头脑风暴",
    triggerKey: "dashboard-research-brainstorm",
    sessionName: "头脑风暴",
    skill: "file_reader",
    templateType: "scene",
  },
  "dashboard-research-search": {
    label: "知识检索",
    triggerKey: "dashboard-research-search",
    sessionName: "知识检索",
    skill: "file_reader",
    templateType: "scene",
  },
  "dashboard-research-data": {
    label: "数据分析",
    triggerKey: "dashboard-research-data",
    sessionName: "数据分析",
    skill: "file_reader",
    templateType: "scene",
  },
  "dashboard-research-writing": {
    label: "科研创作",
    triggerKey: "dashboard-research-writing",
    sessionName: "科研创作",
    skill: "docx",
    templateType: "scene",
  },
  "dashboard-research-paper-gen": {
    label: "论文生成",
    triggerKey: "dashboard-research-paper-gen",
    sessionName: "论文生成",
    skill: "file_reader",
    templateType: "scene",
  },
  "dashboard-research-tracking": {
    label: "业界跟踪",
    triggerKey: "dashboard-research-tracking",
    sessionName: "业界跟踪",
    skill: "news",
    templateType: "scene",
  },
  "enterprise-report": {
    label: "工作汇报",
    triggerKey: "enterprise-report",
    sessionName: "企业工作汇报",
  },
  "enterprise-assign": {
    label: "任务下达",
    triggerKey: "enterprise-assign",
    sessionName: "任务下达",
  },
  "contact-collab": {
    label: "协同任务",
    triggerKey: "contact-collab",
    sessionName: "协同任务",
  },
  "contact-event": {
    label: "活动事项",
    triggerKey: "contact-event",
    sessionName: "活动事项",
  },
  "contact-meeting": {
    label: "通知会议",
    triggerKey: "contact-meeting",
    sessionName: "会议通知",
  },
  "contact-vote": {
    label: "投票",
    triggerKey: "contact-vote",
    sessionName: "投票",
  },
  "digital-strategy": {
    label: "战略专家",
    triggerKey: "digital-strategy",
    sessionName: "数字专家·战略专家",
    templateType: "skill",
    agentKey: "digital-expert",
    runtimeProfile: "isolated",
  },
  "digital-product": {
    label: "产品专家",
    triggerKey: "digital-product",
    sessionName: "数字专家·产品专家",
    templateType: "skill",
    agentKey: "digital-expert",
    runtimeProfile: "isolated",
  },
  "digital-legal": {
    label: "法务专家",
    triggerKey: "digital-legal",
    sessionName: "数字专家·法务专家",
    templateType: "skill",
    agentKey: "digital-expert",
    runtimeProfile: "isolated",
  },
  "digital-rd-assistant": {
    label: "研发助理",
    triggerKey: "digital-rd-assistant",
    sessionName: "数字专家·研发助理",
    templateType: "skill",
    agentKey: "digital-expert",
    runtimeProfile: "isolated",
  },
  "digital-marketing": {
    label: "市场专家",
    triggerKey: "digital-marketing",
    sessionName: "数字专家·市场专家",
    templateType: "skill",
    agentKey: "digital-expert",
    runtimeProfile: "isolated",
  },
  "digital-finance": {
    label: "财务专家",
    triggerKey: "digital-finance",
    sessionName: "数字专家·财务专家",
    templateType: "skill",
    agentKey: "digital-expert",
    runtimeProfile: "isolated",
  },
  "digital-data-analyst": {
    label: "数据分析师",
    triggerKey: "digital-data-analyst",
    sessionName: "数字专家·数据分析师",
    templateType: "skill",
    agentKey: "digital-expert",
    runtimeProfile: "isolated",
  },
  "digital-ai-researcher": {
    label: "AI 研究员",
    triggerKey: "digital-ai-researcher",
    sessionName: "数字专家·AI 研究员",
    templateType: "skill",
    agentKey: "digital-expert",
    runtimeProfile: "isolated",
  },
  "digital-test-engineer": {
    label: "测试工程师",
    triggerKey: "digital-test-engineer",
    sessionName: "数字专家·测试工程师",
    templateType: "skill",
    agentKey: "digital-expert",
    runtimeProfile: "isolated",
  },
  "digital-ops-engineer": {
    label: "运维工程师",
    triggerKey: "digital-ops-engineer",
    sessionName: "数字专家·运维工程师",
    templateType: "skill",
    agentKey: "digital-expert",
    runtimeProfile: "isolated",
  },
  "digital-research-secretary": {
    label: "课题秘书",
    triggerKey: "digital-research-secretary",
    sessionName: "数字专家·课题秘书",
    templateType: "skill",
    agentKey: "digital-expert",
    runtimeProfile: "isolated",
  },
  "digital-literature-intel": {
    label: "文献情报员",
    triggerKey: "digital-literature-intel",
    sessionName: "数字专家·文献情报员",
    templateType: "skill",
    agentKey: "digital-expert",
    runtimeProfile: "isolated",
  },
  "digital-experiment-steward": {
    label: "实验管家",
    triggerKey: "digital-experiment-steward",
    sessionName: "数字专家·实验管家",
    templateType: "skill",
    agentKey: "digital-expert",
    runtimeProfile: "isolated",
  },
  "digital-data-specialist": {
    label: "数据专员",
    triggerKey: "digital-data-specialist",
    sessionName: "数字专家·数据专员",
    templateType: "skill",
    agentKey: "digital-expert",
    runtimeProfile: "isolated",
  },
};

const DEFAULT_DIGITAL_TRIGGER_KEYS = [
  "digital-research-secretary",
  "digital-literature-intel",
  "digital-experiment-steward",
  "digital-data-specialist",
];

const EXPERT_FALLBACK_BY_DEPT: Record<string, string[]> = {
  科研部: [
    "digital-research-secretary",
    "digital-literature-intel",
    "digital-experiment-steward",
    "digital-data-specialist",
  ],
  研发部: [
    "digital-rd-solution",
    "digital-rd-architecture",
    "digital-rd-quality",
    "digital-rd-ops-release",
  ],
  法务部: [
    "digital-legal-contract",
    "digital-legal-compliance",
    "digital-legal-policy",
    "digital-legal-dispute",
  ],
  财务部: [
    "digital-finance-budget",
    "digital-finance-cost",
    "digital-finance-report",
    "digital-finance-tax",
  ],
  行政部: [
    "digital-admin-document",
    "digital-admin-meeting",
    "digital-admin-policy",
    "digital-admin-procurement",
  ],
  品牌运营部: [
    "digital-brand-planning",
    "digital-brand-content",
    "digital-brand-campaign",
    "digital-brand-opinion",
  ],
  总裁办: [
    "digital-exec-strategy",
    "digital-exec-review",
    "digital-exec-supervision",
    "digital-exec-briefing",
  ],
};

const EXPERT_LABELS: Record<string, string> = {
  "digital-research-secretary": "课题秘书",
  "digital-literature-intel": "文献情报员",
  "digital-experiment-steward": "实验管家",
  "digital-data-specialist": "数据专员",
  "digital-rd-solution": "技术方案专家",
  "digital-rd-architecture": "架构评审专家",
  "digital-rd-quality": "测试质量专家",
  "digital-rd-ops-release": "发布运维专家",
  "digital-legal-contract": "合同审查专家",
  "digital-legal-compliance": "合规风控专家",
  "digital-legal-policy": "制度条款专家",
  "digital-legal-dispute": "纠纷应对专家",
  "digital-finance-budget": "预算管理专家",
  "digital-finance-cost": "成本分析专家",
  "digital-finance-report": "报表分析专家",
  "digital-finance-tax": "税务筹划专家",
  "digital-admin-document": "公文流转专家",
  "digital-admin-meeting": "会议会务专家",
  "digital-admin-policy": "制度执行专家",
  "digital-admin-procurement": "采购协同专家",
  "digital-brand-planning": "品牌策划专家",
  "digital-brand-content": "内容运营专家",
  "digital-brand-campaign": "活动投放专家",
  "digital-brand-opinion": "舆情分析专家",
  "digital-exec-strategy": "战略分析专家",
  "digital-exec-review": "经营复盘专家",
  "digital-exec-supervision": "跨部门督办专家",
  "digital-exec-briefing": "高管简报专家",
};

const RESEARCH_PLAN_KEYS = [
  "dashboard-research-topic",
  "dashboard-research-quality",
  "dashboard-research-brainstorm",
];

const RESEARCH_TOOLS_KEYS = [
  "dashboard-research-search",
  "dashboard-research-data",
  "dashboard-research-writing",
  "dashboard-research-paper-gen",
  "dashboard-research-tracking",
];

const RESEARCH_PLAN_SET = new Set(RESEARCH_PLAN_KEYS);
const RESEARCH_TOOLS_SET = new Set(RESEARCH_TOOLS_KEYS);

interface EmployeeSidebarProps {
  selectedKey: string;
}

export default function EmployeeSidebar({ selectedKey }: EmployeeSidebarProps) {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [openKeys, setOpenKeys] = useState<string[]>(DEFAULT_OPEN_KEYS);
  const [departments, setDepartments] = useState<string[]>([]);
  const [deptUsers, setDeptUsers] = useState<Record<string, AdminUserRow[]>>({});
  const [currentUserName, setCurrentUserName] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentUserRole, setCurrentUserRole] = useState("");
  const [digitalGroups, setDigitalGroups] = useState<
    Array<{
      agent_key: string;
      agent_name: string;
      templates: Array<{
        id: string;
        trigger_key: string;
        display_name: string;
        session_name?: string;
        skill?: string;
        runtime_profile?: "standard" | "isolated";
      }>;
    }>
  >([]);
  const [expertAllowed, setExpertAllowed] = useState<string[]>(DEFAULT_DIGITAL_TRIGGER_KEYS);

  const currentDept =
    sessionStorage.getItem("copaw_department") ||
    localStorage.getItem("copaw_department") ||
    "";
  const isOrgAdmin = currentUserRole === "admin" || currentDept === "组织部" || currentDept === "管理员";
  const isSecretary = currentDept === "总裁办";
  // 避免未使用变量警告 - isOrgAdmin 在条件渲染中使用
  void isOrgAdmin;
  const currentActorName = currentUserName || currentDept || currentUserId || "当前员工";

  const buildEmployeeAgentPrompt = (args: {
    department: string;
    employee: string;
    actor: string;
  }) =>
    `我是${args.actor}，不是${args.employee}本人。现在我要和${args.employee}的数字分身对话。请你直接以“${args.employee}的数字分身”身份向我回应，先简洁说明你能代表${args.employee}提供哪些档案事实信息，以及如果我要留言、通知或交办事项，应该如何转达给${args.employee}。不要欢迎${args.employee}回来，也不要把我当成${args.employee}本人。`;

  useEffect(() => {
    let canceled = false;
    const loadCurrentUser = async () => {
      try {
        const me = await authApi.getMe();
        if (canceled) return;
        setCurrentUserName(String(me.name || ""));
        setCurrentUserId(String(me.user_id || ""));
        setCurrentUserRole(String(me.role || "employee"));
      } catch {
        if (canceled) return;
        setCurrentUserName("");
        setCurrentUserId("");
        setCurrentUserRole("");
      }
    };
    loadCurrentUser();
    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    let canceled = false;
    const fallbackDept = String(currentDept || "").trim();
    const fallbackName =
      String(
        currentUserName ||
          sessionStorage.getItem("copaw_user_name") ||
          localStorage.getItem("copaw_user_name") ||
          "",
      ).trim() || "当前员工";
    const fallbackUserId =
      String(
        currentUserId ||
          sessionStorage.getItem("copaw_user_id") ||
          localStorage.getItem("copaw_user_id") ||
          "",
      ).trim() || "local-self";

    const applyFallbackUsers = (reason: string) => {
      if (!fallbackDept || canceled) return;
      const fallbackUsers: Record<string, AdminUserRow[]> = {
        [fallbackDept]: [
          {
            id: Number(fallbackUserId) || -1,
            name: fallbackName,
            phone: "",
            role: "employee",
            status: "active",
            profile_id: Number(fallbackUserId) || -1,
            created_at: "",
            department: fallbackDept,
            position: "",
          },
        ],
      };
      setDepartments([fallbackDept]);
      setDeptUsers(fallbackUsers);
      logSidebarDebug("loadDepartments:fallback", {
        reason,
        fallbackDept,
        fallbackUserId,
        fallbackName,
      });
    };

    const loadDepartments = async () => {
      try {
        const res = await agentOsApi.listActiveUsers();
        const allUsers: AdminUserRow[] = (res.items || []).map((u: any) => ({
          id: Number(u?.user_id) || -1,
          name: String(u?.name || "").trim(),
          phone: "",
          role: "employee",
          status: "active",
          profile_id: Number(u?.user_id) || -1,
          created_at: "",
          department: String(u?.department || "").trim(),
          position: String(u?.position || "").trim(),
        }));

        const deptMap: Record<string, AdminUserRow[]> = {};
        allUsers.forEach((u) => {
          const dept = String(u.department || "").trim();
          if (!dept || dept === "管理员") return;
          if (!deptMap[dept]) deptMap[dept] = [];
          deptMap[dept].push(u);
        });
        const list = Object.keys(deptMap).sort();
        if (canceled) return;
        setDepartments(list);
        setDeptUsers(deptMap);
        logSidebarDebug("loadDepartments:success", {
          totalUsers: allUsers.length,
          departmentCount: list.length,
          departments: list,
        });
        if (!list.length) {
          applyFallbackUsers("empty-response");
        }
      } catch (err) {
        console.warn("Failed to load departments:", err);
        applyFallbackUsers("request-failed");
      }
    };
    loadDepartments();
    return () => {
      canceled = true;
    };
  }, [currentDept, currentUserId, currentUserName]);

  useEffect(() => {
    let canceled = false;
    const loadDigitalEmployees = async () => {
      try {
        let retries = 0;
        const maxRetries = 3;
        while (true) {
          try {
            let res = await promptTemplateApi.listDigitalEmployees();
            let items = Array.isArray(res?.items) ? res.items : [];
            if (!items.length && currentDept) {
              await expertCenterSkillApi.resolveExpertCenterSkills(currentDept || "");
              res = await promptTemplateApi.listDigitalEmployees();
              items = Array.isArray(res?.items) ? res.items : [];
            }
            if (!canceled) {
              setDigitalGroups(items);
              logSidebarDebug("loadDigitalEmployees:success", {
                currentDept,
                groupCount: items.length,
                templateCount: items.reduce(
                  (sum, group) => sum + (Array.isArray(group.templates) ? group.templates.length : 0),
                  0,
                ),
              });
            }
            return;
          } catch (err) {
            retries += 1;
            if (retries <= maxRetries) {
              await new Promise((r) => setTimeout(r, 240 * retries));
              continue;
            }
            throw err;
          }
        }
      } catch (err) {
        console.warn("Failed to load digital employees:", err);
        if (!canceled) {
          setDigitalGroups([]);
          logSidebarDebug("loadDigitalEmployees:failed", {
            currentDept,
            error: err instanceof Error ? err.message : String(err || ""),
          });
        }
      }
    };
    loadDigitalEmployees();
    return () => {
      canceled = true;
    };
  }, [currentDept]);

  useEffect(() => {
    let canceled = false;
    const loadExpertRules = async () => {
      try {
        if (!canceled) {
          setExpertAllowed(EXPERT_FALLBACK_BY_DEPT[currentDept] || []);
        }
        const res = await expertCenterSkillApi.resolveExpertCenterSkills(currentDept || "");
        if (!canceled) {
          const list = Array.isArray(res?.triggers) ? res.triggers.map(String) : [];
          if (list.length > 0) {
            setExpertAllowed(list);
          }
        }
      } catch (err) {
        console.warn("Failed to load expert center rules:", err);
      }
    };
    loadExpertRules();
    return () => {
      canceled = true;
    };
  }, [currentDept]);

  const enterpriseScenes = useMemo(() => {
    const config: Record<string, SceneConfigItem> = {};
    departments.forEach((dept, idx) => {
      const users = deptUsers[dept] || [];
      users.forEach((u, uidx) => {
        const empKey = `enterprise-dept-emp-${idx}-${uidx}`;
        const targetName =
          normalizeMenuLabel(u.name) || normalizeMenuLabel(dept) || `员工${uidx + 1}`;
        const targetUserId = String((u as any).user_id || u.id || "").trim();
        config[empKey] = {
          label: `${targetName} 数字分身`,
          triggerKey: "org-dept-staff",
          sessionName: `${targetName} 数字分身会话`,
          prompt: buildEmployeeAgentPrompt({
            department: dept,
            employee: targetName,
            actor: currentUserName || currentActorName,
          }),
          context: {
            department: dept,
            employee: targetName,
            target_name: targetName,
            target_user_name: targetName,
            target_type: "employee",
            scene_target_name: targetName,
            scene_target_user_name: targetName,
            scene_target_user_id: targetUserId,
            scene_target_profile_id: targetUserId,
            current_user_name: currentUserName,
            current_user_id: currentUserId,
            scene_actor_name: currentUserName || currentActorName,
            scene_actor_user_name: currentUserName || currentActorName,
            scene_actor_user_id: currentUserId,
            scene_actor_profile_id: currentUserId,
          },
          skill: "employee_agent_link",
          templateType: "scene",
        };
      });
    });
    return config;
  }, [currentActorName, currentUserId, currentUserName, departments, deptUsers]);

  const digitalTemplateEntries = useMemo(
    () => {
      const allowed = new Set(expertAllowed);
      const shouldFilter = true;
      const seen = new Set<string>();
      const entries: Array<{ key: string; label: string; scene: SceneConfigItem }> = [];

      digitalGroups.forEach((group) => {
        (group.templates || []).forEach((tmpl) => {
          const triggerKey = String(tmpl.trigger_key || "").trim();
          if (!triggerKey) return;
          if (shouldFilter && !allowed.has(triggerKey)) return;
          if (seen.has(triggerKey)) return;
          seen.add(triggerKey);
          const displayName = normalizeMenuLabel(tmpl.display_name);
          const agentName = normalizeMenuLabel(group.agent_name);
          const fallbackLabel = displayName || agentName || "虚拟员工";
          const sceneKey = `digital-scene-${triggerKey}`;
          entries.push({
            key: sceneKey,
            label: fallbackLabel,
            scene: {
              label: fallbackLabel,
              triggerKey,
              sessionName:
                String(tmpl.session_name || "").trim() ||
                `数字专家·${displayName || agentName || "虚拟员工"}`,
              skill: "",
              templateType: "skill",
              agentKey: group.agent_key || "digital-expert",
              runtimeProfile: tmpl.runtime_profile || "isolated",
              context: {
                target_type: "expert",
                expert_id: String(tmpl.id || "").trim() || triggerKey,
                expert_name: fallbackLabel,
                expert_trigger_key: triggerKey,
                expert_template_skill: String(tmpl.skill || "").trim(),
                scene_actor_name: currentActorName,
                scene_actor_user_name: currentActorName,
                scene_actor_user_id: currentUserId,
                agent_key: group.agent_key || "digital-expert",
                agent_name: group.agent_name || "数字专家",
                runtime_profile: tmpl.runtime_profile || "isolated",
              },
            },
          });
        });
      });

      const fallbackTriggers = expertAllowed;
      fallbackTriggers.forEach((triggerKey) => {
        const base =
          BASE_SCENES[triggerKey] ||
          Object.values(BASE_SCENES).find((item) => item.triggerKey === triggerKey);
        const fallbackLabel = normalizeMenuLabel(EXPERT_LABELS[triggerKey]) || triggerKey;
        const fallbackScene =
          base ||
          ({
            label: fallbackLabel,
            triggerKey,
            sessionName: `数字专家·${fallbackLabel}`,
            skill: "",
            templateType: "skill",
            agentKey: "digital-expert",
            runtimeProfile: "isolated",
            context: {
              target_type: "expert",
              expert_id: triggerKey,
              expert_name: fallbackLabel,
              expert_trigger_key: triggerKey,
              expert_template_skill: "",
              scene_actor_name: currentActorName,
              scene_actor_user_name: currentActorName,
              scene_actor_user_id: currentUserId,
              agent_key: "digital-expert",
              agent_name: "数字专家",
              runtime_profile: "isolated",
            },
          } as SceneConfigItem);
        if (seen.has(triggerKey)) return;
        seen.add(triggerKey);
        entries.push({
          key: `digital-fallback-${triggerKey}`,
          label: fallbackScene.label,
          scene: {
            ...fallbackScene,
            triggerKey,
            templateType: "skill",
            agentKey: fallbackScene.agentKey || "digital-expert",
            runtimeProfile: fallbackScene.runtimeProfile || "isolated",
          },
        });
      });

      const triggerOrder = new Map(fallbackTriggers.map((triggerKey, idx) => [triggerKey, idx]));
      entries.sort((a, b) => {
        const orderA = triggerOrder.get(a.scene.triggerKey) ?? Number.MAX_SAFE_INTEGER;
        const orderB = triggerOrder.get(b.scene.triggerKey) ?? Number.MAX_SAFE_INTEGER;
        return orderA - orderB;
      });

      return entries;
    },
    [currentActorName, currentUserId, digitalGroups, expertAllowed],
  );

  const digitalScenes = useMemo(() => {
    const config: Record<string, SceneConfigItem> = {};
    digitalTemplateEntries.forEach((entry) => {
      config[entry.key] = entry.scene;
    });
    return config;
  }, [digitalTemplateEntries]);

  const sceneConfig = useMemo(
    () => ({ ...BASE_SCENES, ...enterpriseScenes, ...digitalScenes }),
    [enterpriseScenes, digitalScenes],
  );

  const resolveOpenKeys = (key: string): string[] => {
    if (key === "secretary-home") return [];
    if (key === "automation-workbench") return [];
    if (key === "expert-center" || key === "employee-center") return [];
    if (RESEARCH_PLAN_SET.has(key)) return ["research-plan-group"];
    if (RESEARCH_TOOLS_SET.has(key)) return ["research-tools-group"];
    if (key.startsWith("enterprise-")) return ["contact-center-group", "employee-avatar-group"];
    if (key.startsWith("digital-")) return ["contact-center-group", "digital-expert-group"];
    if (key.startsWith("dashboard-")) return ["dashboard-group"];
    if (isSecretary && (key === "party-directive-center" || key === "party-archive")) return ["party-supervision-group-v2"];
    if (isSecretary && (key === "party-affairs" || key === "party-member-evaluation" || key === "party-branch-ranking")) {
      return ["party-governance-group-v2"];
    }
    if (
      isSecretary &&
      (key === "party-activity-collab" || key === "party-organization-care" || key === "party-learning-coach")
    ) {
      return ["party-collab-care-group-v2"];
    }
    if (!isSecretary && (key === "member-tasks" || key === "member-directives")) return ["member-workbench-group"];
    if (!isSecretary && (key === "member-learning" || key === "member-growth")) {
      return ["member-learning-group"];
    }
    if (!isSecretary && (key === "member-activity" || key === "member-support" || key === "member-affairs")) {
      return ["member-collab-group"];
    }
    if (key.startsWith("contact-")) {
      return ["contact-center-group"];
    }
    return DEFAULT_OPEN_KEYS;
  };

  useEffect(() => {
    if (!collapsed) {
      setOpenKeys(resolveOpenKeys(selectedKey));
    }
  }, [collapsed, selectedKey]);

  const menuItems: MenuProps["items"] = [
    {
      type: "group",
      label: "OS 底座",
      children: [
        {
          key: "secretary-home",
          label: "红智秘书",
          icon: <MessagesSquare size={16} />,
        },
        {
          key: "automation-workbench",
          label: "智能工作台",
          icon: <Zap size={16} />,
        },
        {
          key: "notice-sessions",
          label: "会话管理",
          icon: <Brain size={16} />,
        },
      ],
    },
    {
      type: "group",
      label: isSecretary ? "书记驾驶舱" : "党员工作台",
      children: isSecretary 
        ? [
            {
              key: "party-supervision-group-v2",
              label: "党务看板",
              icon: <ShieldCheck size={16} />,
              children: [
                { key: "party-directive-center", label: "指示直达", icon: <FileText size={16} /> },
                { key: "party-archive", label: "党员风貌", icon: <ClipboardCheck size={16} /> },
              ],
            },
            {
              key: "party-governance-group-v2",
              label: "党务管理",
              icon: <Building2 size={16} />,
              children: [
                { key: "party-affairs", label: "事务中心", icon: <ClipboardList size={16} /> },
                { key: "party-member-evaluation", label: "党员测评", icon: <Target size={16} /> },
                { key: "party-branch-ranking", label: "支部评比", icon: <LayoutDashboard size={16} /> },
              ],
            },
            {
              key: "party-collab-care-group-v2",
              label: "协同建设",
              icon: <HeartHandshake size={16} />,
              children: [
                { key: "party-activity-collab", label: "活动协同", icon: <UsersRound size={16} /> },
                { key: "party-organization-care", label: "组织关怀", icon: <HeartHandshake size={16} /> },
                { key: "party-learning-coach", label: "思政辅导", icon: <Brain size={16} /> },
              ],
            },
          ]
        : [
            {
              key: "member-workbench-group",
              label: buildNavLabel("今日任务中枢", "任务总览、我的指示、闭环执行"),
              icon: <ShieldCheck size={16} />,
              children: [
                {
                  key: "member-tasks",
                  label: buildNavLabel("工作台总览", "今日待办、本周计划、风险提醒"),
                  icon: <ClipboardCheckIcon size={16} />,
                },
                {
                  key: "member-directives",
                  label: buildNavLabel("我的指示", "上级要求、时限提醒、个人反馈"),
                  icon: <FileText size={16} />,
                },
              ],
            },
            {
              key: "member-learning-group",
              label: buildNavLabel("学习与成长", "学什么、学得怎样、学成什么"),
              icon: <BookOpen size={16} />,
              children: [
                {
                  key: "member-learning",
                  label: buildNavLabel("学习中心", "必修课程、学习计划、截止提醒"),
                  icon: <BookOpen size={16} />,
                },
                {
                  key: "member-growth",
                  label: buildNavLabel("我的成长", "积分档案、荣誉记录、能力画像"),
                  icon: <Trophy size={16} />,
                },
              ],
            },
            {
              key: "member-collab-group",
              label: buildNavLabel("组织协同", "活动参与、组织支持、我的事务"),
              icon: <HeartHandshake size={16} />,
              children: [
                {
                  key: "member-activity",
                  label: buildNavLabel("参与活动", "活动报名、签到反馈、协同记录"),
                  icon: <Calendar size={16} />,
                },
                {
                  key: "member-support",
                  label: buildNavLabel("组织支持", "服务申请、处理进度、回访记录"),
                  icon: <HeartHandshake size={16} />,
                },
                {
                  key: "member-affairs",
                  label: buildNavLabel("我的事务", "材料提交、办理进度、结果回执"),
                  icon: <ClipboardList size={16} />,
                },
              ],
            },
          ],
    },
    {
      type: "group",
      label: "协作中心",
      children: [
        {
          key: "employee-center",
          label: "员工中心",
          icon: <UsersRound size={16} />,
        },
        {
          key: "expert-center",
          label: "专家中心",
          icon: <Bot size={16} />,
        },
      ],
    },
  ];

  return (
    <Sider
      collapsed={collapsed}
      collapsible
      trigger={null}
      collapsedWidth={84}
      onCollapse={setCollapsed}
      width={280}
      className={styles.sider}
    >
      <div className={styles.siderTop}>
        {!collapsed && (
          <div
            className={styles.logoWrapper}
            role="button"
            tabIndex={0}
            onClick={() => navigate("/app/research-experiment")}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                navigate("/app/research-experiment");
              }
            }}
          >
            <div className={styles.logoText}>
              <span className={styles.companyName}>Afs</span>
              <span className={styles.agentName}>Aifscie Agent OS</span>
            </div>
          </div>
        )}
        <Button
          type="text"
          icon={collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
          onClick={() => setCollapsed(!collapsed)}
          className={styles.collapseBtn}
        />
      </div>

      <div className={styles.siderMenuWrap}>
        <Menu
          key={isSecretary ? "employee-sidebar-menu-secretary-v2" : "employee-sidebar-menu-member-v2"}
          className={styles.siderMenu}
          mode="inline"
          inlineCollapsed={collapsed}
          selectedKeys={[selectedKey]}
          openKeys={collapsed ? [] : openKeys}
          onOpenChange={(keys) => {
            if (!collapsed) {
              setOpenKeys(keys as string[]);
            }
          }}
          onClick={({ key }) => {
            const nextKey = String(key);
            persistEmployeeNavKey(nextKey);

            if (sceneConfig[nextKey]) {
              launchScene({
                key: nextKey,
                scene: sceneConfig[nextKey],
                navigate,
              });
              return;
            }
            const path = EMPLOYEE_KEY_TO_PATH[nextKey];
            if (path) navigate(path);
          }}
          items={menuItems}
        />
      </div>

    </Sider>
  );
}
