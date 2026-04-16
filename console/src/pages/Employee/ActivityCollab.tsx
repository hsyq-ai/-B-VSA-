import {
  ArrowRight,
  BellRing,
  CalendarClock,
  FileCheck2,
  MapPin,
  Plus,
  RefreshCw,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
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
import {
  activityCollabApi,
  type ActivityCollabItem,
  type ActivityCollabReceiptStatus,
  type ActivityCollabReminderStatus,
  type ActivityCollabStatus,
} from "../../api/modules/activityCollab";
import { allowPartyLocalFallback } from "../../utils/runtimeFlags";
import {
  type ActivityCollabFormValues,
  buildSceneConfig,
  focusFallbackItems,
  formatTime,
  getErrorText,
  loadLocal,
  receiptColorMap,
  reminderColorMap,
  saveLocal,
  sortByTimeDesc,
  statusColorMap,
  statusOptions,
  typeOptions,
} from "../../features/party/activity-collab";
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

export default function EmployeeActivityCollabPage() {
  const [form] = Form.useForm<ActivityCollabFormValues>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [items, setItems] = useState<ActivityCollabItem[]>([]);

  const reload = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const remote = await activityCollabApi.list();
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

  const persistLocalPatch = (
    record: ActivityCollabItem,
    patch: Partial<ActivityCollabItem>,
  ) => {
    const now = new Date().toISOString();
    const next = items.map((item) =>
      item.id === record.id ? { ...item, ...patch, updated_at: now } : item,
    );
    const sorted = sortByTimeDesc(next);
    setItems(sorted);
    saveLocal(sorted);
  };

  const handleCreate = async (values: ActivityCollabFormValues) => {
    setSubmitting(true);
    const payload = {
      title: values.title.trim(),
      activity_type: values.activity_type,
      status: "待发布" as ActivityCollabStatus,
      organizer: values.organizer?.trim() || "",
      target_branch: values.target_branch?.trim() || "",
      location: values.location?.trim() || "",
      start_at: values.start_at?.toISOString() || "",
      end_at: values.end_at?.toISOString() || "",
      participants_planned: Number(values.participants_planned || 0),
      participants_confirmed: 0,
      reminder_status: "未提醒" as ActivityCollabReminderStatus,
      receipt_status: "待回执" as ActivityCollabReceiptStatus,
      summary: values.summary?.trim() || "",
    };
    try {
      const created = await activityCollabApi.create(payload);
      const next = sortByTimeDesc([created, ...items]);
      setItems(next);
      saveLocal(next);
      form.resetFields();
      message.success("活动协同事项已创建");
    } catch {
      if (allowPartyLocalFallback) {
        const now = new Date().toISOString();
        const localItem: ActivityCollabItem = {
          id: `local-${Date.now()}`,
          ...payload,
          created_at: now,
          updated_at: now,
        };
        const next = sortByTimeDesc([localItem, ...items]);
        setItems(next);
        saveLocal(next);
        form.resetFields();
        message.success("活动协同事项已创建（本地暂存）");
      } else {
        message.error("创建失败，请稍后重试");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handlePatch = async (
    record: ActivityCollabItem,
    patch: Partial<ActivityCollabItem>,
    successText: string,
    fallbackText = successText,
  ) => {
    try {
      await activityCollabApi.update(record.id, patch);
      persistLocalPatch(record, patch);
      message.success(successText);
    } catch {
      if (allowPartyLocalFallback) {
        persistLocalPatch(record, patch);
        message.success(`${fallbackText}（本地暂存）`);
      } else {
        message.error("更新失败，请稍后重试");
      }
    }
  };

  const handleSendReminder = async (record: ActivityCollabItem) => {
    try {
      const result = await activityCollabApi.sendReminder(record.id);
      persistLocalPatch(record, result.item);
      const count = Number(result.dispatch?.target_count || 0);
      message.success(`已向 ${count} 位成员发送活动提醒`);
    } catch (error) {
      message.error(getErrorText(error, "发送提醒失败，请稍后重试"));
    }
  };

  const handleReceiptRequest = async (record: ActivityCollabItem) => {
    try {
      const result = await activityCollabApi.sendReceiptRequest(record.id);
      persistLocalPatch(record, result.item);
      const count = Number(result.dispatch?.target_count || 0);
      message.success(`已向 ${count} 位成员发起回执催办`);
    } catch (error) {
      message.error(getErrorText(error, "发起回执失败，请稍后重试"));
    }
  };

  const handleCompleteReceipt = async (record: ActivityCollabItem) => {
    try {
      const result = await activityCollabApi.completeReceipt(record.id);
      persistLocalPatch(record, result.item);
      const count = Number(result.dispatch?.target_count || 0);
      message.success(`已向 ${count} 位成员推送回执完成通知`);
    } catch (error) {
      message.error(getErrorText(error, "完成回执失败，请稍后重试"));
    }
  };

  const handleOpenScene = (record: ActivityCollabItem) => {
    openPartyScene({
      navKey: "party-activity-collab",
      sceneKey: `party-activity-collab-${record.id}`,
      scene: buildSceneConfig(record),
      navigate,
    });
  };

  const activeCount = useMemo(
    () => items.filter((item) => item.status === "报名中" || item.status === "进行中").length,
    [items],
  );
  const receiptPendingCount = useMemo(
    () => items.filter((item) => item.receipt_status !== "已完成").length,
    [items],
  );
  const archivedCount = useMemo(
    () => items.filter((item) => item.status === "已归档").length,
    [items],
  );
  const confirmedCount = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.participants_confirmed || 0), 0),
    [items],
  );

  const focusItems = useMemo(() => {
    const liveItems = items.filter((item) => item.status !== "已归档").slice(0, 3);
    if (liveItems.length) return liveItems;
    return focusFallbackItems;
  }, [items]);

  const columns: ColumnsType<ActivityCollabItem> = [
    {
      title: "活动",
      dataIndex: "title",
      key: "title",
      ellipsis: true,
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
      title: "类型 / 支部",
      key: "type_branch",
      width: 170,
      render: (_, record) => (
        <Space direction="vertical" size={4}>
          <Tag>{record.activity_type}</Tag>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.target_branch || "未指定支部"}
          </Text>
        </Space>
      ),
    },
    {
      title: "时间地点",
      key: "schedule",
      width: 210,
      render: (_, record) => (
        <Space direction="vertical" size={4}>
          <Text>{formatTime(record.start_at)}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.location || "地点待定"}
          </Text>
        </Space>
      ),
    },
    {
      title: "参与进度",
      key: "participants",
      width: 150,
      render: (_, record) => {
        const planned = Number(record.participants_planned || 0);
        const confirmed = Number(record.participants_confirmed || 0);
        return (
          <Space direction="vertical" size={4}>
            <Text strong>{`${confirmed}/${planned || 0}`}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              组织人：{record.organizer || "待指定"}
            </Text>
          </Space>
        );
      },
    },
    {
      title: "协同状态",
      key: "collab_status",
      width: 210,
      render: (_, record) => (
        <Space direction="vertical" size={4}>
          <Tag color={reminderColorMap[record.reminder_status]}>{record.reminder_status}</Tag>
          <Tag color={receiptColorMap[record.receipt_status]}>{record.receipt_status}</Tag>
          {record.last_push_at ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              最近推送：{formatTime(record.last_push_at)}
            </Text>
          ) : null}
        </Space>
      ),
    },
    {
      title: "活动状态",
      dataIndex: "status",
      key: "status",
      width: 150,
      render: (value: ActivityCollabStatus, record) => (
        <Select<ActivityCollabStatus>
          size="small"
          value={value}
          style={{ width: 120 }}
          onChange={(next) => void handlePatch(record, { status: next }, "活动状态已更新")}
          options={statusOptions.map((option) => ({ label: option, value: option }))}
        />
      ),
    },
    {
      title: "操作",
      key: "actions",
      width: 240,
      render: (_, record) => {
        const nextReminder =
          record.reminder_status === "未提醒"
            ? "已提醒"
            : record.reminder_status === "已提醒"
              ? "持续催办"
              : null;
        const nextReceipt =
          record.receipt_status === "待回执"
            ? "回执中"
            : record.receipt_status === "回执中"
              ? "已完成"
              : null;
        return (
          <Space size={[6, 6]} wrap>
            <Button
              size="small"
              disabled={!nextReminder}
              onClick={() => nextReminder && void handleSendReminder(record)}
            >
              {record.reminder_status === "未提醒" ? "发送提醒" : "继续催办"}
            </Button>
            <Button
              size="small"
              disabled={!nextReceipt}
              onClick={() =>
                nextReceipt &&
                void (record.receipt_status === "待回执"
                  ? handleReceiptRequest(record)
                  : handleCompleteReceipt(record))
              }
            >
              {record.receipt_status === "待回执" ? "发起回执" : "完成回执"}
            </Button>
            <Button size="small" type="link" onClick={() => handleOpenScene(record)}>
              协同会话
            </Button>
          </Space>
        );
      },
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
          <Space direction="vertical" size={14} style={{ maxWidth: 760 }}>
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
              书记驾驶舱 · 协同建设
            </Tag>
            <div>
              <Title level={2} style={{ margin: 0, color: "#fff7ed" }}>
                活动协同中心
              </Title>
              <Paragraph style={{ margin: "12px 0 0", color: "rgba(255,245,245,0.86)", lineHeight: 1.9, fontSize: 15 }}>
                统一承接党建活动的通知、报名、提醒、签到、回执和复盘沉淀，打通“发起活动—过程催办—回执闭环—协同会话”的全链路执行场景。
              </Paragraph>
            </div>
            <Space size={[8, 8]} wrap>
              <Tag color="gold" style={{ borderRadius: 999, paddingInline: 10 }}>自动提醒</Tag>
              <Tag color="blue" style={{ borderRadius: 999, paddingInline: 10 }}>回执跟进</Tag>
              <Tag color="purple" style={{ borderRadius: 999, paddingInline: 10 }}>协同会话</Tag>
            </Space>
          </Space>
          <Space>
            <Button icon={<RefreshCw size={14} />} onClick={() => void reload(false)} loading={loading}>
              刷新看板
            </Button>
            <Button type="primary" danger icon={<Plus size={14} />} onClick={() => form.scrollToField("title")}>
              发起活动协同
            </Button>
          </Space>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        <StatCard title="活动进行中" value={activeCount} icon={<CalendarClock size={20} />} color="#2563eb" description="已发布且仍在推进过程中的活动数量。" />
        <StatCard title="待回执" value={receiptPendingCount} icon={<BellRing size={20} />} color="#d97706" description="仍需持续催办签到、报名或回执结果的活动。" />
        <StatCard title="已归档" value={archivedCount} icon={<FileCheck2 size={20} />} color="#16a34a" description="已完成复盘并沉淀记录的活动数量。" />
        <StatCard title="累计确认人数" value={confirmedCount} icon={<UsersRound size={20} />} color="#7c3aed" description="当前台账中已完成确认或签到的人数累计。" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 1.35fr) minmax(320px, 1fr)", gap: 16 }}>
        <Card
          title={
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Plus size={16} />
              发起活动协同
            </div>
          }
          bordered={false}
          style={{ borderRadius: 24, boxShadow: "0 14px 28px rgba(15,23,42,0.05)" }}
        >
          <Form form={form} layout="vertical" onFinish={(values) => void handleCreate(values)}>
            <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1fr 1fr", gap: 16 }}>
              <Form.Item label="活动标题" name="title" rules={[{ required: true, message: "请输入活动标题" }]} style={{ marginBottom: 16 }}>
                <Input maxLength={80} placeholder="例如：四月主题党日活动通知与签到安排" />
              </Form.Item>
              <Form.Item label="活动类型" name="activity_type" rules={[{ required: true, message: "请选择活动类型" }]} style={{ marginBottom: 16 }}>
                <Select options={typeOptions.map((option) => ({ label: option, value: option }))} placeholder="请选择" />
              </Form.Item>
              <Form.Item label="组织人" name="organizer" style={{ marginBottom: 16 }}>
                <Input maxLength={40} placeholder="例如：组织委员李娜" />
              </Form.Item>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16 }}>
              <Form.Item label="目标支部" name="target_branch" style={{ marginBottom: 16 }}>
                <Input maxLength={40} placeholder="例如：第一党支部" />
              </Form.Item>
              <Form.Item label="活动地点" name="location" style={{ marginBottom: 16 }}>
                <Input maxLength={60} placeholder="例如：党员活动室" />
              </Form.Item>
              <Form.Item label="开始时间" name="start_at" style={{ marginBottom: 16 }}>
                <DatePicker showTime style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item label="结束时间" name="end_at" style={{ marginBottom: 16 }}>
                <DatePicker showTime style={{ width: "100%" }} />
              </Form.Item>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "220px 1fr auto", gap: 16, alignItems: "flex-end" }}>
              <Form.Item label="计划人数" name="participants_planned" style={{ marginBottom: 0 }}>
                <InputNumber min={0} precision={0} style={{ width: "100%" }} placeholder="0" />
              </Form.Item>
              <Form.Item label="活动说明" name="summary" style={{ marginBottom: 0 }}>
                <Input maxLength={500} placeholder="填写通知范围、报名要求、签到方式和复盘产出" />
              </Form.Item>
              <Button type="primary" danger htmlType="submit" loading={submitting} icon={<Plus size={14} />}>
                创建事项
              </Button>
            </div>
          </Form>
        </Card>

        <Card
          title={
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Sparkles size={16} />
              当前协同重点
            </div>
          }
          bordered={false}
          style={{ borderRadius: 24, boxShadow: "0 14px 28px rgba(15,23,42,0.05)" }}
        >
          <Space direction="vertical" size={14} style={{ width: "100%" }}>
            {focusItems.map((item) => (
              <Card key={item.id} size="small" bordered={false} style={{ borderRadius: 18, background: "#f8fafc" }}>
                <Space direction="vertical" size={6} style={{ width: "100%" }}>
                  <Space align="center" style={{ justifyContent: "space-between", width: "100%" }}>
                    <Text strong style={{ color: "#0f172a" }}>{item.title}</Text>
                    <Tag color={statusColorMap[item.status]}>{item.status}</Tag>
                  </Space>
                  <Space size={[8, 8]} wrap>
                    <Tag>{item.activity_type}</Tag>
                    <Tag color={reminderColorMap[item.reminder_status]}>{item.reminder_status}</Tag>
                    <Tag color={receiptColorMap[item.receipt_status]}>{item.receipt_status}</Tag>
                  </Space>
                  <Space size={6} wrap>
                    <Text type="secondary" style={{ fontSize: 12 }}>组织人：{item.organizer || "待指定"}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>支部：{item.target_branch || "未指定"}</Text>
                  </Space>
                  <Paragraph style={{ margin: 0, color: "#475569", lineHeight: 1.7 }}>
                    {item.summary || "建议尽快补充活动说明、责任分工和回执节点。"}
                  </Paragraph>
                  <Button type="link" size="small" style={{ paddingInline: 0 }} onClick={() => handleOpenScene(item)}>
                    进入协同会话 <ArrowRight size={14} />
                  </Button>
                </Space>
              </Card>
            ))}
            <Card size="small" bordered={false} style={{ borderRadius: 18, background: "#fff7ed" }}>
              <Text strong style={{ color: "#9a3412" }}>书记提示</Text>
              <Paragraph style={{ margin: "8px 0 0", color: "#9a3412" }}>
                对仍处于“待回执”或“持续催办”的活动，建议进入协同会话生成催办清单和标准话术，避免报名、签到和复盘信息分散流失。
              </Paragraph>
            </Card>
          </Space>
        </Card>
      </div>

      <Card
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <MapPin size={16} />
            活动协同台账
          </div>
        }
        bordered={false}
        style={{ borderRadius: 24, boxShadow: "0 14px 28px rgba(15,23,42,0.05)" }}
      >
        <Table<ActivityCollabItem>
          rowKey="id"
          size="middle"
          loading={loading}
          columns={columns}
          dataSource={items}
          pagination={{ pageSize: 8, hideOnSinglePage: true }}
          locale={{ emptyText: "暂无活动协同事项" }}
        />
      </Card>
    </Space>
  );
}
