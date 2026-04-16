import {
  Layout,
  Menu,
  Button,
  type MenuProps,
} from "antd";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  MessageSquare,
  Radio,
  Zap,
  MessageCircle,
  Wifi,
  UsersRound,
  CalendarClock,
  Activity,
  Sparkles,
  Briefcase,
  Cpu,
  Box,
  Globe,
  Settings,
  Shield,
  Plug,
  Wrench,
  PanelLeftClose,
  PanelLeftOpen,
  BarChart3,
  StickyNote,
} from "lucide-react";
import styles from "./index.module.less";

const { Sider } = Layout;

const DEFAULT_OPEN_KEYS = [
  "chat-group",
  "control-group",
  "agent-group",
  "settings-group",
  "admin-group",
];

const KEY_TO_PATH: Record<string, string> = {
  chat: "/admin/chat",
  channels: "/admin/channels",
  sessions: "/admin/sessions",
  "cron-jobs": "/admin/cron-jobs",
  heartbeat: "/admin/heartbeat",
  skills: "/admin/skills",
  tools: "/admin/tools",
  mcp: "/admin/mcp",
  workspace: "/admin/workspace",
  models: "/admin/models",
  environments: "/admin/environments",
  "agent-config": "/admin/agent-config",
  security: "/admin/security",
  "token-usage": "/admin/token-usage",
  "archive-employees": "/admin/archive",
  "archive-manager": "/admin/manager",
  "prompt-templates": "/admin/prompt-templates",
  "digital-expert-templates": "/admin/digital-expert-templates",
  "dashboard-skill-templates": "/admin/dashboard-skill-templates",
  "expert-center-skill-templates": "/admin/expert-center-skill-templates",
  "platform-learning": "/admin/platform-learning",
};

interface SidebarProps {
  selectedKey: string;
  isAdmin?: boolean;
}

export default function Sidebar({ selectedKey, isAdmin: _isAdmin }: SidebarProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const [openKeys, setOpenKeys] = useState<string[]>(DEFAULT_OPEN_KEYS);

  useEffect(() => {
    if (!collapsed) {
      setOpenKeys(DEFAULT_OPEN_KEYS);
    }
  }, [collapsed]);

  const menuItems: MenuProps["items"] = [
    {
      key: "chat-group",
      label: t("nav.chat"),
      icon: <MessageSquare size={16} />,
      children: [
        {
          key: "chat",
          label: t("nav.chat"),
          icon: <MessageCircle size={16} />,
        },
      ],
    },
    {
      key: "control-group",
      label: t("nav.control"),
      icon: <Radio size={16} />,
      children: [
        { key: "channels", label: t("nav.channels"), icon: <Wifi size={16} /> },
        {
          key: "sessions",
          label: t("nav.sessions"),
          icon: <UsersRound size={16} />,
        },
        {
          key: "cron-jobs",
          label: t("nav.cronJobs"),
          icon: <CalendarClock size={16} />,
        },
        {
          key: "heartbeat",
          label: t("nav.heartbeat"),
          icon: <Activity size={16} />,
        },
      ],
    },
    {
      key: "agent-group",
      label: t("nav.agent"),
      icon: <Zap size={16} />,
      children: [
        {
          key: "workspace",
          label: t("nav.workspace"),
          icon: <Briefcase size={16} />,
        },
        { key: "skills", label: t("nav.skills"), icon: <Sparkles size={16} /> },
        { key: "tools", label: t("nav.tools"), icon: <Wrench size={16} /> },
        { key: "mcp", label: t("nav.mcp"), icon: <Plug size={16} /> },
        {
          key: "agent-config",
          label: t("nav.agentConfig"),
          icon: <Settings size={16} />,
        },
      ],
    },
    {
      key: "settings-group",
      label: t("nav.settings"),
      icon: <Cpu size={16} />,
      children: [
        { key: "models", label: t("nav.models"), icon: <Box size={16} /> },
        {
          key: "environments",
          label: t("nav.environments"),
          icon: <Globe size={16} />,
        },
        {
          key: "security",
          label: t("nav.security"),
          icon: <Shield size={16} />,
        },
        {
          key: "token-usage",
          label: t("nav.tokenUsage"),
          icon: <BarChart3 size={16} />,
        },
      ],
    },
    {
      key: "admin-group",
      label: "后台管理",
      icon: <Shield size={16} />,
      children: [
        {
          key: "prompt-templates",
          label: "公共Skill",
          icon: <StickyNote size={16} />,
        },
        {
          key: "dashboard-skill-templates",
          label: "仪表台Skill",
          icon: <StickyNote size={16} />,
        },
        {
          key: "expert-center-skill-templates",
          label: "专家中心Skill",
          icon: <StickyNote size={16} />,
        },
        {
          key: "platform-learning",
          label: "平台学习中心",
          icon: <StickyNote size={16} />,
        },
        {
          key: "agent-os-rooms",
          label: "AgentOS Rooms",
          icon: <StickyNote size={16} />,
        },
        {
          key: "agent-os-traces",
          label: "AgentOS Traces",
          icon: <StickyNote size={16} />,
        },
        {
          key: "agent-os-artifacts",
          label: "AgentOS Artifacts",
          icon: <StickyNote size={16} />,
        },
        {
          key: "agent-os-evals",
          label: "AgentOS Evals",
          icon: <StickyNote size={16} />,
        },
        {
          key: "archive-group",
          label: "档案管理",
          icon: <Shield size={16} />,
          children: [
            {
              key: "digital-expert-templates",
              label: "数字专家模板",
              icon: <Shield size={16} />,
            },
            {
              key: "archive-employees",
              label: "员工档案",
              icon: <Shield size={16} />,
            },
            {
              key: "archive-manager",
              label: "用户管理",
              icon: <Shield size={16} />,
            },
          ],
        },
      ],
    },
  ];

  return (
    <Sider
      collapsed={collapsed}
      onCollapse={setCollapsed}
      width={275}
      className={styles.sider}
    >
      <div className={styles.siderTop}>
        {!collapsed && (
          <div
            className={styles.logoWrapper}
            role="button"
            tabIndex={0}
            onClick={() => navigate("/admin/chat")}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                navigate("/admin/chat");
              }
            }}
          >
            <img
              src="/assets/afs-icon.png"
              alt="Afs"
              className={styles.logoImg}
              width={28}
              height={28}
            />
            <div className={styles.logoText}>
              <span className={styles.companyName}>Afs</span>
              <span className={styles.agentName}>AIFORSCI TECH</span>
            </div>
          </div>
        )}
        <Button
          type="text"
          icon={
            collapsed ? (
              <PanelLeftOpen size={20} />
            ) : (
              <PanelLeftClose size={20} />
            )
          }
          onClick={() => setCollapsed(!collapsed)}
          className={styles.collapseBtn}
        />
      </div>

      <Menu
        mode="inline"
        selectedKeys={[selectedKey]}
        openKeys={openKeys}
        onOpenChange={(keys) => setOpenKeys(keys as string[])}
        onClick={({ key }) => {
          const path = KEY_TO_PATH[String(key)];
          if (path) navigate(path);
        }}
        items={menuItems}
      />
    </Sider>
  );
}
