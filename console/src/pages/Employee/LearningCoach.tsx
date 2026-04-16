import {
  BookOpen,
  Brain,
  CheckCircle2,
  Compass,
  GraduationCap,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Target,
  TimerReset,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  DatePicker,
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
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  learningCoachApi,
  type LearningCoachItem,
  type LearningMode,
  type LearningStatus,
} from "../../api/modules/learningCoach";
import {
  type LearningCoachFormValues,
  type LearningCoachSecretaryAction,
  buildLearningCoachDerived,
  buildLearningCoachSecretaryContext,
  formatTime,
  getLearningCoachPrefillValues,
  loadLocal,
  modeOptions,
  saveLocal,
  sortByTimeDesc,
  statusOptions,
} from "../../features/party/learning-coach";
import { openSecretaryWithContext } from "../../features/party/shared/navigation";
import { allowPartyLocalFallback } from "../../utils/runtimeFlags";

const { Title, Text, Paragraph } = Typography;

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
        background: "linear-gradient(180deg, #ffffff 0%, #f6faff 100%)",
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

export default function EmployeeLearningCoachPage() {
  const [form] = Form.useForm<LearningCoachFormValues>();
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState<LearningCoachItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const reload = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const remote = await learningCoachApi.list();
      const sorted = sortByTimeDesc(remote);
      setItems(sorted);
      saveLocal(sorted);
    } catch {
      if (allowPartyLocalFallback) {
        const local = sortByTimeDesc(loadLocal());
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

  const navigate = useNavigate();
  const askSecretary = (action: LearningCoachSecretaryAction = "review") => {
    openSecretaryWithContext(
      navigate,
      buildLearningCoachSecretaryContext(action, { focusItem, stats }),
    );
  };

  const prefillKey = searchParams.toString();
  useEffect(() => {
    const values = getLearningCoachPrefillValues(searchParams);
    if (!Object.keys(values).length) return;
    form.setFieldsValue(values);
  }, [prefillKey, form, searchParams]);

  const handleCreate = async (values: LearningCoachFormValues) => {
    setSubmitting(true);
    const payload = {
      learner_name: values.learner_name.trim(),
      topic: values.topic.trim(),
      weakness_point: values.weakness_point?.trim() || "",
      mode: values.mode,
      mentor: values.mentor?.trim() || "",
      score: Number(values.score || 0),
      micro_course_title: values.micro_course_title?.trim() || "",
      due_at: values.due_at?.toISOString() || "",
      status: "待学习" as LearningStatus,
    };
    try {
      const created = await learningCoachApi.create(payload);
      const next = sortByTimeDesc([created, ...items]);
      setItems(next);
      saveLocal(next);
      form.resetFields();
      message.success("思政辅导任务已创建");
    } catch {
      if (allowPartyLocalFallback) {
        const now = new Date().toISOString();
        const localItem: LearningCoachItem = {
          id: `local-${Date.now()}`,
          learner_name: payload.learner_name,
          topic: payload.topic,
          weakness_point: payload.weakness_point,
          mode: payload.mode,
          mentor: payload.mentor,
          score: payload.score,
          micro_course_title: payload.micro_course_title,
          due_at: payload.due_at,
          status: payload.status,
          created_at: now,
          updated_at: now,
        };
        const next = sortByTimeDesc([localItem, ...items]);
        setItems(next);
        saveLocal(next);
        form.resetFields();
        message.success("思政辅导任务已创建（本地暂存）");
      } else {
        message.error("创建失败，请稍后重试");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (record: LearningCoachItem, status: LearningStatus) => {
    const now = new Date().toISOString();
    const applyLocal = () => {
      const next = items.map((item) => (item.id === record.id ? { ...item, status, updated_at: now } : item));
      const sorted = sortByTimeDesc(next);
      setItems(sorted);
      saveLocal(sorted);
    };

    try {
      await learningCoachApi.update(record.id, { status });
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

  const { stats, focusItem, featuredGuides } = useMemo(
    () => buildLearningCoachDerived(items),
    [items],
  );

  const columns: ColumnsType<LearningCoachItem> = [
    {
      title: "学员",
      dataIndex: "learner_name",
      key: "learner_name",
      width: 170,
      render: (_value: string, record) => (
        <Space direction="vertical" size={2}>
          <Text strong style={{ color: "#0f172a" }}>{record.learner_name}</Text>
          <Text style={{ color: "#64748b", fontSize: 12 }}>{record.mentor ? `导师：${record.mentor}` : "待分配导师"}</Text>
        </Space>
      ),
    },
    {
      title: "主题",
      dataIndex: "topic",
      key: "topic",
      width: 200,
      ellipsis: true,
    },
    {
      title: "辅导方式",
      dataIndex: "mode",
      key: "mode",
      width: 120,
      render: (value: LearningMode) => <Tag style={{ borderRadius: 999, paddingInline: 10 }}>{value}</Tag>,
    },
    {
      title: "薄弱点",
      dataIndex: "weakness_point",
      key: "weakness_point",
      width: 210,
      ellipsis: true,
      render: (value?: string) => value || "-",
    },
    {
      title: "微课",
      dataIndex: "micro_course_title",
      key: "micro_course_title",
      width: 210,
      ellipsis: true,
      render: (value?: string) => value || "-",
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 150,
      render: (value: LearningStatus, record) => (
        <Select<LearningStatus>
          size="small"
          value={value}
          style={{ width: 108 }}
          options={statusOptions.map((option) => ({ label: option, value: option }))}
          onChange={(next) => void handleStatusChange(record, next)}
        />
      ),
    },
    {
      title: "评分",
      dataIndex: "score",
      key: "score",
      width: 90,
      render: (value?: number) => `${Number(value || 0)}`,
    },
    {
      title: "截止时间",
      dataIndex: "due_at",
      key: "due_at",
      width: 180,
      render: (value?: string) => formatTime(value),
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
            "radial-gradient(circle at top left, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0) 34%), linear-gradient(135deg, #0f172a 0%, #1d4ed8 48%, #2563eb 100%)",
          boxShadow: "0 28px 48px rgba(29,78,216,0.22)",
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
                color: "#dbeafe",
                background: "rgba(255,255,255,0.14)",
                borderRadius: 999,
                padding: "6px 12px",
                fontWeight: 700,
              }}
            >
              书记驾驶舱 · 学习建设
            </Tag>
            <div>
              <Title level={2} style={{ margin: 0, color: "#eff6ff" }}>
                思政辅导
              </Title>
              <Paragraph style={{ margin: "12px 0 0", color: "rgba(239,246,255,0.86)", lineHeight: 1.9, fontSize: 15 }}>
                将党员学习画像、薄弱点识别、微课推荐与辅导进度统一整合，形成兼具策略性与陪伴感的学习建设界面，让思政工作既能精准触达，也能长期跟踪成效。
              </Paragraph>
            </div>
            <Space size={[8, 8]} wrap>
              <Tag color="blue" style={{ borderRadius: 999, paddingInline: 10 }}>学习画像识别</Tag>
              <Tag color="cyan" style={{ borderRadius: 999, paddingInline: 10 }}>微课智能推荐</Tag>
              <Tag color="purple" style={{ borderRadius: 999, paddingInline: 10 }}>陪伴式跟踪闭环</Tag>
            </Space>
          </Space>
          <Space wrap>
            <Button icon={<RefreshCw size={14} />} onClick={() => void reload(false)} loading={loading}>
              同步数据
            </Button>
            <Button onClick={() => askSecretary("review")} icon={<Sparkles size={14} />}>
              交给秘书复盘
            </Button>
            <Button type="primary" icon={<Plus size={14} />} onClick={() => form.scrollToField("learner_name")}>
              发起辅导任务
            </Button>
          </Space>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        <StatCard title="总辅导任务" value={stats.total} icon={<BookOpen size={20} />} color="#2563eb" description="覆盖学习推动、主题辅导与重点党员长期跟踪的全部任务。" />
        <StatCard title="学习中任务" value={stats.studying} icon={<Brain size={20} />} color="#0891b2" description="当前正在推进中的辅导事项，适合纳入近期督导节奏。" />
        <StatCard title="已完成学习" value={stats.completed} icon={<CheckCircle2 size={20} />} color="#0f766e" description="已形成学习反馈或完成闭环确认的辅导任务数量。" />
        <StatCard title="平均学习分" value={stats.avgScore} icon={<Target size={20} />} color="#7c3aed" description="综合当前任务评分估算出的整体学习达成水平。" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        {featuredGuides.map((item) => (
          <Card
            key={item.eyebrow}
            bordered={false}
            styles={{ body: { padding: 22 } }}
            style={{
              borderRadius: 24,
              background: "linear-gradient(180deg, #ffffff 0%, #f6faff 100%)",
              border: "1px solid rgba(59,130,246,0.12)",
              boxShadow: "0 12px 24px rgba(15,23,42,0.04)",
            }}
          >
            <Text style={{ color: "#1d4ed8", fontSize: 12, fontWeight: 700 }}>{item.eyebrow}</Text>
            <div style={{ margin: "10px 0", fontSize: 18, fontWeight: 700, color: "#0f172a", lineHeight: 1.6 }}>{item.title}</div>
            <Text style={{ color: "#64748b", lineHeight: 1.9 }}>{item.description}</Text>
          </Card>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
        <InsightCard title="72 小时内到期" value={`${stats.upcoming} 项`} description="临近截止的学习任务建议优先提醒，防止学习闭环断档。" tone="#ea580c" />
        <InsightCard title="辅导机制建议" value="识别-推荐-跟踪" description="先定位问题，再匹配内容和导师，最后沉淀完成反馈与学习分。" tone="#2563eb" />
        <InsightCard title="AI 推荐覆盖" value="100%" description="新建任务均支持微课推荐、摘要沉淀与后续复盘扩展。" tone="#7c3aed" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 1.25fr) minmax(320px, 1fr)", gap: 16 }}>
        <Card
          title={
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <GraduationCap size={16} />
              发起辅导任务
            </div>
          }
          bordered={false}
          style={{ borderRadius: 24, boxShadow: cardShadow }}
        >
          <Form
            form={form}
            layout="vertical"
            initialValues={{ mode: "微课推送", score: 80 }}
            onFinish={(values) => void handleCreate(values)}
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
              <Form.Item
                label="学员姓名"
                name="learner_name"
                rules={[{ required: true, message: "请输入学员姓名" }]}
                style={{ marginBottom: 16 }}
              >
                <Input maxLength={40} placeholder="例如：王五" />
              </Form.Item>
              <Form.Item
                label="辅导主题"
                name="topic"
                rules={[{ required: true, message: "请输入辅导主题" }]}
                style={{ marginBottom: 16 }}
              >
                <Input maxLength={80} placeholder="例如：党章重点章节学习" />
              </Form.Item>
              <Form.Item
                label="辅导方式"
                name="mode"
                rules={[{ required: true, message: "请选择辅导方式" }]}
                style={{ marginBottom: 16 }}
              >
                <Select options={modeOptions.map((option) => ({ label: option, value: option }))} />
              </Form.Item>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
              <Form.Item label="薄弱点" name="weakness_point" style={{ marginBottom: 16 }}>
                <Input maxLength={100} placeholder="例如：政策条款理解不系统" />
              </Form.Item>
              <Form.Item label="微课标题" name="micro_course_title" style={{ marginBottom: 16 }}>
                <Input maxLength={120} placeholder="例如：基层治理政策10分钟导读" />
              </Form.Item>
              <Form.Item label="导师" name="mentor" style={{ marginBottom: 16 }}>
                <Input maxLength={40} placeholder="例如：李老师" />
              </Form.Item>
            </div>
            <div style={{ display: "flex", gap: 16, alignItems: "flex-end" }}>
              <Form.Item label="预估评分" name="score" style={{ flex: 1, marginBottom: 0 }}>
                <InputNumber min={0} max={100} precision={0} style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item label="完成截止时间" name="due_at" style={{ flex: 2, marginBottom: 0 }}>
                <DatePicker showTime style={{ width: "100%" }} />
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={submitting} icon={<Plus size={14} />}>
                生成辅导闭环
              </Button>
            </div>
          </Form>
        </Card>

        <Card
          title={
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Sparkles size={16} />
              学习建设建议
            </div>
          }
          bordered={false}
          style={{ borderRadius: 24, boxShadow: cardShadow }}
        >
          <Space direction="vertical" size={14} style={{ width: "100%" }}>
            <Card size="small" bordered={false} style={{ borderRadius: 18, background: "#eff6ff" }}>
              <Text strong style={{ color: "#1d4ed8" }}>今日辅导建议</Text>
              <Paragraph style={{ margin: "8px 0 0", color: "#1e40af" }}>
                优先覆盖理论学习薄弱、工作场景理解偏差和新党员融入三个场景，推动主题辅导与岗位实践同步展开。
              </Paragraph>
            </Card>
            <Card size="small" bordered={false} style={{ borderRadius: 18, background: "#f5f3ff" }}>
              <Text strong style={{ color: "#6d28d9" }}>推荐沉淀的材料</Text>
              <Space direction="vertical" size={8} style={{ width: "100%", marginTop: 10 }}>
                <Button block>生成个性化辅导纪要</Button>
                <Button block>生成微课推送清单</Button>
                <Button block>生成月度学习复盘</Button>
              </Space>
            </Card>
            <Card size="small" bordered={false} style={{ borderRadius: 18, background: "#f8fafc" }}>
              <Text strong style={{ color: "#0f172a" }}>节奏提醒</Text>
              <Paragraph style={{ margin: "8px 0 0", color: "#475569" }}>
                对临近截止但仍处于“待学习”的任务，建议自动提醒导师和学员确认学习节点，防止推进滞后。
              </Paragraph>
            </Card>
          </Space>
        </Card>
      </div>

      <Card
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Search size={16} />
            思政辅导台账
          </div>
        }
        extra={
          <Space size={6}>
            <Compass size={14} color="#64748b" />
            <Text style={{ color: "#64748b", fontSize: 12 }}>支持学习状态更新、评分沉淀与微课留痕</Text>
          </Space>
        }
        bordered={false}
        style={{ borderRadius: 24, boxShadow: cardShadow }}
      >
        <Table<LearningCoachItem>
          rowKey="id"
          size="middle"
          loading={loading}
          columns={columns}
          dataSource={items}
          pagination={{ pageSize: 8, hideOnSinglePage: true }}
          locale={{ emptyText: "暂无辅导任务，建议先创建重点党员学习任务" }}
        />
        <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <Text style={{ color: "#64748b" }}>建议将重点党员学习画像与季度组织生活会准备联动，持续提升学习建设的针对性与层次感。</Text>
          <Button type="link" style={{ paddingInline: 0 }} onClick={() => askSecretary("review")}>
            查看学习建设节奏建议 <TimerReset size={14} />
          </Button>
        </div>
      </Card>
    </Space>
  );
}
