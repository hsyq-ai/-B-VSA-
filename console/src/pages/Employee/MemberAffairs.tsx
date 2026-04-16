import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Clock,
  RefreshCw,
  Send,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Button,
  Card,
  DatePicker,
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
  partyAffairsApi,
  type PartyAffairItem,
  type PartyAffairStatus,
  type PartyAffairType,
} from "../../api/modules/partyAffairs";
import {
  type AffairFormValues,
  calcMemberAffairStats,
  findMemberAffairFocusItem,
  formatTime,
  getVisibleMemberAffairs,
  loadLocal,
  saveLocal,
  sortByTimeDesc,
  statusColorMap,
  typeOptions,
} from "../../features/party/member-affairs";
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
        background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
        boxShadow: cardShadow,
      }}
    >
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: 16,
            background: `${color}15`,
            color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon}
        </div>
        <div>
          <Text style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>{title}</Text>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#0f172a", marginTop: 4 }}>{value}</div>
          <Text style={{ display: "block", marginTop: 8, color: "#64748b", lineHeight: 1.7 }}>{description}</Text>
        </div>
      </Space>
    </Card>
  );
}

export default function MemberAffairsPage() {
  const [form] = Form.useForm<AffairFormValues>();
  const [items, setItems] = useState<PartyAffairItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const currentUserName = String(
    sessionStorage.getItem("copaw_user_name") || localStorage.getItem("copaw_user_name") || "当前党员",
  ).trim();

  const reload = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const remote = await partyAffairsApi.list();
      const sorted = sortByTimeDesc(remote);
      setItems(sorted);
      saveLocal(sorted);
    } catch {
      if (allowPartyLocalFallback) {
        const local = sortByTimeDesc(loadLocal());
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

  const { visibleItems, fallbackHint } = useMemo(
    () => getVisibleMemberAffairs(items, currentUserName),
    [currentUserName, items],
  );

  const handleCreate = async (values: AffairFormValues) => {
    setSubmitting(true);
    const payload = {
      title: values.title.trim(),
      type: values.type,
      status: "待处理" as PartyAffairStatus,
      assignee: currentUserName,
      deadline: values.deadline?.toISOString() || "",
      summary: values.summary?.trim() || "",
    };
    try {
      const created = await partyAffairsApi.create(payload);
      const next = sortByTimeDesc([created, ...items]);
      setItems(next);
      saveLocal(next);
      form.resetFields();
      message.success("事务申请已提交");
    } catch {
      if (allowPartyLocalFallback) {
        const now = new Date().toISOString();
        const localItem: PartyAffairItem = {
          id: `local-${Date.now()}`,
          ...payload,
          created_at: now,
          updated_at: now,
        };
        const next = sortByTimeDesc([localItem, ...items]);
        setItems(next);
        saveLocal(next);
        form.resetFields();
        message.success("事务申请已提交（本地暂存）");
      } else {
        message.error("提交失败，请稍后重试");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const stats = useMemo(() => calcMemberAffairStats(visibleItems), [visibleItems]);

  const focusItem = useMemo(
    () => findMemberAffairFocusItem(visibleItems),
    [visibleItems],
  );

  const columns: ColumnsType<PartyAffairItem> = [
    {
      title: "我的事项",
      dataIndex: "title",
      key: "title",
      width: 240,
      render: (value: string, record) => (
        <Space direction="vertical" size={2}>
          <Text strong>{value}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{record.summary || "待补充材料说明"}</Text>
        </Space>
      ),
    },
    {
      title: "事项类型",
      dataIndex: "type",
      key: "type",
      width: 120,
      render: (value: PartyAffairType) => <Tag>{value}</Tag>,
    },
    {
      title: "办理状态",
      dataIndex: "status",
      key: "status",
      width: 130,
      render: (value: PartyAffairStatus) => <Tag color={statusColorMap[value]}>{value}</Tag>,
    },
    {
      title: "截止时间",
      dataIndex: "deadline",
      key: "deadline",
      width: 170,
      render: (value?: string) => formatTime(value),
    },
    {
      title: "最近更新",
      dataIndex: "updated_at",
      key: "updated_at",
      width: 170,
      render: (_: string | undefined, record) => formatTime(record.updated_at || record.created_at),
    },
  ];

  return (
    <Space className="lux-shell" direction="vertical" size={24} style={{ width: "100%", padding: 4 }}>
      <Card
        bordered={false}
        styles={{ body: { padding: 28 } }}
        style={{
          borderRadius: 28,
          overflow: "hidden",
          background:
            "radial-gradient(circle at top left, rgba(255,255,255,0.24) 0%, rgba(255,255,255,0) 40%), linear-gradient(135deg, #7f1d1d 0%, #9f1239 55%, #be123c 100%)",
          boxShadow: "0 28px 50px rgba(127,29,29,0.22)",
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
                background: "rgba(255,255,255,0.14)",
                color: "#ffe4e6",
                fontWeight: 700,
              }}
            >
              党员工作台 · 我的事务
            </Tag>
            <div>
              <Title level={2} style={{ margin: 0, color: "#fff7ed" }}>
                看清我要提交什么、办理到了哪一步、还差哪些材料
              </Title>
              <Paragraph style={{ margin: "12px 0 0", color: "rgba(255,245,245,0.86)", lineHeight: 1.9, fontSize: 15 }}>
                聚焦党员个人办理视角，把组织事项从“发起统筹”转为“我的提交、我的进度、我的结果”。无论是活动申请、材料补充还是组织生活相关办理，都可以在这里查看节点并提交说明。
              </Paragraph>
            </div>
            <Space size={[8, 8]} wrap>
              <Tag color="gold" style={{ borderRadius: 999, paddingInline: 10 }}>材料提交</Tag>
              <Tag color="blue" style={{ borderRadius: 999, paddingInline: 10 }}>办理进度</Tag>
              <Tag color="purple" style={{ borderRadius: 999, paddingInline: 10 }}>结果回执</Tag>
            </Space>
            {fallbackHint ? (
              <Text style={{ color: "rgba(255,245,245,0.82)" }}>当前暂无只属于你的事务记录，先展示组织侧事项台账供你参考。</Text>
            ) : null}
          </Space>
          <Space>
            <Button icon={<RefreshCw size={14} />} onClick={() => void reload(false)} loading={loading}>
              同步进度
            </Button>
            <Button type="primary" danger icon={<Send size={14} />} onClick={() => form.scrollToField("title")}>
              提交办理申请
            </Button>
          </Space>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        <StatCard title="我的事务" value={stats.total} icon={<ClipboardList size={20} />} color="#2563eb" description="当前账号下可查看或提交的事务总量。" />
        <StatCard title="待提交/待处理" value={stats.pending} icon={<Clock size={20} />} color="#d97706" description="仍需你补充动作或等待组织受理的事项。" />
        <StatCard title="审批中" value={stats.processing} icon={<Activity size={20} />} color="#1d4ed8" description="组织已接收并正在流转中的事项数量。" />
        <StatCard title="临期提醒" value={stats.overdue} icon={<AlertCircle size={20} />} color="#dc2626" description="已过截止节点或需要尽快处理的事项。" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 1.3fr) minmax(320px, 1fr)", gap: 16 }}>
        <Card
          title={
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Send size={16} />
              提交办理申请
            </div>
          }
          bordered={false}
          style={{ borderRadius: 24, boxShadow: cardShadow }}
        >
          <Form form={form} layout="vertical" onFinish={(values) => void handleCreate(values)}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
              <Form.Item label="事项标题" name="title" rules={[{ required: true, message: "请输入事项标题" }]}>
                <Input maxLength={80} placeholder="例如：提交主题党日心得材料" />
              </Form.Item>
              <Form.Item label="事项类型" name="type" rules={[{ required: true, message: "请选择事项类型" }]}>
                <Select options={typeOptions.map((option) => ({ label: option, value: option }))} />
              </Form.Item>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 16 }}>
              <Form.Item label="希望办结时间（可选）" name="deadline">
                <DatePicker showTime style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item label="材料说明 / 办理说明" name="summary">
                <TextArea rows={4} maxLength={500} placeholder="请说明当前需要办理什么、已准备哪些材料、还希望组织提供什么帮助。" />
              </Form.Item>
            </div>
            <Button type="primary" danger htmlType="submit" loading={submitting} icon={<Send size={14} />}>
              提交到我的事务
            </Button>
          </Form>
        </Card>

        <Card
          title={
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <CheckCircle2 size={16} />
              办理提示
            </div>
          }
          bordered={false}
          style={{ borderRadius: 24, boxShadow: cardShadow }}
        >
          <Space direction="vertical" size={14} style={{ width: "100%" }}>
            <Card size="small" bordered={false} style={{ borderRadius: 18, background: "#fff7ed" }}>
              <Text strong style={{ color: "#9a3412" }}>当前优先处理</Text>
              <Paragraph style={{ margin: "8px 0 0", color: "#9a3412", lineHeight: 1.8 }}>
                {focusItem
                  ? `${focusItem.title}，当前状态为“${focusItem.status}”，请关注截止时间 ${formatTime(focusItem.deadline)}。`
                  : "当前暂无待处理事项，可从左侧发起新的办理申请。"}
              </Paragraph>
            </Card>
            <Card size="small" bordered={false} style={{ borderRadius: 18, background: "#f8fafc" }}>
              <Text strong style={{ color: "#111827" }}>建议按这个顺序办理</Text>
              <Paragraph style={{ margin: "8px 0 0", color: "#64748b", lineHeight: 1.8 }}>
                先查看待处理事项，再补齐材料说明，最后跟踪状态变化。若状态进入“审批中”，说明组织已经开始处理。
              </Paragraph>
            </Card>
            <Card size="small" bordered={false} style={{ borderRadius: 18, background: "#eff6ff" }}>
              <Text strong style={{ color: "#1d4ed8" }}>记录归属</Text>
              <Paragraph style={{ margin: "8px 0 0", color: "#1e40af", lineHeight: 1.8 }}>
                你提交的新事务会自动以“{currentUserName}”作为当前办理人，便于后续在党员工作台快速查看。
              </Paragraph>
            </Card>
          </Space>
        </Card>
      </div>

      <Card
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ClipboardList size={16} />
            我的事务台账
          </div>
        }
        extra={<Text style={{ color: "#64748b", fontSize: 12 }}>和书记侧事务中心同源，组织处理后这里会同步更新</Text>}
        bordered={false}
        style={{ borderRadius: 24, boxShadow: cardShadow }}
      >
        {visibleItems.length ? (
          <Table<PartyAffairItem>
            rowKey="id"
            size="middle"
            loading={loading}
            columns={columns}
            dataSource={visibleItems}
            pagination={{ pageSize: 8, hideOnSinglePage: true }}
          />
        ) : (
          <Empty description="当前暂无事务记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
      </Card>
    </Space>
  );
}
