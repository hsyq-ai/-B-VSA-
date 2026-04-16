import { useEffect, useMemo, useState } from "react";
import { Button, Card, Input, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import api from "../../api";
import type {
  PlatformLearningSchedulerStatus,
  PlatformRuntimeSkill,
  PlatformSkillAuditLog,
  SandboxContainerInfo,
} from "../../api/types";

const { Title, Paragraph, Text } = Typography;

const formatTs = (ts: number): string => {
  if (!ts) return "-";
  return new Date(ts * 1000).toLocaleString();
};

export default function PlatformLearningPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PlatformRuntimeSkill[]>([]);
  const [selected, setSelected] = useState<PlatformRuntimeSkill | null>(null);
  const [audits, setAudits] = useState<PlatformSkillAuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [department, setDepartment] = useState("");
  const [acting, setActing] = useState(false);
  const [scheduler, setScheduler] = useState<PlatformLearningSchedulerStatus | null>(null);
  const [schedulerLoading, setSchedulerLoading] = useState(false);
  const [sandboxItems, setSandboxItems] = useState<SandboxContainerInfo[]>([]);
  const [sandboxLoading, setSandboxLoading] = useState(false);
  const [selectedSandbox, setSelectedSandbox] = useState<SandboxContainerInfo | null>(null);

  const loadScheduler = async () => {
    setSchedulerLoading(true);
    try {
      const status = await api.getSchedulerStatus();
      setScheduler(status || null);
    } catch (err) {
      console.error(err);
      message.error("加载调度器状态失败");
    } finally {
      setSchedulerLoading(false);
    }
  };

  const loadSandboxes = async () => {
    setSandboxLoading(true);
    try {
      const res = await api.getSandboxOverview();
      const items: SandboxContainerInfo[] = Array.isArray(res?.items) ? res.items : [];
      setSandboxItems(items);
      if (!selectedSandbox || !items.some((x) => x.container_id === selectedSandbox.container_id)) {
        setSelectedSandbox(items.length > 0 ? items[0] : null);
      }
    } catch (err) {
      console.error(err);
      message.error("加载沙箱日志失败");
    } finally {
      setSandboxLoading(false);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const [res] = await Promise.all([
        api.listRuntimeSkills({
          department: department.trim(),
          limit: 300,
        }),
        loadScheduler(),
        loadSandboxes(),
      ]);
      const items = Array.isArray(res?.items) ? res.items : [];
      setData(items);
      if (!selected || !items.some((x) => x.id === selected.id)) {
        setSelected(items.length > 0 ? items[0] : null);
      }
    } catch (err) {
      console.error(err);
      message.error("加载平台学习数据失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const loadAudits = async (skillId: string) => {
    if (!skillId) {
      setAudits([]);
      return;
    }
    setAuditLoading(true);
    try {
      const res = await api.listAuditLogs({ skillId, limit: 100 });
      setAudits(Array.isArray(res?.items) ? res.items : []);
    } catch (err) {
      console.error(err);
      message.error("加载审计日志失败");
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => {
    if (!selected?.id) {
      setAudits([]);
      return;
    }
    void loadAudits(selected.id);
  }, [selected?.id]);

  const columns: ColumnsType<PlatformRuntimeSkill> = useMemo(
    () => [
      {
        title: "技能名",
        dataIndex: "name",
        key: "name",
        ellipsis: true,
      },
      {
        title: "部门",
        dataIndex: "department",
        key: "department",
        width: 120,
        render: (value: string) => value || "未标注",
      },
      {
        title: "状态",
        dataIndex: "status",
        key: "status",
        width: 120,
        render: (value: string) => <Tag>{value || "candidate"}</Tag>,
      },
      {
        title: "更新时间",
        dataIndex: "updated_at",
        key: "updated_at",
        width: 180,
        render: (value: number) => formatTs(value),
      },
    ],
    [],
  );

  const mutateStatus = async (skillId: string, status: string) => {
    setActing(true);
    try {
      await api.updateRuntimeSkillStatus(skillId, status);
      message.success(`状态已更新为 ${status}`);
      await load();
      if (selected?.id) {
        const fresh = (await api.listRuntimeSkills({ limit: 300 })).items || [];
        const target = fresh.find((x) => x.id === selected.id) || null;
        setSelected(target);
        if (target?.id) {
          await loadAudits(target.id);
        }
      }
    } catch (err) {
      console.error(err);
      message.error("状态更新失败");
    } finally {
      setActing(false);
    }
  };

  const publishSkill = async (skillId: string) => {
    setActing(true);
    try {
      await api.publishRuntimeSkill(skillId);
      message.success("已发布到 PromptTemplate");
      await load();
      if (selected?.id) {
        const fresh = (await api.listRuntimeSkills({ limit: 300 })).items || [];
        const target = fresh.find((x) => x.id === selected.id) || null;
        setSelected(target);
        if (target?.id) {
          await loadAudits(target.id);
        }
      }
    } catch (err) {
      console.error(err);
      message.error("发布失败");
    } finally {
      setActing(false);
    }
  };

  const reEvolveSkill = async (skillId: string) => {
    setActing(true);
    try {
      await api.reEvolveRuntimeSkill(skillId);
      message.success("已按来源会话重新演化");
      await load();
      if (selected?.id) {
        const fresh = (await api.listRuntimeSkills({ limit: 300 })).items || [];
        const target = fresh.find((x) => x.id === selected.id) || null;
        setSelected(target);
        if (target?.id) {
          await loadAudits(target.id);
        }
      }
    } catch (err) {
      console.error(err);
      message.error("重新演化失败");
    } finally {
      setActing(false);
    }
  };

  const auditColumns: ColumnsType<PlatformSkillAuditLog> = useMemo(
    () => [
      {
        title: "时间",
        dataIndex: "ts",
        key: "ts",
        width: 170,
        render: (value: number) => formatTs(value),
      },
      {
        title: "动作",
        dataIndex: "action",
        key: "action",
        width: 180,
      },
      {
        title: "状态",
        key: "status",
        width: 170,
        render: (_: unknown, row: PlatformSkillAuditLog) =>
          `${row.status_from || "-"} -> ${row.status_to || "-"}`,
      },
      {
        title: "执行人",
        key: "actor",
        width: 140,
        render: (_: unknown, row: PlatformSkillAuditLog) =>
          row.actor_name || row.actor_user_id || "system",
      },
      {
        title: "备注",
        dataIndex: "note",
        key: "note",
        ellipsis: true,
      },
    ],
    [],
  );

  const sandboxColumns: ColumnsType<SandboxContainerInfo> = useMemo(
    () => [
      {
        title: "容器",
        key: "name",
        dataIndex: "name",
        ellipsis: true,
      },
      {
        title: "角色",
        key: "role",
        width: 100,
        render: (_: unknown, row: SandboxContainerInfo) =>
          row.role === "so" ? <Tag color="blue">SO</Tag> : <Tag color="green">员工</Tag>,
      },
      {
        title: "用户",
        key: "user_id",
        width: 110,
        render: (_: unknown, row: SandboxContainerInfo) => row.user_id || "-",
      },
      {
        title: "状态",
        key: "status",
        width: 120,
        render: (_: unknown, row: SandboxContainerInfo) => (
          <Tag color={row.running ? "success" : "default"}>{row.status || "unknown"}</Tag>
        ),
      },
      {
        title: "端口",
        key: "ports",
        width: 160,
        render: (_: unknown, row: SandboxContainerInfo) =>
          row.ports && row.ports.length > 0 ? row.ports.join(", ") : "-",
      },
      {
        title: "最近活跃",
        key: "last_active",
        width: 180,
        render: (_: unknown, row: SandboxContainerInfo) =>
          row.last_active?.timestamp ? formatTs(row.last_active.timestamp) : "-",
      },
    ],
    [],
  );

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card>
        <Title level={3} style={{ margin: 0 }}>
          平台学习中心
        </Title>
        <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
          展示会话后自动沉淀的候选技能，支持审批发布、驳回和按来源会话重新演化。
        </Paragraph>
      </Card>

      <Card
        title="异步调度状态"
        extra={
          <Button size="small" onClick={() => void loadScheduler()} loading={schedulerLoading}>
            刷新状态
          </Button>
        }
      >
        {!scheduler ? (
          <Text type="secondary">暂无状态数据</Text>
        ) : (
          <Space direction="vertical" size={4}>
            <Text type="secondary">
              运行状态：{scheduler.running ? "运行中" : "未运行"} | pending: {scheduler.pending_count} |
              running: {scheduler.running_count}
            </Text>
            <Text type="secondary">
              入队: {scheduler.total_enqueued}，去重: {scheduler.total_deduped}，重试:{" "}
              {scheduler.total_retried}，失败: {scheduler.total_failed}，丢弃: {scheduler.total_dropped}
            </Text>
            <Text type="secondary">
              下一次触发:{" "}
              {scheduler.next_due_in_seconds == null
                ? "-"
                : `${Math.max(0, Math.round(scheduler.next_due_in_seconds))} 秒后`}
            </Text>
          </Space>
          )}
      </Card>

      <Card
        title="沙箱运行面板"
        extra={
          <Button size="small" onClick={() => void loadSandboxes()} loading={sandboxLoading}>
            刷新状态
          </Button>
        }
      >
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <Text type="secondary">
            员工登录后会自动拉起对应沙箱，档案、记忆、自进化资料都在容器挂载目录中按用户隔离保存。
          </Text>
          <Table<SandboxContainerInfo>
            rowKey="container_id"
            loading={sandboxLoading}
            columns={sandboxColumns}
            dataSource={sandboxItems}
            pagination={{ pageSize: 6, hideOnSinglePage: true }}
            onRow={(record) => ({
              onClick: () => setSelectedSandbox(record),
            })}
          />
          {!selectedSandbox ? (
            <Text type="secondary">请选择一个容器查看最近日志。</Text>
          ) : (
            <Space direction="vertical" size={8} style={{ width: "100%" }}>
              <Text strong>
                {selectedSandbox.name} {selectedSandbox.role === "so" ? "(SO)" : `(用户 ${selectedSandbox.user_id})`}
              </Text>
              <Text type="secondary">
                容器状态：{selectedSandbox.status || "-"} | health: {selectedSandbox.health || "-"} | 启动时间：{selectedSandbox.started_at || "-"}
              </Text>
              <Text type="secondary">
                最近活动：{selectedSandbox.last_active?.timestamp ? formatTs(selectedSandbox.last_active.timestamp) : "-"}
              </Text>
              <Text type="secondary">
                工作目录：{selectedSandbox.working_dir || "-"}
              </Text>
              <Card size="small" title="最近日志（Tail 40）">
                <Paragraph style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>
                  {selectedSandbox.logs_tail || "暂无日志"}
                </Paragraph>
              </Card>
            </Space>
          )}
        </Space>
      </Card>

      <Card>
        <Space>
          <Input
            placeholder="按部门过滤，例如：科研部"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            style={{ width: 220 }}
            allowClear
          />
          <Button type="primary" onClick={() => void load()} loading={loading}>
            查询
          </Button>
          <Button onClick={() => {
            setDepartment("");
            void load();
          }}>
            重置
          </Button>
        </Space>
      </Card>

      <Space align="start" size={16} style={{ width: "100%" }}>
        <Card title="候选技能列表" style={{ flex: 1 }}>
          <Table<PlatformRuntimeSkill>
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={data}
            pagination={{ pageSize: 10, hideOnSinglePage: true }}
            onRow={(record) => ({
              onClick: () => setSelected(record),
            })}
          />
        </Card>

        <Card title="技能详情" style={{ width: 480 }}>
          {!selected ? (
            <Text type="secondary">请选择左侧技能查看详情。</Text>
          ) : (
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              <Text strong>{selected.name}</Text>
              <Text type="secondary">描述：{selected.description || "无"}</Text>
              <Text type="secondary">部门：{selected.department || "未标注"}</Text>
              <Text type="secondary">来源会话：{selected.source_chat_id || "-"}</Text>
              <Text type="secondary">来源 session：{selected.source_session_id || "-"}</Text>
              <Text type="secondary">发布触发键：{selected.published_trigger_key || "-"}</Text>
              <Text type="secondary">更新时间：{formatTs(selected.updated_at)}</Text>
              <Space>
                <Button
                  type="primary"
                  loading={acting}
                  onClick={() => void publishSkill(selected.id)}
                >
                  发布到 PromptTemplate
                </Button>
                <Button
                  loading={acting}
                  onClick={() => void reEvolveSkill(selected.id)}
                  disabled={!selected.source_chat_id && !selected.source_session_id}
                >
                  按来源会话重新演化
                </Button>
                <Button
                  loading={acting}
                  onClick={() => void mutateStatus(selected.id, "candidate")}
                >
                  设为候选
                </Button>
                <Button
                  danger
                  loading={acting}
                  onClick={() => void mutateStatus(selected.id, "rejected")}
                >
                  驳回
                </Button>
              </Space>
              <Card size="small" title="内容预览">
                <Paragraph style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>
                  {selected.content || "无"}
                </Paragraph>
              </Card>
              <Card
                size="small"
                title="审计日志（当前技能）"
                extra={
                  <Button
                    size="small"
                    onClick={() => void loadAudits(selected.id)}
                    loading={auditLoading}
                  >
                    刷新
                  </Button>
                }
              >
                <Table<PlatformSkillAuditLog>
                  rowKey="id"
                  loading={auditLoading}
                  size="small"
                  columns={auditColumns}
                  dataSource={audits}
                  pagination={{ pageSize: 5, hideOnSinglePage: true }}
                />
              </Card>
            </Space>
          )}
        </Card>
      </Space>
    </Space>
  );
}
