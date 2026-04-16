import { useCallback, useEffect, useMemo, useState, type Key } from "react";
import {
  Button,
  Card,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Segmented,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import {
  BellDot,
  History,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { ColumnsType } from "antd/es/table";
import type {
  AgentOSDuplicateHitsResponse,
  AgentOSIAPMessageItem,
  AgentOSMailboxOverviewItem,
  AgentOSPlanItem,
  AgentOSRegistryItem,
} from "../../api/types";
import { agentOsApi } from "../../api/modules/agentOs";
import sessionApi from "../Chat/sessionApi";
import { getApiToken, getApiUrl } from "../../api/config";

interface SessionRow {
  key: string;
  sessionId: string;
  realId?: string;
  name: string;
  triggeredAt: string;
  type: string;
  source: string;
  channel: string;
  updatedAt?: string;
  unread: boolean;
}

interface AgentOsOverviewState {
  registry: AgentOSRegistryItem[];
  mailbox: AgentOSMailboxOverviewItem[];
  plans: AgentOSPlanItem[];
  iapMessages: AgentOSIAPMessageItem[];
  duplicateStats: AgentOSDuplicateHitsResponse | null;
  iapSummaryTotal: number;
  routeResultSummary: Record<string, number>;
}

const SEEN_KEY = "copaw_session_last_seen_v1";
const { Text, Title, Paragraph } = Typography;

const formatDateTime = (value: unknown): string => {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  if (/^\d+$/.test(raw)) {
    const ts = Number(raw);
    if (Number.isFinite(ts) && ts > 0) {
      return new Date(ts).toLocaleString("zh-CN", { hour12: false });
    }
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", { hour12: false });
};

const loadSeenMapLocal = (): Record<string, string> => {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const saveSeenMapLocal = (map: Record<string, string>) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(SEEN_KEY, JSON.stringify(map));
};

export default function EmployeeSessions() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [filterType, setFilterType] = useState<"all" | "system" | "human">("all");
  const [query, setQuery] = useState("");
  const [seenMap, setSeenMap] = useState<Record<string, string>>({});
  const [auditVisible, setAuditVisible] = useState(false);
  const [opsLoading, setOpsLoading] = useState(false);
  const [opsOverview, setOpsOverview] = useState<AgentOsOverviewState>({
    registry: [],
    mailbox: [],
    plans: [],
    iapMessages: [],
    duplicateStats: null,
    iapSummaryTotal: 0,
    routeResultSummary: {},
  });

  const fetchSeenMap = useCallback(async (): Promise<Record<string, string>> => {
    try {
      const token = getApiToken();
      const url = getApiUrl("/employee/sessions/seen");
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const data = res.ok ? await res.json() : { seen_map: {} };
      return (data.seen_map || {}) as Record<string, string>;
    } catch {
      return {};
    }
  }, []);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const list = await sessionApi.getSessionList();
      const serverSeen = await fetchSeenMap();
      const localSeen = loadSeenMapLocal();
      const mergedSeen = { ...localSeen, ...serverSeen };
      setSeenMap(mergedSeen);
      const rows: SessionRow[] = (list || []).map((s) => {
        const meta = ((s as any).meta || {}) as Record<string, unknown>;
        const pushSource = meta.push_source_user_name || meta.push_source_user_id;
        const updatedAt = String((s as any).updatedAt || (s as any).updated_at || "");
        const createdAt = String((s as any).createdAt || (s as any).created_at || "");
        const key = String((s as any).id || "");
        const sessionId = String((s as any).sessionId || (s as any).session_id || key);
        const realId = String((s as any).realId || "");
        const triggerSource = String(meta.secretary_welcome_ts || "") || updatedAt || createdAt || key;
        const lastSeen = mergedSeen[key] || mergedSeen[sessionId] || mergedSeen[realId] || "";
        const unread = Boolean(updatedAt && (!lastSeen || updatedAt > lastSeen));
        return {
          key,
          sessionId,
          realId: realId || undefined,
          name: String((s as any).name || "未命名会话"),
          triggeredAt: formatDateTime(triggerSource),
          type: pushSource ? "人际会话" : "系统会话",
          source: pushSource ? String(meta.push_source_user_name || "同事") : "系统",
          channel: String((s as any).channel || "console"),
          updatedAt,
          unread,
        };
      });
      setSessions(rows);
    } finally {
      setLoading(false);
    }
  }, [fetchSeenMap]);

  const pruneLocalState = (rows: SessionRow[]) => {
    const ids = new Set<string>();
    rows.forEach((row) => {
      [row.key, row.sessionId, row.realId].filter(Boolean).forEach((id) => ids.add(String(id)));
    });
    if (!ids.size) return;
    setSelectedRowKeys((prev) => prev.filter((key) => !ids.has(String(key))));
    setSeenMap((prev) => {
      const next = { ...prev };
      ids.forEach((id) => {
        delete next[id];
      });
      saveSeenMapLocal(next);
      return next;
    });
  };

  const handleDelete = async (row: SessionRow) => {
    setActionLoading(true);
    try {
      await sessionApi.removeSession({
        id: row.key,
        realId: row.realId,
        sessionId: row.sessionId,
      } as any);
      pruneLocalState([row]);
      message.success(`已删除会话：${row.name}`);
      await loadSessions();
    } catch (e: any) {
      message.error(e?.message || "删除失败");
    } finally {
      setActionLoading(false);
    }
  };

  const handleBatchDelete = async () => {
    const rowsToDelete = sessions.filter((row) => selectedRowKeys.includes(row.key));
    if (!rowsToDelete.length) {
      message.info("请先勾选需要删除的会话");
      return;
    }
    setActionLoading(true);
    try {
      for (const row of rowsToDelete) {
        await sessionApi.removeSession({
          id: row.key,
          realId: row.realId,
          sessionId: row.sessionId,
        } as any);
      }
      pruneLocalState(rowsToDelete);
      message.success(`已删除 ${rowsToDelete.length} 个会话`);
      await loadSessions();
    } catch (e: any) {
      message.error(e?.message || "批量删除失败");
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    const handlePushUpdated = () => {
      void loadSessions();
    };
    window.addEventListener("copaw-push-session-updated", handlePushUpdated as EventListener);
    return () => {
      window.removeEventListener("copaw-push-session-updated", handlePushUpdated as EventListener);
    };
  }, [loadSessions]);

  useEffect(() => {
    setSelectedRowKeys((prev) => prev.filter((key) => sessions.some((row) => row.key === String(key))));
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    return sessions.filter((row) => {
      const loweredQuery = query.toLowerCase();
      const matchesQuery =
        !query ||
        row.name.toLowerCase().includes(loweredQuery) ||
        row.source.toLowerCase().includes(loweredQuery);
      const matchesType =
        filterType === "all" ||
        (filterType === "human" && row.type === "人际会话") ||
        (filterType === "system" && row.type === "系统会话");
      return matchesQuery && matchesType;
    });
  }, [sessions, query, filterType]);

  const unreadCount = filteredSessions.filter((row) => row.unread).length;
  const selectedCount = selectedRowKeys.length;

  const markSeen = (row: SessionRow) => {
    const seenAt = row.updatedAt || new Date().toISOString();
    const nextMap = {
      ...seenMap,
      [row.key]: seenAt,
      [row.sessionId]: seenAt,
      ...(row.realId ? { [row.realId]: seenAt } : {}),
    };
    setSeenMap(nextMap);
    saveSeenMapLocal(nextMap);
    const token = getApiToken();
    const url = getApiUrl("/employee/sessions/seen");
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ session_id: row.sessionId || row.key, last_seen: seenAt }),
    }).catch(() => undefined);
    setSessions((prev) => prev.map((item) => (item.key === row.key ? { ...item, unread: false } : item)));
  };

  const handleOpenSession = (row: SessionRow) => {
    markSeen(row);
    navigate(`/app/workspace/${row.key}`);
  };

  const handleDeleteAll = async () => {
    if (!sessions.length) {
      message.info("当前没有会话可删除");
      return;
    }
    setActionLoading(true);
    try {
      let deleted = 0;
      for (const row of sessions) {
        await sessionApi.removeSession({
          id: row.key,
          realId: row.realId,
          sessionId: row.sessionId,
        } as any);
        deleted++;
      }
      pruneLocalState(sessions);
      message.success(`已删除全部 ${deleted} 个会话`);
      await loadSessions();
    } catch (e: any) {
      message.error(e?.message || "删除全部会话失败");
    } finally {
      setActionLoading(false);
    }
  };

  const loadAgentOsOverview = async () => {
    setOpsLoading(true);
    try {
      const [summaryRes, registryRes, mailboxRes, plansRes, iapRes, duplicateRes] = await Promise.all([
        agentOsApi.getSummary(),
        agentOsApi.listRegistry(),
        agentOsApi.listMailboxOverview(),
        agentOsApi.listPlans({ limit: 20 }),
        agentOsApi.listIapMessages({ limit: 20 }),
        agentOsApi.getDuplicateHits({ days: 30 }),
      ]);
      setOpsOverview({
        registry: Array.isArray(registryRes?.items) ? registryRes.items : [],
        mailbox: Array.isArray(mailboxRes?.items) ? mailboxRes.items : [],
        plans: Array.isArray(plansRes?.items) ? plansRes.items : [],
        iapMessages: Array.isArray(iapRes?.items) ? iapRes.items : [],
        duplicateStats: duplicateRes || null,
        iapSummaryTotal: Number(summaryRes?.summary?.total || 0),
        routeResultSummary: summaryRes?.summary?.by_route_result || {},
      });
    } catch (e: any) {
      message.error(e?.message || "加载 Agent OS 概览失败");
    } finally {
      setOpsLoading(false);
    }
  };



  const summaryCards = [
    {
      label: "全部会话",
      value: sessions.length,
      hint: "统一查看系统与人际触达",
      icon: <History size={18} color="#2563eb" />,
      background: "linear-gradient(135deg, rgba(239,246,255,0.95), rgba(219,234,254,0.78))",
    },
    {
      label: "未读会话",
      value: unreadCount,
      hint: "优先处理最新触达内容",
      icon: <BellDot size={18} color="#d97706" />,
      background: "linear-gradient(135deg, rgba(255,247,237,0.95), rgba(254,215,170,0.78))",
    },
  ];

  const columns: ColumnsType<SessionRow> = [
    {
      title: "会话名称",
      dataIndex: "name",
      key: "name",
      width: 280,
      render: (_: unknown, row: SessionRow) => (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <Text strong style={{ color: "#0f172a", fontSize: 14 }}>
            {row.name}
          </Text>
          <Text style={{ color: "#64748b", fontSize: 12 }}>
            来源：{row.source || "系统"} · 渠道：{row.channel || "console"}
          </Text>
        </div>
      ),
    },
    {
      title: "类型",
      dataIndex: "type",
      key: "type",
      width: 110,
      render: (value: string) => (
        <Tag color={value === "人际会话" ? "blue" : "geekblue"} style={{ borderRadius: 999, paddingInline: 10 }}>
          {value}
        </Tag>
      ),
    },
    {
      title: "未读",
      dataIndex: "unread",
      key: "unread",
      width: 80,
      render: (value: boolean) => (
        <Tag color={value ? "error" : "default"} style={{ borderRadius: 999, paddingInline: 10 }}>
          {value ? "未读" : "已读"}
        </Tag>
      ),
    },
    {
      title: "触发时间",
      dataIndex: "triggeredAt",
      key: "triggeredAt",
      width: 170,
    },
    {
      title: "操作",
      key: "actions",
      width: 160,
      fixed: "right" as const,
      render: (_: unknown, row: SessionRow) => (
        <Space size={8} wrap onClick={(event) => event.stopPropagation()}>
          <Button size="small" type="primary" ghost onClick={() => handleOpenSession(row)}>
            打开
          </Button>
          <Popconfirm
            title={`确认删除"${row.name}"吗？`}
            description="删除后该会话将不再出现在列表中。"
            okText="删除"
            okButtonProps={{ danger: true, loading: actionLoading }}
            cancelText="取消"
            onConfirm={() => handleDelete(row)}
          >
            <Button size="small" danger onClick={(event) => event.stopPropagation()}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const opsRouteResultEntries = Object.entries(opsOverview.routeResultSummary || {});
  const opsStatCards = [
    {
      label: "注册 Agent",
      value: opsOverview.registry.length,
      hint: "当前用户可见的 PIA / SO / 其他代理数",
    },
    {
      label: "邮箱主体",
      value: opsOverview.mailbox.length,
      hint: "已建立 mailbox 的代理数量",
    },
    {
      label: "协作计划",
      value: opsOverview.plans.length,
      hint: "近期 plan 列表，可继续执行与跟踪",
    },
    {
      label: "去重命中",
      value: Number(opsOverview.duplicateStats?.duplicate_hit_count || 0),
      hint: "最近 30 天重复路由命中次数",
    },
  ];

  return (
    <div className="lux-shell">
      <div style={{ display: "grid", gap: 20 }}>
        <Card
          bordered={false}
          style={{
            borderRadius: 28,
            overflow: "hidden",
            background:
              "linear-gradient(135deg, rgba(248,250,252,0.98), rgba(254,242,242,0.98) 42%, rgba(250,245,255,0.98))",
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
                    background: "linear-gradient(135deg, #fee2e2, #fecaca)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <History size={22} color="#dc2626" />
                </div>
                <div>
                  <Title level={3} style={{ margin: 0, color: "#0f172a" }}>
                    会话管理中心
                  </Title>
                  <Paragraph style={{ display: "block", marginTop: 8, color: "#475569", lineHeight: 1.8 }}>
                    统一管理系统会话与人际会话，支持按类型筛选和批量操作。
                  </Paragraph>
                </div>
              </Space>
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {summaryCards.map((item) => (
                <div
                  key={item.label}
                  style={{
                    minWidth: 164,
                    padding: "14px 16px",
                    borderRadius: 20,
                    background: item.background,
                    border: "1px solid rgba(148,163,184,0.16)",
                  }}
                >
                  <Space size={8} align="center">
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 12,
                        background: "rgba(255,255,255,0.72)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {item.icon}
                    </div>
                    <Text style={{ color: "#475569", fontSize: 12 }}>{item.label}</Text>
                  </Space>
                  <div style={{ marginTop: 12, fontSize: 28, fontWeight: 800, color: "#0f172a" }}>
                    {item.value}
                  </div>
                  <Text style={{ color: "#64748b", fontSize: 12 }}>{item.hint}</Text>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card
          bordered={false}
          style={{ borderRadius: 28, boxShadow: "0 18px 45px rgba(15, 23, 42, 0.06)" }}
          styles={{ body: { padding: 22 } }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <Space size={12} wrap>
              <Input
                prefix={<Search size={14} color="#94a3b8" />}
                placeholder="搜索会话或来源"
                allowClear
                onChange={(event) => setQuery(event.target.value)}
                value={query}
                style={{ width: 280, borderRadius: 12 }}
              />
              <Segmented
                options={[
                  { label: "全部", value: "all" },
                  { label: "系统", value: "system" },
                  { label: "人际", value: "human" },
                ]}
                value={filterType}
                onChange={(value) => setFilterType(value as "all" | "system" | "human")}
                style={{ borderRadius: 12, padding: 4 }}
              />
            </Space>
            <Space size={12} wrap>
              <Tag color={selectedCount ? "processing" : "default"} style={{ borderRadius: 999, paddingInline: 12, height: 34, lineHeight: "32px" }}>
                {selectedCount ? `已选择 ${selectedCount} 项` : "未选择会话"}
              </Tag>
              <Button icon={<RefreshCw size={14} />} onClick={() => void loadSessions()} loading={loading}>
                刷新
              </Button>
              <Popconfirm
                title={`确认删除全部 ${sessions.length} 个会话吗？`}
                description="此操作将清空所有会话记录，不可恢复。"
                okText="删除全部"
                okButtonProps={{ danger: true, loading: actionLoading }}
                cancelText="取消"
                onConfirm={handleDeleteAll}
              >
                <Button danger icon={<Trash2 size={14} />} disabled={!sessions.length} loading={actionLoading}>
                  删除全部
                </Button>
              </Popconfirm>
              <Popconfirm
                title={selectedCount ? `确认删除已勾选的 ${selectedCount} 个会话？` : "请先勾选需要删除的会话"}
                description={selectedCount ? "仅删除当前勾选项。" : undefined}
                okText="删除所选"
                okButtonProps={{ danger: true, loading: actionLoading }}
                cancelText="取消"
                disabled={!selectedCount}
                onConfirm={handleBatchDelete}
              >
                <Button danger icon={<Trash2 size={14} />} disabled={!selectedCount} loading={actionLoading}>
                  删除所选
                </Button>
              </Popconfirm>
            </Space>
          </div>

          <div
            style={{
              marginTop: 16,
              marginBottom: 18,
              padding: "14px 16px",
              borderRadius: 18,
              background: "linear-gradient(135deg, #f8fafc, #fff7ed)",
              border: "1px solid rgba(226, 232, 240, 0.9)",
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <Space size={8} align="center">
              <Sparkles size={16} color="#f97316" />
              <Text style={{ color: "#334155" }}>
                当前筛选下共有 <Text strong>{filteredSessions.length}</Text> 个会话，其中未读
                <Text strong style={{ color: "#dc2626" }}> {unreadCount} </Text>
                个。
              </Text>
            </Space>
          </div>

          {filteredSessions.length === 0 ? (
            <div style={{ padding: "72px 0" }}>
              <Empty
                description={
                  query || filterType !== "all"
                    ? "没有匹配当前筛选条件的会话"
                    : "暂无会话，快去工作台发起第一次对话吧"
                }
              />
            </div>
          ) : (
            <Table
              rowKey="key"
              columns={columns}
              dataSource={filteredSessions}
              loading={loading}
              size="middle"
              pagination={{
                pageSize: 10,
                showSizeChanger: false,
                showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 条`,
                style: { marginTop: 20 },
              }}
              onRow={(row) => ({
                onClick: () => handleOpenSession(row),
                style: {
                  cursor: "pointer",
                  background: selectedRowKeys.includes(row.key)
                    ? "#f8fbff"
                    : row.unread
                      ? "#fffaf5"
                      : "#ffffff",
                },
              })}
            />
          )}
        </Card>
      </div>

      <Modal
        title="Agent OS 概览"
        open={auditVisible}
        footer={null}
        onCancel={() => setAuditVisible(false)}
        width={920}
      >
        {opsLoading ? (
          <Text type="secondary">正在加载 Agent OS 概览...</Text>
        ) : (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Space size={12} wrap style={{ width: "100%" }}>
              {opsStatCards.map((item) => (
                <Card
                  key={item.label}
                  size="small"
                  bordered={false}
                  style={{ flex: 1, minWidth: 180, borderRadius: 18, background: "#f8fafc" }}
                >
                  <Text type="secondary">{item.label}</Text>
                  <div style={{ fontSize: 28, fontWeight: 800, color: "#0f172a", marginTop: 8 }}>
                    {item.value}
                  </div>
                  <Text style={{ color: "#64748b", fontSize: 12 }}>{item.hint}</Text>
                </Card>
              ))}
            </Space>

            <Card
              size="small"
              title="IAP 路由摘要"
              extra={
                <Button size="small" onClick={() => void loadAgentOsOverview()} loading={opsLoading}>
                  刷新概览
                </Button>
              }
            >
              <Space direction="vertical" size={8} style={{ width: "100%" }}>
                <Text type="secondary">最近消息总量：{opsOverview.iapSummaryTotal}</Text>
                {opsRouteResultEntries.length ? (
                  <Space size={[8, 8]} wrap>
                    {opsRouteResultEntries.map(([key, value]) => (
                      <Tag key={key} color="processing">
                        {key}: {value}
                      </Tag>
                    ))}
                  </Space>
                ) : (
                  <Text type="secondary">暂无路由结果统计</Text>
                )}
              </Space>
            </Card>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Card size="small" title="Registry">
                <Space direction="vertical" size={10} style={{ width: "100%" }}>
                  {opsOverview.registry.length ? (
                    opsOverview.registry.slice(0, 6).map((item) => (
                      <div key={item.agent_id} style={{ padding: "10px 12px", borderRadius: 14, background: "#f8fafc" }}>
                        <Space direction="vertical" size={4} style={{ width: "100%" }}>
                          <Text strong>{item.agent_id}</Text>
                          <Text type="secondary">
                            类型：{item.agent_type || "-"} · 状态：{item.status || "-"}
                          </Text>
                        </Space>
                      </div>
                    ))
                  ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无 registry 数据" />
                  )}
                </Space>
              </Card>

              <Card size="small" title="Mailbox 概览">
                <Space direction="vertical" size={10} style={{ width: "100%" }}>
                  {opsOverview.mailbox.length ? (
                    opsOverview.mailbox.slice(0, 6).map((item) => (
                      <div key={item.agent_id} style={{ padding: "10px 12px", borderRadius: 14, background: "#f8fafc" }}>
                        <Space direction="vertical" size={4} style={{ width: "100%" }}>
                          <Text strong>{item.agent_id}</Text>
                          <Text type="secondary">
                            inbox: {Number(item.inbox_total || 0)} · outbox: {Number(item.outbox_total || 0)}
                          </Text>
                        </Space>
                      </div>
                    ))
                  ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无 mailbox 数据" />
                  )}
                </Space>
              </Card>

              <Card size="small" title="近期协作计划">
                <Space direction="vertical" size={10} style={{ width: "100%" }}>
                  {opsOverview.plans.length ? (
                    opsOverview.plans.slice(0, 6).map((item) => (
                      <div key={item.plan_id} style={{ padding: "10px 12px", borderRadius: 14, background: "#f8fafc" }}>
                        <Space direction="vertical" size={4} style={{ width: "100%" }}>
                          <Text strong>{item.title || item.goal || item.plan_id}</Text>
                          <Text type="secondary">
                            状态：{item.status || "-"} · room: {item.room_id || "-"}
                          </Text>
                        </Space>
                      </div>
                    ))
                  ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无计划数据" />
                  )}
                </Space>
              </Card>

              <Card size="small" title="最近 IAP 消息">
                <Space direction="vertical" size={10} style={{ width: "100%" }}>
                  {opsOverview.iapMessages.length ? (
                    opsOverview.iapMessages.slice(0, 6).map((item, index) => (
                      <div
                        key={`${String(item.envelope_id || item.created_at || index)}`}
                        style={{ padding: "10px 12px", borderRadius: 14, background: "#f8fafc" }}
                      >
                        <Space direction="vertical" size={4} style={{ width: "100%" }}>
                          <Text strong>{item.intent || "(无 intent)"}</Text>
                          <Text type="secondary">
                            {item.from_agent_id || "-"} → {item.to_agent_id || "-"}
                          </Text>
                          <Text type="secondary">{formatDateTime(item.created_at)}</Text>
                        </Space>
                      </div>
                    ))
                  ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无 IAP 消息" />
                  )}
                </Space>
              </Card>
            </div>
          </Space>
        )}
      </Modal>
    </div>
  );
}

