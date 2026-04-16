import {
  ArrowRight,
  CalendarClock,
  CircleAlert,
  FileText,
  RefreshCw,
  Send,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Button,
  Card,
  Drawer,
  Empty,
  Form,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  directiveCenterApi,
  type DirectiveCenterItem,
  type DirectiveSla,
  type DirectiveStatus,
} from "../../api/modules/directiveCenter";
import {
  type FeedbackValues,
  buildMemberDirectiveGuidanceCards,
  calcMemberDirectiveStats,
  composeSummary,
  formatTime,
  loadLocal,
  resolveDeadline,
  saveLocal,
  sortByPublishAt,
  splitSummary,
  statusOptions,
  statusToneMap,
} from "../../features/party/member-directives";
import { allowPartyLocalFallback } from "../../utils/runtimeFlags";

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const cardShadow = "0 18px 36px rgba(15,23,42,0.06)";

function StatCard({
  title,
  value,
  icon,
  color,
  description,
}: {
  title: string;
  value: string | number;
  icon: ReactNode;
  color: string;
  description: string;
}) {
  return (
    <Card
      bordered={false}
      styles={{ body: { padding: 20 } }}
      style={{
        borderRadius: 24,
        border: "1px solid rgba(226,232,240,0.9)",
        background: "linear-gradient(180deg, #ffffff 0%, #fffaf7 100%)",
        boxShadow: cardShadow,
      }}
    >
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: 16,
            background: `${color}14`,
            color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon}
        </div>
        <div>
          <Text style={{ color: "#7c2d12", fontSize: 13, fontWeight: 700 }}>{title}</Text>
          <div style={{ marginTop: 6, fontSize: 28, fontWeight: 800, color: "#111827" }}>{value}</div>
          <Text style={{ display: "block", marginTop: 6, color: "#7c6f67", lineHeight: 1.7 }}>{description}</Text>
        </div>
      </Space>
    </Card>
  );
}

