import {
  ArrowRight,
  CheckCircle2,
  Clock,
  KanbanSquare,
  Plus,
  RefreshCw,
  Route,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Button,
  Card,
  DatePicker,
  Drawer,
  Empty,
  Form,
  Input,
  Progress,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useNavigate } from "react-router-dom";
import { agentOsApi } from "../../api/modules/agentOs";
import { partyAffairsApi, type PartyAffairItem } from "../../api/modules/partyAffairs";
import PageAiInsightCard from "../../components/employee/ai/PageAiInsightCard";
import { allowPartyLocalFallback } from "../../utils/runtimeFlags";
import {
  type ActiveUserOption,
  type AuditDrawerState,
  type PartyAffairFormValues,
  buildSceneConfig,
  formatTime,
  getErrorText,
  loadLocal,
  normalizeItem,
  priorityColorMap,
  priorityOptions,
  receiptColorMap,
  saveLocal,
  sortByTimeDesc,
  statusColorMap,
  typeOptions,
} from "../../features/party/party-affairs";
import { openPartyScene } from "../../features/party/shared/navigation";

const { Title, Text, Paragraph } = Typography;

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
        boxShadow: "0 18px 36px rgba(15,23,42,0.06)",
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
          <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.6, color: "#94a3b8" }}>{description}</div>
        </div>
      </Space>
    </Card>
  );
}

