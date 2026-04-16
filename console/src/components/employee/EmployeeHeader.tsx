import { Avatar, Badge, Layout, Space } from "antd";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@agentscope-ai/design";
import { LogoutOutlined } from "@ant-design/icons";
import GlobalSearch from "./GlobalSearch";
import styles from "../../layouts/index.module.less";
import { authApi } from "../../api/modules/auth";
import { buildBusinessAvatar, getPersonAvatarSeed } from "../../utils/avatar";

const { Header: AntHeader } = Layout;

interface EmployeeHeaderProps {
  selectedKey: string;
  onLogout?: () => void;
  unreadCount?: number;
  onOpenInbox?: () => void;
}

export default function EmployeeHeader({
  selectedKey: _selectedKey,
  onLogout,
  unreadCount = 0,
  onOpenInbox,
}: EmployeeHeaderProps) {
  const navigate = useNavigate();
  const [currentUserName, setCurrentUserName] = useState(
    String(sessionStorage.getItem("copaw_user_name") || localStorage.getItem("copaw_user_name") || "当前员工"),
  );
  const [currentUserId, setCurrentUserId] = useState(
    String(sessionStorage.getItem("copaw_user_id") || localStorage.getItem("copaw_user_id") || ""),
  );
  const [currentUserGender, setCurrentUserGender] = useState<unknown>(undefined);

  useEffect(() => {
    let canceled = false;
    authApi
      .getMe()
      .then((me) => {
        if (canceled) return;
        const nextName = String(me?.name || "").trim() || "当前员工";
        const nextId = String((me as any)?.user_id || (me as any)?.profile_id || "").trim();
        setCurrentUserName(nextName);
        if (nextId) {
          setCurrentUserId(nextId);
        }
        setCurrentUserGender((me as any)?.gender ?? (me as any)?.sex);
      })
      .catch(() => void 0);
    return () => {
      canceled = true;
    };
  }, []);

  const handleOpenInbox = () => {
    if (onOpenInbox) {
      onOpenInbox();
      return;
    }
    navigate("/app/inbox");
  };

  const avatarSeed = getPersonAvatarSeed(currentUserId || currentUserName, currentUserName);
  const avatar = buildBusinessAvatar({
    seed: avatarSeed,
    name: currentUserName,
    gender: currentUserGender as any,
  });

  return (
    <AntHeader className={`${styles.header} ${styles.headerEmployee}`}>
      <div className={styles.headerLeft}>
        <span className={styles.headerTitleLeft}>红智数字分身操作系统</span>
        <div style={{ marginLeft: "32px", width: "280px" }}>
          <GlobalSearch />
        </div>
      </div>
      <div className={styles.headerBrand}>
        <img src="/assets/afs-logo.png" alt="Afs" className={styles.headerLogo} />
      </div>
      <Space size="middle">
        <Avatar
          size={34}
          src={avatar.src}
          style={{
            background: avatar.background,
            boxShadow: "0 8px 16px rgba(79,70,229,0.24)",
            fontWeight: 700,
          }}
        >
          {avatar.fallback}
        </Avatar>
        <Badge count={unreadCount} size="small" overflowCount={99}>
          <Button type="text" onClick={handleOpenInbox}>通知</Button>
        </Badge>
        <Button type="text" icon={<LogoutOutlined />} onClick={() => onLogout?.()}>
          退出
        </Button>
      </Space>
    </AntHeader>
  );
}
