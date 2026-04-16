import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Heart,
  HeartHandshake,
  MessageCircleHeart,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  UserRoundSearch,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Button,
  Card,
  DatePicker,
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
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  organizationCareApi,
  type CareSignalLevel,
  type CareStatus,
  type OrganizationCareItem,
} from "../../api/modules/organizationCare";
import PageAiInsightCard from "../../components/employee/ai/PageAiInsightCard";
import {
  type OrganizationCareFormValues,
  type OrganizationCareSecretaryAction,
  buildOrganizationCareDerived,
  buildOrganizationCareSecretaryContext,
  formatTime,
  getOrganizationCarePrefillValues,
  loadLocal,
  saveLocal,
  signalOptions,
  sortByTimeDesc,
  statusOptions,
} from "../../features/party/organization-care";
import { openSecretaryWithContext } from "../../features/party/shared/navigation";
import { allowPartyLocalFallback } from "../../utils/runtimeFlags";

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const cardShadow = "0 18px 38px rgba(127,29,29,0.08)";
const sectionCardStyle = {
  borderRadius: 24,
  border: "1px solid rgba(127,29,29,0.08)",
  boxShadow: cardShadow,
  background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(255,250,248,0.98) 100%)",
} as const;
const panelStyle = {
  borderRadius: 18,
  border: "1px solid rgba(127,29,29,0.08)",
  background: "linear-gradient(180deg, rgba(255,248,246,0.96) 0%, rgba(255,255,255,0.98) 100%)",
} as const;

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
    <Card bordered={false} styles={{ body: { padding: 20 } }} style={sectionCardStyle}>
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
          <div style={{ marginTop: 8, fontSize: 28, fontWeight: 800, color: "#1f2937", lineHeight: 1 }}>{value}</div>
          <Text style={{ display: "block", marginTop: 6, color: "#7c6f67", lineHeight: 1.7 }}>{description}</Text>
        </div>
      </Space>
    </Card>
  );
}

