import {
  ArrowRight,
  Award,
  BarChart3,
  CheckCircle2,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useNavigate } from "react-router-dom";
import {
  memberEvaluationApi,
  type CandidateStatus,
  type EvaluationLevel,
  type MemberEvaluationItem,
} from "../../api/modules/memberEvaluation";
import PageAiInsightCard from "../../components/employee/ai/PageAiInsightCard";
import {
  type MemberEvaluationFormValues,
  type MemberEvaluationSecretaryAction,
  buildMemberEvaluationDerived,
  buildMemberEvaluationSecretaryContext,
  candidateStatusColorMap,
  candidateStatusOptions,
  formatTime,
  levelColorMap,
  levelOptions,
  loadLocal,
  resolveCandidateStatus,
  saveLocal,
  sortByScore,
} from "../../features/party/member-evaluation";
import { openSecretaryWithContext } from "../../features/party/shared/navigation";
import { allowPartyLocalFallback } from "../../utils/runtimeFlags";

const { Title, Paragraph, Text } = Typography;

const cardShadow = "0 16px 32px rgba(15,23,42,0.06)";

function StatCard({
  title,
  value,
  icon,
  color,
  description,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  description: string;
}) {
  return (
    <Card
      bordered={false}
      styles={{ body: { padding: 20 } }}
      style={{
        borderRadius: 24,
        background: "linear-gradient(180deg, #ffffff 0%, #fff8f5 100%)",
        boxShadow: cardShadow,
      }}
    >
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: `${color}18`,
              color,
            }}
          >
            {icon}
          </div>
          <Text style={{ color: "#64748b", fontSize: 12 }}>{title}</Text>
        </div>
        <div style={{ fontSize: 28, fontWeight: 800, color: "#0f172a", lineHeight: 1 }}>{value}</div>
        <Text style={{ color: "#8c8c8c", lineHeight: 1.7 }}>{description}</Text>
      </Space>
    </Card>
  );
}

