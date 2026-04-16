import {
  Activity,
  ArrowRight,
  Award,
  Building2,
  CheckCircle2,
  Crown,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
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
  branchRankingApi,
  type BranchRankingItem,
  type BranchRankingStatus,
} from "../../api/modules/branchRanking";
import {
  type BranchRankingFormValues,
  type BranchRankingSecretaryAction,
  buildBranchRankingDerived,
  buildBranchRankingSecretaryContext,
  formatTime,
  loadLocal,
  saveLocal,
  sortByScore,
  statusOptions,
} from "../../features/party/branch-ranking";
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
        background: "linear-gradient(180deg, #ffffff 0%, #fffaf5 100%)",
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

function InsightCard({ title, value, description, tone }: { title: string; value: string; description: string; tone: string }) {
  return (
    <Card
      bordered={false}
      styles={{ body: { padding: 20 } }}
      style={{
        borderRadius: 24,
        background: `linear-gradient(180deg, ${tone}16 0%, #ffffff 100%)`,
        border: `1px solid ${tone}22`,
        boxShadow: "0 12px 24px rgba(15,23,42,0.04)",
      }}
    >
      <Text style={{ color: tone, fontSize: 12, fontWeight: 700 }}>{title}</Text>
      <div style={{ marginTop: 8, fontSize: 24, fontWeight: 800, color: "#0f172a" }}>{value}</div>
      <Text style={{ color: "#64748b", lineHeight: 1.7 }}>{description}</Text>
    </Card>
  );
}

