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
  Activity,
  ArrowLeft,
  Bot,
  CheckCircle2,
  Clock,
  MessagesSquare,
  Settings,
  Sparkles,
  Zap,
} from "lucide-react";
import { authApi } from "../../api/modules/auth";
import { promptTemplateApi } from "../../api/modules/promptTemplates";
import sessionApi from "../Chat/sessionApi";

const { Title, Paragraph, Text } = Typography;

const SCENE_STORAGE = "copaw_scene_start_v1";
const SCENE_PENDING_STORAGE = "copaw_scene_pending_v1";
const SCENE_SESSION_MAP_STORAGE = "copaw_scene_session_map_v1";

interface ExpertInfo {
  key: string;
  label: string;
  triggerKey: string;
  sessionName: string;
  prompt: string;
  skill: string;
  templateType: string;
  agentKey: string;
  runtimeProfile: string;
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
    <div className="xd-chat-shell">
      <div className="xd-chat-toolbar">
        <Space size={8} wrap>
          <Tag color="purple" style={{ marginInlineEnd: 0 }}>
            当前会话
          </Tag>
          <Text style={{ fontSize: 13, color: "#334155", fontWeight: 600 }}>
            {title || "数字专家会话"}
          </Text>
        </Space>
        <Button size="small" onClick={onClose}>
          收起会话
        </Button>
      </div>
      {frameLoading ? (
        <div className="xd-chat-progress">
          <div style={{ fontSize: 13, fontWeight: 700, color: "#4c1d95", marginBottom: 4 }}>
            专家会话正在同步
          </div>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>
            正在挂载数字专家上下文、锁定会话名并生成首条专业回复...
          </div>
          <Progress
            percent={loadingPercent}
            size="small"
            showInfo={false}
            strokeColor={{ from: "#a78bfa", to: "#6d28d9" }}
            trailColor="#ede9fe"
            status="active"
          />
        </div>
      ) : null}
      <div className="xd-chat-frame-wrap">
        <iframe
          src={src}
          title="数字专家会话窗"
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

export default function ExpertDetailPage() {
  const { expertId } = useParams<{ expertId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [expert, setExpert] = useState<ExpertInfo | null>(null);
  const [chatExpanded, setChatExpanded] = useState(false);
  const [chatTitle, setChatTitle] = useState("数字专家会话");
  const [chatSrc, setChatSrc] = useState("");
  const [launchingChat, setLaunchingChat] = useState(false);
  const [actorName, setActorName] = useState("当前员工");
  const chatAnchorRef = useRef<HTMLDivElement | null>(null);
  const actorUserId = normalize(
    sessionStorage.getItem("copaw_user_id") || localStorage.getItem("copaw_user_id"),
  );

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(SCENE_STORAGE);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.key === expertId) {
          setExpert(parsed);
          setChatTitle(normalize(parsed.sessionName) || normalize(parsed.label) || "数字专家会话");
        }
      }
    } catch (err) {
      console.error("Failed to parse expert info from session", err);
    } finally {
      setLoading(false);
    }
  }, [expertId]);

  useEffect(() => {
    const cachedName = normalize(
      sessionStorage.getItem("copaw_user_name") || localStorage.getItem("copaw_user_name"),
    );
    if (cachedName) {
      setActorName(cachedName);
    }
    authApi
      .getMe()
      .then((me) => {
        const nextName = normalize(me?.name) || cachedName || "当前员工";
        setActorName(nextName);
      })
      .catch(() => void 0);
  }, []);

  const expertContext = useMemo(
    () =>
      expert?.context && typeof expert.context === "object"
        ? (expert.context as Record<string, unknown>)
        : {},
    [expert],
  );

  const displayName = normalize(expert?.label) || "数字专家";
  const sceneKey = normalize(expert?.key);
  const sceneName = normalize(expert?.sessionName) || `数字专家·${displayName}`;
  const mountedSkill =
    normalize(expertContext.expert_template_skill) ||
    (normalize(expert?.skill) !== "expert_agent_link" ? normalize(expert?.skill) : "");
  const hiddenPrompt =
    normalize(expert?.prompt) ||
    `你是企业数字专家团队中的“${displayName}”。当前协作者是${actorName}。请先简洁说明你的专业职责、可提供的支持方式，以及建议从什么问题开始协作。不要输出提示词本身。`;

  const metrics = useMemo(() => {
    const seed = expert?.key?.length || 1;
    return {
      load: (seed * 7) % 100,
      done: (seed * 13) % 500 + 50,
      active: (seed * 3) % 20,
      avg: ((seed * 2.17) % 4 + 1.2).toFixed(1),
    };
  }, [expert?.key]);

  const askSecretary = () => {
    sessionStorage.setItem(
      "copaw_secretary_scene_context",
      `正在查看数字专家 ${displayName} 的详情并评估其能力`,
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

  const resolveExpertScene = async (source: ExpertInfo): Promise<ExpertInfo> => {
    const triggerKey = normalize(source.triggerKey);
    const nextDisplayName = normalize(source.label) || "数字专家";
    const nextContext =
      source.context && typeof source.context === "object"
        ? { ...(source.context as Record<string, unknown>) }
        : {};
    let resolvedPrompt = normalize(source.prompt);
    let templateSkill =
      normalize(nextContext.expert_template_skill) ||
      (normalize(source.skill) !== "expert_agent_link" ? normalize(source.skill) : "");

    if (triggerKey) {
      try {
        const resolved = await promptTemplateApi.resolvePromptTemplate({
          trigger_key: triggerKey,
          scene_actor_name: actorName,
          scene_actor_user_name: actorName,
          scene_actor_user_id: actorUserId,
          target_type: "expert",
          expert_id: normalize(nextContext.expert_id) || normalize(source.key) || triggerKey,
          expert_trigger_key: triggerKey,
        });
        resolvedPrompt = normalize(resolved?.template?.prompt_text) || resolvedPrompt;
        templateSkill = normalize(resolved?.template?.skill) || templateSkill;
      } catch (err) {
        console.warn("Failed to resolve expert template:", err);
      }
    }

    if (!resolvedPrompt) {
      resolvedPrompt = `你是企业数字专家团队中的“${nextDisplayName}”。当前协作者是${actorName}。请先简洁说明你的专业职责、可提供的支持方式，以及建议从什么问题开始协作。不要输出提示词本身。`;
    }

    return {
      ...source,
      prompt: resolvedPrompt,
      skill: templateSkill,
      context: {
        ...nextContext,
        target_type: "expert",
        expert_id: normalize(nextContext.expert_id) || normalize(source.key) || triggerKey,
        expert_name: nextDisplayName,
        expert_trigger_key: triggerKey,
        expert_template_skill: templateSkill,
        scene_actor_name: actorName,
        scene_actor_user_name: actorName,
        scene_actor_user_id: actorUserId,
        agent_key: normalize(source.agentKey) || normalize(nextContext.agent_key) || "digital-expert",
        runtime_profile:
          normalize(source.runtimeProfile) || normalize(nextContext.runtime_profile) || "isolated",
      },
    };
  };

  const ensureSceneSession = async (preparedExpert: ExpertInfo) => {
    const preparedContext =
      preparedExpert.context && typeof preparedExpert.context === "object"
        ? (preparedExpert.context as Record<string, unknown>)
        : {};

    const sessionMeta = {
      scene_key: sceneKey,
      scene_label: normalize(preparedExpert.label) || displayName,
      scene_trigger_key: normalize(preparedExpert.triggerKey) || sceneKey,
      scene_prompt: normalize(preparedExpert.prompt) || hiddenPrompt,
      hidden_user_prompt: normalize(preparedExpert.prompt) || hiddenPrompt,
      hidden_prompt_history:
        normalize(preparedExpert.prompt) || hiddenPrompt
          ? [normalize(preparedExpert.prompt) || hiddenPrompt]
          : [],
      scene_context: preparedContext,
      scene_skill: normalize(preparedExpert.skill) || mountedSkill,
      scene_template_type: normalize(preparedExpert.templateType) || "skill",
      scene_agent_key: normalize(preparedExpert.agentKey) || "digital-expert",
      scene_runtime_profile: normalize(preparedExpert.runtimeProfile) || "isolated",
      locked_session_name: true,
      session_display_name: sceneName,
      scene_bootstrap_status: "ready",
    };

    const bootstrapMessage = `已打开「${sceneName}」，正在挂载数字专家上下文，请稍候查看首条专业回复。`;
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
    if (!expert || !sceneKey) return;
    setLaunchingChat(true);
    try {
      const preparedExpert = await resolveExpertScene(expert);
      setExpert(preparedExpert);
      sessionStorage.setItem(
        SCENE_STORAGE,
        JSON.stringify({
          ...preparedExpert,
          ts: Date.now(),
        }),
      );
      const { sessionId, isNew } = await ensureSceneSession(preparedExpert);
      if (isNew) {
        sessionStorage.setItem(
          SCENE_PENDING_STORAGE,
          JSON.stringify({
            id: sessionId,
            prompt: normalize(preparedExpert.prompt) || hiddenPrompt,
            processingText: "正在同步数字专家上下文并生成首条专业回复...",
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
      console.error("Failed to open expert chat:", err);
      message.error("开启专家会话失败，请稍后重试");
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
    return <div style={{ textAlign: "center", padding: 100 }}><Spin size="large" /></div>;
  }

  if (!expert) {
    return (
      <Card style={{ textAlign: "center", padding: 40, borderRadius: 16 }} bordered={false}>
        <Title level={4}>未能加载数字专家详情</Title>
        <Button onClick={() => navigate("/app/expert-center")} type="primary">返回专家中心</Button>
      </Card>
    );
  }

  return (
    <div style={{ maxWidth: 1620, margin: "0 auto", padding: "6px 4px 28px" }}>
      <Card
        bordered={false}
        style={{
          borderRadius: 24,
          marginBottom: 18,
          background: "linear-gradient(120deg, #111827 0%, #312e81 42%, #7c3aed 100%)",
          boxShadow: "0 20px 48px rgba(49, 46, 129, 0.35)",
        }}
        styles={{ body: { padding: 28 } }}
      >
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} xl={16}>
            <Space direction="vertical" size={8}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <Tag color="purple" style={{ borderRadius: 999, paddingInline: 12 }}>
                  <Sparkles size={12} style={{ marginRight: 6 }} /> Agent OS Digital Expert
                </Tag>
                <Text style={{ color: "rgba(255,255,255,0.78)" }}>ID: {expert.agentKey}</Text>
              </div>
              <Title level={2} style={{ margin: 0, color: "#fff", display: "flex", alignItems: "center", gap: 10 }}>
                <Bot size={28} /> {displayName}
              </Title>
              <Text style={{ color: "rgba(255,255,255,0.84)", fontSize: 15 }}>
                详情页内可直接锁定专家会话、注入隐藏提示词并展开会话区，确保首屏先有场景开场内容。
              </Text>
            </Space>
          </Col>
          <Col xs={24} xl={8}>
            <div className="xd-hero-actions">
              <Space wrap>
                <Button icon={<ArrowLeft size={14} />} onClick={() => navigate("/app/expert-center")}>返回专家中心</Button>
                <Button icon={<MessagesSquare size={14} />} onClick={askSecretary}>咨询秘书</Button>
              </Space>
              <Button
                type="primary"
                size="large"
                icon={<Zap size={16} />}
                onClick={() => void openSceneChat()}
                className="xd-primary-btn xd-primary-btn-hero"
                loading={launchingChat}
              >
                分配任务 / 开启会话
              </Button>
              <Text className="xd-hero-tip">专家上下文将随会话首次打开自动注入，后续复用同一命名会话。</Text>
            </div>
          </Col>
        </Row>
      </Card>

      <Row gutter={[18, 18]}>
        <Col xs={24} xl={17}>
          <Space direction="vertical" size={18} style={{ width: "100%" }}>
            <Card title="专家档案" bordered={false} className="xd-surface-card">
              <Paragraph style={{ fontSize: 15, color: "#334155", marginBottom: 12 }}>
                该数字专家面向组织专业场景，支持复杂任务拆解与多步骤执行，可通过独立运行时保障协作稳定性。
              </Paragraph>
              <Divider style={{ margin: "12px 0 16px" }} />
              <Row gutter={[16, 14]}>
                <Col xs={24} md={8}>
                  <Text type="secondary">触发标识</Text>
                  <div className="xd-info-value">{expert.triggerKey}</div>
                </Col>
                <Col xs={24} md={8}>
                  <Text type="secondary">运行时环境</Text>
                  <div style={{ marginTop: 6 }}>
                    <Tag color={expert.runtimeProfile === "isolated" ? "purple" : "cyan"}>
                      {expert.runtimeProfile === "isolated" ? "沙箱隔离模式" : "标准模式"}
                    </Tag>
                  </div>
                </Col>
                <Col xs={24} md={8}>
                  <Text type="secondary">会话命名</Text>
                  <div className="xd-info-value">{sceneName}</div>
                </Col>
              </Row>
            </Card>

            <div ref={chatAnchorRef}>
              <Card
                title="会话区"
                bordered={false}
                className="xd-surface-card"
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
                  <div className="xd-chat-collapsed">
                    <div>
                      <Text strong style={{ fontSize: 16, color: "#0f172a", display: "block", marginBottom: 4 }}>
                        一键进入 {displayName} 的专业会话
                      </Text>
                      <Text type="secondary">
                        打开后会优先确保会话存在、锁定命名，再写入隐藏专家提示词并展开内嵌会话区。
                      </Text>
                      <div style={{ marginTop: 12 }}>
                        <Badge status="processing" text="详情页内嵌会话区默认折叠，可随时再次展开" />
                      </div>
                    </div>
                    <Button
                      type="primary"
                      icon={<Zap size={14} />}
                      className="xd-primary-btn"
                      loading={launchingChat}
                      onClick={() => void openSceneChat()}
                    >
                      立即展开会话
                    </Button>
                  </div>
                )}
              </Card>
            </div>

            <Card title="挂载技能" bordered={false} className="xd-surface-card">
              {mountedSkill ? (
                <div className="xd-skill-banner">
                  <Settings size={19} color="#6d28d9" style={{ marginTop: 1 }} />
                  <div>
                    <Text strong style={{ fontSize: 16, display: "block", marginBottom: 2 }}>{mountedSkill}</Text>
                    <Text type="secondary">该专家已绑定核心技能，可直接调度底层能力进行任务闭环执行。</Text>
                  </div>
                </div>
              ) : (
                <Empty description="该专家暂未绑定特定技能插件，使用通用能力" />
              )}
              <div style={{ marginTop: 14 }}>
                <Text strong style={{ display: "block", marginBottom: 12 }}>标准能力矩阵</Text>
                <Row gutter={[12, 12]}>
                  {["自然语言意图理解", "跨节点 IAP 协议通信", "独立沙箱存储", "任务进度异步回调"].map((item) => (
                    <Col xs={24} md={12} key={item}>
                      <div className="xd-check-item"><CheckCircle2 size={16} color="#22c55e" />{item}</div>
                    </Col>
                  ))}
                </Row>
              </div>
            </Card>
          </Space>
        </Col>

        <Col xs={24} xl={7}>
          <Space direction="vertical" size={18} style={{ width: "100%" }}>
            <Card title="快速操作" bordered={false} className="xd-surface-card" style={{ position: "sticky", top: 16 }}>
              <Space direction="vertical" style={{ width: "100%" }}>
                <Button
                  block
                  size="large"
                  type="primary"
                  icon={<Zap size={14} />}
                  className="xd-primary-btn"
                  loading={launchingChat}
                  onClick={() => void openSceneChat()}
                >
                  开启该专家会话
                </Button>
                <Button block size="large" icon={<MessagesSquare size={14} />} onClick={askSecretary}>
                  让秘书协助评估
                </Button>
                <Button block size="large" icon={<Bot size={14} />} onClick={() => navigate("/app/expert-center")}>
                  返回专家中心
                </Button>
                <div className="xd-note-box">
                  <Badge status="processing" text="会话命名已锁定，专家提示词仅首次自动注入" />
                </div>
              </Space>
            </Card>

            <Card title="运行负载" bordered={false} className="xd-surface-card">
              <div style={{ textAlign: "center", marginBottom: 16 }}>
                <Progress
                  type="dashboard"
                  percent={metrics.load}
                  strokeColor={metrics.load > 80 ? "#ef4444" : "#6366f1"}
                  size={170}
                />
                <div style={{ marginTop: 8, color: "#475569" }}>当前算力占用率</div>
              </div>
              <Divider style={{ margin: "8px 0 14px" }} />
              <Space direction="vertical" style={{ width: "100%" }} size={12}>
                <div className="xd-stat-row"><span><Activity size={15} /> 并发处理中</span><b>{metrics.active} 任务</b></div>
                <div className="xd-stat-row"><span><CheckCircle2 size={15} /> 累计完成</span><b>{metrics.done} 任务</b></div>
                <div className="xd-stat-row"><span><Clock size={15} /> 平均响应耗时</span><b>{metrics.avg}s</b></div>
              </Space>
            </Card>
          </Space>
        </Col>
      </Row>

      <div className="xd-float-actions">
        <Button
          type="primary"
          icon={<Zap size={14} />}
          className="xd-primary-btn xd-float-primary"
          loading={launchingChat}
          onClick={() => void openSceneChat()}
        >
          开启会话
        </Button>
        <Button icon={<MessagesSquare size={14} />} className="xd-float-secondary" onClick={askSecretary}>
          分配任务
        </Button>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
            .xd-surface-card {
              border-radius: 18px;
              background: linear-gradient(180deg, #ffffff 0%, #fafafa 100%);
              box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
            }
            .xd-primary-btn {
              border: none !important;
              border-radius: 12px !important;
              background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%) !important;
              box-shadow: 0 12px 26px rgba(99, 102, 241, 0.32);
            }
            .xd-primary-btn-hero {
              min-width: 240px;
              height: 48px;
              font-weight: 700;
            }
            .xd-hero-actions {
              display: flex;
              flex-direction: column;
              align-items: flex-end;
              gap: 12px;
            }
            .xd-hero-tip {
              color: rgba(255,255,255,0.76);
              font-size: 12px;
            }
            .xd-skill-banner {
              display: flex;
              gap: 12px;
              align-items: flex-start;
              background: linear-gradient(180deg, #faf5ff 0%, #f3e8ff 100%);
              border: 1px solid #e9d5ff;
              border-radius: 12px;
              padding: 14px;
            }
            .xd-info-value {
              margin-top: 6px;
              font-weight: 700;
              color: #0f172a;
              word-break: break-all;
            }
            .xd-check-item {
              display: inline-flex;
              align-items: center;
              gap: 8px;
              width: 100%;
              padding: 10px 12px;
              border: 1px solid #e2e8f0;
              border-radius: 10px;
              background: #f8fafc;
            }
            .xd-chat-collapsed {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 16px;
              padding: 18px;
              border-radius: 16px;
              border: 1px solid #e9d5ff;
              background: linear-gradient(135deg, #faf5ff 0%, #fcfcff 100%);
            }
            .xd-chat-shell {
              border-radius: 20px;
              border: 1px solid #e9d5ff;
              box-shadow: 0 10px 30px rgba(15,23,42,0.06);
              overflow: hidden;
              background: linear-gradient(180deg, #ffffff 0%, #faf5ff 100%);
            }
            .xd-chat-toolbar {
              padding: 12px 18px;
              border-bottom: 1px solid #ede9fe;
              background: #faf5ff;
              display: flex;
              justify-content: space-between;
              align-items: center;
              gap: 12px;
              flex-wrap: wrap;
            }
            .xd-chat-progress {
              padding: 14px 18px;
              background: linear-gradient(135deg, #faf5ff 0%, #fcfcff 100%);
              border-bottom: 1px solid #ede9fe;
            }
            .xd-chat-frame-wrap {
              padding: 16px;
              background: #f5f3ff;
            }
            .xd-chat-frame-wrap iframe {
              border-radius: 16px;
              overflow: hidden;
              box-shadow: 0 10px 30px rgba(15,23,42,0.08);
            }
            .xd-stat-row {
              display: flex;
              align-items: center;
              justify-content: space-between;
              border: 1px solid #e2e8f0;
              border-radius: 10px;
              padding: 10px 12px;
            }
            .xd-stat-row span {
              display: inline-flex;
              align-items: center;
              gap: 6px;
              color: #475569;
            }
            .xd-note-box {
              border-radius: 10px;
              border: 1px dashed #c4b5fd;
              background: #f5f3ff;
              padding: 10px 12px;
            }
            .xd-float-actions {
              position: fixed;
              right: 24px;
              bottom: 28px;
              z-index: 1100;
              display: flex;
              flex-direction: column;
              gap: 10px;
            }
            .xd-float-primary {
              height: 44px;
              padding-inline: 16px !important;
              border-radius: 14px !important;
            }
            .xd-float-secondary {
              border-radius: 14px !important;
              box-shadow: 0 10px 24px rgba(15, 23, 42, 0.12);
            }
            @media (max-width: 1200px) {
              .xd-hero-actions {
                align-items: flex-start;
              }
            }
            @media (max-width: 768px) {
              .xd-chat-collapsed {
                flex-direction: column;
                align-items: flex-start;
              }
              .xd-float-actions {
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