export default function MemberDirectivesPage() {
  const [form] = Form.useForm<FeedbackValues>();
  const [items, setItems] = useState<DirectiveCenterItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeItem, setActiveItem] = useState<DirectiveCenterItem | null>(null);

  const currentUserName = String(
    sessionStorage.getItem("copaw_user_name") || localStorage.getItem("copaw_user_name") || "当前党员",
  ).trim();

  const reload = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const remote = await directiveCenterApi.list();
      const sorted = sortByPublishAt(remote);
      setItems(sorted);
      saveLocal(sorted);
    } catch {
      if (allowPartyLocalFallback) {
        const local = sortByPublishAt(loadLocal());
        setItems(local);
        if (!silent) message.warning("接口不可用，已切换为本地暂存模式");
      } else if (!silent) {
        message.error("加载失败，请稍后重试");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void reload(false);
  }, []);

  const stats = useMemo(() => calcMemberDirectiveStats(items), [items]);

  const focusDirective = useMemo(
    () => items.find((item) => item.status !== "已完成") || items[0] || null,
    [items],
  );

  const guidanceCards = useMemo(
    () => buildMemberDirectiveGuidanceCards(focusDirective, stats),
    [focusDirective, stats],
  );

  const openFeedback = (record: DirectiveCenterItem) => {
    const parsed = splitSummary(record.summary);
    form.setFieldsValue({
      status: record.status,
      feedback: parsed.feedback,
    });
    setActiveItem(record);
  };

  const handleSaveFeedback = async (values: FeedbackValues) => {
    if (!activeItem) return;
    setSaving(true);
    const parsed = splitSummary(activeItem.summary);
    const now = new Date().toISOString();
    const payload = {
      status: values.status,
      summary: composeSummary(parsed.origin, values.feedback),
    };

    const applyLocal = () => {
      const next = sortByPublishAt(
        items.map((item) =>
          item.id === activeItem.id ? { ...item, ...payload, updated_at: now } : item,
        ),
      );
      setItems(next);
      saveLocal(next);
      setActiveItem(next.find((item) => item.id === activeItem.id) || null);
    };

    try {
      await directiveCenterApi.update(activeItem.id, payload);
      applyLocal();
      message.success("执行反馈已提交");
    } catch {
      if (allowPartyLocalFallback) {
        applyLocal();
        message.success("执行反馈已提交（本地暂存）");
      } else {
        message.error("提交失败，请稍后重试");
        setSaving(false);
        return;
      }
    }

    setSaving(false);
  };

  const columns: ColumnsType<DirectiveCenterItem> = [
    {
      title: "指示事项",
      dataIndex: "title",
      key: "title",
      width: 260,
      render: (value: string, record) => {
        const parsed = splitSummary(record.summary);
        return (
          <Space direction="vertical" size={2}>
            <Text strong style={{ color: "#111827" }}>{value}</Text>
            <Text style={{ color: "#7c6f67", fontSize: 12 }}>
              {parsed.origin || "待补充具体要求说明"}
            </Text>
          </Space>
        );
      },
    },
    {
      title: "下发时间",
      dataIndex: "publish_at",
      key: "publish_at",
      width: 170,
      render: (value: string) => formatTime(value),
    },
    {
      title: "反馈时限",
      dataIndex: "sla",
      key: "sla",
      width: 120,
      render: (value: DirectiveSla) => <Tag color={value === "T+1" ? "red" : "gold"}>{value}</Tag>,
    },
    {
      title: "当前状态",
      dataIndex: "status",
      key: "status",
      width: 140,
      render: (value: DirectiveStatus) => {
        const tone = statusToneMap[value];
        return (
          <Tag
            bordered={false}
            style={{
              borderRadius: 999,
              paddingInline: 10,
              marginInlineEnd: 0,
              background: tone.bg,
              color: tone.color,
            }}
          >
            {value}
          </Tag>
        );
      },
    },
    {
      title: "截止节点",
      key: "deadline",
      width: 170,
      render: (_: unknown, record) => formatTime(resolveDeadline(record)?.toISOString()),
    },
    {
      title: "操作",
      key: "action",
      width: 120,
      render: (_: unknown, record) => (
        <Button type="link" style={{ paddingInline: 0 }} onClick={() => openFeedback(record)}>
          查看并反馈
        </Button>
      ),
    },
  ];

  const activeSummary = splitSummary(activeItem?.summary);

  return (
    <Space className="lux-shell" direction="vertical" size={24} style={{ width: "100%", padding: 4 }}>
      <Card
        bordered={false}
        styles={{ body: { padding: 28 } }}
        style={{
          borderRadius: 28,
          overflow: "hidden",
          background:
            "radial-gradient(circle at top right, rgba(251,191,36,0.18) 0%, rgba(251,191,36,0) 28%), linear-gradient(135deg, #7f1d1d 0%, #991b1b 46%, #b91c1c 100%)",
          boxShadow: "0 28px 60px rgba(127,29,29,0.22)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}>
          <Space direction="vertical" size={14} style={{ maxWidth: 780 }}>
            <Tag
              bordered={false}
              style={{
                width: "fit-content",
                marginInlineEnd: 0,
                borderRadius: 999,
                padding: "6px 12px",
                color: "#7f1d1d",
                background: "rgba(255,245,240,0.92)",
                fontWeight: 700,
              }}
            >
              党员工作台 · 我的指示
            </Tag>
            <div>
              <Title level={2} style={{ margin: 0, color: "#fff7ed" }}>
                接收组织要求、反馈执行进度、掌握个人节点
              </Title>
              <Paragraph style={{ margin: "12px 0 0", color: "rgba(255,245,240,0.86)", fontSize: 15, lineHeight: 1.9 }}>
                以“我收到了什么、我现在做到哪一步、我还需要补什么”为核心，集中呈现当前账号需要响应的指示事项，帮助 {currentUserName} 清晰完成阅读确认、阶段执行与结果反馈。
              </Paragraph>
            </div>
            <Space size={[8, 8]} wrap>
              <Tag bordered={false} style={{ borderRadius: 999, background: "rgba(255,255,255,0.14)", color: "#fff7ed", marginInlineEnd: 0 }}>我的接收事项</Tag>
              <Tag bordered={false} style={{ borderRadius: 999, background: "rgba(255,255,255,0.14)", color: "#fff7ed", marginInlineEnd: 0 }}>时限提醒</Tag>
              <Tag bordered={false} style={{ borderRadius: 999, background: "rgba(255,255,255,0.14)", color: "#fff7ed", marginInlineEnd: 0 }}>执行反馈留痕</Tag>
            </Space>
          </Space>
          <Space wrap>
            <Button icon={<RefreshCw size={14} />} onClick={() => void reload(false)} loading={loading}>
              同步数据
            </Button>
            <Button
              type="primary"
              icon={<ArrowRight size={14} />}
              onClick={() => (focusDirective ? openFeedback(focusDirective) : message.info("当前暂无待处理指示"))}
              style={{ background: "#fff7ed", color: "#7f1d1d", borderColor: "#fff7ed" }}
            >
              优先处理首项
            </Button>
          </Space>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        <StatCard title="我的指示" value={stats.total} icon={<ShieldCheck size={20} />} color="#b91c1c" description="当前账号可查看并跟进的指示事项总数。" />
        <StatCard title="待响应" value={stats.pending} icon={<CircleAlert size={20} />} color="#c2410c" description="建议先确认要求，再补充个人执行动作。" />
        <StatCard title="执行中" value={stats.processing} icon={<Send size={20} />} color="#1d4ed8" description="正在推进中的事项，记得及时更新反馈。" />
        <StatCard title="临期提醒" value={stats.urgent} icon={<CalendarClock size={20} />} color="#7c2d12" description="距离反馈节点不足 24 小时的事项数量。" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        {guidanceCards.map((item) => (
          <Card key={item.title} bordered={false} styles={{ body: { padding: 22 } }} style={{ borderRadius: 24, boxShadow: cardShadow }}>
            <Text style={{ color: "#b91c1c", fontSize: 12, fontWeight: 700 }}>{item.title}</Text>
            <div style={{ margin: "10px 0", fontSize: 18, fontWeight: 700, color: "#111827", lineHeight: 1.6 }}>{item.value}</div>
            <Text style={{ color: "#7c6f67", lineHeight: 1.8 }}>{item.description}</Text>
          </Card>
        ))}
      </div>

      <Card
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <FileText size={16} />
            我的指示台账
          </div>
        }
        extra={<Text style={{ color: "#7c6f67", fontSize: 12 }}>优先处理未完成事项，并及时补充执行反馈</Text>}
        bordered={false}
        style={{ borderRadius: 24, boxShadow: cardShadow }}
      >
        {items.length ? (
          <Table<DirectiveCenterItem>
            rowKey="id"
            size="middle"
            loading={loading}
            columns={columns}
            dataSource={items}
            pagination={{ pageSize: 8, hideOnSinglePage: true }}
          />
        ) : (
          <Empty description="当前暂无指示事项" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
      </Card>

      <Drawer
        title={activeItem ? `${activeItem.title} · 执行反馈` : "执行反馈"}
        width={560}
        open={Boolean(activeItem)}
        onClose={() => {
          setActiveItem(null);
          form.resetFields();
        }}
      >
        {activeItem ? (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Card size="small" style={{ borderRadius: 16, background: "#fffaf7", borderColor: "#fed7aa" }}>
              <Space direction="vertical" size={8} style={{ width: "100%" }}>
                <Text strong style={{ color: "#7c2d12" }}>组织要求</Text>
                <Paragraph style={{ margin: 0, color: "#7c6f67", lineHeight: 1.8 }}>
                  {activeSummary.origin || "当前未补充详细说明，请先阅读标题并结合组织通知确认要求。"}
                </Paragraph>
                <Space size={[8, 8]} wrap>
                  <Tag color="red">{activeItem.sla}</Tag>
                  <Tag color="blue">下发于 {formatTime(activeItem.publish_at)}</Tag>
                  <Tag color="orange">截止于 {formatTime(resolveDeadline(activeItem)?.toISOString())}</Tag>
                </Space>
              </Space>
            </Card>

            <Card size="small" style={{ borderRadius: 16 }}>
              <Text strong style={{ color: "#111827" }}>建议你这样处理</Text>
              <Paragraph style={{ margin: "8px 0 0", color: "#7c6f67", lineHeight: 1.8 }}>
                先确认是否已理解要求，再将状态调整为“分析中”或“已完成”；如已形成阶段成果，可在下方补充执行说明，便于组织掌握你的落实进度。
              </Paragraph>
            </Card>

            <Form form={form} layout="vertical" onFinish={(values) => void handleSaveFeedback(values)}>
              <Form.Item label="当前进度" name="status" rules={[{ required: true, message: "请选择当前进度" }]}>
                <Select options={statusOptions.map((option) => ({ label: option, value: option }))} />
              </Form.Item>
              <Form.Item label="执行反馈" name="feedback">
                <TextArea rows={5} maxLength={500} placeholder="例如：已完成学习传达，今天下班前补充心得与落实情况。" />
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={saving} icon={<Send size={14} />}>
                提交反馈
              </Button>
            </Form>
          </Space>
        ) : null}
      </Drawer>
    </Space>
  );
}