export default function EmployeeBranchRankingPage() {
  const [form] = Form.useForm<BranchRankingFormValues>();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [items, setItems] = useState<BranchRankingItem[]>([]);

  const reload = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const remote = await branchRankingApi.list();
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

  const handleCreate = async (values: BranchRankingFormValues) => {
    setSubmitting(true);
    const payload = {
      branch_name: values.branch_name.trim(),
      score: Number(values.score),
      candidate_count: Number(values.candidate_count || 0),
      recommendation: values.recommendation?.trim() || "",
      status: "参评中" as BranchRankingStatus,
    };
    try {
      const created = await branchRankingApi.create(payload);
      const next = sortByScore([created, ...items]);
      setItems(next);
      saveLocal(next);
      form.resetFields();
      message.success("支部评比记录已创建");
    } catch {
      if (allowPartyLocalFallback) {
        const now = new Date().toISOString();
        const localItem: BranchRankingItem = {
          id: `local-${Date.now()}`,
          branch_name: payload.branch_name,
          score: payload.score,
          candidate_count: payload.candidate_count,
          recommendation: payload.recommendation,
          status: payload.status,
          created_at: now,
          updated_at: now,
        };
        const next = sortByScore([localItem, ...items]);
        setItems(next);
        saveLocal(next);
        form.resetFields();
        message.success("支部评比记录已创建（本地暂存）");
      } else {
        message.error("创建失败，请稍后重试");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (record: BranchRankingItem, status: BranchRankingStatus) => {
    const now = new Date().toISOString();
    const applyLocal = () => {
      const next = items.map((item) => (item.id === record.id ? { ...item, status, updated_at: now } : item));
      const sorted = sortByScore(next);
      setItems(sorted);
      saveLocal(sorted);
    };
    try {
      await branchRankingApi.update(record.id, { status });
      applyLocal();
      message.success("状态已更新");
    } catch {
      if (allowPartyLocalFallback) {
        applyLocal();
        message.success("状态已更新（本地暂存）");
      } else {
        message.error("状态更新失败，请稍后重试");
      }
    }
  };

  const { stats, excellentBranch, topThree } = useMemo(
    () => buildBranchRankingDerived(items),
    [items],
  );

  const navigate = useNavigate();
  const askSecretary = (action: BranchRankingSecretaryAction = "excellent") => {
    openSecretaryWithContext(
      navigate,
      buildBranchRankingSecretaryContext(action, {
        excellentBranch,
        topThree,
        stats,
      }),
    );
  };

  const columns: ColumnsType<BranchRankingItem> = [
    {
      title: "支部",
      dataIndex: "branch_name",
      key: "branch_name",
      width: 200,
      render: (value: string, record) => (
        <Space direction="vertical" size={2}>
          <Text strong style={{ color: "#0f172a" }}>{value}</Text>
          <Text style={{ color: "#64748b", fontSize: 12 }}>提拔建议：{Number(record.candidate_count || 0)} 人</Text>
        </Space>
      ),
    },
    {
      title: "评分",
      dataIndex: "score",
      key: "score",
      width: 90,
      sorter: (a, b) => a.score - b.score,
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 150,
      render: (value: BranchRankingStatus, record) => (
        <Select<BranchRankingStatus>
          size="small"
          value={value}
          style={{ width: 100 }}
          options={statusOptions.map((option) => ({ label: option, value: option }))}
          onChange={(next) => void handleStatusChange(record, next)}
        />
      ),
    },
    {
      title: "提拔建议说明",
      dataIndex: "recommendation",
      key: "recommendation",
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
            "radial-gradient(circle at top left, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0) 34%), linear-gradient(135deg, #7c2d12 0%, #9a3412 42%, #f59e0b 100%)",
          boxShadow: "0 28px 48px rgba(180,83,9,0.22)",
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
                color: "#fff7ed",
                background: "rgba(255,255,255,0.14)",
                borderRadius: 999,
                padding: "6px 12px",
                fontWeight: 700,
              }}
            >
              书记驾驶舱 · 党务管理
            </Tag>
            <div>
              <Title level={2} style={{ margin: 0, color: "#fffbeb" }}>
                支部评比
              </Title>
              <Paragraph style={{ margin: "12px 0 0", color: "rgba(255,251,235,0.88)", lineHeight: 1.9, fontSize: 15 }}>
                聚焦支部建设质效、干部储备与综合排名，把分数、状态、建议提拔人数与评比说明统一纳入书记驾驶舱，帮助快速看清先进支部、潜力梯队和后续培育重点。
              </Paragraph>
            </div>
            <Space size={[8, 8]} wrap>
              <Tag color="gold" style={{ borderRadius: 999, paddingInline: 10 }}>综合排名</Tag>
              <Tag color="blue" style={{ borderRadius: 999, paddingInline: 10 }}>梯队识别</Tag>
              <Tag color="purple" style={{ borderRadius: 999, paddingInline: 10 }}>干部储备分析</Tag>
            </Space>
          </Space>
          <Space wrap>
            <Button icon={<RefreshCw size={14} />} onClick={() => void reload(false)} loading={loading}>
              同步排行
            </Button>
            <Button onClick={() => askSecretary("excellent")} icon={<Sparkles size={14} />}>
              交给秘书生成建议
            </Button>
            <Button type="primary" danger icon={<Plus size={14} />} onClick={() => form.scrollToField("branch_name")}>
              新增评比记录
            </Button>
          </Space>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        <StatCard title="参评支部数" value={stats.total} icon={<Building2 size={20} />} color="#2563eb" description="当前纳入本轮评比的支部数量，可持续用于季度和年度横向对比。" />
        <StatCard title="平均得分" value={stats.avgScore} icon={<Activity size={20} />} color="#0f766e" description="综合当前样本计算得到的支部建设平均分，用于观察整体水平。" />
        <StatCard title="建议提拔总数" value={stats.candidateTotal} icon={<Users size={20} />} color="#d97706" description="来自各支部的可培养对象总量，可作为干部储备池输入。" />
        <StatCard title="已评定支部" value={stats.rated} icon={<CheckCircle2 size={20} />} color="#7c3aed" description="已完成结果确认并可用于正式通报的支部数量。" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        <Card
          bordered={false}
          styles={{ body: { padding: 22 } }}
          style={{
            borderRadius: 24,
            background: "linear-gradient(180deg, #ffffff 0%, #fffaf5 100%)",
            border: "1px solid rgba(245,158,11,0.14)",
            boxShadow: "0 12px 24px rgba(15,23,42,0.04)",
          }}
        >
          <Text style={{ color: "#b45309", fontSize: 12, fontWeight: 700 }}>当前领跑</Text>
          <div style={{ margin: "10px 0", fontSize: 18, fontWeight: 700, color: "#0f172a", lineHeight: 1.6 }}>
            {excellentBranch ? `${excellentBranch.branch_name} · ${excellentBranch.score} 分` : "暂无排名样本"}
          </div>
          <Text style={{ color: "#64748b", lineHeight: 1.9 }}>
            {excellentBranch
              ? `当前建议提拔 ${Number(excellentBranch.candidate_count || 0)} 人，可优先作为先进支部案例和干部培养源头。`
              : "建议先录入本轮支部评比结果，形成书记侧可直接查看的综合排名。"}
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
          <Text style={{ color: "#1d4ed8", fontSize: 12, fontWeight: 700 }}>前列梯队</Text>
          <div style={{ margin: "10px 0", fontSize: 18, fontWeight: 700, color: "#0f172a", lineHeight: 1.6 }}>
            {topThree.length ? `TOP ${topThree.length} 已形成` : "暂未形成 TOP 梯队"}
          </div>
          <Text style={{ color: "#64748b", lineHeight: 1.9 }}>
            {topThree.length
              ? `${topThree.map((item) => item.branch_name).join("、")} 当前位列前段，建议用于支部建设经验互学。`
              : "待支部样本增加后，可自动生成前列梯队和后续培育建议。"}
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
          <div style={{ margin: "10px 0", fontSize: 18, fontWeight: 700, color: "#0f172a", lineHeight: 1.6 }}>评比闭环以“排名—确认—培养”推进</div>
          <Text style={{ color: "#64748b", lineHeight: 1.9 }}>
            建议将排名结果与干部储备、支部经验复制和整改辅导联动，形成既能选优也能促建的组织治理闭环。
          </Text>
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
        <InsightCard title="评定完成率" value={`${stats.total ? Math.round((stats.rated / stats.total) * 100) : 0}%`} description="已进入正式评定状态的支部占比，可用于观察本轮评比推进节奏。" tone="#7c3aed" />
        <InsightCard title="先进支部门槛" value={excellentBranch ? `${excellentBranch.score} 分` : "待生成"} description="当前排名第一支部的分数可作为本轮先进支部参考线。" tone="#d97706" />
        <InsightCard title="AI 辅助覆盖" value="100%" description="新建评比记录均可承接后续简报生成、梯队分析与材料沉淀能力。" tone="#2563eb" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 1.25fr) minmax(320px, 1fr)", gap: 16 }}>
        <Card
          title={
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Award size={16} />
              新增支部评比记录
            </div>
          }
          bordered={false}
          style={{ borderRadius: 24, boxShadow: cardShadow }}
        >
          <Form
            form={form}
            layout="vertical"
            initialValues={{ score: 80, candidate_count: 0 }}
            onFinish={(values) => void handleCreate(values)}
          >
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 16 }}>
              <Form.Item label="支部名称" name="branch_name" rules={[{ required: true, message: "请输入支部名称" }]} style={{ marginBottom: 16 }}>
                <Input maxLength={60} placeholder="例如：第一党支部" />
              </Form.Item>
              <Form.Item label="评比分" name="score" rules={[{ required: true, message: "请输入评比分" }]} style={{ marginBottom: 16 }}>
                <InputNumber min={0} max={100} precision={0} style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item label="建议提拔人数" name="candidate_count" style={{ marginBottom: 16 }}>
                <InputNumber min={0} max={100} precision={0} style={{ width: "100%" }} />
              </Form.Item>
            </div>
            <div style={{ display: "flex", gap: 16, alignItems: "flex-end" }}>
              <Form.Item label="提拔建议说明" name="recommendation" style={{ flex: 1, marginBottom: 0 }}>
                <Input maxLength={500} placeholder="记录可培养对象方向、支部亮点与后续培育建议" />
              </Form.Item>
              <Button type="primary" danger htmlType="submit" loading={submitting} icon={<Plus size={14} />}>
                生成评比记录
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
              <Text strong style={{ color: "#b45309" }}>今日评比建议</Text>
              <Paragraph style={{ margin: "8px 0 0", color: "#92400e" }}>
                建议优先完成重点支部、样板支部和整改支部的评定，形成“先进引领 + 问题改进”两端兼顾的组织格局。
              </Paragraph>
            </Card>
            <Card size="small" bordered={false} style={{ borderRadius: 18, background: "#f8fafc" }}>
              <Text strong style={{ color: "#0f172a" }}>建议形成的材料</Text>
              <Space direction="vertical" size={8} style={{ width: "100%", marginTop: 10 }}>
                <Button block>生成先进支部建议名单</Button>
                <Button block>生成干部储备观察简报</Button>
                <Button block>生成后进支部辅导建议</Button>
              </Space>
            </Card>
            <Card size="small" bordered={false} style={{ borderRadius: 18, background: "#f5f3ff" }}>
              <Text strong style={{ color: "#6d28d9" }}>闭环提醒</Text>
              <Paragraph style={{ margin: "8px 0 0", color: "#5b21b6" }}>
                对评分已录入但仍停留在“参评中”的支部，建议尽快完成结果确认，便于书记层统一发布与后续跟进。
              </Paragraph>
            </Card>
          </Space>
        </Card>
      </div>

      <Card
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Search size={16} />
            支部评比台账
          </div>
        }
        extra={
          topThree.length ? (
            <Space size={[6, 6]} wrap>
              {topThree.map((item, index) => (
                <Tag key={item.id} color={index === 0 ? "gold" : "blue"} style={{ borderRadius: 999, paddingInline: 10 }}>
                  {index === 0 ? <Crown size={12} style={{ marginRight: 4, verticalAlign: "-1px" }} /> : null}
                  {item.branch_name}
                </Tag>
              ))}
            </Space>
          ) : undefined
        }
        bordered={false}
        style={{ borderRadius: 24, boxShadow: cardShadow }}
      >
        <Table<BranchRankingItem>
          rowKey="id"
          size="middle"
          loading={loading}
          columns={columns}
          dataSource={items}
          pagination={{ pageSize: 8, hideOnSinglePage: true }}
          locale={{ emptyText: "暂无评比记录，建议先录入本轮重点支部结果" }}
        />
        <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <Text style={{ color: "#64748b" }}>建议将支部评比结果与年度表彰、组织生活质量提升计划联动，形成从评比到促建的连续治理动作。</Text>
          <Button type="link" style={{ paddingInline: 0 }} onClick={() => askSecretary("improvement")}>
            查看支部促建建议 <ArrowRight size={14} />
          </Button>
        </div>
      </Card>
    </Space>
  );
}
