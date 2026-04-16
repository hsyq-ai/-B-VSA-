import {
  Clock3,
  HeartHandshake,
  LifeBuoy,
  MessageCircleHeart,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
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
import dayjs from "dayjs";
import {
  organizationCareApi,
  type CareSignalLevel,
  type CareStatus,
  type OrganizationCareItem,
} from "../../api/modules/organizationCare";
import { allowPartyLocalFallback } from "../../utils/runtimeFlags";

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const LOCAL_KEY = "copaw_organization_care_mvp_v1";
const signalOptions: CareSignalLevel[] = ["低", "中", "高"];
const cardShadow = "0 18px 38px rgba(127,29,29,0.08)";

interface SupportFormValues {
  signal_level: CareSignalLevel;
  care_type: string;
  owner?: string;
  care_note?: string;
  follow_up_at?: dayjs.Dayjs;
}

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
        background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(255,250,248,0.98) 100%)",
        border: "1px solid rgba(127,29,29,0.08)",
        boxShadow: cardShadow,
      }}
    >
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: `${color}14`,
            color,
          }}
        >
          {icon}
        </div>
        <div>
          <Text style={{ color: "#7f1d1d", fontSize: 13, fontWeight: 700 }}>{title}</Text>
          <div style={{ marginTop: 8, fontSize: 28, fontWeight: 800, color: "#1f2937" }}>{value}</div>
          <Text style={{ display: "block", marginTop: 6, color: "#7c6f67", lineHeight: 1.7 }}>{description}</Text>
        </div>
      </Space>
    </Card>
  );
}

const loadLocal = (): OrganizationCareItem[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OrganizationCareItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveLocal = (items: OrganizationCareItem[]) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOCAL_KEY, JSON.stringify(items));
};

const sortByTimeDesc = (items: OrganizationCareItem[]) => {
  return [...items].sort((a, b) => {
    const aTs = new Date(a.updated_at || a.created_at || 0).getTime();
    const bTs = new Date(b.updated_at || b.created_at || 0).getTime();
    return bTs - aTs;
  });
};

const formatTime = (value?: string) => {
  const time = dayjs(value);
  return time.isValid() ? time.format("YYYY-MM-DD HH:mm") : "-";
};

const statusToneMap: Record<CareStatus, { bg: string; color: string }> = {
  待关怀: { bg: "#fff7ed", color: "#c2410c" },
  跟进中: { bg: "#eff6ff", color: "#1d4ed8" },
  已回访: { bg: "#ecfdf5", color: "#15803d" },
};

