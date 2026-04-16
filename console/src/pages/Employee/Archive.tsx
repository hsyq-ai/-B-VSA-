import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button, Card, Progress, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { RefreshCw, ShieldCheck, BookOpen, BriefcaseBusiness, Sparkles, Search } from "lucide-react";
import dayjs from "dayjs";
import { agentOsApi } from "../../api/modules/agentOs";

const { Title, Text, Paragraph } = Typography;

interface MemberPortraitRow {
  key: string;
  memberName: string;
  branch: string;
  learningStatus: string;
  workStatus: string;
  styleLabel: string;
  latestTopic: string;
  updatedAt: string;
  heat: number;
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

interface ActiveMemberRow {
  user_id: string;
  name: string;
  department?: string;
}

const inferBranch = (name: string, department?: string) => {
  const dept = String(department || "").trim();
  if (dept) return /党支部/.test(dept) ? dept : `${dept}党支部`;
  const branchNames = ["第一党支部", "第二党支部", "综合党支部", "科技创新党支部"];
  const index = Math.abs(name.split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0)) % branchNames.length;
  return branchNames[index];
};

const buildPortraitsFromAudit = (records: any[], members: ActiveMemberRow[]): MemberPortraitRow[] => {
  const grouped = new Map<string, any[]>();
  records.forEach((record) => {
    const name = String(record?.source_user_name || "").trim();
    if (!name) return;
    if (!grouped.has(name)) grouped.set(name, []);
    grouped.get(name)?.push(record);
  });

  const memberByName = new Map<string, ActiveMemberRow>();
  members.forEach((member) => {
    const name = String(member?.name || "").trim();
    if (!name) return;
    if (!memberByName.has(name)) memberByName.set(name, member);
  });

  const names = members.length ? members.map((member) => String(member.name || "").trim()).filter(Boolean) : Array.from(grouped.keys());

  return names
    .map((memberName) => {
      const memberRecords = grouped.get(memberName) || [];
      const sorted = [...memberRecords].sort(
        (a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime(),
      );
      const latest = sorted[0] || {};
      const learningHits = sorted.filter((item) => /学习|党课|宣讲|专题|党章|理论|培训/.test(String(item?.detail || ""))).length;
      const workHits = sorted.filter((item) => /执行|落实|督办|项目|整改|服务|走访|协同/.test(String(item?.detail || ""))).length;
      const routedHits = sorted.filter((item) => String(item?.route_result || "") === "routed").length;
      const baseHeat = sorted.length ? 58 : 60;
      const intensity = Math.min(98, baseHeat + sorted.length * 7 + learningHits * 6 + routedHits * 5);
      const learningStatus = learningHits >= 2 ? "学习领先" : learningHits === 1 ? "持续学习" : "跟进良好";
      const workStatus = routedHits >= 2 ? "执行高效" : workHits >= 1 ? "稳步推进" : "状态平稳";
      const styleLabel =
        intensity >= 90 ? "先锋示范" : intensity >= 82 ? "担当在线" : intensity >= 72 ? "作风扎实" : "持续提升";
      const memberInfo = memberByName.get(memberName);
      return {
        key: `${memberInfo?.user_id || memberName}-${latest?.task_id || latest?.id || memberRecords.length}`,
        memberName,
        branch: inferBranch(memberName, memberInfo?.department),
        learningStatus,
        workStatus,
        styleLabel,
        latestTopic: String(latest?.detail || "暂无留痕记录，等待最新学习与工作回执"),
        updatedAt: latest?.created_at ? dayjs(latest.created_at).format("YYYY-MM-DD HH:mm:ss") : "-",
        heat: intensity,
      };
    })
    .sort((a, b) => b.heat - a.heat)
    .slice(0, 200);
};

const styleColorMap: Record<string, string> = {
  先锋示范: "success",
  担当在线: "processing",
  作风扎实: "gold",
  持续提升: "default",
};

export default function Archive() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any[]>([]);
  const [activeMembers, setActiveMembers] = useState<ActiveMemberRow[]>([]);
  const [listOnlyMode, setListOnlyMode] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const [auditRes, membersRes] = await Promise.all([
        agentOsApi.listAuditRoutes({ limit: 100 }),
        agentOsApi.listActiveUsers(),
      ]);
      const auditItems = auditRes.items || [];
      const members = (membersRes.items || []).map((item) => ({
        user_id: String(item?.user_id || ""),
        name: String(item?.name || "").trim(),
        department: String(item?.department || "").trim(),
      })).filter((item) => item.name);
      setData(auditItems);
      setActiveMembers(members);
      setListOnlyMode(!auditItems.length && members.length > 0);
      if (!members.length) {
        message.warning("暂未获取到后台真实员工名单，请先在后台完成员工激活");
      } else if (!auditItems.length) {
        message.info("已加载真实员工名单，待风貌留痕生成后将自动更新画像");
      }
    } catch (err) {
      console.error(err);
      setData([]);
      setActiveMembers([]);
      setListOnlyMode(false);
      message.warning("加载党员风貌失败，请检查后端服务");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const portraits = useMemo(() => buildPortraitsFromAudit(data, activeMembers), [data, activeMembers]);

  const stats = useMemo(() => {
    const total = portraits.length;
    const learningLeading = portraits.filter((item) => item.learningStatus === "学习领先").length;
    const workStrong = portraits.filter((item) => item.workStatus === "执行高效").length;
    const pioneer = portraits.filter((item) => item.styleLabel === "先锋示范").length;
    return { total, learningLeading, workStrong, pioneer };
  }, [portraits]);

  const observationCards = useMemo(() => portraits.slice(0, 3), [portraits]);

  const timeline = useMemo(() => {
    if (!data.length) {
      return portraits.slice(0, 6).map((item) => ({
        key: `${item.key}-timeline`,
        title: item.memberName,
        detail: item.latestTopic,
        created_at: item.updatedAt,
        route_result: "routed",
      }));
    }
    return data
      .slice()
      .sort((a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime())
      .slice(0, 6);
  }, [data, portraits]);

  const columns: ColumnsType<MemberPortraitRow> = [
    {
      title: "党员姓名",
      dataIndex: "memberName",
      key: "memberName",
      width: 120,
      render: (value: string, record) => (
        <Space direction="vertical" size={2}>
          <Text strong>{value}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.branch}
          </Text>
        </Space>
      ),
    },
    {
      title: "学习状态",
      dataIndex: "learningStatus",
      key: "learningStatus",
      width: 120,
      render: (value: string) => <Tag color={value === "学习领先" ? "success" : "processing"}>{value}</Tag>,
    },
    {
      title: "工作状态",
      dataIndex: "workStatus",
      key: "workStatus",
      width: 120,
      render: (value: string) => <Tag color={value === "执行高效" ? "red" : "blue"}>{value}</Tag>,
    },
    {
      title: "风貌热度",
      dataIndex: "heat",
      key: "heat",
      width: 180,
      render: (value: number) => <Progress percent={value} size="small" strokeColor="#b91c1c" showInfo={false} />,
    },
    {
      title: "风貌标签",
      dataIndex: "styleLabel",
      key: "styleLabel",
      width: 120,
      render: (value: string) => <Tag color={styleColorMap[value] || "default"}>{value}</Tag>,
    },
    {
      title: "最新观察",
      dataIndex: "latestTopic",
      key: "latestTopic",
      ellipsis: true,
      render: (value: string) => value || "-",
    },
    {
      title: "最近更新时间",
      dataIndex: "updatedAt",
      key: "updatedAt",
      width: 180,
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
            "radial-gradient(circle at top left, rgba(255,255,255,0.24) 0%, rgba(255,255,255,0) 40%), linear-gradient(135deg, #111827 0%, #7f1d1d 55%, #b91c1c 100%)",
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
                color: "#fee2e2",
                fontWeight: 700,
              }}
            >
              书记驾驶舱 · 党员风貌
            </Tag>
            <div>
              <Title level={2} style={{ margin: 0, color: "#fff7ed" }}>
                党员风貌
              </Title>
              <Paragraph style={{ margin: "12px 0 0", color: "rgba(255,245,245,0.86)", lineHeight: 1.9, fontSize: 15 }}>
                通过学习轨迹、执行回执和最新事项，呈现党员近期学习状态、工作状态与作风画像，用于书记侧一屏了解先锋带动、持续跟进和需要重点关注的人员风貌。
              </Paragraph>
            </div>
            <Space size={[8, 8]} wrap>
              <Tag color="gold" style={{ borderRadius: 999, paddingInline: 10 }}>学习状态</Tag>
              <Tag color="blue" style={{ borderRadius: 999, paddingInline: 10 }}>工作状态</Tag>
              <Tag color="purple" style={{ borderRadius: 999, paddingInline: 10 }}>先锋画像</Tag>
              {listOnlyMode ? <Tag color="default" style={{ borderRadius: 999, paddingInline: 10 }}>当前为实名名单展示</Tag> : null}
            </Space>
          </Space>
          <Space>
            <Button icon={<RefreshCw size={16} />} onClick={() => void reload()} loading={loading}>
              同步风貌
            </Button>
            <Button icon={<Sparkles size={16} />} onClick={() => message.success("已准备生成党员风貌纪实材料")}>生成风貌纪实</Button>
          </Space>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        <StatCard title="在册风貌画像" value={stats.total} icon={<ShieldCheck size={20} />} color="#b91c1c" description="展示当前可观测的党员画像数量。" />
        <StatCard title="学习领先" value={stats.learningLeading} icon={<BookOpen size={20} />} color="#2563eb" description="近期在学习专题、理论研读方面表现突出的党员。" />
        <StatCard title="执行高效" value={stats.workStrong} icon={<BriefcaseBusiness size={20} />} color="#0f766e" description="在工作推进、事项闭环和责任落实方面稳定在线。" />
        <StatCard title="先锋示范" value={stats.pioneer} icon={<Sparkles size={20} />} color="#7c3aed" description="兼具学习深度与工作担当的示范型党员。" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        {observationCards.map((item, index) => (
          <Card
            key={item.key}
            bordered={false}
            styles={{ body: { padding: 22 } }}
            style={{
              borderRadius: 24,
              border: "1px solid rgba(226,232,240,0.9)",
              background: index === 0 ? "linear-gradient(145deg, #fff7ed 0%, #ffffff 100%)" : "linear-gradient(145deg, #ffffff 0%, #f8fafc 100%)",
              boxShadow: "0 16px 32px rgba(15,23,42,0.06)",
            }}
          >
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              <Space align="center" style={{ justifyContent: "space-between", width: "100%" }}>
                <div>
                  <Text strong style={{ fontSize: 16, color: "#0f172a" }}>{item.memberName}</Text>
                  <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 4 }}>{item.branch}</div>
                </div>
                <Tag color={styleColorMap[item.styleLabel] || "default"}>{item.styleLabel}</Tag>
              </Space>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Card size="small" bordered={false} style={{ borderRadius: 16, background: "#eff6ff" }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>学习状态</Text>
                  <div style={{ fontWeight: 700, color: "#1d4ed8", marginTop: 6 }}>{item.learningStatus}</div>
                </Card>
                <Card size="small" bordered={false} style={{ borderRadius: 16, background: "#ecfeff" }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>工作状态</Text>
                  <div style={{ fontWeight: 700, color: "#0f766e", marginTop: 6 }}>{item.workStatus}</div>
                </Card>
              </div>
              <Progress percent={item.heat} size="small" strokeColor="#b91c1c" showInfo={false} />
              <Paragraph style={{ margin: 0, color: "#475569", lineHeight: 1.8 }}>{item.latestTopic}</Paragraph>
              <Text style={{ color: "#94a3b8", fontSize: 12 }}>最近更新时间：{item.updatedAt}</Text>
            </Space>
          </Card>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 1.45fr) minmax(320px, 1fr)", gap: 16 }}>
        <Card
          title={
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Search size={16} />
              党员风貌总览
            </div>
          }
          bordered={false}
          style={{ borderRadius: 24, boxShadow: "0 14px 28px rgba(15,23,42,0.05)" }}
        >
          <Table<MemberPortraitRow>
            columns={columns}
            dataSource={portraits}
            loading={loading}
            rowKey="key"
            pagination={{ pageSize: 6, hideOnSinglePage: true }}
            locale={{ emptyText: "暂无党员风貌数据" }}
          />
        </Card>

        <Card
          title={
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ShieldCheck size={16} />
              风貌纪实流
            </div>
          }
          bordered={false}
          style={{ borderRadius: 24, boxShadow: "0 14px 28px rgba(15,23,42,0.05)" }}
        >
          <Space direction="vertical" size={14} style={{ width: "100%" }}>
            {timeline.map((item) => (
              <Card
                key={String(item?.key || item?.task_id || item?.id || Math.random())}
                size="small"
                bordered={false}
                style={{ borderRadius: 18, background: "#f8fafc" }}
              >
                <Space direction="vertical" size={6} style={{ width: "100%" }}>
                  <Space align="center" style={{ justifyContent: "space-between", width: "100%" }}>
                    <Text strong>{String(item?.title || item?.source_user_name || "党员纪实")}</Text>
                    <Tag color={String(item?.route_result || "") === "routed" ? "success" : "processing"}>
                      {String(item?.route_result || "") === "routed" ? "已留痕" : "跟进中"}
                    </Tag>
                  </Space>
                  <Paragraph style={{ margin: 0, color: "#475569", lineHeight: 1.7 }}>
                    {String(item?.detail || item?.latestTopic || "围绕当前学习与工作状态形成纪实记录")}
                  </Paragraph>
                  <Text style={{ color: "#94a3b8", fontSize: 12 }}>{dayjs(item?.created_at || item?.updatedAt).format("YYYY-MM-DD HH:mm:ss")}</Text>
                </Space>
              </Card>
            ))}
          </Space>
        </Card>
      </div>
    </Space>
  );
}