export default function EmployeeMemberEvaluationPage() {
  const [form] = Form.useForm<MemberEvaluationFormValues>();
  const [items, setItems] = useState<MemberEvaluationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const reload = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const remote = await memberEvaluationApi.list();
      const sorted = sortByScore(remote);
      setItems(sorted);
      saveLocal(sorted);
    } catch {
      if (allowPartyLocalFallback) {
        const local = sortByScore(loadLocal());
        setItems(local);
        if (!silent) message.warning("接口不可用，已切换为本地暂存模式");
      } else if (!silent) {
        message.error("加载失败，请检查后端服务或联系管理员");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void reload(false);
  }, []);

  const handleCreate = async (values: MemberEvaluationFormValues) => {
    setSubmitting(true);
    const payload = {
      member_name: values.member_name.trim(),
      branch_name: values.branch_name.trim(),
      level: values.level,
      score: Number(values.score),
      reviewer: values.reviewer?.trim() || "",
      remark: values.remark?.trim() || "",
    };
    try {
      const created = await memberEvaluationApi.create(payload);
      const next = sortByScore([created, ...items]);
      setItems(next);
      saveLocal(next);
      form.resetFields();
      message.success("测评记录已创建");
    } catch {
      if (allowPartyLocalFallback) {
        const now = new Date().toISOString();
        const localItem: MemberEvaluationItem = {
          id: `local-${Date.now()}`,
          member_name: payload.member_name,
          branch_name: payload.branch_name,
          level: payload.level,
          score: payload.score,
          reviewer: payload.reviewer,
          remark: payload.remark,
          created_at: now,
          updated_at: now,
        };
        const next = sortByScore([localItem, ...items]);
        setItems(next);
        saveLocal(next);
        form.resetFields();
        message.success("测评记录已创建（本地暂存）");
      } else {
        message.error("创建失败，请稍后重试");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const persistLocalPatch = (record: MemberEvaluationItem, patch: Partial<MemberEvaluationItem>) => {
    const next = items.map((item) =>
      item.id === record.id
        ? { ...item, ...patch, updated_at: patch.updated_at || new Date().toISOString() }
        : item,
    );
    const sorted = sortByScore(next);
    setItems(sorted);
    saveLocal(sorted);
  };

  const handleLevelChange = async (record: MemberEvaluationItem, level: EvaluationLevel) => {
    try {
      await memberEvaluationApi.update(record.id, { level });
      persistLocalPatch(record, { level, updated_at: new Date().toISOString() });
      message.success("等级已更新");
    } catch {
      if (allowPartyLocalFallback) {
        persistLocalPatch(record, { level, updated_at: new Date().toISOString() });
        message.success("等级已更新（本地暂存）");
      } else {
        message.error("等级更新失败，请稍后重试");
      }
    }
  };

  const handleCandidateStatusChange = async (
    record: MemberEvaluationItem,
    candidate_status: CandidateStatus,
  ) => {
    const now = new Date().toISOString();
    const patch: Partial<MemberEvaluationItem> = {
      candidate_status,
      candidate_updated_at: now,
      candidate_rank: candidate_status === "未入选" ? undefined : record.candidate_rank || 0,
      candidate_reason:
        candidate_status === "未入选"
          ? ""
          : record.candidate_reason || `依据测评分数 ${record.score} 分纳入优秀候选观察。`,
    };
    try {
      await memberEvaluationApi.update(record.id, patch);
      persistLocalPatch(record, patch);
      message.success(candidate_status === "已推荐" ? "已加入优秀候选清单" : "候选状态已更新");
    } catch {
      if (allowPartyLocalFallback) {
        persistLocalPatch(record, patch);
        message.success("候选状态已更新（本地暂存）");
      } else {
        message.error("候选状态更新失败，请稍后重试");
      }
    }
  };

  const { excellentList, candidateList, stats, topMember, topBranch } = useMemo(
    () => buildMemberEvaluationDerived(items),
    [items],
  );

  const navigate = useNavigate();
  const askSecretary = (action: MemberEvaluationSecretaryAction = "pioneer") => {
    openSecretaryWithContext(
      navigate,
      buildMemberEvaluationSecretaryContext(action, {
        topMember,
        topBranch,
        candidateList,
        stats,
      }),
    );
  };
  const scrollToCreateForm = () => {
    form.scrollToField("member_name");
  };

  const columns: ColumnsType<MemberEvaluationItem> = [
    {
      title: "党员姓名",
      dataIndex: "member_name",
      key: "member_name",
      width: 180,
      render: (_value: string, record) => (
        <Space direction="vertical" size={2}>
          <Text strong style={{ color: "#0f172a" }}>{record.member_name}</Text>
          <Text style={{ color: "#64748b", fontSize: 12 }}>{record.branch_name}</Text>
        </Space>
      ),
    },
    {
      title: "评分",
      dataIndex: "score",
      key: "score",
      width: 90,
      render: (value: number) => `${value}`,
      sorter: (a, b) => a.score - b.score,
    },
    {
      title: "等级",
      dataIndex: "level",
      key: "level",
      width: 150,
      render: (value: EvaluationLevel, record) => (
        <Select<EvaluationLevel>
          size="small"
          value={value}
          style={{ width: 110 }}
          onChange={(next) => void handleLevelChange(record, next)}
          options={levelOptions.map((option) => ({ label: option, value: option }))}
        />
      ),
    },
    {
      title: "候选状态",
      dataIndex: "candidate_status",
      key: "candidate_status",
      width: 150,
      render: (_value: CandidateStatus | undefined, record) => {
        const currentStatus = resolveCandidateStatus(record);
        return (
          <Select<CandidateStatus>
            size="small"
            value={currentStatus}
            style={{ width: 110 }}
            onChange={(next) => void handleCandidateStatusChange(record, next)}
            options={candidateStatusOptions.map((option) => ({ label: option, value: option }))}
          />
        );
      },
    },
    {
      title: "评审人",
      dataIndex: "reviewer",
      key: "reviewer",
      width: 130,
      render: (value?: string) => value || "-",
    },
    {
      title: "评语摘要",
      dataIndex: "remark",
      key: "remark",
      ellipsis: true,
      render: (value?: string) => value || "-",
    },
    {
      title: "更新时间",
      dataIndex: "updated_at",
      key: "updated_at",
      width: 180,
      render: (_: string | undefined, record) => formatTime(record.updated_at || record.created_at),
    },
  ];

  return (
    <Space className="lux-shell" direction="vertical" size={18} style={{ width: "100%" }}>
      <Card
        bordered={false}
        style={{
          borderRadius: 28,
          overflow: "hidden",
          background:
            "radial-gradient(circle at top left, rgba(255,255,255,0.32) 0%, rgba(255,255,255,0) 34%), linear-gradient(135deg, #111827 0%, #7f1d1d 50%, #c2410c 100%)",
          boxShadow: "0 28px 48px rgba(127,29,29,0.24)",
        }}
        styles={{ body: { padding: 28 } }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
          <Space direction="vertical" size={14} style={{ maxWidth: 780 }}>
            <Tag
              bordered={false}
              style={{
                marginInlineEnd: 0,
                width: "fit-content",
                color: "#ffedd5",
                background: "rgba(255,255,255,0.14)",
                borderRadius: 999,
                padding: "6px 12px",
                fontWeight: 700,
              }}
            >
              书记驾驶舱 · 党务管理
            </Tag>
            <div>
              <Title level={2} style={{ margin: 0, color: "#fff7ed" }}>
                党员测评
              </Title>
              <Paragraph style={{ margin: "12px 0 0", color: "rgba(255,247,237,0.86)", lineHeight: 1.9, fontSize: 15 }}>
                将党员表现评估、等级调整、评语沉淀与支部横向对比统一收拢到同一驾驶舱，帮助书记快速识别先锋示范对象、跟踪成长梯队，并让测评工作更正式、更有质感。
              </Paragraph>
            </div>
            <Space size={[8, 8]} wrap>
              <Tag color="gold" style={{ borderRadius: 999, paddingInline: 10 }}>先锋示范识别</Tag>
              <Tag color="blue" style={{ borderRadius: 999, paddingInline: 10 }}>量化评分沉淀</Tag>
              <Tag color="purple" style={{ borderRadius: 999, paddingInline: 10 }}>支部横向对标</Tag>
            </Space>
          </Space>
          <Space wrap>
            <Button icon={<RefreshCw size={14} />} onClick={() => void reload(false)} loading={loading}>
              同步数据
            </Button>
            <Button onClick={() => askSecretary("pioneer")} icon={<Sparkles size={14} />}>
              交给秘书研判
            </Button>
            <Button type="primary" danger icon={<Plus size={14} />} onClick={scrollToCreateForm}>
              新增测评记录
            </Button>
          </Space>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        <StatCard title="总测评人数" value={stats.total} icon={<Users size={20} />} color="#2563eb" description="当前已纳入测评台账的党员总量，可持续用于年度对比与梯队分析。" />
        <StatCard title="优秀党员" value={stats.excellent} icon={<Star size={20} />} color="#d97706" description="达到优秀等级、可作为先锋示范对象重点展示的党员数量。" />
        <StatCard title="平均得分" value={stats.avgScore} icon={<BarChart3 size={20} />} color="#0f766e" description="从当前测评数据估算出的整体表现均值，用于观察组织活力趋势。" />
        <StatCard title="待评审补全" value={stats.pendingReview} icon={<CheckCircle2 size={20} />} color="#7c3aed" description="仍缺少评审人或需要完善评语沉淀的测评记录数量。" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        <Card
          bordered={false}
          styles={{ body: { padding: 22 } }}
          style={{
            borderRadius: 24,
            background: "linear-gradient(180deg, #ffffff 0%, #fff8f5 100%)",
            border: "1px solid rgba(194,65,12,0.12)",
            boxShadow: "0 12px 24px rgba(15,23,42,0.04)",
          }}
        >
          <Text style={{ color: "#c2410c", fontSize: 12, fontWeight: 700 }}>当前最佳表现</Text>
          <div style={{ margin: "10px 0", fontSize: 18, fontWeight: 700, color: "#0f172a", lineHeight: 1.6 }}>
            {topMember ? `${topMember.member_name} · ${topMember.score} 分` : "暂无测评样本"}
          </div>
          <Text style={{ color: "#64748b", lineHeight: 1.9 }}>
            {topMember
              ? `${topMember.branch_name} 当前表现领先，建议结合“${topMember.level}”等级与评语，沉淀为先锋示范材料。`
              : "建议先录入党员测评记录，逐步形成书记侧可观测的个人表现画像。"}
          </Text>
        </Card>
        <Card
          bordered={false}
          styles={{ body: { padding: 22 } }}
          style={{
            borderRadius: 24,
            background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
            border: "1px solid rgba(59,130,246,0.12)",
            boxShadow: "0 12px 24px rgba(15,23,42,0.04)",
          }}
        >
          <Text style={{ color: "#1d4ed8", fontSize: 12, fontWeight: 700 }}>支部画像</Text>
          <div style={{ margin: "10px 0", fontSize: 18, fontWeight: 700, color: "#0f172a", lineHeight: 1.6 }}>
            {topBranch ? `${topBranch.branch} · 均分 ${topBranch.avg}` : "暂无支部对标结果"}
          </div>
          <Text style={{ color: "#64748b", lineHeight: 1.9 }}>
            {topBranch
              ? `该支部已纳入 ${topBranch.count} 条测评记录，建议作为支部建设横向复盘的优先样本。`
              : "待形成跨支部测评样本后，可自动生成支部均分与优先改进方向。"}
          </Text>
        </Card>
        <Card
          bordered={false}
          styles={{ body: { padding: 22 } }}
          style={{
            borderRadius: 24,
            background: "linear-gradient(180deg, #ffffff 0%, #f5f3ff 100%)",
            border: "1px solid rgba(124,58,237,0.12)",
            boxShadow: "0 12px 24px rgba(15,23,42,0.04)",
          }}
        >
          <Text style={{ color: "#7c3aed", fontSize: 12, fontWeight: 700 }}>机制建议</Text>
          <div style={{ margin: "10px 0", fontSize: 18, fontWeight: 700, color: "#0f172a", lineHeight: 1.6 }}>测评闭环以“评分—分级—跟进”推进</div>
          <Text style={{ color: "#64748b", lineHeight: 1.9 }}>
            建议将测评分数、等级调整与个体成长建议同步沉淀，避免测评工作停留在打分层面，而是形成可追踪的干部培养依据。
          </Text>
        </Card>
      </div>

      <PageAiInsightCard
        badge="AI 测评诊断"
        tone="violet"
        title={topMember ? `红智助手已识别当前先锋候选焦点：${topMember.member_name}` : "红智助手已识别当前测评样本仍待建立"}
        description="党员测评页现在会直接解释先锋候选、支部对比与成长跟进重点，让书记在台账页就能先看到 AI 诊断结果和材料生成入口。"
        insights={[
          `优秀党员：${stats.excellent} 人`,
          `待补评审：${stats.pendingReview} 条`,
          `领先支部：${topBranch ? `${topBranch.branch} · 均分 ${topBranch.avg}` : "暂无支部对标结果"}`,
        ]}
        suggestions={[
          candidateList.length > 0 ? "优先从优秀候选中形成先锋示范名单，再同步准备公示与宣传口径。" : "当前应先补充足够的优秀样本，再做先锋示范推荐。",
          stats.pendingReview > 0 ? "优先补齐缺失评审人与评语的记录，否则测评结果难以正式沉淀。" : "当前可重点对比支部差异，沉淀横向复盘材料。",
          "涉及培养和跟进时，让秘书同步输出成长提醒，避免测评停留在打分层。",
        ]}
        actions={[
          { key: "evaluation-pioneer", label: "生成先锋示范名单建议", type: "primary", onClick: () => askSecretary("pioneer") },
          { key: "evaluation-compare", label: "生成支部对比简报", onClick: () => askSecretary("compare") },
          { key: "evaluation-growth", label: "生成成长跟进提醒", onClick: () => askSecretary("growth") },
        ]}
      />

      <Card
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Award size={16} />
            优秀候选清单
          </div>
        }
        extra={
          <Text type="secondary" style={{ fontSize: 12 }}>
            {candidateList.length ? `共 ${candidateList.length} 人` : "待生成"}
          </Text>
        }
        bordered={false}
        style={{ borderRadius: 24, boxShadow: cardShadow }}
      >
        {candidateList.length ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
            {candidateList.slice(0, 6).map((item, index) => {
              const currentStatus = (item.candidate_status || "候选中") as CandidateStatus;
              return (
                <Card key={item.id} size="small" bordered={false} style={{ borderRadius: 18, background: index === 0 ? "#fff7ed" : "#f8fafc" }}>
                  <Space direction="vertical" size={8} style={{ width: "100%" }}>
                    <Space align="center" style={{ justifyContent: "space-between", width: "100%" }}>
                      <Text strong>{`${index + 1}. ${item.member_name}`}</Text>
                      <Tag color={candidateStatusColorMap[currentStatus]}>{currentStatus}</Tag>
                    </Space>
                    <Space size={[8, 8]} wrap>
                      <Tag color={levelColorMap[item.level]}>{item.level}</Tag>
                      <Tag>{item.branch_name}</Tag>
                      <Tag color="gold">{item.score} 分</Tag>
                    </Space>
                    <Paragraph style={{ margin: 0, color: "#475569", lineHeight: 1.7 }}>
                      {item.candidate_reason || "建议结合测评分数、评语沉淀与近期表现确定候选推荐。"}
                    </Paragraph>
                    <Space size={8} wrap>
                      <Button size="small" onClick={() => void handleCandidateStatusChange(item, "候选中")}>纳入候选</Button>
                      <Button size="small" type="primary" ghost onClick={() => void handleCandidateStatusChange(item, "已推荐")}>标记推荐</Button>
                    </Space>
                  </Space>
                </Card>
              );
            })}
          </div>
        ) : (
          <Text type="secondary">暂无优秀党员样本，录入“优秀”等级后会自动进入候选清单。</Text>
        )}
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 1.25fr) minmax(320px, 1fr)", gap: 16 }}>
        <Card
          title={
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ShieldCheck size={16} />
              录入测评记录
            </div>
          }
          bordered={false}
          style={{ borderRadius: 24, boxShadow: cardShadow }}
        >
          <Form
            form={form}
            layout="vertical"
            initialValues={{ level: "合格", score: 80 }}
            onFinish={(values) => void handleCreate(values)}
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
              <Form.Item label="党员姓名" name="member_name" rules={[{ required: true, message: "请输入党员姓名" }]} style={{ marginBottom: 16 }}>
                <Input maxLength={30} placeholder="例如：王强" />
              </Form.Item>
              <Form.Item label="所属支部" name="branch_name" rules={[{ required: true, message: "请输入所属支部" }]} style={{ marginBottom: 16 }}>
                <Input maxLength={50} placeholder="例如：第一党支部" />
              </Form.Item>
              <Form.Item label="评分" name="score" rules={[{ required: true, message: "请输入评分" }]} style={{ marginBottom: 16 }}>
                <InputNumber min={0} max={100} precision={0} style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item label="等级" name="level" rules={[{ required: true, message: "请选择等级" }]} style={{ marginBottom: 16 }}>
                <Select options={levelOptions.map((option) => ({ label: option, value: option }))} />
              </Form.Item>
            </div>
            <div style={{ display: "flex", gap: 16, alignItems: "flex-end" }}>
              <Form.Item label="评审人" name="reviewer" style={{ flex: 1, marginBottom: 0 }}>
                <Input maxLength={30} placeholder="例如：支委会" />
              </Form.Item>
              <Form.Item label="评语摘要" name="remark" style={{ flex: 3, marginBottom: 0 }}>
                <Input maxLength={500} placeholder="记录测评依据、亮点表现与后续建议" />
              </Form.Item>
              <Button type="primary" danger htmlType="submit" loading={submitting} icon={<Plus size={14} />}>
                生成测评记录
              </Button>
            </div>
          </Form>
        </Card>

        <Card
          title={
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Sparkles size={16} />
              书记研判建议
            </div>
          }
          bordered={false}
          style={{ borderRadius: 24, boxShadow: cardShadow }}
        >
          <Space direction="vertical" size={14} style={{ width: "100%" }}>
            <Card size="small" bordered={false} style={{ borderRadius: 18, background: "#fff7ed" }}>
              <Text strong style={{ color: "#c2410c" }}>今日测评建议</Text>
              <Paragraph style={{ margin: "8px 0 0", color: "#9a3412" }}>
                建议优先覆盖新党员、关键岗位党员与近期承担攻坚任务的骨干，形成兼顾公平性与重点性的测评样本。
              </Paragraph>
            </Card>
            <Card size="small" bordered={false} style={{ borderRadius: 18, background: "#f8fafc" }}>
              <Text strong style={{ color: "#0f172a" }}>建议形成的材料</Text>
              <Space direction="vertical" size={8} style={{ width: "100%", marginTop: 10 }}>
                <Button block onClick={() => askSecretary("pioneer")}>生成先锋示范名单建议</Button>
                <Button block onClick={() => askSecretary("compare")}>生成支部测评对比简报</Button>
                <Button block onClick={() => askSecretary("growth")}>生成成长跟进提醒</Button>
              </Space>
            </Card>
            <Card size="small" bordered={false} style={{ borderRadius: 18, background: "#f5f3ff" }}>
              <Text strong style={{ color: "#6d28d9" }}>闭环提醒</Text>
              <Paragraph style={{ margin: "8px 0 0", color: "#5b21b6" }}>
                对“评分高但评语空缺”或“等级一般但缺少改进建议”的记录，建议补充书记点评，提升测评材料的正式度与可用性。
              </Paragraph>
            </Card>
          </Space>
        </Card>
      </div>

      <Card
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Search size={16} />
            测评台账
          </div>
        }
        extra={
          excellentList.length ? (
            <Space size={[6, 6]} wrap>
              {excellentList.slice(0, 3).map((item) => (
                <Tag key={item.id} color={levelColorMap[item.level]} style={{ borderRadius: 999, paddingInline: 10 }}>
                  {item.member_name} · {item.score} 分
                </Tag>
              ))}
            </Space>
          ) : undefined
        }
        bordered={false}
        style={{ borderRadius: 24, boxShadow: cardShadow }}
      >
        <Table<MemberEvaluationItem>
          rowKey="id"
          size="middle"
          loading={loading}
          columns={columns}
          dataSource={items}
          pagination={{ pageSize: 8, hideOnSinglePage: true }}
          locale={{ emptyText: "暂无测评数据，建议先录入先锋示范或重点跟进对象" }}
        />
        <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <Text style={{ color: "#64748b" }}>建议将测评结果与季度表彰、培养对象推荐联动，形成更加完整的党员成长观察链路。</Text>
          <Button type="link" style={{ paddingInline: 0 }} onClick={() => askSecretary("pioneer")}>
            查看先锋画像建议 <ArrowRight size={14} />
          </Button>
        </div>
      </Card>
    </Space>
  );
}
