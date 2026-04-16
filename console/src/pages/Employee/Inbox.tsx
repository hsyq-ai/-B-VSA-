import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Empty,
  Form,
  Input,
  message,
  Modal,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
} from "antd";
import { useNavigate } from "react-router-dom";
import sessionApi from "../Chat/sessionApi";
import { getApiToken, getApiUrl } from "../../api/config";
import { agentOsApi } from "../../api/modules/agentOs";

interface InboxRow {
  key: string;
  title: string;
  source: string;
  sourceTag: string;
  type: string;
  intentType?: string;
  traceId?: string;
  conversationKey?: string;
  status: "待办" | "处理中" | "已完成";
  statusUpdatedAt?: string;
  statusUpdatedBy?: string;
}

type StatusRecord = {
  status: InboxRow["status"];
  updated_at?: string;
  updated_by?: string;
  history?: { status: InboxRow["status"]; ts: string; by: string }[];
};

export default function EmployeeInbox() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<InboxRow[]>([]);
  const [filterStatus, setFilterStatus] = useState<"all" | InboxRow["status"]>("all");
  const [query, setQuery] = useState("");
  const [historyVisible, setHistoryVisible] = useState(false);
  const [historyTitle, setHistoryTitle] = useState("");
  const [historyList, setHistoryList] = useState<
    { status: InboxRow["status"]; ts: string; by: string }[]
  >([]);
  const [statusMap, setStatusMap] = useState<Record<string, StatusRecord>>({});
  const [collabVisible, setCollabVisible] = useState(false);
  const [collabSubmitting, setCollabSubmitting] = useState(false);
  const [activeUsers, setActiveUsers] = useState<
    { user_id: string; name: string; department?: string; position?: string }[]
  >([]);
  const [collabForm] = Form.useForm();

  const resolveSourceTag = (
    meta: Record<string, unknown>,
    isHuman: boolean,
  ): string => {
    const sourceAgentId = String(meta.source_agent_id || "");
    if (sourceAgentId.startsWith("so:")) return "系统Agent（SO）";
    if (sourceAgentId.startsWith("pia:")) return "虚拟员工（PIA）";
    if (isHuman) return "员工";
    return "系统通知";
  };

  const fetchStatusMap = async (): Promise<Record<string, StatusRecord>> => {
    try {
      const token = getApiToken();
      const url = getApiUrl("/employee/inbox/status");
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const data = res.ok ? await res.json() : { status_map: {} };
      return (data.status_map || {}) as Record<string, StatusRecord>;
    } catch {
      return {};
    }
  };

  const loadInbox = async () => {
    setLoading(true);
    try {
      const list = await sessionApi.getSessionList();
      const status = await fetchStatusMap();
      setStatusMap(status);
      const rows: InboxRow[] = (list || [])
        .filter((s) => {
          const meta = (s as any).meta || {};
          return Boolean(
            meta.push_source_user_id ||
              meta.push_conversation_key ||
              String(s.name || "").includes("系统推送"),
          );
        })
        .map((s) => {
          const meta = (s as any).meta || {};
          const sourceName = meta.push_source_user_name || "系统";
          const isHuman = Boolean(meta.push_source_user_id);
          const sourceAgentId = String(meta.source_agent_id || "");
          const sourceTag = resolveSourceTag(meta, isHuman);
          const key = String(s.id);
          const record = status[key] || ({} as StatusRecord);
          const history = record.history || [];
          const latest = history[0];
          const messageType = sourceAgentId.startsWith("so:")
            ? "来自数字专家"
            : sourceAgentId.startsWith("pia:")
              ? "来自虚拟员工"
              : isHuman
                ? "来自员工"
                : "系统消息";
          return {
            key,
            title: String((s as any).name || "通知"),
            source: String(sourceName),
            sourceTag,
            type: messageType,
            intentType: String(meta.push_intent_type || ""),
            traceId: String(meta.push_trace_id || ""),
            conversationKey: String(meta.push_conversation_key || ""),
            status: (record.status as InboxRow["status"]) || "待办",
            statusUpdatedAt: latest?.ts || record.updated_at || "",
            statusUpdatedBy: latest?.by || record.updated_by || "",
          };
        });
      setItems(rows);
    } finally {
      setLoading(false);
    }
  };

  const loadActiveUsers = async () => {
    try {
      const res = await agentOsApi.listActiveUsers();
      setActiveUsers(Array.isArray(res.items) ? res.items : []);
    } catch (err) {
      console.error(err);
      setActiveUsers([]);
    }
  };

  useEffect(() => {
    loadInbox();
    loadActiveUsers();

    const handlePushUpdated = () => {
      void loadInbox();
    };
    window.addEventListener("copaw-push-session-updated", handlePushUpdated);
    return () => {
      window.removeEventListener("copaw-push-session-updated", handlePushUpdated);
    };
  }, []);

  const updateStatus = async (key: string, status: InboxRow["status"]) => {
    const token = getApiToken();
    const url = getApiUrl("/employee/inbox/status");
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ session_id: key, status }),
      });
      const data = res.ok ? await res.json() : null;
      if (data) {
        const nextRecord: StatusRecord = {
          status: data.status,
          updated_at: data.updated_at,
          updated_by: data.updated_by,
          history: data.history || [],
        };
        setStatusMap((prev) => ({ ...prev, [key]: nextRecord }));
        setItems((prev) =>
          prev.map((item) =>
            item.key === key
              ? {
                  ...item,
                  status: nextRecord.status,
                  statusUpdatedAt: nextRecord.updated_at,
                  statusUpdatedBy: nextRecord.updated_by,
                }
              : item,
          ),
        );
        if (historyVisible && historyTitle) {
          setHistoryList(nextRecord.history || []);
        }
      }
    } catch {
      // no-op: keep UI status unchanged on failure
    }
  };

  const openHistory = (row: InboxRow) => {
    setHistoryTitle(row.title);
    setHistoryList(statusMap[row.key]?.history || []);
    setHistoryVisible(true);
  };

  const filteredItems = useMemo(() => {
    return items.filter((row) => {
      const matchesQuery =
        !query ||
        row.title.toLowerCase().includes(query.toLowerCase()) ||
        row.source.toLowerCase().includes(query.toLowerCase()) ||
        row.sourceTag.toLowerCase().includes(query.toLowerCase());
      const matchesStatus = filterStatus === "all" || row.status === filterStatus;
      return matchesQuery && matchesStatus;
    });
  }, [items, query, filterStatus]);

  const submitCollabRequest = async (values: {
    target_user_id: string;
    topic: string;
    content: string;
  }) => {
    setCollabSubmitting(true);
    try {
      await agentOsApi.sendCollabRequest({
        target_user_id: values.target_user_id,
        topic: values.topic,
        content: values.content,
      });
      message.success("协作请求已发送");
      setCollabVisible(false);
      collabForm.resetFields();
      await loadInbox();
    } catch (err) {
      console.error(err);
      message.error("发送协作请求失败，请稍后重试");
    } finally {
      setCollabSubmitting(false);
    }
  };

  const columns = useMemo(
    () => [
      { title: "标题", dataIndex: "title", key: "title" },
      { title: "来源", dataIndex: "source", key: "source" },
      {
        title: "来源标签",
        dataIndex: "sourceTag",
        key: "sourceTag",
        render: (value: string) => {
          if (value.includes("SO")) return <Tag color="purple">{value}</Tag>;
          if (value.includes("PIA")) return <Tag color="blue">{value}</Tag>;
          if (value.includes("员工")) return <Tag color="cyan">{value}</Tag>;
          return <Tag>{value}</Tag>;
        },
      },
      {
        title: "消息类型",
        dataIndex: "type",
        key: "type",
        render: (value: string) => (
          <Tag
            color={
              value.includes("数字专家")
                ? "purple"
                : value.includes("虚拟员工")
                  ? "blue"
                  : value.includes("员工")
                    ? "cyan"
                    : "gold"
            }
          >
            {value}
          </Tag>
        ),
      },
      {
        title: "会话键",
        dataIndex: "conversationKey",
        key: "conversationKey",
        render: (value: string) => value || "-",
      },
      {
        title: "trace_id",
        dataIndex: "traceId",
        key: "traceId",
        render: (value: string) => value || "-",
      },
      {
        title: "状态",
        dataIndex: "status",
        key: "status",
        render: (_: unknown, row: InboxRow) => (
          <Select
            size="small"
            value={row.status}
            onChange={(value) => updateStatus(row.key, value as InboxRow["status"])}
            options={[
              { label: "待办", value: "待办" },
              { label: "处理中", value: "处理中" },
              { label: "已完成", value: "已完成" },
            ]}
          />
        ),
      },
      {
        title: "更新时间",
        dataIndex: "statusUpdatedAt",
        key: "statusUpdatedAt",
        render: (value: string) => value || "-",
      },
      {
        title: "流转记录",
        key: "history",
        render: (_: unknown, row: InboxRow) => (
          <Button size="small" onClick={() => openHistory(row)}>
            查看
          </Button>
        ),
      },
      {
        title: "操作",
        key: "action",
        render: (_: unknown, row: InboxRow) => (
          <Button size="small" onClick={() => navigate(`/app/workspace/${row.key}`)}>
            打开会话
          </Button>
        ),
      },
    ],
    [navigate],
  );

  return (
    <>
      <Card
        title="消息中心"
        extra={
          <Space>
            <Button
              type="primary"
              size="small"
              onClick={() => {
                setCollabVisible(true);
                void loadActiveUsers();
              }}
            >
              发起协作请求
            </Button>
            <Input.Search
              allowClear
              placeholder="搜索通知/来源"
              onSearch={(value) => setQuery(value)}
              onChange={(e) => setQuery(e.target.value)}
              value={query}
              style={{ width: 200 }}
            />
            <Segmented
              size="small"
              options={[
                { label: "全部", value: "all" },
                { label: "待办", value: "待办" },
                { label: "处理中", value: "处理中" },
                { label: "已完成", value: "已完成" },
              ]}
              value={filterStatus}
              onChange={(value) => setFilterStatus(value as "all" | InboxRow["status"])}
            />
            <Button size="small" onClick={loadInbox} loading={loading}>
              刷新
            </Button>
          </Space>
        }
      >
      {filteredItems.length === 0 ? (
        <Empty description="暂无消息，来自员工、PIA 和数字专家的新消息会在这里汇总" />
      ) : (
        <Table
          rowKey="key"
          columns={columns}
          dataSource={filteredItems}
          pagination={{ pageSize: 8 }}
          loading={loading}
        />
      )}
      </Card>
      <Modal
        title={`状态流转：${historyTitle}`}
        open={historyVisible}
        onCancel={() => setHistoryVisible(false)}
        footer={null}
      >
        {historyList.length === 0 ? (
          <Empty description="暂无流转记录" />
        ) : (
          <Table
            rowKey={(row) => `${row.ts}-${row.status}`}
            columns={[
              { title: "状态", dataIndex: "status", key: "status" },
              { title: "操作者", dataIndex: "by", key: "by" },
              { title: "时间", dataIndex: "ts", key: "ts" },
            ]}
            dataSource={historyList}
            pagination={false}
            size="small"
          />
        )}
      </Modal>
      <Modal
        title="发起协作请求"
        open={collabVisible}
        onCancel={() => setCollabVisible(false)}
        onOk={() => {
          collabForm.submit();
        }}
        okText="发送请求"
        confirmLoading={collabSubmitting}
      >
        <Form
          form={collabForm}
          layout="vertical"
          onFinish={(values) =>
            void submitCollabRequest(
              values as { target_user_id: string; topic: string; content: string },
            )
          }
        >
          <Form.Item
            label="目标员工"
            name="target_user_id"
            rules={[{ required: true, message: "请选择目标员工" }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={activeUsers.map((user) => ({
                value: user.user_id,
                label: `${user.name}（${user.department || "未分配部门"}）`,
              }))}
              placeholder="选择要协作的员工"
            />
          </Form.Item>
          <Form.Item
            label="协作主题"
            name="topic"
            rules={[{ required: true, message: "请输入协作主题" }]}
          >
            <Input placeholder="例如：固态电池氧化物资料汇总" maxLength={120} />
          </Form.Item>
          <Form.Item
            label="协作内容"
            name="content"
            rules={[{ required: true, message: "请输入协作内容" }]}
          >
            <Input.TextArea rows={4} placeholder="描述你的协作需求、预期产出和时间要求" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