export default function EmployeeOrganizationCarePage() {
  const navigate = useNavigate();
  const [form] = Form.useForm<OrganizationCareFormValues>();
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState<OrganizationCareItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
        if (!silent) message.warning("接口暂不可用，已切换为本地暂存模式");
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

  const askSecretary = (action: OrganizationCareSecretaryAction = "briefing") => {
    openSecretaryWithContext(
      navigate,
      buildOrganizationCareSecretaryContext(action, { latestItem, stats: careStats }),
    );
  };
  const scrollToCreateForm = () => {
    form.scrollToField("employee_name");
  };

  const prefillKey = searchParams.toString();
  useEffect(() => {
    const values = getOrganizationCarePrefillValues(searchParams);
    if (!Object.keys(values).length) return;
    form.setFieldsValue(values);
  }, [prefillKey, form, searchParams]);

  const handleCreate = async (values: OrganizationCareFormValues) => {
    setSubmitting(true);
    const payload = {
      employee_name: values.employee_name.trim(),
      department: values.department?.trim() || "",
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
      message.success("组织关怀事项已提交");
    } catch {
      if (allowPartyLocalFallback) {
        const now = new Date().toISOString();
        const localItem: OrganizationCareItem = {
          id: `local-${Date.now()}`,
          employee_name: payload.employee_name,
          department: payload.department,
          signal_level: payload.signal_level,
          care_type: payload.care_type,
          owner: payload.owner,
          care_note: payload.care_note,
          follow_up_at: payload.follow_up_at,
          status: payload.status,
          created_at: now,
          updated_at: now,
        };
        const next = sortByTimeDesc([localItem, ...items]);
        setItems(next);
        saveLocal(next);
        form.resetFields();
        message.success("组织关怀事项已提交（本地暂存）");
      } else {
        message.error("提交失败，请稍后重试");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (record: OrganizationCareItem, status: CareStatus) => {
    const now = new Date().toISOString();
    const applyLocal = () => {
      const next = items.map((item) => (item.id === record.id ? { ...item, status, updated_at: now } : item));
      const sorted = sortByTimeDesc(next);
      setItems(sorted);
      saveLocal(sorted);
    };
    try {
      await organizationCareApi.update(record.id, { status });
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

  const { stats: careStats, latestItem, featuredCards } = useMemo(
    () => buildOrganizationCareDerived(items),
    [items],
  );

  const columns: ColumnsType<OrganizationCareItem> = [
    {
      title: "员工",
      dataIndex: "employee_name",
      key: "employee_name",
      width: 180,
      render: (_value: string, record) => (
        <Space direction="vertical" size={2}>
          <Text strong style={{ color: "#1f2937" }}>{record.employee_name}</Text>
          <Text style={{ color: "#7c6f67", fontSize: 12 }}>{record.department || "未填写部门"}</Text>
        </Space>
      ),
    },
    {
      title: "信号等级",
      dataIndex: "signal_level",
      key: "signal_level",
      width: 110,
      render: (value: CareSignalLevel) => (
        <Tag
          bordered={false}
          style={{
            borderRadius: 999,
            paddingInline: 10,
            background: value === "高" ? "#fef2f2" : value === "中" ? "#fff7ed" : "#f5f5f4",
            color: value === "高" ? "#991b1b" : value === "中" ? "#c2410c" : "#57534e",
          }}
        >
          {value}
        </Tag>
      ),
    },
    {
      title: "关怀主题",
      dataIndex: "care_type",
      key: "care_type",
      width: 220,
      ellipsis: true,
    },
    {
      title: "责任人",
      dataIndex: "owner",
      key: "owner",
      width: 140,
      render: (value?: string) => value || "-",
    },
    {
      title: "回访时间",
      dataIndex: "follow_up_at",
      key: "follow_up_at",
      width: 180,
      render: (value?: string) => formatTime(value),
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 150,
      render: (value: CareStatus, record) => (
        <Select<CareStatus>
          size="small"
          value={value}
          style={{ width: 108 }}
          options={statusOptions.map((option) => ({ label: option, value: option }))}
          onChange={(next) => void handleStatusChange(record, next)}
        />
      ),
    },
    {
      title: "备注",
      dataIndex: "care_note",
      key: "care_note",
      ellipsis: true,
      render: (value?: string) => value || "-",
    },
  ];

  return (
    <Space className="lux-shell" direction="vertical" size={24} style={{ width: "100%", padding: 4 }}>
      <Card
        bordered={false}
        style={{
          borderRadius: 28,
          overflow: "hidden",
          background:
            "radial-gradient(circle at top right, rgba(251,191,36,0.18) 0%, rgba(251,191,36,0) 28%), linear-gradient(135deg, #7f1d1d 0%, #991b1b 44%, #b91c1c 100%)",
          boxShadow: "0 28px 60px rgba(127,29,29,0.22)",
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
                color: "#7f1d1d",
                background: "rgba(255,245,240,0.92)",
                borderRadius: 999,
                padding: "6px 12px",
                fontWeight: 700,
              }}
            >
              组织协同 · 组织关怀
            </Tag>
            <div>
              <Title level={2} style={{ margin: 0, color: "#fff7ed" }}>
                关怀支持、风险提醒、回访留痕统一管理
              </Title>
              <Paragraph style={{ margin: "12px 0 0", color: "rgba(255,245,240,0.86)", lineHeight: 1.9, fontSize: 15 }}>
                以“有温度的组织支持”为目标，将关怀诉求、预警信号、责任跟进和回访记录集中沉淀在同一页面中，既方便员工发起支持，也方便组织形成持续闭环。
              </Paragraph>
            </div>
            <Space size={[8, 8]} wrap>
              <Tag bordered={false} style={{ borderRadius: 999, background: "rgba(255,255,255,0.14)", color: "#fff7ed", marginInlineEnd: 0 }}>服务支持申请</Tag>
              <Tag bordered={false} style={{ borderRadius: 999, background: "rgba(255,255,255,0.14)", color: "#fff7ed", marginInlineEnd: 0 }}>风险预警识别</Tag>
              <Tag bordered={false} style={{ borderRadius: 999, background: "rgba(255,255,255,0.14)", color: "#fff7ed", marginInlineEnd: 0 }}>回访闭环留痕</Tag>
            </Space>
          </Space>
          <Space wrap>
            <Button icon={<RefreshCw size={14} />} onClick={() => void reload(false)} loading={loading}>
              同步数据
            </Button>
            <Button type="primary" danger icon={<Plus size={14} />} onClick={scrollToCreateForm}>
              提交关怀事项
            </Button>
          </Space>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        <StatCard title="关怀事项总数" value={careStats.total} icon={<Heart size={20} />} color="#b91c1c" description="已沉淀的组织关怀、支持申请和回访记录数量。" />
        <StatCard title="高风险预警" value={careStats.highSignal} icon={<ShieldAlert size={20} />} color="#991b1b" description="需要优先沟通和重点关注的高等级信号。" />
        <StatCard title="待跟进事项" value={careStats.pending} icon={<Clock3 size={20} />} color="#c2410c" description="仍需沟通、回访或补充动作的关怀事项。" />
        <StatCard title="已回访闭环" value={careStats.revisited} icon={<CheckCircle2 size={20} />} color="#166534" description="已形成回访留痕的支持事项数量。" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        {featuredCards.map((item) => (
          <Card key={item.eyebrow} bordered={false} styles={{ body: { padding: 22 } }} style={sectionCardStyle}>
            <Text style={{ color: "#b91c1c", fontSize: 12, fontWeight: 700 }}>{item.eyebrow}</Text>
            <div style={{ margin: "10px 0", fontSize: 18, fontWeight: 700, color: "#1f2937", lineHeight: 1.6 }}>{item.title}</div>
            <Text style={{ color: "#7c6f67", lineHeight: 1.9 }}>{item.description}</Text>
          </Card>
        ))}
      </div>

      <PageAiInsightCard
        badge="AI 关怀编排"
        tone="emerald"
        title={latestItem ? `红智助手已锁定当前最新关怀事项：${latestItem.employee_name} · ${latestItem.care_type}` : "红智助手已识别当前组织关怀台账仍待建立重点样本"}
        description="组织关怀页现在会直接解释风险等级、回访压力与组织温度趋势，并把秘书接管入口放到页面正中，而不是只留在表单和台账里。"
        insights={[
          `高风险预警：${careStats.highSignal} 项`,
          `48 小时内待回访：${careStats.dueSoon} 项`,
          `最新事项：${latestItem ? `${latestItem.employee_name} · ${latestItem.status}` : "暂无已登记关怀事项"}`,
        ]}
        suggestions={[
          careStats.highSignal > 0 ? "优先处理高等级信号事项，并尽快补齐责任人与回访节点。" : "当前可先沉淀典型关怀样本，形成稳定的组织支持机制。",
          "先由秘书输出温度简报，再决定本周要重点跟进的人员和沟通节奏。",
          "重要事项建议同步生成跟进单和谈话纪要，避免关怀动作只停留在登记层。",
        ]}
        actions={[
          { key: "care-briefing", label: "生成组织温度简报", type: "primary", onClick: () => askSecretary("briefing") },
          { key: "care-followup", label: "生成重点人员跟进单", onClick: () => askSecretary("followup") },
          { key: "care-create", label: "提交关怀事项", onClick: scrollToCreateForm },
        ]}
      />

      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 1.25fr) minmax(320px, 1fr)", gap: 16 }}>
        <Card
          title={
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <HeartHandshake size={16} />
              提交关怀事项
            </div>
          }
          bordered={false}
          style={sectionCardStyle}
        >
          <Form form={form} layout="vertical" initialValues={{ signal_level: "中" }} onFinish={(values) => void handleCreate(values)}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
              <Form.Item label="员工姓名" name="employee_name" rules={[{ required: true, message: "请输入员工姓名" }]} style={{ marginBottom: 16 }}>
                <Input maxLength={40} placeholder="例如：张三" />
              </Form.Item>
              <Form.Item label="所属部门" name="department" style={{ marginBottom: 16 }}>
                <Input maxLength={40} placeholder="例如：科研部" />
              </Form.Item>
              <Form.Item label="信号等级" name="signal_level" rules={[{ required: true, message: "请选择信号等级" }]} style={{ marginBottom: 16 }}>
                <Select options={signalOptions.map((option) => ({ label: option, value: option }))} />
              </Form.Item>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
              <Form.Item label="关怀主题" name="care_type" rules={[{ required: true, message: "请输入关怀主题" }]} style={{ marginBottom: 16 }}>
                <Input maxLength={80} placeholder="例如：连续加班压力疏导" />
              </Form.Item>
              <Form.Item label="责任人" name="owner" style={{ marginBottom: 16 }}>
                <Input maxLength={30} placeholder="例如：党小组长李四" />
              </Form.Item>
              <Form.Item label="计划回访时间" name="follow_up_at" style={{ marginBottom: 16 }}>
                <DatePicker showTime style={{ width: "100%" }} />
              </Form.Item>
            </div>
            <div style={{ display: "flex", gap: 16, alignItems: "flex-end" }}>
              <Form.Item label="情况说明" name="care_note" style={{ flex: 1, marginBottom: 0 }}>
                <TextArea rows={3} maxLength={500} placeholder="记录关怀背景、风险观察、沟通重点与后续动作建议" />
              </Form.Item>
              <Button type="primary" danger htmlType="submit" loading={submitting} icon={<Plus size={14} />}>
                生成关怀闭环
              </Button>
            </div>
          </Form>
        </Card>

        <Card
          title={
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Sparkles size={16} />
              组织支持建议
            </div>
          }
          bordered={false}
          style={sectionCardStyle}
        >
          <Space direction="vertical" size={14} style={{ width: "100%" }}>
            <div style={{ ...panelStyle, padding: 14 }}>
              <Text strong style={{ color: "#b91c1c" }}>今日关怀建议</Text>
              <Paragraph style={{ margin: "8px 0 0", color: "#7c6f67", lineHeight: 1.8 }}>
                建议优先覆盖高强度加班、跨部门磨合和关键岗位情绪波动三类场景，确保重点人员在 24 小时内被主动触达。
              </Paragraph>
            </div>
            <div style={{ ...panelStyle, padding: 14 }}>
              <Text strong style={{ color: "#c2410c" }}>建议形成的留痕材料</Text>
              <Space direction="vertical" size={8} style={{ width: "100%", marginTop: 10 }}>
                <Button block onClick={() => askSecretary("minutes")}>生成关怀谈话纪要</Button>
                <Button block onClick={() => askSecretary("followup")}>生成重点人员跟进单</Button>
                <Button block onClick={() => askSecretary("briefing")}>生成月度温度分析简报</Button>
              </Space>
            </div>
            <div style={{ ...panelStyle, padding: 14 }}>
              <Text strong style={{ color: "#7f1d1d" }}>当前最新事项</Text>
              <Paragraph style={{ margin: "8px 0 0", color: "#7c6f67", lineHeight: 1.8 }}>
                {latestItem
                  ? `${latestItem.employee_name} · ${latestItem.care_type}，当前状态为“${latestItem.status}”，建议结合回访节点继续补充记录。`
                  : "当前暂无已提交事项，可先创建关怀任务或服务支持单。"}
              </Paragraph>
            </div>
          </Space>
        </Card>
      </div>

      <Card
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Search size={16} />
            关怀执行台账
          </div>
        }
        extra={
          <Space size={6}>
            <UserRoundSearch size={14} color="#7c6f67" />
            <Text style={{ color: "#7c6f67", fontSize: 12 }}>支持实时更新状态与回访留痕</Text>
          </Space>
        }
        bordered={false}
        style={sectionCardStyle}
      >
        <Table<OrganizationCareItem>
          rowKey="id"
          size="middle"
          loading={loading}
          columns={columns}
          dataSource={items}
          pagination={{ pageSize: 8, hideOnSinglePage: true }}
          locale={{ emptyText: "暂无关怀记录，建议先提交重点事项" }}
        />
        <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <Text style={{ color: "#7c6f67" }}>建议将高等级信号事项纳入周例会专题跟进，形成稳定的组织支持机制。</Text>
          <Button type="link" danger icon={<ArrowRight size={14} />} onClick={() => navigate("/app/member/tasks")}>
            返回任务中枢
          </Button>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        <Card bordered={false} style={sectionCardStyle} styles={{ body: { padding: 18 } }}>
          <Space align="start" size={12}>
            <div style={{ width: 42, height: 42, borderRadius: 14, background: "rgba(185,28,28,0.12)", color: "#b91c1c", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <MessageCircleHeart size={18} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1f2937" }}>沟通支持</div>
              <Text style={{ color: "#7c6f67", fontSize: 12, lineHeight: 1.8 }}>需要沟通、辅导或支持时，可在本页直接提交关怀事项。</Text>
            </div>
          </Space>
        </Card>
        <Card bordered={false} style={sectionCardStyle} styles={{ body: { padding: 18 } }}>
          <Space align="start" size={12}>
            <div style={{ width: 42, height: 42, borderRadius: 14, background: "rgba(194,65,12,0.12)", color: "#c2410c", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Sparkles size={18} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1f2937" }}>学习建设联动</div>
              <Text style={{ color: "#7c6f67", fontSize: 12, lineHeight: 1.8 }}>如关怀事项涉及学习压力，可进入思政辅导继续获取陪跑建议。</Text>
            </div>
          </Space>
        </Card>
        <Card bordered={false} style={sectionCardStyle} styles={{ body: { padding: 18 } }}>
          <Space align="start" size={12}>
            <div style={{ width: 42, height: 42, borderRadius: 14, background: "rgba(127,29,29,0.12)", color: "#7f1d1d", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <HeartHandshake size={18} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1f2937" }}>组织温度沉淀</div>
              <Text style={{ color: "#7c6f67", fontSize: 12, lineHeight: 1.8 }}>通过回访留痕与状态更新，持续沉淀组织支持的温度与效率。</Text>
            </div>
          </Space>
        </Card>
      </div>
    </Space>
  );
}
