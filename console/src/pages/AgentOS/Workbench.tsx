import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Descriptions,
  Empty,
  Form,
  Input,
  List,
  Segmented,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Timeline,
  Typography,
  message,
  Drawer,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { Activity, Boxes, GitBranch, Package, RefreshCw, RotateCcw, UsersRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { agentOsApi } from "../../api/modules/agentOs";
import type {
  AgentOSArtifactItem,
  AgentOSEvalItem,
  AgentOSReplayItem,
  AgentOSRoomEventItem,
  AgentOSRoomItem,
  AgentOSRoomMemberItem,
  AgentOSTraceDetailResponse,
  AgentOSTraceListItem,
} from "../../api/types";

const { Paragraph, Text, Title } = Typography;

type SectionKey = "rooms" | "traces" | "artifacts" | "evals";

const SECTION_OPTIONS: Array<{ label: string; value: SectionKey }> = [
  { label: "Rooms", value: "rooms" },
  { label: "Traces", value: "traces" },
  { label: "Artifacts", value: "artifacts" },
  { label: "Evals", value: "evals" },
];

const SECTION_PATH_MAP: Record<SectionKey, string> = {
  rooms: "/admin/rooms",
  traces: "/admin/traces",
  artifacts: "/admin/artifacts",
  evals: "/admin/evals",
};

const ROOM_TYPE_OPTIONS = [
  { label: "全部类型", value: "all" },
  { label: "协作", value: "collab" },
  { label: "IAP", value: "iap" },
  { label: "场景", value: "scene" },
  { label: "计划", value: "plan" },
];

const ROOM_STATUS_OPTIONS = [
  { label: "全部状态", value: "all" },
  { label: "进行中", value: "active" },
  { label: "暂停", value: "paused" },
  { label: "已关闭", value: "closed" },
];

const TRACE_STATUS_OPTIONS = [
  { label: "全部状态", value: "all" },
  { label: "created", value: "created" },
  { label: "routed", value: "routed" },
  { label: "queued", value: "queued" },
  { label: "duplicate_hit", value: "duplicate_hit" },
  { label: "recorded", value: "recorded" },
];

const statusColorMap: Record<string, string> = {
  active: "processing",
  paused: "warning",
  closed: "default",
  created: "cyan",
  routed: "success",
  queued: "gold",
  duplicate_hit: "orange",
  recorded: "blue",
  completed: "success",
};

const roomTypeColorMap: Record<string, string> = {
  collab: "blue",
  iap: "purple",
  scene: "geekblue",
  plan: "cyan",
};

const formatDateTime = (value: unknown): string => {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString("zh-CN", { hour12: false });
};

const formatPayloadPreview = (value: unknown): string => {
  if (!value || typeof value !== "object") return "-";
  try {
    const text = JSON.stringify(value, null, 2);
    return text.length > 320 ? `${text.slice(0, 320)}...` : text;
  } catch {
    return "-";
  }
};

const matchesKeyword = (fields: unknown[], keyword: string): boolean => {
  const lowered = keyword.trim().toLowerCase();
  if (!lowered) return true;
  return fields
    .map((field) => String(field || "").toLowerCase())
    .some((field) => field.includes(lowered));
};

interface AgentOSWorkbenchProps {
  defaultSection: SectionKey;
}

export default function AgentOSWorkbench({ defaultSection }: AgentOSWorkbenchProps) {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState<SectionKey>(defaultSection);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [submittingEval, setSubmittingEval] = useState(false);
  const [submittingReplay, setSubmittingReplay] = useState(false);

  const [keyword, setKeyword] = useState("");
  const [roomType, setRoomType] = useState("all");
  const [roomStatus, setRoomStatus] = useState("all");
  const [traceStatus, setTraceStatus] = useState("all");

  const [rooms, setRooms] = useState<AgentOSRoomItem[]>([]);
  const [traces, setTraces] = useState<AgentOSTraceListItem[]>([]);
  const [artifacts, setArtifacts] = useState<AgentOSArtifactItem[]>([]);
  const [evals, setEvals] = useState<AgentOSEvalItem[]>([]);
  const [replays, setReplays] = useState<AgentOSReplayItem[]>([]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<AgentOSRoomItem | null>(null);
  const [members, setMembers] = useState<AgentOSRoomMemberItem[]>([]);
  const [events, setEvents] = useState<AgentOSRoomEventItem[]>([]);
  const [linkedArtifacts, setLinkedArtifacts] = useState<AgentOSArtifactItem[]>([]);
  const [traceDetail, setTraceDetail] = useState<AgentOSTraceDetailResponse | null>(null);

  const [evalForm] = Form.useForm();
  const [replayForm] = Form.useForm();

  useEffect(() => {
    setActiveSection(defaultSection);
  }, [defaultSection]);

  useEffect(() => {
    setKeyword("");
  }, [activeSection]);

  const loadRooms = useCallback(async () => {
    const res = await agentOsApi.listRooms({
      limit: 200,
      room_type: roomType === "all" ? undefined : roomType,
      status: roomStatus === "all" ? undefined : roomStatus,
    });
    setRooms(Array.isArray(res.items) ? res.items : []);
  }, [roomStatus, roomType]);

  const loadTraces = useCallback(async () => {
    const res = await agentOsApi.listTraces({
      limit: 200,
      status: traceStatus === "all" ? undefined : traceStatus,
    });
    setTraces(Array.isArray(res.items) ? res.items : []);
  }, [traceStatus]);

  const loadArtifacts = useCallback(async () => {
    const res = await agentOsApi.listArtifacts({ limit: 200 });
    setArtifacts(Array.isArray(res.items) ? res.items : []);
  }, []);

  const loadEvals = useCallback(async () => {
    const [evalRes, replayRes] = await Promise.all([
      agentOsApi.listEvals({ limit: 200 }),
      agentOsApi.listReplays({ limit: 200 }),
    ]);
    setEvals(Array.isArray(evalRes.items) ? evalRes.items : []);
    setReplays(Array.isArray(replayRes.items) ? replayRes.items : []);
  }, []);

  const refreshActiveSection = useCallback(async () => {
    setLoading(true);
    try {
      if (activeSection === "rooms") {
        await loadRooms();
      } else if (activeSection === "traces") {
        await loadTraces();
      } else if (activeSection === "artifacts") {
        await loadArtifacts();
      } else {
        await loadEvals();
      }
    } catch (error) {
      console.error(error);
      message.error("加载 Agent OS 管理数据失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }, [activeSection, loadArtifacts, loadEvals, loadRooms, loadTraces]);

  useEffect(() => {
    void refreshActiveSection();
  }, [refreshActiveSection]);

  const loadRoomDetail = useCallback(async (roomId: string, preferredTraceId?: string) => {
    const normalizedRoomId = String(roomId || "").trim();
    if (!normalizedRoomId) return;
    setDrawerOpen(true);
    setDetailLoading(true);
    try {
      const roomRes = await agentOsApi.getRoom(normalizedRoomId);
      const effectiveTraceId = String(preferredTraceId || roomRes.item?.trace_id || "").trim();
      const [eventsRes, artifactsRes, traceRes] = await Promise.all([
        agentOsApi.listRoomEvents(normalizedRoomId, { limit: 200 }),
        agentOsApi.listArtifacts({ room_id: normalizedRoomId, limit: 100 }),
        effectiveTraceId ? agentOsApi.getTrace(effectiveTraceId).catch(() => null) : Promise.resolve(null),
      ]);
      setSelectedRoom(roomRes.item || null);
      setMembers(Array.isArray(roomRes.members) ? roomRes.members : []);
      setEvents(Array.isArray(eventsRes.items) ? eventsRes.items : []);
      setLinkedArtifacts(Array.isArray(artifactsRes.items) ? artifactsRes.items : []);
      setTraceDetail(traceRes);
    } catch (error) {
      console.error(error);
      setSelectedRoom(null);
      setMembers([]);
      setEvents([]);
      setLinkedArtifacts([]);
      setTraceDetail(null);
      message.error("加载 Room 详情失败，请稍后重试");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const loadTraceDetail = useCallback(async (traceId: string) => {
    const normalizedTraceId = String(traceId || "").trim();
    if (!normalizedTraceId) return;
    setDrawerOpen(true);
    setDetailLoading(true);
    try {
      const traceRes = await agentOsApi.getTrace(normalizedTraceId);
      const linkedRoomId = String(traceRes.room_id || "").trim();
      if (linkedRoomId) {
        const [roomRes, eventsRes, artifactsRes] = await Promise.all([
          agentOsApi.getRoom(linkedRoomId),
          agentOsApi.listRoomEvents(linkedRoomId, { limit: 200 }),
          agentOsApi.listArtifacts({ room_id: linkedRoomId, limit: 100 }),
        ]);
        setSelectedRoom(roomRes.item || null);
        setMembers(Array.isArray(roomRes.members) ? roomRes.members : []);
        setEvents(Array.isArray(eventsRes.items) ? eventsRes.items : []);
        setLinkedArtifacts(Array.isArray(artifactsRes.items) ? artifactsRes.items : []);
      } else {
        setSelectedRoom(null);
        setMembers([]);
        setEvents([]);
        setLinkedArtifacts([]);
      }
      setTraceDetail(traceRes);
    } catch (error) {
      console.error(error);
      setSelectedRoom(null);
      setMembers([]);
      setEvents([]);
      setLinkedArtifacts([]);
      setTraceDetail(null);
      message.error("加载 Trace 详情失败，请稍后重试");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const filteredRooms = useMemo(
    () => rooms.filter((item) => matchesKeyword([item.title, item.room_key, item.trace_id, item.session_id, item.owner_user_id], keyword)),
    [keyword, rooms],
  );

  const filteredTraces = useMemo(
    () => traces.filter((item) => matchesKeyword([item.trace_id, item.room_id, item.latest_event_type, item.latest_status, item.latest_summary], keyword)),
    [keyword, traces],
  );

  const filteredArtifacts = useMemo(
    () =>
      artifacts.filter((item) =>
        matchesKeyword([item.title, item.artifact_type, item.trace_id, item.room_id, item.owner_user_id, item.uri], keyword),
      ),
    [artifacts, keyword],
  );

  const filteredEvals = useMemo(
    () => evals.filter((item) => matchesKeyword([item.title, item.trace_id, item.room_id, item.status, item.dataset, item.metric], keyword)),
    [evals, keyword],
  );

  const filteredReplays = useMemo(
    () => replays.filter((item) => matchesKeyword([item.title, item.trace_id, item.room_id, item.status, item.source], keyword)),
    [keyword, replays],
  );

  const stats = useMemo(() => {
    if (activeSection === "rooms") {
      return {
        a: filteredRooms.length,
        b: filteredRooms.filter((item) => item.status === "active").length,
        c: filteredRooms.filter((item) => item.room_type === "collab").length,
        d: filteredRooms.filter((item) => item.room_type === "scene").length,
      };
    }
    if (activeSection === "traces") {
      return {
        a: filteredTraces.length,
        b: filteredTraces.filter((item) => item.latest_status === "routed").length,
        c: filteredTraces.filter((item) => item.latest_status === "created").length,
        d: filteredTraces.reduce((sum, item) => sum + Number(item.event_count || 0), 0),
      };
    }
    if (activeSection === "artifacts") {
      return {
        a: filteredArtifacts.length,
        b: filteredArtifacts.filter((item) => item.artifact_type === "report").length,
        c: filteredArtifacts.filter((item) => item.artifact_type === "file").length,
        d: filteredArtifacts.filter((item) => item.artifact_type === "image").length,
      };
    }
    return {
      a: filteredEvals.length,
      b: filteredReplays.length,
      c: filteredEvals.filter((item) => item.status === "queued").length,
      d: filteredReplays.filter((item) => item.status === "queued").length,
    };
  }, [activeSection, filteredArtifacts, filteredEvals, filteredReplays, filteredRooms, filteredTraces]);

  const roomColumns: ColumnsType<AgentOSRoomItem> = [
    {
      title: "协作主题",
      dataIndex: "title",
      key: "title",
      width: 260,
      render: (_value, row) => (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <Text strong>{row.title || row.room_key}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            room_key：{row.room_key || "-"}
          </Text>
        </div>
      ),
    },
    {
      title: "类型",
      dataIndex: "room_type",
      key: "room_type",
      width: 120,
      render: (value) => <Tag color={roomTypeColorMap[String(value || "")] || "default"}>{String(value || "-")}</Tag>,
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 120,
      render: (value) => <Tag color={statusColorMap[String(value || "")] || "default"}>{String(value || "-")}</Tag>,
    },
    {
      title: "owner",
      dataIndex: "owner_user_id",
      key: "owner_user_id",
      width: 120,
      render: (value) => <Text style={{ fontSize: 12 }}>{String(value || "-")}</Text>,
    },
    {
      title: "trace_id",
      dataIndex: "trace_id",
      key: "trace_id",
      width: 220,
      render: (value) => <Text style={{ fontSize: 12 }}>{String(value || "-")}</Text>,
    },
    {
      title: "更新时间",
      dataIndex: "updated_at",
      key: "updated_at",
      width: 180,
      render: (value) => formatDateTime(value),
    },
    {
      title: "操作",
      key: "actions",
      width: 180,
      fixed: "right",
      render: (_value, row) => (
        <Space wrap>
          <Button size="small" type="primary" ghost onClick={() => void loadRoomDetail(row.room_id, String(row.trace_id || "") || undefined)}>
            查看 Room
          </Button>
          {row.trace_id ? (
            <Button size="small" onClick={() => void loadTraceDetail(String(row.trace_id))}>
              查看 Trace
            </Button>
          ) : null}
        </Space>
      ),
    },
  ];

  const traceColumns: ColumnsType<AgentOSTraceListItem> = [
    {
      title: "trace_id",
      dataIndex: "trace_id",
      key: "trace_id",
      width: 240,
      render: (value) => <Text style={{ fontSize: 12 }}>{String(value || "-")}</Text>,
    },
    {
      title: "room_id",
      dataIndex: "room_id",
      key: "room_id",
      width: 180,
      render: (value) => <Text style={{ fontSize: 12 }}>{String(value || "-")}</Text>,
    },
    {
      title: "最新状态",
      dataIndex: "latest_status",
      key: "latest_status",
      width: 120,
      render: (value) => <Tag color={statusColorMap[String(value || "")] || "default"}>{String(value || "-")}</Tag>,
    },
    {
      title: "最新事件",
      dataIndex: "latest_event_type",
      key: "latest_event_type",
      width: 160,
      render: (value) => <Tag>{String(value || "-")}</Tag>,
    },
    {
      title: "摘要",
      dataIndex: "latest_summary",
      key: "latest_summary",
      render: (value) => <Text>{String(value || "-")}</Text>,
    },
    {
      title: "事件数",
      dataIndex: "event_count",
      key: "event_count",
      width: 100,
    },
    {
      title: "最后事件时间",
      dataIndex: "last_event_at",
      key: "last_event_at",
      width: 180,
      render: (value) => formatDateTime(value),
    },
    {
      title: "操作",
      key: "actions",
      width: 120,
      fixed: "right",
      render: (_value, row) => (
        <Button size="small" type="primary" ghost onClick={() => void loadTraceDetail(row.trace_id)}>
          查看详情
        </Button>
      ),
    },
  ];

  const artifactColumns: ColumnsType<AgentOSArtifactItem> = [
    {
      title: "产物",
      dataIndex: "title",
      key: "title",
      render: (_value, row) => (
        <Space direction="vertical" size={2}>
          <Space size={8} wrap>
            <Text strong>{row.title || row.artifact_id}</Text>
            <Tag color="success">{row.artifact_type || "note"}</Tag>
          </Space>
          <Text type="secondary" style={{ fontSize: 12 }}>
            uri：{row.uri || "-"}
          </Text>
        </Space>
      ),
    },
    {
      title: "trace_id",
      dataIndex: "trace_id",
      key: "trace_id",
      width: 220,
      render: (value) => <Text style={{ fontSize: 12 }}>{String(value || "-")}</Text>,
    },
    {
      title: "room_id",
      dataIndex: "room_id",
      key: "room_id",
      width: 180,
      render: (value) => <Text style={{ fontSize: 12 }}>{String(value || "-")}</Text>,
    },
    {
      title: "owner",
      dataIndex: "owner_user_id",
      key: "owner_user_id",
      width: 120,
      render: (value) => <Text style={{ fontSize: 12 }}>{String(value || "-")}</Text>,
    },
    {
      title: "时间",
      dataIndex: "updated_at",
      key: "updated_at",
      width: 180,
      render: (value) => formatDateTime(value),
    },
    {
      title: "操作",
      key: "actions",
      width: 160,
      fixed: "right",
      render: (_value, row) => (
        <Space wrap>
          {row.trace_id ? (
            <Button size="small" onClick={() => void loadTraceDetail(String(row.trace_id))}>
              Trace
            </Button>
          ) : null}
          {row.room_id ? (
            <Button size="small" type="primary" ghost onClick={() => void loadRoomDetail(String(row.room_id), String(row.trace_id || "") || undefined)}>
              Room
            </Button>
          ) : null}
        </Space>
      ),
    },
  ];

  const evalColumns: ColumnsType<AgentOSEvalItem> = [
    {
      title: "评测任务",
      dataIndex: "title",
      key: "title",
      render: (_value, row) => (
        <Space direction="vertical" size={2}>
          <Text strong>{row.title || row.eval_id}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {row.summary || "暂无说明"}
          </Text>
        </Space>
      ),
    },
    { title: "trace_id", dataIndex: "trace_id", key: "trace_id", width: 220, render: (value) => <Text style={{ fontSize: 12 }}>{String(value || "-")}</Text> },
    { title: "dataset", dataIndex: "dataset", key: "dataset", width: 140 },
    { title: "metric", dataIndex: "metric", key: "metric", width: 140 },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 120,
      render: (value) => <Tag color={statusColorMap[String(value || "")] || "default"}>{String(value || "-")}</Tag>,
    },
    { title: "创建时间", dataIndex: "created_at", key: "created_at", width: 180, render: (value) => formatDateTime(value) },
  ];

  const replayColumns: ColumnsType<AgentOSReplayItem> = [
    {
      title: "回放任务",
      dataIndex: "title",
      key: "title",
      render: (_value, row) => (
        <Space direction="vertical" size={2}>
          <Text strong>{row.title || row.replay_id}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {row.summary || "暂无说明"}
          </Text>
        </Space>
      ),
    },
    { title: "trace_id", dataIndex: "trace_id", key: "trace_id", width: 220, render: (value) => <Text style={{ fontSize: 12 }}>{String(value || "-")}</Text> },
    { title: "source", dataIndex: "source", key: "source", width: 140 },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 120,
      render: (value) => <Tag color={statusColorMap[String(value || "")] || "default"}>{String(value || "-")}</Tag>,
    },
    { title: "创建时间", dataIndex: "created_at", key: "created_at", width: 180, render: (value) => formatDateTime(value) },
  ];

  const submitEval = async (values: {
    title?: string;
    trace_id?: string;
    room_id?: string;
    dataset?: string;
    metric?: string;
    summary?: string;
  }) => {
    setSubmittingEval(true);
    try {
      await agentOsApi.createEval({
        title: values.title,
        trace_id: values.trace_id,
        room_id: values.room_id,
        dataset: values.dataset,
        metric: values.metric,
        summary: values.summary,
        status: "queued",
        metadata: { source: "admin-agent-os-workbench" },
      });
      message.success("评测任务已创建");
      evalForm.resetFields();
      await loadEvals();
    } catch (error) {
      console.error(error);
      message.error("创建评测任务失败，请稍后重试");
    } finally {
      setSubmittingEval(false);
    }
  };

  const submitReplay = async (values: {
    title?: string;
    trace_id?: string;
    room_id?: string;
    source?: string;
    summary?: string;
  }) => {
    setSubmittingReplay(true);
    try {
      await agentOsApi.createReplay({
        title: values.title,
        trace_id: values.trace_id,
        room_id: values.room_id,
        source: values.source,
        summary: values.summary,
        status: "queued",
        metadata: { source: "admin-agent-os-workbench" },
      });
      message.success("回放任务已创建");
      replayForm.resetFields();
      await loadEvals();
    } catch (error) {
      console.error(error);
      message.error("创建回放任务失败，请稍后重试");
    } finally {
      setSubmittingReplay(false);
    }
  };

  const renderSection = () => {
    if (activeSection === "rooms") {
      return filteredRooms.length === 0 ? (
        <div style={{ padding: "72px 0" }}>
          <Empty description="当前暂无可展示的 Room" />
        </div>
      ) : (
        <Table rowKey="room_id" columns={roomColumns} dataSource={filteredRooms} loading={loading} scroll={{ x: 1320 }} pagination={{ pageSize: 10, showSizeChanger: false }} />
      );
    }
    if (activeSection === "traces") {
      return filteredTraces.length === 0 ? (
        <div style={{ padding: "72px 0" }}>
          <Empty description="当前暂无可展示的 Trace" />
        </div>
      ) : (
        <Table rowKey="trace_id" columns={traceColumns} dataSource={filteredTraces} loading={loading} scroll={{ x: 1360 }} pagination={{ pageSize: 10, showSizeChanger: false }} />
      );
    }
    if (activeSection === "artifacts") {
      return filteredArtifacts.length === 0 ? (
        <div style={{ padding: "72px 0" }}>
          <Empty description="当前暂无可展示的产物" />
        </div>
      ) : (
        <Table rowKey="artifact_id" columns={artifactColumns} dataSource={filteredArtifacts} loading={loading} scroll={{ x: 1320 }} pagination={{ pageSize: 10, showSizeChanger: false }} />
      );
    }
    return (
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
          <Card bordered={false} style={{ borderRadius: 24, background: "#f8fafc" }}>
            <Title level={4} style={{ marginTop: 0 }}>
              新建评测任务
            </Title>
            <Form form={evalForm} layout="vertical" onFinish={(values) => void submitEval(values as { title?: string; trace_id?: string; room_id?: string; dataset?: string; metric?: string; summary?: string })}>
              <Form.Item label="任务标题" name="title">
                <Input placeholder="例如：Room 路由闭环验收" />
              </Form.Item>
              <Form.Item label="trace_id" name="trace_id">
                <Input placeholder="可直接绑定现有 trace_id" />
              </Form.Item>
              <Form.Item label="room_id" name="room_id">
                <Input placeholder="可选，关联现有 room_id" />
              </Form.Item>
              <Form.Item label="数据集 / 样本集" name="dataset">
                <Input placeholder="例如：P0 验收样本集" />
              </Form.Item>
              <Form.Item label="指标" name="metric">
                <Input placeholder="例如：route_success_rate" />
              </Form.Item>
              <Form.Item label="说明" name="summary">
                <Input.TextArea rows={4} placeholder="说明这次评测要验证什么" />
              </Form.Item>
              <Button type="primary" loading={submittingEval} onClick={() => evalForm.submit()}>
                创建评测
              </Button>
            </Form>
          </Card>

          <Card bordered={false} style={{ borderRadius: 24, background: "#f8fafc" }}>
            <Title level={4} style={{ marginTop: 0 }}>
              新建回放任务
            </Title>
            <Form form={replayForm} layout="vertical" onFinish={(values) => void submitReplay(values as { title?: string; trace_id?: string; room_id?: string; source?: string; summary?: string })}>
              <Form.Item label="任务标题" name="title">
                <Input placeholder="例如：IAP 重放复盘" />
              </Form.Item>
              <Form.Item label="trace_id" name="trace_id">
                <Input placeholder="优先绑定待回放的 trace_id" />
              </Form.Item>
              <Form.Item label="room_id" name="room_id">
                <Input placeholder="可选，关联现有 room_id" />
              </Form.Item>
              <Form.Item label="来源" name="source" initialValue="manual">
                <Select
                  options={[
                    { label: "manual", value: "manual" },
                    { label: "audit", value: "audit" },
                    { label: "regression", value: "regression" },
                  ]}
                />
              </Form.Item>
              <Form.Item label="说明" name="summary">
                <Input.TextArea rows={4} placeholder="说明为什么要回放这条链路" />
              </Form.Item>
              <Button type="primary" loading={submittingReplay} onClick={() => replayForm.submit()}>
                创建回放
              </Button>
            </Form>
          </Card>
        </div>

        <Card bordered={false} style={{ borderRadius: 24 }} title={`评测列表（${filteredEvals.length}）`}>
          <Table rowKey="eval_id" columns={evalColumns} dataSource={filteredEvals} loading={loading} scroll={{ x: 1080 }} pagination={{ pageSize: 8, showSizeChanger: false }} />
        </Card>

        <Card bordered={false} style={{ borderRadius: 24 }} title={`回放列表（${filteredReplays.length}）`}>
          <Table rowKey="replay_id" columns={replayColumns} dataSource={filteredReplays} loading={loading} scroll={{ x: 980 }} pagination={{ pageSize: 8, showSizeChanger: false }} />
        </Card>
      </Space>
    );
  };

  return (
    <div className="lux-shell">
      <div style={{ display: "grid", gap: 20 }}>
        <Card
          bordered={false}
          style={{
            borderRadius: 28,
            overflow: "hidden",
            background: "linear-gradient(135deg, rgba(238,242,255,0.98), rgba(248,250,252,0.98) 40%, rgba(236,253,245,0.98))",
            boxShadow: "0 18px 45px rgba(15, 23, 42, 0.08)",
          }}
          styles={{ body: { padding: 24 } }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div style={{ minWidth: 320, flex: 1 }}>
              <Space size={14} align="start">
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 16,
                    background: "linear-gradient(135deg, #e0e7ff, #c7d2fe)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <GitBranch size={22} color="#4338ca" />
                </div>
                <div>
                  <Title level={3} style={{ margin: 0, color: "#0f172a" }}>
                    Agent OS 运维工作台
                  </Title>
                  <Paragraph style={{ display: "block", marginTop: 8, color: "#475569", lineHeight: 1.8 }}>
                    这里集中查看 `rooms / traces / artifacts / evals`：让协作链路、观测链路、产物链路和回归链路都能在管理端直接打开、直接核对。
                  </Paragraph>
                  <Space size={8} wrap style={{ marginTop: 14 }}>
                    <Tag color="processing" style={{ borderRadius: 999, paddingInline: 12 }}>
                      Room 治理
                    </Tag>
                    <Tag color="purple" style={{ borderRadius: 999, paddingInline: 12 }}>
                      Trace 观测
                    </Tag>
                    <Tag color="success" style={{ borderRadius: 999, paddingInline: 12 }}>
                      Artifact 盘点
                    </Tag>
                    <Tag color="gold" style={{ borderRadius: 999, paddingInline: 12 }}>
                      Eval / Replay
                    </Tag>
                  </Space>
                </div>
              </Space>
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Card size="small" style={{ borderRadius: 20, minWidth: 140 }}>
                <Statistic title="当前条目" value={stats.a} prefix={<Boxes size={16} />} />
              </Card>
              <Card size="small" style={{ borderRadius: 20, minWidth: 140 }}>
                <Statistic title={activeSection === "rooms" ? "进行中" : activeSection === "traces" ? "已路由" : activeSection === "artifacts" ? "报告类" : "回放数"} value={stats.b} prefix={<Activity size={16} />} />
              </Card>
              <Card size="small" style={{ borderRadius: 20, minWidth: 140 }}>
                <Statistic title={activeSection === "rooms" ? "协作 Room" : activeSection === "traces" ? "已创建" : activeSection === "artifacts" ? "文件类" : "评测排队"} value={stats.c} prefix={<UsersRound size={16} />} />
              </Card>
              <Card size="small" style={{ borderRadius: 20, minWidth: 140 }}>
                <Statistic title={activeSection === "rooms" ? "场景 Room" : activeSection === "traces" ? "事件总数" : activeSection === "artifacts" ? "图片类" : "回放排队"} value={stats.d} prefix={<Package size={16} />} />
              </Card>
            </div>
          </div>
        </Card>

        <Card bordered={false} style={{ borderRadius: 28, boxShadow: "0 18px 45px rgba(15, 23, 42, 0.06)" }} styles={{ body: { padding: 22 } }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <Space size={12} wrap>
              <Segmented
                options={SECTION_OPTIONS}
                value={activeSection}
                onChange={(value) => {
                  const next = String(value) as SectionKey;
                  setActiveSection(next);
                  navigate(SECTION_PATH_MAP[next]);
                }}
              />
              <Input.Search
                allowClear
                placeholder="搜索标题、trace_id、room_id、状态"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                style={{ width: 280 }}
              />
              {activeSection === "rooms" ? (
                <>
                  <Segmented options={ROOM_STATUS_OPTIONS} value={roomStatus} onChange={(value) => setRoomStatus(String(value))} />
                  <Select style={{ width: 150 }} value={roomType} options={ROOM_TYPE_OPTIONS} onChange={(value) => setRoomType(String(value))} />
                </>
              ) : null}
              {activeSection === "traces" ? (
                <Segmented options={TRACE_STATUS_OPTIONS} value={traceStatus} onChange={(value) => setTraceStatus(String(value))} />
              ) : null}
            </Space>
            <Space>
              <Button icon={<RotateCcw size={14} />} onClick={() => {
                setKeyword("");
                setRoomType("all");
                setRoomStatus("all");
                setTraceStatus("all");
              }}>
                重置筛选
              </Button>
              <Button type="primary" icon={<RefreshCw size={14} />} onClick={() => void refreshActiveSection()} loading={loading}>
                刷新数据
              </Button>
            </Space>
          </div>

          <div
            style={{
              marginTop: 16,
              marginBottom: 18,
              padding: "14px 16px",
              borderRadius: 18,
              background: "linear-gradient(135deg, #f8fafc, #eef2ff)",
              border: "1px solid rgba(226, 232, 240, 0.9)",
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <Text style={{ color: "#334155" }}>
              当前正在查看 <Text strong>{SECTION_OPTIONS.find((item) => item.value === activeSection)?.label}</Text>，支持直接下钻到 Room / Trace 详情。
            </Text>
            <Text style={{ color: "#64748b" }}>
              这批页面优先解决“管理端能看见、能搜索、能发起 eval/replay”的最小可用闭环。
            </Text>
          </div>

          {renderSection()}
        </Card>
      </div>

      <Drawer
        title={selectedRoom?.title || traceDetail?.trace_id || "Agent OS 详情"}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={860}
        destroyOnClose={false}
      >
        {detailLoading ? (
          <Text type="secondary">正在加载详情...</Text>
        ) : !selectedRoom && !traceDetail ? (
          <Empty description="未找到可用详情" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            {selectedRoom ? (
              <Card bordered={false} style={{ borderRadius: 20, background: "#f8fafc" }}>
                <Descriptions column={2} size="small" title="Room 概览">
                  <Descriptions.Item label="room_id">{selectedRoom.room_id}</Descriptions.Item>
                  <Descriptions.Item label="room_type">{selectedRoom.room_type || "-"}</Descriptions.Item>
                  <Descriptions.Item label="status">{selectedRoom.status || "-"}</Descriptions.Item>
                  <Descriptions.Item label="trace_id">{selectedRoom.trace_id || "-"}</Descriptions.Item>
                  <Descriptions.Item label="session_id">{selectedRoom.session_id || "-"}</Descriptions.Item>
                  <Descriptions.Item label="更新时间">{formatDateTime(selectedRoom.updated_at)}</Descriptions.Item>
                </Descriptions>
                <Paragraph style={{ marginTop: 12, marginBottom: 0, color: "#475569" }}>
                  metadata：{formatPayloadPreview(selectedRoom.metadata)}
                </Paragraph>
              </Card>
            ) : null}

            <Card bordered={false} style={{ borderRadius: 20 }} title={`成员视图（${members.length}）`}>
              {members.length ? (
                <Space size={[8, 8]} wrap>
                  {members.map((member) => (
                    <Tag key={`${member.member_type}:${member.member_id}`} color={member.member_type === "agent" ? "geekblue" : "blue"} style={{ borderRadius: 999, paddingInline: 12 }}>
                      {member.display_name || member.member_id}
                      {member.role ? ` · ${member.role}` : ""}
                    </Tag>
                  ))}
                </Space>
              ) : (
                <Empty description="当前暂无成员记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              )}
            </Card>

            <Card bordered={false} style={{ borderRadius: 20 }} title={`Room 时间线（${events.length}）`}>
              {events.length ? (
                <Timeline
                  items={events.map((event) => ({
                    color: statusColorMap[String(event.event_type || "")] || "blue",
                    children: (
                      <div>
                        <Space size={8} wrap>
                          <Text strong>{event.summary || event.event_type}</Text>
                          <Tag>{event.event_type}</Tag>
                          <Text type="secondary">{formatDateTime(event.created_at)}</Text>
                        </Space>
                        <Paragraph style={{ margin: "6px 0 0", color: "#64748b", whiteSpace: "pre-wrap" }}>
                          actor={String(event.actor_agent_id || event.actor_user_id || "system")}
                        </Paragraph>
                        <Paragraph style={{ margin: "6px 0 0", color: "#475569", whiteSpace: "pre-wrap" }}>
                          {formatPayloadPreview(event.payload)}
                        </Paragraph>
                      </div>
                    ),
                  }))}
                />
              ) : (
                <Empty description="当前暂无 Room 时间线事件" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              )}
            </Card>

            <Card bordered={false} style={{ borderRadius: 20 }} title={`Artifacts（${linkedArtifacts.length}）`}>
              {linkedArtifacts.length ? (
                <List
                  dataSource={linkedArtifacts}
                  renderItem={(artifact) => (
                    <List.Item key={artifact.artifact_id}>
                      <List.Item.Meta
                        title={
                          <Space size={8} wrap>
                            <Text strong>{artifact.title || artifact.artifact_id}</Text>
                            <Tag color="success">{artifact.artifact_type || "note"}</Tag>
                          </Space>
                        }
                        description={
                          <Space direction="vertical" size={4} style={{ width: "100%" }}>
                            <Text type="secondary">uri：{artifact.uri || "-"}</Text>
                            <Text type="secondary">mime：{artifact.mime_type || "-"}</Text>
                            <Text type="secondary">时间：{formatDateTime(artifact.created_at)}</Text>
                            <Paragraph style={{ margin: 0, color: "#475569" }}>{formatPayloadPreview(artifact.metadata)}</Paragraph>
                          </Space>
                        }
                      />
                    </List.Item>
                  )}
                />
              ) : (
                <Empty description="当前暂无挂载产物" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              )}
            </Card>

            <Card bordered={false} style={{ borderRadius: 20 }} title="Trace 详情">
              {traceDetail ? (
                <Space direction="vertical" size={12} style={{ width: "100%" }}>
                  <Descriptions column={2} size="small">
                    <Descriptions.Item label="trace_id">{traceDetail.trace_id}</Descriptions.Item>
                    <Descriptions.Item label="room_id">{traceDetail.room_id || "-"}</Descriptions.Item>
                    <Descriptions.Item label="事件数">{traceDetail.event_count}</Descriptions.Item>
                    <Descriptions.Item label="状态分布">
                      <Space size={[6, 6]} wrap>
                        {Object.entries(traceDetail.status_counts || {}).map(([status, count]) => (
                          <Tag key={status} color={statusColorMap[status] || "default"}>
                            {status}: {count}
                          </Tag>
                        ))}
                      </Space>
                    </Descriptions.Item>
                  </Descriptions>
                  {traceDetail.items?.length ? (
                    <Timeline
                      items={traceDetail.items.map((event) => ({
                        color: statusColorMap[String(event.status || "")] || "blue",
                        children: (
                          <div>
                            <Space size={8} wrap>
                              <Text strong>{event.summary || event.event_type}</Text>
                              <Tag>{event.event_type}</Tag>
                              <Tag color={statusColorMap[String(event.status || "")] || "default"}>{event.status || "unknown"}</Tag>
                              <Text type="secondary">{formatDateTime(event.created_at)}</Text>
                            </Space>
                            <Paragraph style={{ margin: "6px 0 0", color: "#64748b", whiteSpace: "pre-wrap" }}>
                              actor={String(event.actor_agent_id || event.actor_user_id || "system")}
                            </Paragraph>
                          </div>
                        ),
                      }))}
                    />
                  ) : (
                    <Empty description="当前 Trace 暂无事件" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  )}
                </Space>
              ) : (
                <Empty description="当前暂无 Trace 详情" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              )}
            </Card>
          </Space>
        )}
      </Drawer>
    </div>
  );
}
