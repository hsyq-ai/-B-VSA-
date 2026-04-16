import { useEffect, useMemo, useState } from "react";
import {
  Card,
  Input,
  Tabs,
  Tag,
  Avatar,
  Typography,
  Space,
  Row,
  Col,
  Button,
  Empty,
  Spin,
  message,
} from "antd";
import {
  Search,
  Zap,
  Trophy,
  Clock3,
  Crown,
  Sparkles,
  ArrowUpRight,
  Radar,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { promptTemplateApi } from "../../api/modules/promptTemplates";
import { expertCenterSkillApi } from "../../api/modules/expertCenterSkills";
import { authApi } from "../../api/modules/auth";
import PageAiInsightCard from "../../components/employee/ai/PageAiInsightCard";
import { usePageAiContextSync } from "../../components/employee/ai/pageAiContextBridge";
import { openSecretaryWithContext } from "../../features/party/shared/navigation";
import { buildBusinessAvatar, getPersonAvatarSeed } from "../../utils/avatar";

const { Title, Text, Paragraph } = Typography;

interface ExpertTemplate {
  id: string;
  trigger_key: string;
  display_name: string;
  session_name?: string;
  category?: string;
  agent_key?: string;
  agent_name?: string;
  runtime_profile?: "standard" | "isolated";
  expert_profile?: string;
  skill?: string;
  enabled?: boolean;
  updated_at?: number;
}

const CATEGORY_MAP: Record<string, string> = {
  strategy: "战略专家",
  product: "产品专家",
  legal: "法务专家",
  rd: "研发专家",
  marketing: "市场专家",
  finance: "财务专家",
  data: "数据分析",
  ai: "AI研究",
  test: "质量保障",
  ops: "运维专家",
  research: "科研助理",
  general: "通用专家",
  "digital-employee": "数字专家",
};

const normalize = (value: unknown) => String(value || "").trim();

const inferCategory = (item: ExpertTemplate): string => {
  const raw = normalize(item.category).toLowerCase();
  if (raw && raw !== "digital-employee") return raw;
  const trigger = normalize(item.trigger_key).toLowerCase();
  if (trigger.includes("strategy") || trigger.includes("exec")) return "strategy";
  if (trigger.includes("product")) return "product";
  if (trigger.includes("legal")) return "legal";
  if (trigger.includes("finance") || trigger.includes("budget") || trigger.includes("tax")) return "finance";
  if (trigger.includes("data")) return "data";
  if (trigger.includes("ai")) return "ai";
  if (trigger.includes("test") || trigger.includes("quality")) return "test";
  if (trigger.includes("ops") || trigger.includes("release")) return "ops";
  if (trigger.includes("research") || trigger.includes("paper") || trigger.includes("literature")) return "research";
  if (trigger.includes("marketing") || trigger.includes("brand")) return "marketing";
  if (trigger.includes("rd") || trigger.includes("dev") || trigger.includes("tech")) return "rd";
  return "general";
};

const formatUpdatedAt = (value?: number) => {
  if (!value) return "-";
  return new Date(value * 1000).toLocaleString();
};

const CATEGORY_AVATAR_SYMBOL: Record<string, string> = {
  strategy: "策",
  product: "产",
  legal: "法",
  rd: "研",
  marketing: "营",
  finance: "财",
  data: "数",
  ai: "智",
  test: "质",
  ops: "运",
  research: "科",
  general: "专",
  "digital-employee": "专",
};

const getExpertAvatar = (expert: ExpertTemplate) => {
  const key = normalize(expert.id) || normalize(expert.trigger_key) || normalize(expert.display_name) || "expert";
  const seed = getPersonAvatarSeed(key, "expert");
  const category = normalize(expert.category);
  const fallback = normalize(expert.display_name).charAt(0) || "专";
  const symbol = CATEGORY_AVATAR_SYMBOL[category] || fallback;
  const avatar = buildBusinessAvatar({ seed, name: normalize(expert.display_name) || symbol });

  return {
    ...avatar,
    symbol,
  };
};

export default function ExpertCenterPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [experts, setExperts] = useState<ExpertTemplate[]>([]);
  const [searchText, setSearchText] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [currentUserName, setCurrentUserName] = useState("当前员工");

  const currentDept = sessionStorage.getItem("copaw_department") || localStorage.getItem("copaw_department") || "";
  const currentUserId =
    sessionStorage.getItem("copaw_user_id") || localStorage.getItem("copaw_user_id") || "";

  useEffect(() => {
    authApi
      .getMe()
      .then((me: any) => {
        setCurrentUserName(normalize(me?.name) || "当前员工");
      })
      .catch(() => void 0);
  }, []);

  useEffect(() => {
    let canceled = false;

    const loadExperts = async () => {
      setLoading(true);
      try {
        const ruleRes = await expertCenterSkillApi.resolveExpertCenterSkills(currentDept || "");
        const allowedTriggers = new Set(
          Array.isArray(ruleRes?.triggers)
            ? ruleRes.triggers.map((item) => normalize(item))
            : [],
        );

        const res = await promptTemplateApi.listDigitalEmployees();
        const groups = Array.isArray(res?.items) ? res.items : [];
        const raw = groups.flatMap((group) =>
          (Array.isArray(group.templates) ? group.templates : []).map((template) => ({
            id: normalize(template.id) || `${normalize(group.agent_key)}-${normalize(template.trigger_key)}`,
            trigger_key: normalize(template.trigger_key),
            display_name: normalize(template.display_name),
            session_name: normalize(template.session_name),
            runtime_profile: template.runtime_profile,
            skill: normalize(template.skill),
            agent_key: normalize(group.agent_key) || "digital-expert",
            agent_name: normalize(group.agent_name),
            enabled: true,
          })),
        );

        const realExperts = raw
          .filter((item) => item.trigger_key)
          .filter((item) => !allowedTriggers.size || allowedTriggers.has(item.trigger_key))
          .filter((item) => item.enabled !== false)
          .map((item) => ({
            ...item,
            category: inferCategory(item),
          }));

        if (!canceled) {
          setExperts(realExperts);
        }
      } catch (err) {
        console.error("Failed to load experts:", err);
        if (!canceled) {
          setExperts([]);
          message.error("加载专家列表失败");
        }
      } finally {
        if (!canceled) setLoading(false);
      }
    };

    void loadExperts();
    return () => {
      canceled = true;
    };
  }, [currentDept]);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    experts.forEach((e) => {
      const c = normalize(e.category);
      if (c) cats.add(c);
    });
    return Array.from(cats);
  }, [experts]);

  const filteredExperts = useMemo(() => {
    const keyword = searchText.toLowerCase().trim();
    return experts.filter((e) => {
      const name = normalize(e.display_name).toLowerCase();
      const profile = normalize(e.expert_profile).toLowerCase();
      const category = normalize(e.category).toLowerCase();
      const matchesSearch = !keyword || name.includes(keyword) || profile.includes(keyword) || category.includes(keyword);
      const matchesTab = activeTab === "all" || normalize(e.category) === activeTab;
      return matchesSearch && matchesTab;
    });
  }, [experts, searchText, activeTab]);

  const rankingList = useMemo(() => {
    return [...experts]
      .sort((a, b) => Number(b.updated_at || 0) - Number(a.updated_at || 0))
      .slice(0, 10);
  }, [experts]);

  const aiPageContext = useMemo(() => {
    const deptLabel = normalize(currentDept) || "当前组织";
    const categoryLabel = activeTab === "all" ? "全部领域" : CATEGORY_MAP[activeTab] || activeTab;
    const keywordLabel = normalize(searchText) || "无关键词";
    const focusExpert = filteredExperts[0] || rankingList[0] || null;
    const focusName = normalize(focusExpert?.display_name) || "暂无优先专家";

    return {
      path: "/app/expert-center",
      source: "expert-center",
      title: filteredExperts.length > 0 ? `当前正在筛选 ${categoryLabel} 方向专家` : `当前 ${categoryLabel} 方向暂无可用专家`,
      summary: `部门视角：${deptLabel}；当前领域：${categoryLabel}；搜索词：${keywordLabel}；当前结果 ${filteredExperts.length} 位。`,
      tags: [deptLabel, categoryLabel],
      insights: [`优先候选：${focusName}`, `当前共可见 ${experts.length} 位专家`, `覆盖 ${categories.length} 个能力领域`],
      quickPrompts:
        focusExpert
          ? [`为什么当前应优先联系${focusName}`, `基于当前问题为我安排${focusName}的咨询切入点`, "结合当前筛选推荐多专家联席顺序"]
          : ["当前筛选下暂无专家，帮我判断应该先放宽哪个筛选条件", "请基于当前部门视角推荐可补充的专家方向"],
      promptContext: [
        "页面：专家中心",
        `当前操作者：${currentUserName}`,
        `部门视角：${deptLabel}`,
        `当前领域：${categoryLabel}`,
        `搜索关键词：${keywordLabel}`,
        `当前结果数：${filteredExperts.length}`,
        `专家总量：${experts.length}`,
        `覆盖领域数：${categories.length}`,
        `优先候选专家：${focusName}`,
      ].join("\n"),
    };
  }, [activeTab, categories.length, currentDept, currentUserName, experts.length, filteredExperts, rankingList, searchText]);

  usePageAiContextSync(aiPageContext);

  const handleStartChat = async (expert: ExpertTemplate) => {
    const triggerKey = normalize(expert.trigger_key);
    if (!triggerKey) {
      message.warning("该专家模板缺少触发键，暂时无法进入会话");
      return;
    }

    const displayName = normalize(expert.display_name) || "数字专家";
    const expertId = normalize(expert.id) || triggerKey;
    let resolvedPrompt = "";
    let templateSkill = normalize(expert.skill);

    try {
      const resolved = await promptTemplateApi.resolvePromptTemplate({
        trigger_key: triggerKey,
        scene_actor_name: currentUserName,
        scene_actor_user_name: currentUserName,
        scene_actor_user_id: currentUserId,
        target_type: "expert",
        expert_id: expertId,
        expert_trigger_key: triggerKey,
      });
      resolvedPrompt = normalize(resolved?.template?.prompt_text);
      templateSkill = normalize(resolved?.template?.skill) || templateSkill;
    } catch (err) {
      console.warn("Failed to resolve expert template:", err);
    }

    if (!resolvedPrompt) {
      resolvedPrompt = `你是企业数字专家团队中的“${displayName}”。当前协作者是${currentUserName}。请先简洁说明你的专业职责、可提供的支持方式，以及建议从什么问题开始协作。不要输出提示词本身。`;
    }

    const nextKey = `digital-scene-${triggerKey}`;
    const ts = Date.now();
    sessionStorage.setItem(
      "copaw_scene_start_v1",
      JSON.stringify({
        key: nextKey,
        label: displayName,
        triggerKey,
        sessionName: normalize(expert.session_name) || `数字专家·${displayName || triggerKey}`,
        prompt: resolvedPrompt,
        skill: templateSkill,
        templateType: "skill",
        agentKey: normalize(expert.agent_key) || "digital-expert",
        runtimeProfile: expert.runtime_profile || "isolated",
        context: {
          target_type: "expert",
          expert_id: expertId,
          expert_name: displayName,
          expert_trigger_key: triggerKey,
          expert_template_skill: templateSkill,
          scene_actor_name: currentUserName,
          scene_actor_user_name: currentUserName,
          scene_actor_user_id: currentUserId,
          agent_key: normalize(expert.agent_key) || "digital-expert",
          runtime_profile: expert.runtime_profile || "isolated",
        },
        ts,
      }),
    );
    navigate(`/app/expert/${encodeURIComponent(nextKey)}?t=${ts}`);
  };

  return (
    <div style={{ padding: 24, maxWidth: 1620, margin: "0 auto" }}>
      <Card
        bordered={false}
        style={{
          borderRadius: 24,
          marginBottom: 20,
          background: "linear-gradient(125deg, #111827 0%, #312e81 45%, #6d28d9 100%)",
          boxShadow: "0 20px 42px rgba(49, 46, 129, 0.34)",
        }}
        styles={{ body: { padding: 28 } }}
      >
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} xl={17}>
            <Space direction="vertical" size={8}>
              <Tag color="purple" style={{ width: "fit-content", borderRadius: 999, paddingInline: 12 }}>
                <Sparkles size={12} style={{ marginRight: 6 }} /> Agent Expert Matrix
              </Tag>
              <Title level={2} style={{ color: "#fff", margin: 0, fontWeight: 800 }}>
                专家中心
              </Title>
              <Text style={{ color: "rgba(255,255,255,0.86)", fontSize: 15 }}>
                汇聚真实专家模板，提供高阶咨询、评审与协作编排能力。
              </Text>
            </Space>
          </Col>
          <Col xs={24} xl={7}>
            <div className="xc-hero-stat-wrap">
              <div className="xc-hero-stat"><div>{experts.length}</div><span>专家总数</span></div>
              <div className="xc-hero-stat"><div>{categories.length}</div><span>能力领域</span></div>
              <div className="xc-hero-stat"><div>{filteredExperts.length}</div><span>筛选结果</span></div>
            </div>
          </Col>
        </Row>
      </Card>

      <PageAiInsightCard
        badge="AI 专家路由"
        tone="violet"
        title={filteredExperts.length > 0 ? `红智助手已为你识别 ${filteredExperts.length} 位可用专家` : "红智助手已识别当前暂无可用专家"}
        description="专家中心现在会直接暴露专家推荐、联席建议与高匹配专家入口，而不是只展示一组专家卡片。"
        insights={[
          `专家总量：${experts.length} 位`,
          `覆盖领域：${categories.length} 类`,
          `优先候选：${normalize((filteredExperts[0] || rankingList[0])?.display_name) || "请检查专家模板启用情况"}`,
        ]}
        suggestions={[
          "先根据当前问题选择最匹配的专家，再决定是否扩展为多专家联席。",
          "复杂议题建议让秘书先解释推荐原因，避免盲目切换专家。",
          "高频问题可以直接固化为专家协作模板，降低重复选择成本。",
        ]}
        actions={[
          {
            key: "expert-route",
            label: "让秘书推荐专家组合",
            type: "primary",
            onClick: () =>
              openSecretaryWithContext(
                navigate,
                `专家中心：当前共 ${experts.length} 位专家、${categories.length} 个能力领域，当前优先候选是 ${normalize((filteredExperts[0] || rankingList[0])?.display_name) || "暂无"}。请基于当前场景推荐专家组合与联席顺序。`,
              ),
          },
          {
            key: "expert-first",
            label: filteredExperts[0] ? `咨询 ${normalize(filteredExperts[0].display_name) || "首位专家"}` : "查看专家排行",
            onClick: () =>
              filteredExperts[0] ? void handleStartChat(filteredExperts[0]) : message.info("当前暂无可直接咨询的专家，请先检查筛选条件"),
          },
          { key: "expert-workbench", label: "进入智能工作台", onClick: () => navigate("/app/research-experiment") },
        ]}
      />

      <Row gutter={20}>
        <Col xs={24} lg={17}>
          <Card bordered={false} className="xc-surface-card" style={{ marginBottom: 18 }}>
            <Input
              prefix={<Search size={18} color="#64748b" />}
              placeholder="搜索专家名称、能力领域或简介"
              size="large"
              allowClear
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ borderRadius: 12, height: 46 }}
            />
            <div style={{ marginTop: 16 }}>
              <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                items={[
                  { key: "all", label: "全部领域" },
                  ...categories.map((cat) => ({ key: cat, label: CATEGORY_MAP[cat] || cat })),
                ]}
              />
            </div>
          </Card>

          {loading ? (
            <Card bordered={false} className="xc-surface-card" style={{ textAlign: "center", padding: 48 }}>
              <Spin tip="正在加载真实数字专家..." />
            </Card>
          ) : (
            <Row gutter={[16, 16]}>
              {filteredExperts.length > 0 ? (
                filteredExperts.map((expert) => {
                  const avatar = getExpertAvatar(expert);
                  return (
                    <Col xs={24} md={12} xxl={8} key={expert.id}>
                      <Card bordered={false} hoverable className="xc-expert-card" onClick={() => void handleStartChat(expert)}>
                        <div style={{ display: "flex", gap: 14, marginBottom: 12 }}>
                          <Avatar
                            size={54}
                            src={avatar.src}
                            style={{
                              background: avatar.background,
                              boxShadow: "0 10px 20px rgba(79, 70, 229, 0.22)",
                              fontWeight: 800,
                              fontSize: 22,
                            }}
                          >
                            {avatar.symbol}
                          </Avatar>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                              <Title level={4} style={{ margin: 0, fontSize: 17 }} ellipsis>
                                {normalize(expert.display_name) || "未命名专家"}
                              </Title>
                              <Tag color="purple" style={{ borderRadius: 8, margin: 0 }}>
                                {CATEGORY_MAP[normalize(expert.category)] || "数字专家"}
                              </Tag>
                            </div>
                            <Text type="secondary" style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6 }}>
                              <Clock3 size={12} /> {formatUpdatedAt(expert.updated_at)}
                            </Text>
                          </div>
                        </div>

                        <Paragraph ellipsis={{ rows: 2 }} style={{ color: "#64748b", minHeight: 42, marginBottom: 14 }}>
                          {normalize(expert.expert_profile) || "该数字专家由真实模板提供，支持高质量专业协作与任务执行。"}
                        </Paragraph>

                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <Space size={6}>
                            <Tag className="xc-soft-tag">深度咨询</Tag>
                            <Tag className="xc-soft-tag">实时协作</Tag>
                          </Space>
                          <Button type="text" style={{ color: "#4f46e5", fontWeight: 600 }}>
                            咨询此专家 <ArrowUpRight size={14} />
                          </Button>
                        </div>
                      </Card>
                    </Col>
                  );
                })
              ) : (
                <Col span={24}>
                  <Card bordered={false} className="xc-surface-card">
                    <Empty description="暂无可用数字专家（请检查后台数字专家模板是否启用）" />
                  </Card>
                </Col>
              )}
            </Row>
          )}
        </Col>

        <Col xs={24} lg={7}>
          <Card bordered={false} className="xc-surface-card" style={{ position: "sticky", top: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <Text strong style={{ fontSize: 16 }}><Trophy size={17} style={{ marginRight: 6 }} /> 专家排行榜</Text>
              <Tag color="gold">TOP 10</Tag>
            </div>
            {rankingList.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无排行数据" />
            ) : (
              rankingList.map((expert, index) => {
                const avatar = getExpertAvatar(expert);
                return (
                  <div key={expert.id} className="xc-rank-item" onClick={() => void handleStartChat(expert)}>
                    <div className="xc-rank-index">{index === 0 ? <Crown size={15} fill="#f59e0b" /> : index + 1}</div>
                    <Avatar
                      size={34}
                      src={avatar.src}
                      style={{
                        background: avatar.background,
                        boxShadow: index < 3 ? "0 10px 18px rgba(79, 70, 229, 0.22)" : "none",
                        fontWeight: 800,
                        fontSize: 14,
                      }}
                    >
                      {avatar.symbol}
                    </Avatar>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {normalize(expert.display_name) || "未命名专家"}
                      </div>
                      <Text type="secondary" style={{ fontSize: 12 }}>{CATEGORY_MAP[normalize(expert.category)] || "数字专家"}</Text>
                    </div>
                    <Radar size={15} color="#6366f1" />
                  </div>
                );
              })
            )}
            <Button block type="default" icon={<Zap size={14} />} style={{ marginTop: 10 }} onClick={() => setActiveTab("all")}>
              查看全部专家
            </Button>
          </Card>
        </Col>
      </Row>

      <style
        dangerouslySetInnerHTML={{
          __html: `
            .xc-surface-card {
              border-radius: 20px;
              background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
              box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
            }
            .xc-expert-card {
              border-radius: 18px;
              border: 1px solid #ede9fe;
              background: linear-gradient(180deg, #ffffff 0%, #faf8ff 100%);
              box-shadow: 0 8px 18px rgba(15, 23, 42, 0.07);
              transition: all .25s ease;
            }
            .xc-expert-card:hover {
              transform: translateY(-4px);
              box-shadow: 0 16px 30px rgba(124, 58, 237, 0.2);
              border-color: #c4b5fd;
            }
            .xc-soft-tag {
              border: none !important;
              background: #f3f4f6 !important;
              color: #64748b !important;
              border-radius: 8px !important;
            }
            .xc-rank-item {
              display: flex;
              align-items: center;
              gap: 10px;
              padding: 10px;
              border-radius: 12px;
              border: 1px solid #eef2ff;
              margin-bottom: 9px;
              cursor: pointer;
              transition: all .2s ease;
            }
            .xc-rank-item:hover {
              background: #f8faff;
              border-color: #c7d2fe;
            }
            .xc-rank-index {
              width: 24px;
              text-align: center;
              font-weight: 800;
              color: #64748b;
              font-size: 13px;
            }
            .xc-hero-stat-wrap {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 8px;
            }
            .xc-hero-stat {
              border: 1px solid rgba(255,255,255,0.25);
              background: rgba(255,255,255,0.1);
              border-radius: 12px;
              text-align: center;
              padding: 8px;
            }
            .xc-hero-stat div {
              color: #fff;
              font-size: 19px;
              font-weight: 800;
              line-height: 1.1;
            }
            .xc-hero-stat span {
              color: rgba(255,255,255,0.82);
              font-size: 12px;
            }
          `,
        }}
      />
    </div>
  );
}
