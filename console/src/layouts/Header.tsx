import { Layout, Space, message } from "antd";
import { useNavigate } from "react-router-dom";
import LanguageSwitcher from "../components/LanguageSwitcher";
import { useTranslation } from "react-i18next";
import {
  FileTextOutlined,
  BookOutlined,
  QuestionCircleOutlined,
  GithubOutlined,
  LogoutOutlined,
  SendOutlined,
} from "@ant-design/icons";
import { Button, Tooltip } from "@agentscope-ai/design";
import { getApiToken, getApiUrl } from "../api/config";
import sessionApi from "../pages/Chat/sessionApi";
import styles from "./index.module.less";

const { Header: AntHeader } = Layout;

// Navigation URLs
const NAV_URLS = {
  docs: "https://copaw.agentscope.io/docs/intro",
  faq: "https://copaw.agentscope.io/docs/faq",
  changelog: "https://github.com/agentscope-ai/CoPaw/releases",
  github: "https://github.com/agentscope-ai/CoPaw",
} as const;

interface HeaderProps {
  onLogout?: () => void;
}

export default function Header({ onLogout }: HeaderProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const handleTestPush = async () => {
    const token = getApiToken();
    if (!token) {
      message.error("未登录，无法测试");
      return;
    }
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const pushRes = await fetch(getApiUrl("/messages/test-push"), {
        method: "POST",
        headers,
      });
      if (!pushRes.ok) {
        const err = await pushRes.json().catch(() => ({}));
        message.error(`注入失败: ${pushRes.status} ${JSON.stringify(err)}`);
        return;
      }
      const pullRes = await fetch(getApiUrl("/messages/pull"), { headers });
      if (!pullRes.ok) {
        message.error(`拉取失败: ${pullRes.status}`);
        return;
      }
      const data = await pullRes.json();
      if (!data.messages?.length) {
        const debugRes = await fetch(getApiUrl("/messages/debug"), { headers });
        const debug = debugRes.ok ? await debugRes.json() : {};
        message.error(`未收到消息。调试: user_id=${debug.user_id} pending=${debug.pending_count}`);
        return;
      }
      const raw = data.messages[0];
      const msg = typeof raw === "string" ? raw : raw?.text ?? String(raw);
      const pushSource =
        typeof raw === "object" && raw?.source_user_id
          ? {
              source_user_id: raw.source_user_id,
              source_user_name: raw.source_user_name || "",
            }
          : undefined;
      const sessionName =
        msg.length > 25 ? `系统推送: ${msg.substring(0, 25)}...` : `系统推送: ${msg}`;
      const newSessions = await sessionApi.createSession({
        name: sessionName,
        pushMessage: msg,
        pushSource,
      });
      const newSessionId = newSessions[0]?.id;
      if (newSessionId) {
        message.success("测试成功，已创建新会话");
        navigate(`/admin/chat/${newSessionId}`, { replace: false });
      } else {
        message.warning("创建会话失败");
      }
    } catch (e) {
      message.error(`测试失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleNavClick = (url: string) => {
    if (url) {
      // Check if running in pywebview environment
      const pywebview = (window as any).pywebview;
      if (pywebview && pywebview.api) {
        // Use pywebview API to open external link in system browser
        pywebview.api.open_external_link(url);
      } else {
        // Normal browser environment
        window.open(url, "_blank");
      }
    }
  };

  return (
    <AntHeader className={styles.header}>
      <div className={styles.headerActions}>
        <Space size="middle">
          <Tooltip title={t("header.changelog")}>
            <Button
              icon={<FileTextOutlined />}
              type="text"
              onClick={() => handleNavClick(NAV_URLS.changelog)}
            >
              {t("header.changelog")}
            </Button>
          </Tooltip>
          <Tooltip title={t("header.docs")}>
            <Button
              icon={<BookOutlined />}
              type="text"
              onClick={() => handleNavClick(NAV_URLS.docs)}
            >
              {t("header.docs")}
            </Button>
          </Tooltip>
          <Tooltip title={t("header.faq")}>
            <Button
              icon={<QuestionCircleOutlined />}
              type="text"
              onClick={() => handleNavClick(NAV_URLS.faq)}
            >
              {t("header.faq")}
            </Button>
          </Tooltip>
          <Tooltip title={t("header.github")}>
            <Button
              icon={<GithubOutlined />}
              type="text"
              onClick={() => handleNavClick(NAV_URLS.github)}
            >
              {t("header.github")}
            </Button>
          </Tooltip>
          <LanguageSwitcher />
          <Tooltip title="注入测试消息并拉取，验证推送链路">
            <Button
              icon={<SendOutlined />}
              type="text"
              onClick={handleTestPush}
            >
              测试推送
            </Button>
          </Tooltip>
          <Tooltip title="退出登录">
            <Button
              icon={<LogoutOutlined />}
              type="text"
              onClick={() => onLogout?.()}
            >
              退出
            </Button>
          </Tooltip>
        </Space>
      </div>
    </AntHeader>
  );
}