export default function MemberSupportPage() {
  const [form] = Form.useForm<SupportFormValues>();
  const [items, setItems] = useState<OrganizationCareItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const currentUserName = String(
    sessionStorage.getItem("copaw_user_name") || localStorage.getItem("copaw_user_name") || "当前党员",
  ).trim();
  const currentDept = String(
    sessionStorage.getItem("copaw_department") || localStorage.getItem("copaw_department") || "所在支部",
  ).trim();

  const reload = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const remote = await organizationCareApi.list();
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

  const ownItems = useMemo(
    () => items.filter((item) => String(item.employee_name || "").trim() === currentUserName),
    [currentUserName, items],
  );
  const visibleItems = ownItems.length ? ownItems : items;
  const fallbackHint = !ownItems.length && items.length > 0;

  const handleCreate = async (values: SupportFormValues) => {
    setSubmitting(true);
    const payload = {
      employee_name: currentUserName,
      department: currentDept,
      signal_level: values.signal_level,
      care_type: values.care_type.trim(),
      owner: values.owner?.trim() || "",
      care_note: values.care_note?.trim() || "",
      follow_up_at: values.follow_up_at?.toISOString() || "",
      status: "待关怀" as CareStatus,
    };
    try {
      const created = await organizationCareApi.create(payload);
      const next = sortByTimeDesc([created, ...items]);
      setItems(next);
      saveLocal(next);
      form.resetFields();
      message.success("支持申请已提交");
    } catch {
      if (allowPartyLocalFallback) {
        const now = new Date().toISOString();
        const localItem: OrganizationCareItem = {
          id: `local-${Date.now()}`,
          ...payload,
          created_at: now,
          updated_at: now,
        };
        const next = sortByTimeDesc([localItem, ...items]);
        setItems(next);
        saveLocal(next);
        form.resetFields();
        message.success("支持申请已提交（本地暂存）");
      } else {
        message.error("提交失败，请稍后重试");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const stats = useMemo(() => {
    const total = visibleItems.length;
    const pending = visibleItems.filter((item) => item.status === "待关怀").length;
    const processing = visibleItems.filter((item) => item.status === "跟进中").length;
    const revisited = visibleItems.filter((item) => item.status === "已回访").length;
    const urgent = visibleItems.filter((item) => item.signal_level === "高").length;
    return { total, pending, processing, revisited, urgent };
  }, [visibleItems]);

  const latestItem = visibleItems[0] || null;

  const requestTemplates = [
    {
      title: "学习压力支持",
      description: "适用于专题学习跟进、课程消化困难、考试压力等场景。",
      level: "中" as CareSignalLevel,
      note: "近期学习任务较集中，希望获得节奏建议或组织支持。",
    },
    {
      title: "工作协同支持",
      description: "适用于跨部门协同、任务衔接不顺、时间安排紧张等场景。",
      level: "中" as CareSignalLevel,
      note: "当前协同事项较多，希望组织协助协调节奏与资源。",
    },
    {
      title: "生活关怀支持",
      description: "适用于家庭、健康、情绪波动等需要组织主动关怀的场景。",
      level: "高" as CareSignalLevel,
      note: "当前存在需要组织关注的生活与情绪压力，希望获得沟通与支持。",
    },
  ];

  const applyTemplate = (template: (typeof requestTemplates)[number]) => {
    form.setFieldsValue({
      signal_level: template.level,
      care_type: template.title,
      care_note: template.note,
    });
    form.scrollToField("care_type");
  };

  const columns: ColumnsType<OrganizationCareItem> = [
    {
      title: "支持事项",
      dataIndex: "care_type",
      key: "care_type",
      width: 220,
      render: (value: string, record) => (
        <Space direction="vertical" size={2}>
          <Text strong style={{ color: "#1f2937" }}>{value}</Text>
          <Text style={{ color: "#7c6f67", fontSize: 12 }}>{record.care_note || "待补充说明"}</Text>
        </Space>
      ),
    },
    {
      title: "紧急程度",
      dataIndex: "signal_level",
      key: "signal_level",
      width: 120,
      render: (value: CareSignalLevel) => <Tag color={value === "高" ? "red" : value === "中" ? "orange" : "default"}>{value}</Tag>,
    },
    {
      title: "处理状态",
      dataIndex: "status",
      key: "status",
      width: 140,
      render: (value: CareStatus) => {
        const tone = statusToneMap[value];
        return (
          <Tag
            bordered={false}
            style={{ borderRadius: 999, marginInlineEnd: 0, paddingInline: 10, background: tone.bg, color: tone.color }}
          >
            {value}
          </Tag>
        );
      },
    },
    {
      title: "希望联系对象",
      dataIndex: "owner",
      key: "owner",
      width: 150,
      render: (value?: string) => value || "由组织统筹安排",
    },
    {
      title: "最近节点",
      dataIndex: "follow_up_at",
      key: "follow_up_at",
      width: 170,
      render: (value?: string) => formatTime(value),
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
            "radial-gradient(circle at top right, rgba(251,191,36,0.18) 0%, rgba(251,191,36,0) 28%), linear-gradient(135deg, #7f1d1d 0%, #991b1b 44%, #b91c1c 100%)",
          boxShadow: "0 28px 60px rgba(127,29,29,0.22)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
          <Space direction="vertical" size={14} style={{ maxWidth: 780 }}>
            <Tag
              bordered={false}
              style={{
                marginInlineEnd: 0,
                width: "fit-content",
                color: "#7f1d1d",
                background: "rgba(255,245,240,0.92)",
                borderRadius: 999,
                padding: "6px 12px",
                fontWeight: 700,
              }}
            >
              党员工作台 · 组织支持
            </Tag>
            <div>
              <Title level={2} style={{ margin: 0, color: "#fff7ed" }}>
                申请帮助、查看进度、感知组织温度
              </Title>
              <Paragraph style={{ margin: "12px 0 0", color: "rgba(255,245,240,0.86)", lineHeight: 1.9, fontSize: 15 }}>
                这里面向党员个人，重点解决“我能向组织申请什么支持、组织处理到哪一步、什么时候会回访”的问题。你提交的申请会与组织关怀台账保持同源，既方便组织跟进，也方便你随时查看进度。
              </Paragraph>
            </div>
            <Space size={[8, 8]} wrap>
              <Tag bordered={false} style={{ borderRadius: 999, background: "rgba(255,255,255,0.14)", color: "#fff7ed", marginInlineEnd: 0 }}>我的支持申请</Tag>
              <Tag bordered={false} style={{ borderRadius: 999, background: "rgba(255,255,255,0.14)", color: "#fff7ed", marginInlineEnd: 0 }}>处理进度可见</Tag>
              <Tag bordered={false} style={{ borderRadius: 999, background: "rgba(255,255,255,0.14)", color: "#fff7ed", marginInlineEnd: 0 }}>回访结果留痕</Tag>
            </Space>
            <Text style={{ color: "rgba(255,245,240,0.82)" }}>当前申请人：{currentUserName} · {currentDept}</Text>
            {fallbackHint ? (
              <Text style={{ color: "rgba(255,245,240,0.82)" }}>当前暂无专属申请记录，先展示组织支持台账中的相关内容供你参考。</Text>
            ) : null}
          </Space>
          <Space wrap>
            <Button icon={<RefreshCw size={14} />} onClick={() => void reload(false)} loading={loading}>
              同步进度
            </Button>
            <Button
              type="primary"
              danger
              icon={<Send size={14} />}
              onClick={() => form.scrollToField("care_type")}
            >
              发起支持申请
            </Button>
          </Space>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        <StatCard title="我的申请" value={stats.total} icon={<LifeBuoy size={20} />} color="#b91c1c" description="当前账号提交或可查看的支持事项总数。" />
        <StatCard title="待回应" value={stats.pending} icon={<Clock3 size={20} />} color="#c2410c" description="组织尚未开始跟进的申请，建议优先查看。" />
        <StatCard title="处理中" value={stats.processing} icon={<HeartHandshake size={20} />} color="#1d4ed8" description="已经被组织接收并持续跟进的支持事项。" />
        <StatCard title="高优先级" value={stats.urgent} icon={<ShieldAlert size={20} />} color="#991b1b" description="需要组织尽快关注的高紧急度事项数量。" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
        {requestTemplates.map((item) => (
          <Card key={item.title} bordered={false} styles={{ body: { padding: 22 } }} style={{ borderRadius: 24, boxShadow: cardShadow }}>
            <Text style={{ color: "#b91c1c", fontSize: 12, fontWeight: 700 }}>{item.title}</Text>
            <Paragraph style={{ margin: "10px 0 0", color: "#7c6f67", lineHeight: 1.8 }}>{item.description}</Paragraph>
            <Button type="link" danger style={{ paddingInline: 0 }} onClick={() => applyTemplate(item)}>
              直接套用此模板
            </Button>
          </Card>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 1.2fr) minmax(320px, 1fr)", gap: 16 }}>
        <Card
          title={
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <MessageCircleHeart size={16} />
              发起支持申请
            </div>
          }
          bordered={false}
          style={{ borderRadius: 24, boxShadow: cardShadow }}
        >
          <Form form={form} layout="vertical" initialValues={{ signal_level: "中" }} onFinish={(values) => void handleCreate(values)}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
              <Form.Item label="紧急程度" name="signal_level" rules={[{ required: true, message: "请选择紧急程度" }]}>
                <Select options={signalOptions.map((option) => ({ label: option, value: option }))} />
              </Form.Item>
              <Form.Item label="希望联系对象（可选）" name="owner">
                <Input maxLength={30} placeholder="例如：党小组长 / 支部委员" />
              </Form.Item>
            </div>
            <Form.Item label="申请事项" name="care_type" rules={[{ required: true, message: "请输入申请事项" }]}>
              <Input maxLength={80} placeholder="例如：近期学习压力较大，希望获得节奏建议" />
            </Form.Item>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: 16 }}>
              <Form.Item label="情况说明" name="care_note">
                <TextArea rows={4} maxLength={500} placeholder="可补充背景、当前困难、已尝试动作和期望获得的帮助。" />
              </Form.Item>
              <Form.Item label="希望回访时间（可选）" name="follow_up_at">
                <DatePicker showTime style={{ width: "100%" }} />
              </Form.Item>
            </div>
            <Button type="primary" danger htmlType="submit" loading={submitting} icon={<Send size={14} />}>
              提交给组织
            </Button>
          </Form>
        </Card>

        <Card
          title={
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Sparkles size={16} />
              我的支持提示
            </div>
          }
          bordered={false}
          style={{ borderRadius: 24, boxShadow: cardShadow }}
        >
          <Space direction="vertical" size={14} style={{ width: "100%" }}>
            <Card size="small" bordered={false} style={{ borderRadius: 18, background: "#fff7ed" }}>
              <Text strong style={{ color: "#9a3412" }}>如何更快获得帮助</Text>
              <Paragraph style={{ margin: "8px 0 0", color: "#9a3412", lineHeight: 1.8 }}>
                建议在申请里明确你的当前困扰、希望组织提供的帮助，以及最晚希望得到回应的时间，组织更容易快速判断与安排。
              </Paragraph>
            </Card>
            <Card size="small" bordered={false} style={{ borderRadius: 18, background: "#fef2f2" }}>
              <Text strong style={{ color: "#b91c1c" }}>最近一条记录</Text>
              <Paragraph style={{ margin: "8px 0 0", color: "#7c6f67", lineHeight: 1.8 }}>
                {latestItem
                  ? `${latestItem.care_type}，当前状态为“${latestItem.status}”，最近节点：${formatTime(latestItem.follow_up_at)}。`
                  : "当前暂无申请记录，你可以先从左侧模板中选择一类支持事项发起申请。"}
              </Paragraph>
            </Card>
            <Card size="small" bordered={false} style={{ borderRadius: 18, background: "#f8fafc" }}>
              <Text strong style={{ color: "#111827" }}>组织处理一般会经历</Text>
              <Paragraph style={{ margin: "8px 0 0", color: "#64748b", lineHeight: 1.8 }}>
                提交申请 → 组织接收并确认 → 跟进沟通 → 回访留痕。你可以在下方台账里持续查看状态变化。
              </Paragraph>
            </Card>
          </Space>
        </Card>
      </div>

      <Card
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <HeartHandshake size={16} />
            我的支持进度
          </div>
        }
        extra={<Text style={{ color: "#7c6f67", fontSize: 12 }}>和组织关怀台账同源，状态会自动同步</Text>}
        bordered={false}
        style={{ borderRadius: 24, boxShadow: cardShadow }}
      >
        {visibleItems.length ? (
          <Table<OrganizationCareItem>
            rowKey="id"
            size="middle"
            loading={loading}
            columns={columns}
            dataSource={visibleItems}
            pagination={{ pageSize: 8, hideOnSinglePage: true }}
          />
        ) : (
          <Empty description="当前暂无支持申请记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
        <Card bordered={false} style={{ borderRadius: 24, boxShadow: cardShadow }} styles={{ body: { padding: 18 } }}>
          <Text strong style={{ color: "#1f2937" }}>学习支持</Text>
          <Text style={{ display: "block", marginTop: 6, color: "#7c6f67", lineHeight: 1.8 }}>当支持事项涉及学习压力时，可同步回到“学习中心”推进课程，完成后在“我的成长”查看结果沉淀。</Text>
        </Card>
        <Card bordered={false} style={{ borderRadius: 24, boxShadow: cardShadow }} styles={{ body: { padding: 18 } }}>
          <Text strong style={{ color: "#1f2937" }}>事务协同</Text>
          <Text style={{ display: "block", marginTop: 6, color: "#7c6f67", lineHeight: 1.8 }}>如果需要补交材料、办理申请或跟踪组织结果，可联动“我的事务”继续处理。</Text>
        </Card>
      </div>
    </Space>
  );
}
