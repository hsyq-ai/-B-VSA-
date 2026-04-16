import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Badge,
  Button,
  Card,
  Col,
  Divider,
  Empty,
  Progress,
  Row,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from "antd";
import {
  ArrowLeft,
  Briefcase,
  Building2,
  CheckCircle2,
  MessagesSquare,
  Rocket,
  ShieldCheck,
  Sparkles,
  UserRound,
  Zap,
} from "lucide-react";
import sessionApi from "../Chat/sessionApi";

const { Title, Paragraph, Text } = Typography;

const SCENE_STORAGE = "copaw_scene_start_v1";
const SCENE_PENDING_STORAGE = "copaw_scene_pending_v1";
const SCENE_SESSION_MAP_STORAGE = "copaw_scene_session_map_v1";

interface EmployeeSceneInfo {
  key: string;
  label: string;
  triggerKey: string;
  sessionName: string;
  prompt: string;
  skill: string;
  templateType: string;
  context?: Record<string, unknown>;
  ts?: number;
}

const normalize = (value: unknown) => String(value || "").trim();

const parseSceneSessionMap = (): Record<string, string> => {
  try {
    const raw = sessionStorage.getItem(SCENE_SESSION_MAP_STORAGE);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const persistSceneSessionMap = (value: Record<string, string>) => {
  sessionStorage.setItem(SCENE_SESSION_MAP_STORAGE, JSON.stringify(value));
};

function SceneChatPanel({
  src,
  title,
  onClose,
}: {
  src: string;
  title: string;
  onClose: () => void;
}) {
  const [frameLoading, setFrameLoading] = useState(true);
  const [loadingPercent, setLoadingPercent] = useState(18);

  useEffect(() => {
    if (!src) return;
    setFrameLoading(true);
    setLoadingPercent(18);
    const timer = window.setInterval(() => {
      setLoadingPercent((prev) => (prev >= 88 ? prev : prev + 7));
    }, 180);
    return () => window.clearInterval(timer);
  }, [src]);

  if (!src) return null;

  return (
    <div className="ed-chat-shell">
      <div className="ed-chat-toolbar">
        <Space size={8} wrap>
          <Tag color="blue" style={{ marginInlineEnd: 0 }}>
            当前会话
          </Tag>
          <Text style={{ fontSize: 13, color: "#334155", fontWeight: 600 }}>
            {title || "员工分身会话"}
          </Text>
        </Space>
        <Button size="small" onClick={onClose}>
          收起会话
        </Button>
      </div>
      {frameLoading ? (
        <div className="ed-chat-progress">
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1e3a8a", marginBottom: 4 }}>
            分身会话正在同步
          </div>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>
            正在挂载员工上下文、恢复会话命名并生成首条场景内容...
          </div>
          <Progress
            percent={loadingPercent}
            size="small"
            showInfo={false}
            strokeColor={{ from: "#60a5fa", to: "#2563eb" }}
            trailColor="#dbeafe"
            status="active"
          />
        </div>
      ) : null}
      <div className="ed-chat-frame-wrap">
        <iframe
          src={src}
          title="员工分身会话窗"
          onLoad={() => {
            setLoadingPercent(100);
            window.setTimeout(() => setFrameLoading(false), 320);
          }}
          style={{ width: "100%", height: "70vh", border: "none", background: "#fff" }}
        />
      </div>
    </div>
  );
}

export default function EmployeeDetailPage() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState<EmployeeSceneInfo | null>(null);
  const [chatExpanded, setChatExpanded] = useState(false);
  const [chatTitle, setChatTitle] = useState("员工分身会话");
  const [chatSrc, setChatSrc] = useState("");
  const [launchingChat, setLaunchingChat] = useState(false);
  const chatAnchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(SCENE_STORAGE);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.key === employeeId) {
          setEmployee(parsed);
          setChatTitle(normalize(parsed.sessionName) || normalize(parsed.label) || "员工分身会话");
        }
      }
    } catch (err) {
      console.error("Failed to parse employee info from session", err);
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  const employeeContext = useMemo(
    () =>
      employee?.context && typeof employee.context === "object"
        ? (employee.context as Record<string, unknown>)
        : {},
    [employee],
  );

  const targetName = useMemo(() => {
    return (
      normalize(employeeContext.target_user_name) ||
      normalize(employeeContext.employee) ||
      normalize(employee?.label).replace(/\s*数字分身\s*$/, "") ||
      "员工"
    );
  }, [employee, employeeContext]);

  const department = normalize(employeeContext.department) || "未分配部门";
  const targetId =
    normalize(employeeContext.scene_target_user_id) ||
    normalize(employeeContext.target_user_id) ||
    normalize(employeeContext.scene_target_profile_id) ||
    "-";
  const sceneKey = normalize(employee?.key);
  const sceneName =
    normalize(employee?.sessionName) || `${targetName || "员工"} 数字分身会话`;
  const hiddenPrompt =
    normalize(employee?.prompt) ||
    `我是当前协作者，不是${targetName}本人。现在我要和${targetName}的数字分身对话。请你直接以“${targetName}的数字分身”身份向我回应，先简洁说明你能代表${targetName}提供哪些档案事实信息，以及如果我要留言、通知或交办事项，应该如何转达给${targetName}。不要欢迎${targetName}回来，也不要把我当成${targetName}本人。`;
  const bootstrapMessage = `已打开「${sceneName}」，正在连接${targetName}的数字分身，请稍候查看首条协同回复。`;

  const askSecretary = () => {
    sessionStorage.setItem(
      "copaw_secretary_scene_context",
      `正在查看员工 ${targetName} 的数字分身详情，并准备安排协作任务`,
    );
    navigate("/app/secretary");
  };

  const jumpToChat = () => {
    window.setTimeout(() => {
      chatAnchorRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 80);
  };

  const ensureSceneSession = async () => {
    if (!employee || !sceneKey) {
      throw new Error("missing employee scene");
    }

    const sessionMeta = {
      scene_key: sceneKey,
      scene_label: normalize(employee.label) || `${targetName} 数字分身`,
      scene_trigger_key: normalize(employee.triggerKey) || sceneKey,
      scene_prompt: hiddenPrompt,
      hidden_user_prompt: hiddenPrompt,
      hidden_prompt_history: hiddenPrompt ? [hiddenPrompt] : [],
      scene_context: employeeContext,
      scene_skill: normalize(employee.skill) || "employee_agent_link",
      scene_template_type: normalize(employee.templateType) || "scene",
      locked_session_name: true,
      session_display_name: sceneName,
      scene_bootstrap_status: "ready",
    };

    const sessionMap = parseSceneSessionMap();
    const cachedId = normalize(sessionMap[sceneKey]);
    if (cachedId && sessionApi.peekSession(cachedId)) {
      await sessionApi.updateSession({
        id: cachedId,
        name: sceneName,
        meta: sessionMeta,
      } as any);
      return { sessionId: cachedId, isNew: false };
    }

    const created = await sessionApi.createSession({
      name: sceneName,
      pushMessage: bootstrapMessage,
      meta: sessionMeta,
    } as any);
    const nextId = normalize((created?.[0] as any)?.id);
    if (!nextId) {
      throw new Error("create session failed");
    }

    await sessionApi.updateSession({
      id: nextId,
      name: sceneName,
      meta: sessionMeta,
    } as any);

    sessionMap[sceneKey] = nextId;
    persistSceneSessionMap(sessionMap);
    return { sessionId: nextId, isNew: true };
  };

  const openSceneChat = async () => {
    if (!employee) return;
    setLaunchingChat(true);
    try {
      const { sessionId, isNew } = await ensureSceneSession();
      if (isNew) {
        sessionStorage.setItem(
          SCENE_PENDING_STORAGE,
          JSON.stringify({
            id: sessionId,
            prompt: hiddenPrompt,
            processingText: "正在同步员工分身上下文并生成首条场景内容...",
            ts: Date.now(),
          }),
        );
      }
      setChatTitle(sceneName);
      setChatSrc(
        `/app/workspace-embed/${encodeURIComponent(sessionId)}?simple=1&scene=${encodeURIComponent(sceneKey)}&t=${Date.now()}`,
      );
      setChatExpanded(true);
      jumpToChat();
    } catch (err) {
      console.error("Failed to open employee chat:", err);
      message.error("开启分身会话失败，请稍后重试");
    } finally {
      setLaunchingChat(false);
    }
  };

  const toggleChatPanel = () => {
    if (chatExpanded) {
      setChatExpanded(false);
      return;
    }
    if (chatSrc) {
      setChatExpanded(true);
      jumpToChat();
      return;
    }
    void openSceneChat();
  };

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 100 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!employee) {
    return (
      <Card style={{ textAlign: "center", padding: 40, borderRadius: 16 }} bordered={false}>
        <Title level={4}>未能加载员工分身详情</Title>
        <Button onClick={() => navigate("/app/employee-center")} type="primary">
          返回员工中心
        </Button>
      </Card>
    );
  }

  return (
    <div style={{ maxWidth: 1620, margin: "0 auto", padding: "6px 4px 28px" }}>
      <Card
        bordered={false}
        style={{
          borderRadius: 24,
          background: "linear-gradient(120deg, #0f172a 0%, #1e293b 45%, #334155 100%)",
          marginBottom: 18,
          boxShadow: "0 20px 48px rgba(15, 23, 42, 0.32)",
        }}
        styles={{ body: { padding: 28 } }}
      >
        <Row gutter={[18, 18]} align="middle">
          <Col xs={24} xl={16}>
            <Space direction="vertical" size={8}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <Tag color="cyan" style={{ borderRadius: 999, paddingInline: 12 }}>
                  <Sparkles size={12} style={{ marginRight: 6 }} /> Employee Digital Persona
                </Tag>
                <Text style={{ color: "rgba(255,255,255,0.75)" }}>ID: {targetId}</Text>
              </div>
              <Title level={2} style={{ color: "#fff", margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
                <UserRound size={28} /> {targetName} 的数字分身
              </Title>
              <Text style={{ color: "rgba(255,255,255,0.82)", fontSize: 15 }}>
                详情页内可直接锁定会话、挂载隐藏提示词并展开会话区，避免首屏空白等待。
              </Text>
            </Space>
          </Col>
          <Col xs={24} xl={8}>
            <div className="ed-hero-actions">
              <Space wrap>
                <Button icon={<ArrowLeft size={14} />} onClick={() => navigate("/app/employee-center")}>
                  返回员工中心
                </Button>
                <Button icon={<MessagesSquare size={14} />} onClick={askSecretary}>
                  咨询秘书
                </Button>
              </Space>
              <Button
                type="primary"
                size="large"
                icon={<Rocket size={16} />}
                onClick={() => void openSceneChat()}
                className="ed-primary-btn ed-primary-btn-hero"
                loading={launchingChat}
              >
                分配任务 / 开启会话
              </Button>
              <Text className="ed-hero-tip">会话命名锁定，首次打开将自动注入场景开场内容。</Text>
            </div>
          </Col>
        </Row>
      </Card>

      <Row gutter={[18, 18]}>
        <Col xs={24} xl={17}>
          <Space direction="vertical" size={18} style={{ width: "100%" }}>
            <Card title="员工分身档案" bordered={false} className="ed-surface-card">
              <Paragraph style={{ fontSize: 15, color: "#334155", marginBottom: 12 }}>
                该分身用于承接跨部门沟通、任务交办与信息确认。系统将保持协作者身份，不会识别为员工本人。
              </Paragraph>
              <Divider style={{ margin: "12px 0 16px" }} />
              <Row gutter={[16, 14]}>
                <Col xs={24} md={8}>
                  <Text type="secondary">员工姓名</Text>
                  <div className="ed-info-value">{targetName}</div>
                </Col>
                <Col xs={24} md={8}>
                  <Text type="secondary">所属部门</Text>
                  <div className="ed-info-value">
                    <Building2 size={14} /> {department}
                  </div>
                </Col>
                <Col xs={24} md={8}>
                  <Text type="secondary">触发场景</Text>
                  <div className="ed-info-value">{employee.triggerKey}</div>
                </Col>
              </Row>
            </Card>

            <div ref={chatAnchorRef}>
              <Card
                title="会话区"
                bordered={false}
                className="ed-surface-card"
                extra={
                  <Button type={chatExpanded ? "default" : "primary"} onClick={toggleChatPanel} loading={launchingChat}>
                    {chatExpanded ? "收起会话区" : "展开会话区"}
                  </Button>
                }
              >
                {chatExpanded && chatSrc ? (
                  <SceneChatPanel
                    src={chatSrc}
                    title={chatTitle || sceneName}
                    onClose={() => setChatExpanded(false)}
                  />
                ) : (
                  <div className="ed-chat-collapsed">
                    <div>
                      <Text strong style={{ fontSize: 16, color: "#0f172a", display: "block", marginBottom: 4 }}>
                        一键进入 {targetName} 的分身会话
                      </Text>
                      <Text type="secondary">
                        打开后会先写入隐藏场景提示词，再展开内嵌会话区，保持首屏有明确开场内容。
                      </Text>
                      <div style={{ marginTop: 12 }}>
                        <Badge status="processing" text="会话将复用原员工分身链路" />
                      </div>
                    </div>
                    <Button
                      type="primary"
                      icon={<Zap size={14} />}
                      className="ed-primary-btn"
                      loading={launchingChat}
                      onClick={() => void openSceneChat()}
                    >
                      立即展开会话
                    </Button>
                  </div>
                )}
              </Card>
            </div>

            <Card title="协作能力" bordered={false} className="ed-surface-card">
              {employee.skill ? (
                <div className="ed-skill-banner">
                  <ShieldCheck size={19} color="#4338ca" style={{ marginTop: 1 }} />
                  <div>
                    <Text strong style={{ fontSize: 16, display: "block", marginBottom: 2 }}>
                      {employee.skill}
                    </Text>
                    <Text type="secondary">支持员工档案事实说明、留言代转、任务交办与协作跟进。</Text>
                  </div>
                </div>
              ) : (
                <Empty description="当前分身使用默认协作能力" />
              )}
              <div style={{ marginTop: 14 }}>
                <Text strong style={{ display: "block", marginBottom: 12 }}>标准协作项</Text>
                <Row gutter={[12, 12]}>
                  {["员工身份事实确认", "留言与通知转达", "任务交办建议生成", "协作上下文保持"].map((item) => (
                    <Col xs={24} md={12} key={item}>
                      <div className="ed-check-item">
                        <CheckCircle2 size={16} color="#22c55e" />
                        {item}
                      </div>
                    </Col>
                  ))}
                </Row>
              </div>
            </Card>
          </Space>
        </Col>

        <Col xs={24} xl={7}>
          <Card title="快速操作" bordered={false} className="ed-surface-card" style={{ position: "sticky", top: 16 }}>
            <Space direction="vertical" style={{ width: "100%" }}>
              <Button
                block
                size="large"
                type="primary"
                icon={<Zap size={14} />}
                className="ed-primary-btn"
                loading={launchingChat}
                onClick={() => void openSceneChat()}
              >
                开启该分身会话
              </Button>
              <Button block size="large" icon={<Briefcase size={14} />} onClick={askSecretary}>
                让秘书协助交办
              </Button>
              <Button block size="large" icon={<UserRound size={14} />} onClick={() => navigate("/app/employee-center")}>
                返回员工中心
              </Button>
              <div className="ed-note-box">
                <Badge status="processing" text="会话命名已锁定，隐藏提示词仅首次自动注入" />
              </div>
            </Space>
          </Card>
        </Col>
      </Row>

      <div className="ed-float-actions">
        <Button
          type="primary"
          icon={<Rocket size={14} />}
          className="ed-primary-btn ed-float-primary"
          loading={launchingChat}
          onClick={() => void openSceneChat()}
        >
          开启会话
        </Button>
        <Button icon={<MessagesSquare size={14} />} className="ed-float-secondary" onClick={askSecretary}>
          分配任务
        </Button>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
            .ed-surface-card {
              border-radius: 18px;
              background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
              box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
            }
            .ed-primary-btn {
              border: none !important;
              border-radius: 12px !important;
              background: linear-gradient(135deg, #3730a3 0%, #4f46e5 48%, #6366f1 100%) !important;
              box-shadow: 0 12px 26px rgba(79, 70, 229, 0.34);
            }
            .ed-primary-btn-hero {
              min-width: 240px;
              height: 48px;
              font-weight: 700;
            }
            .ed-hero-actions {
              display: flex;
              flex-direction: column;
              align-items: flex-end;
              gap: 12px;
            }
            .ed-hero-tip {
              color: rgba(255,255,255,0.76);
              font-size: 12px;
            }
            .ed-skill-banner {
              display: flex;
              gap: 12px;
              align-items: flex-start;
              background: linear-gradient(180deg, #f8faff 0%, #eef2ff 100%);
              border: 1px solid #dbe5ff;
              border-radius: 12px;
              padding: 14px;
            }
            .ed-info-value {
              margin-top: 6px;
              font-weight: 700;
              color: #0f172a;
              display: inline-flex;
              align-items: center;
              gap: 6px;
            }
            .ed-check-item {
              display: inline-flex;
              align-items: center;
              gap: 8px;
              padding: 10px 12px;
              width: 100%;
              border-radius: 10px;
              background: #f8fafc;
              border: 1px solid #e2e8f0;
            }
            .ed-note-box {
              border-radius: 10px;
              border: 1px dashed #c7d2fe;
              background: #eef2ff;
              padding: 10px 12px;
            }
            .ed-chat-collapsed {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 16px;
              padding: 18px;
              border-radius: 16px;
              border: 1px solid #dbeafe;
              background: linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%);
            }
            .ed-chat-shell {
              border-radius: 20px;
              border: 1px solid #e2e8f0;
              box-shadow: 0 10px 30px rgba(15,23,42,0.06);
              overflow: hidden;
              background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
            }
            .ed-chat-toolbar {
              padding: 12px 18px;
              border-bottom: 1px solid #e2e8f0;
              background: #f8fafc;
              display: flex;
              justify-content: space-between;
              align-items: center;
              gap: 12px;
              flex-wrap: wrap;
            }
            .ed-chat-progress {
              padding: 14px 18px;
              background: linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%);
              border-bottom: 1px solid #dbeafe;
            }
            .ed-chat-frame-wrap {
              padding: 16px;
              background: #f1f5f9;
            }
            .ed-chat-frame-wrap iframe {
              border-radius: 16px;
              overflow: hidden;
              box-shadow: 0 10px 30px rgba(15,23,42,0.08);
            }
            .ed-float-actions {
              position: fixed;
              right: 24px;
              bottom: 28px;
              z-index: 1100;
              display: flex;
              flex-direction: column;
              gap: 10px;
            }
            .ed-float-primary {
              height: 44px;
              padding-inline: 16px !important;
              border-radius: 14px !important;
            }
            .ed-float-secondary {
              border-radius: 14px !important;
              box-shadow: 0 10px 24px rgba(15, 23, 42, 0.12);
            }
            @media (max-width: 1200px) {
              .ed-hero-actions {
                align-items: flex-start;
              }
            }
            @media (max-width: 768px) {
              .ed-chat-collapsed {
                flex-direction: column;
                align-items: flex-start;
              }
              .ed-float-actions {
                right: 16px;
                bottom: 20px;
              }
            }
          `,
        }}
      />
    </div>
  );
}