export default function EmployeePartyAffairsPage() {
  const [form] = Form.useForm<PartyAffairFormValues>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [items, setItems] = useState<PartyAffairItem[]>([]);
  const [activeUsers, setActiveUsers] = useState<ActiveUserOption[]>([]);
  const [auditState, setAuditState] = useState<AuditDrawerState>({
    open: false,
    title: "任务审计链",
    loading: false,
    items: [],
  });

  const persistItems = (next: PartyAffairItem[]) => {
    const normalized = sortByTimeDesc(next.map(normalizeItem));
    setItems(normalized);
    saveLocal(normalized);
  };

  const persistLocalPatch = (record: PartyAffairItem, patch: Partial<PartyAffairItem>) => {
    persistItems(items.map((item) => (item.id === record.id ? normalizeItem({ ...item, ...patch }) : item)));
  };

  const loadActiveUsers = async () => {
    try {
      const res = await agentOsApi.listActiveUsers();
      setActiveUsers(Array.isArray(res.items) ? res.items : []);
    } catch {
      setActiveUsers([]);
    }
  };

  const reload = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const remote = await partyAffairsApi.list();
      persistItems(remote);
    } catch {
      if (allowPartyLocalFallback) {
        const local = loadLocal().map(normalizeItem);
        persistItems(local);
        if (!silent) message.warning("接口不可用，已切换为本地暂存模式");
      } else if (!silent) {
        message.error("加载失败，请检查后端服务或联系管理员");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void Promise.all([reload(false), loadActiveUsers()]);
  }, []);

  const handleCreate = async (values: PartyAffairFormValues) => {
    setSubmitting(true);
    const selectedUser = activeUsers.find((item) => item.user_id === values.assignee_user_id);
    const payload: Omit<PartyAffairItem, "id" | "created_at" | "updated_at"> = {
      title: values.title.trim(),
      type: values.type,
      status: "待处理",
      assignee: selectedUser?.name || "",
      assignee_user_id: selectedUser?.user_id || "",
      target_department: selectedUser?.department || "",
      deadline: values.deadline?.toISOString() || "",
      summary: values.summary?.trim() || "",
      priority: values.priority,
      owner_role: "党务专员",
      stage: "待分派",
      receipt_status: "待回执",
      next_action: "等待秘书分派",
      progress_percent: 10,
      biz_domain: "party",
      module: "party-affairs",
    };
    try {
      const created = normalizeItem(await partyAffairsApi.create(payload));
      persistItems([created, ...items]);
      form.resetFields();
      message.success("党建任务卡已创建");
    } catch (error) {
      if (allowPartyLocalFallback) {
        const now = new Date().toISOString();
        const localItem: PartyAffairItem = normalizeItem({
          id: `local-${Date.now()}`,
          ...payload,
          task_id: `party-affair-local-${Date.now()}`,
          created_at: now,
          updated_at: now,
        });
        persistItems([localItem, ...items]);
        form.resetFields();
        message.success("党建任务卡已创建（本地暂存）");
      } else {
        message.error(getErrorText(error, "创建失败，请稍后重试"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenScene = (record: PartyAffairItem) => {
    openPartyScene({
      navKey: "party-affairs",
      sceneKey: `party-affair-${record.id}`,
      scene: buildSceneConfig(record),
      navigate,
    });
  };
  const scrollToCreateForm = () => {
    form.scrollToField("title");
  };

  const handleDispatchTaskCard = async (record: PartyAffairItem) => {
    try {
      const result = await partyAffairsApi.dispatchTaskCard(record.id);
      persistLocalPatch(record, result.item);
      const count = Number(result.dispatch?.target_count || 0);
      message.success(`已向 ${count} 位成员投递党建任务卡`);
    } catch (error) {
      if (allowPartyLocalFallback) {
        persistLocalPatch(record, {
          status: "审批中",
          stage: "执行中",
          receipt_status: "回执中",
          progress_percent: 42,
          trace_id: `local-trace-${Date.now()}`,
          conversation_key: `task:${record.task_id || record.id}`,
          session_id: `console:task:${record.task_id || record.id}`,
          last_push_at: new Date().toISOString(),
          audit_summary: "本地暂存：任务卡已派发",
        });
        message.success("任务卡状态已更新（本地暂存）");
      } else {
        message.error(getErrorText(error, "投递任务卡失败，请稍后重试"));
      }
    }
  };

  const handleCompleteTaskCard = async (record: PartyAffairItem) => {
    try {
      const result = await partyAffairsApi.completeTaskCard(record.id);
      persistLocalPatch(record, result.item);
      message.success("任务卡已办结并推送归档通知");
    } catch (error) {
      if (allowPartyLocalFallback) {
        persistLocalPatch(record, {
          status: "已办结",
          stage: "归档完成",
          receipt_status: "已完成",
          progress_percent: 100,
          last_push_at: new Date().toISOString(),
          audit_summary: "本地暂存：任务卡已办结",
        });
        message.success("任务卡状态已更新（本地暂存）");
      } else {
        message.error(getErrorText(error, "办结任务卡失败，请稍后重试"));
      }
    }
  };

  const openAuditDrawer = async (record: PartyAffairItem) => {
    setAuditState({ open: true, title: `审计链 · ${record.title}`, loading: true, items: [] });
    try {
      const res = await agentOsApi.listAuditRoutes({ limit: 200 });
      const filtered = (res.items || [])
        .filter((item) => {
          const taskMatch = record.task_id && String(item.task_id || "") === String(record.task_id || "");
          const traceMatch = record.trace_id && String(item.trace_id || "") === String(record.trace_id || "");
          const convoMatch =
            record.conversation_key &&
            String(item.conversation_key || "") === String(record.conversation_key || "");
          return Boolean(taskMatch || traceMatch || convoMatch);
        })
        .sort(
          (a, b) =>
            new Date(String(b.created_at || 0)).getTime() - new Date(String(a.created_at || 0)).getTime(),
        );
      setAuditState({
        open: true,
        title: `审计链 · ${record.title}`,
        loading: false,
        items: filtered,
      });
    } catch (error) {
      setAuditState({
        open: true,
        title: `审计链 · ${record.title}`,
        loading: false,
        items: [],
      });
      message.error(getErrorText(error, "加载审计链失败，请稍后重试"));
    }
  };

  const pendingCount = useMemo(
    () => items.filter((item) => item.status === "待处理").length,
    [items],
  );
  const inFlightCount = useMemo(
    () => items.filter((item) => item.status === "审批中").length,
    [items],
  );
  const doneCount = useMemo(
    () => items.filter((item) => item.status === "已办结").length,
    [items],
  );
  const tracedCount = useMemo(
    () => items.filter((item) => item.trace_id || item.conversation_key).length,
    [items],
  );

  const focusItems = useMemo(() => {
    const pending = items.filter((item) => item.status !== "已办结").slice(0, 3);
    if (pending.length) return pending;
    return sortByTimeDesc(items).slice(0, 3);
  }, [items]);

  const columns: ColumnsType<PartyAffairItem> = [
    {
      title: "事项",
      dataIndex: "title",
      key: "title",
      width: 260,
      render: (value: string, record) => (
        <Space direction="vertical" size={2}>
          <Text strong>{value}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.summary || "暂无补充说明"}
          </Text>
        </Space>
      ),
    },
    {
      title: "任务卡",
      key: "task_card",
      width: 190,
      render: (_, record) => (
        <Space direction="vertical" size={4}>
          <Tag color="blue">{record.task_id || record.id}</Tag>
          <Space size={[6, 6]} wrap>
            <Tag>{record.type}</Tag>
            <Tag color={priorityColorMap[record.priority || "中"]}>{record.priority || "中"}</Tag>
          </Space>
        </Space>
      ),
    },
    {
      title: "责任人",
      key: "assignee",
      width: 160,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Text>{record.assignee || "待指定"}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.target_department || "未指定部门"}
          </Text>
        </Space>
      ),
    },
    {
      title: "流程状态",
      key: "status",
      width: 220,
      render: (_, record) => (
        <Space direction="vertical" size={4} style={{ width: "100%" }}>
          <Space size={[6, 6]} wrap>
            <Tag color={statusColorMap[record.status]}>{record.status}</Tag>
            <Tag>{record.stage || "待分派"}</Tag>
            <Tag color={receiptColorMap[record.receipt_status || "待回执"]}>
              {record.receipt_status || "待回执"}
            </Tag>
          </Space>
          <Progress percent={record.progress_percent || 0} size="small" showInfo={false} />
        </Space>
      ),
    },
    {
      title: "审计标识",
      key: "trace",
      width: 220,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Text style={{ fontSize: 12, color: "#334155" }}>
            trace：{record.trace_id || "-"}
          </Text>
          <Text style={{ fontSize: 12, color: "#64748b" }}>
            会话：{record.conversation_key || "-"}
          </Text>
        </Space>
      ),
    },
    {
      title: "最近推送",
      key: "last_push",
      width: 180,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Text>{formatTime(record.last_push_at)}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.last_push_target_names || "等待首次投递"}
          </Text>
        </Space>
      ),
    },
    {
      title: "操作",
      key: "actions",
      width: 260,
      fixed: "right",
      render: (_, record) => (
        <Space size={[8, 8]} wrap>
          <Button size="small" onClick={() => void handleDispatchTaskCard(record)}>
            {record.trace_id ? "再次派发" : "投递任务卡"}
          </Button>
          <Button
            size="small"
            disabled={record.status === "已办结"}
            onClick={() => void handleCompleteTaskCard(record)}
          >
            办结归档
          </Button>
          <Button size="small" type="link" onClick={() => handleOpenScene(record)}>
            协同会话
          </Button>
          <Button size="small" type="link" onClick={() => void openAuditDrawer(record)}>
            审计链
          </Button>
        </Space>
      ),
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
            "radial-gradient(circle at top left, rgba(255,255,255,0.24) 0%, rgba(255,255,255,0) 40%), linear-gradient(135deg, #7f1d1d 0%, #9f1239 55%, #be123c 100%)",
          boxShadow: "0 28px 50px rgba(127,29,29,0.22)",
        }}
        styles={{ body: { padding: 28 } }}
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
              秘书入口 · 党建任务卡 / 流程卡 / 审计链
            </Tag>
            <div>
              <Title level={2} style={{ margin: 0, color: "#fff7ed" }}>
                事务中心
              </Title>
              <Paragraph style={{ margin: "12px 0 0", color: "rgba(255,245,245,0.86)", lineHeight: 1.9, fontSize: 15 }}>
                已从单纯台账升级为可投递的党建任务卡：支持秘书发起、自动协同、状态推进、会话留痕与审计链追踪，满足“发起任务 → 自动通知 → 回执更新 → 审计留痕”的最小闭环。
              </Paragraph>
            </div>
            <Space size={[8, 8]} wrap>
              <Tag color="gold" style={{ borderRadius: 999, paddingInline: 10 }}>任务卡</Tag>
              <Tag color="blue" style={{ borderRadius: 999, paddingInline: 10 }}>流程卡</Tag>
              <Tag color="purple" style={{ borderRadius: 999, paddingInline: 10 }}>协同引擎</Tag>
              <Tag color="red" style={{ borderRadius: 999, paddingInline: 10 }}>审计链</Tag>
            </Space>
          </Space>
          <Space>
            <Button icon={<RefreshCw size={14} />} onClick={() => void reload(false)} loading={loading}>
              刷新看板
            </Button>
            <Button type="primary" danger icon={<Plus size={14} />} onClick={scrollToCreateForm}>
              新建任务卡
            </Button>
          </Space>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        <StatCard title="待分派任务卡" value={pendingCount} icon={<Clock size={20} />} color="#2563eb" description="尚未正式投递给责任人，等待秘书确认对象与截止节点。" />
        <StatCard title="执行中" value={inFlightCount} icon={<Route size={20} />} color="#d97706" description="已进入推进或回执阶段的党建任务卡数量。" />
        <StatCard title="已办结" value={doneCount} icon={<CheckCircle2 size={20} />} color="#16a34a" description="已完成归档并沉淀闭环信息的任务卡数量。" />
        <StatCard title="已接入审计链" value={tracedCount} icon={<ShieldCheck size={20} />} color="#dc2626" description="已生成 trace_id / 会话键，可直接查看投递与流转留痕。" />
      </div>

      <PageAiInsightCard
        badge="AI 流程编排"
        tone="crimson"
        title={focusItems.length ? `红智助手已识别当前最该推进的任务卡：${focusItems[0].title}` : "红智助手已识别当前事务中心仍待创建首张任务卡"}
        description="事务中心现在会直接解释分派堵点、回执进度和审计链覆盖情况，并把协同会话入口前置到页面中心。"
        insights={[
          `待分派任务卡：${pendingCount} 张`,
          `已接入审计链：${tracedCount} 张`,
          `当前焦点：${focusItems[0]?.title || "暂无任务卡，可直接新建"}`,
        ]}
        suggestions={[
          pendingCount > 0 ? "先完成待分派任务卡的责任人确认与截止节点设置，再进入批量推进。" : "当前可把重点放在执行中任务的回执催收与办结归档上。",
          focusItems[0]?.receipt_status && focusItems[0]?.receipt_status !== "已完成" ? "优先检查焦点任务的回执状态，避免流程停在已派发未反馈。" : "已接入审计链的任务建议同步查看流转留痕，确认协同是否顺畅。",
          "跨部门事项优先进入协同会话，由 AI 先输出执行清单和催办话术。",
        ]}
        actions={[
          {
            key: "affairs-scene",
            label: "进入焦点任务协同会话",
            type: "primary",
            onClick: () => {
              const current = focusItems[0];
              if (!current) {
                message.info("当前暂无可接管的任务卡，请先新建事项");
                return;
              }
              handleOpenScene(current);
            },
          },
          {
            key: "affairs-audit",
            label: "查看焦点任务审计链",
            onClick: () => {
              const current = focusItems[0];
              if (!current) {
                message.info("当前暂无审计链可查看");
                return;
              }
              void openAuditDrawer(current);
            },
          },
          { key: "affairs-create", label: "新建党建任务卡", onClick: scrollToCreateForm },
        ]}
      />

      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 1.35fr) minmax(320px, 1fr)", gap: 16 }}>
        <Card
          title={<div style={{ display: "flex", alignItems: "center", gap: 8 }}><Plus size={16} />发起党建任务卡</div>}
          bordered={false}
          style={{ borderRadius: 24, boxShadow: "0 14px 28px rgba(15,23,42,0.05)" }}
        >
          <Form
            form={form}
            layout="vertical"
            initialValues={{ priority: "中" }}
            onFinish={(values) => void handleCreate(values)}
          >
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1.2fr", gap: 16 }}>
              <Form.Item label="事项标题" name="title" rules={[{ required: true, message: "请输入事项标题" }]}>
                <Input maxLength={80} placeholder="例如：四月主题党日会务与材料统筹" />
              </Form.Item>
              <Form.Item label="事项类型" name="type" rules={[{ required: true, message: "请选择事项类型" }]}>
                <Select options={typeOptions.map((option) => ({ label: option, value: option }))} />
              </Form.Item>
              <Form.Item label="责任人" name="assignee_user_id">
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="选择责任员工"
                  options={activeUsers.map((user) => ({
                    label: `${user.name || user.user_id}${user.department ? ` · ${user.department}` : ""}`,
                    value: user.user_id,
                  }))}
                />
              </Form.Item>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr auto", gap: 16, alignItems: "end" }}>
              <Form.Item label="截止时间" name="deadline" style={{ marginBottom: 0 }}>
                <DatePicker showTime style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item label="优先级" name="priority" style={{ marginBottom: 0 }}>
                <Select options={priorityOptions.map((option) => ({ label: option, value: option }))} />
              </Form.Item>
              <Form.Item label="任务说明" name="summary" style={{ marginBottom: 0 }}>
                <Input maxLength={500} placeholder="填写背景、输出物、回执要求和需要协同的部门" />
              </Form.Item>
              <Button type="primary" danger htmlType="submit" loading={submitting} icon={<Plus size={14} />}>
                创建
              </Button>
            </div>
          </Form>
        </Card>

        <Card
          title={<div style={{ display: "flex", alignItems: "center", gap: 8 }}><KanbanSquare size={16} />本周流程卡</div>}
          bordered={false}
          style={{ borderRadius: 24, boxShadow: "0 14px 28px rgba(15,23,42,0.05)" }}
        >
          <Space direction="vertical" size={14} style={{ width: "100%" }}>
            {focusItems.length ? (
              focusItems.map((item) => (
                <Card key={item.id} size="small" bordered={false} style={{ borderRadius: 18, background: "#f8fafc" }}>
                  <Space direction="vertical" size={6} style={{ width: "100%" }}>
                    <Space align="center" style={{ justifyContent: "space-between", width: "100%" }}>
                      <Text strong>{item.title}</Text>
                      <Space size={[6, 6]} wrap>
                        <Tag color={statusColorMap[item.status]}>{item.status}</Tag>
                        <Tag>{item.stage || "待分派"}</Tag>
                      </Space>
                    </Space>
                    <Space size={[8, 8]} wrap>
                      <Tag color={priorityColorMap[item.priority || "中"]}>{item.priority || "中"}</Tag>
                      <Tag>{item.assignee || "待指定责任人"}</Tag>
                      <Tag color={receiptColorMap[item.receipt_status || "待回执"]}>{item.receipt_status || "待回执"}</Tag>
                    </Space>
                    <Progress percent={item.progress_percent || 0} size="small" showInfo={false} />
                    <Paragraph style={{ margin: 0, color: "#475569", lineHeight: 1.7 }}>
                      {item.audit_summary || item.summary || "等待首次协同投递"}
                    </Paragraph>
                    <Button type="link" size="small" style={{ paddingInline: 0 }} onClick={() => handleOpenScene(item)}>
                      进入协同会话 <ArrowRight size={14} />
                    </Button>
                  </Space>
                </Card>
              ))
            ) : (
              <Empty description="暂无任务卡" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
            <Card size="small" bordered={false} style={{ borderRadius: 18, background: "#fff7ed" }}>
              <Text strong style={{ color: "#9a3412" }}>秘书提示</Text>
              <Paragraph style={{ margin: "8px 0 0", color: "#9a3412" }}>
                建议优先为跨部门、需回执、需归档的事项使用“任务卡 + 协同会话 + 审计链”模式，避免只停留在表格更新。
              </Paragraph>
            </Card>
          </Space>
        </Card>
      </div>

      <Card
        title={<div style={{ display: "flex", alignItems: "center", gap: 8 }}><Search size={16} />任务卡总览</div>}
        bordered={false}
        style={{ borderRadius: 24, boxShadow: "0 14px 28px rgba(15,23,42,0.05)" }}
      >
        <Table<PartyAffairItem>
          rowKey="id"
          size="middle"
          loading={loading}
          columns={columns}
          dataSource={items}
          pagination={{ pageSize: 8, hideOnSinglePage: true }}
          scroll={{ x: 1480 }}
          locale={{ emptyText: "暂无党建任务卡" }}
        />
      </Card>

      <Drawer
        title={auditState.title}
        width={540}
        open={auditState.open}
        onClose={() => setAuditState((prev) => ({ ...prev, open: false }))}
      >
        {auditState.loading ? (
          <Text type="secondary">正在加载审计链...</Text>
        ) : auditState.items.length ? (
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            {auditState.items.map((item, index) => (
              <Card
                key={`${item.trace_id || item.task_id || item.conversation_key || index}-${index}`}
                size="small"
                bordered={false}
                style={{ borderRadius: 18, background: "#f8fafc" }}
              >
                <Space direction="vertical" size={6} style={{ width: "100%" }}>
                  <Space align="center" style={{ justifyContent: "space-between", width: "100%" }}>
                    <Text strong>{item.status || "审计事件"}</Text>
                    <Tag color={String(item.route_result || "") === "routed" ? "success" : "processing"}>
                      {item.route_result || "pending"}
                    </Tag>
                  </Space>
                  <Paragraph style={{ margin: 0, color: "#475569", lineHeight: 1.7 }}>
                    {item.detail || "暂无详情"}
                  </Paragraph>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {formatTime(item.created_at)} · task={item.task_id || "-"}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    trace={item.trace_id || "-"} · conversation={item.conversation_key || "-"}
                  </Text>
                </Space>
              </Card>
            ))}
          </Space>
        ) : (
          <Empty description="暂无匹配的审计记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
      </Drawer>
    </Space>
  );
}
