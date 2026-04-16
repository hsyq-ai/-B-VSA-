import {
  ArrowRight,
  Calendar,
  CalendarClock,
  CheckCircle2,
  MapPin,
  Plus,
  Sparkles,
  Target,
  Trophy,
  Users,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import {
  Badge,
  Button,
  Card,
  Col,
  Empty,
  List,
  Row,
  Space,
  Tag,
  Typography,
  message,
} from "antd";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";

const { Paragraph, Text, Title } = Typography;

type ActivityType = "主题党日" | "志愿服务" | "理论学习" | "文体活动" | "组织生活会";

interface ActivityItem {
  id: string;
  title: string;
  type: ActivityType;
  status: "报名中" | "进行中" | "已结束";
  location: string;
  date: string;
  time: string;
  organizer: string;
  participants: number;
  maxParticipants: number;
  description: string;
  score: number;
}

interface ParticipationRecord {
  id: string;
  activityId: string;
  activityTitle: string;
  participationType: "已报名" | "已参加" | "已签到" | "已评价";
  date: string;
  feedback?: string;
  score: number;
}

function StatCard({
  title,
  value,
  description,
  accent,
  icon,
}: {
  title: string;
  value: string | number;
  description: string;
  accent: string;
  icon: ReactNode;
}) {
  return (
    <Card
      bordered={false}
      styles={{ body: { padding: 20 } }}
      style={{
        height: "100%",
        borderRadius: 24,
        border: "1px solid rgba(127,29,29,0.08)",
        background: "linear-gradient(180deg, #fffdfc 0%, #fff7f2 100%)",
        boxShadow: "0 16px 36px rgba(127,29,29,0.08)",
      }}
    >
      <Space direction="vertical" size={14} style={{ width: "100%" }}>
        <div
          style={{
            width: 50,
            height: 50,
            borderRadius: 16,
            background: `${accent}14`,
            color: accent,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon}
        </div>
        <div>
          <Text style={{ color: "#7f1d1d", fontWeight: 700, fontSize: 13 }}>{title}</Text>
          <div style={{ marginTop: 8, fontSize: 28, fontWeight: 800, color: "#1f2937", lineHeight: 1.1 }}>{value}</div>
          <Text style={{ display: "block", marginTop: 6, color: "#7c6f67", fontSize: 12, lineHeight: 1.7 }}>{description}</Text>
        </div>
      </Space>
    </Card>
  );
}

function QuickCard({
  title,
  description,
  accent,
  icon,
  onClick,
}: {
  title: string;
  description: string;
  accent: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <Card
      hoverable
      bordered={false}
      onClick={onClick}
      styles={{ body: { padding: 18 } }}
      style={{
        height: "100%",
        borderRadius: 20,
        border: "1px solid rgba(127,29,29,0.08)",
        background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(255,250,248,0.98) 100%)",
        boxShadow: "0 14px 30px rgba(127,29,29,0.06)",
      }}
    >
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            background: `${accent}14`,
            color: accent,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon}
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1f2937" }}>{title}</div>
          <Text style={{ color: "#7c6f67", fontSize: 12, lineHeight: 1.8 }}>{description}</Text>
        </div>
      </Space>
    </Card>
  );
}

const sectionCardStyle = {
  borderRadius: 24,
  border: "1px solid rgba(127,29,29,0.08)",
  boxShadow: "0 18px 40px rgba(127,29,29,0.07)",
  background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(255,250,248,0.98) 100%)",
} as const;

const panelStyle = {
  borderRadius: 18,
  border: "1px solid rgba(127,29,29,0.08)",
  background: "linear-gradient(180deg, rgba(255,248,246,0.96) 0%, rgba(255,255,255,0.98) 100%)",
} as const;

const activities: ActivityItem[] = [
  {
    id: "a1",
    title: "四月清明祭英烈主题党日活动",
    type: "主题党日",
    status: "报名中",
    location: "烈士陵园",
    date: "2026-04-05",
    time: "09:00-12:00",
    organizer: "第一党支部",
    participants: 24,
    maxParticipants: 30,
    description: "清明祭扫英烈，传承红色基因，加强爱国主义教育。",
    score: 20,
  },
  {
    id: "a2",
    title: "社区环境卫生整治志愿服务",
    type: "志愿服务",
    status: "进行中",
    location: "阳光社区",
    date: "2026-04-12",
    time: "14:00-17:00",
    organizer: "志愿服务队",
    participants: 18,
    maxParticipants: 25,
    description: "参与社区卫生环境整治，服务社区居民。",
    score: 15,
  },
  {
    id: "a3",
    title: "党的二十大精神专题学习会",
    type: "理论学习",
    status: "报名中",
    location: "党员活动室",
    date: "2026-04-08",
    time: "15:00-17:00",
    organizer: "理论学习中心组",
    participants: 32,
    maxParticipants: 40,
    description: "专题学习党的二十大精神，加强理论武装。",
    score: 10,
  },
  {
    id: "a4",
    title: "春季职工运动会",
    type: "文体活动",
    status: "已结束",
    location: "体育馆",
    date: "2026-03-28",
    time: "08:30-17:00",
    organizer: "工会委员会",
    participants: 56,
    maxParticipants: 60,
    description: "促进职工身心健康，增强团队凝聚力。",
    score: 15,
  },
  {
    id: "a5",
    title: "第一季度组织生活会",
    type: "组织生活会",
    status: "已结束",
    location: "党员活动室",
    date: "2026-03-25",
    time: "14:00-16:30",
    organizer: "党支部委员会",
    participants: 28,
    maxParticipants: 30,
    description: "开展批评与自我批评，加强党员作风建设。",
    score: 25,
  },
];

const participationRecords: ParticipationRecord[] = [
  {
    id: "p1",
    activityId: "a4",
    activityTitle: "春季职工运动会",
    participationType: "已报名",
    date: "2026-03-28",
    score: 15,
  },
  {
    id: "p2",
    activityId: "a5",
    activityTitle: "第一季度组织生活会",
    participationType: "已参加",
    date: "2026-03-25",
    feedback: "会议富有成效，党员间的批评与自我批评很深刻。",
    score: 25,
  },
  {
    id: "p3",
    activityId: "a1",
    activityTitle: "三月主题党日活动",
    participationType: "已签到",
    date: "2026-03-15",
    feedback: "活动意义重大，深受教育。",
    score: 20,
  },
];

const typePalette: Record<ActivityType, { color: string; bg: string }> = {
  主题党日: { color: "#b91c1c", bg: "#fef2f2" },
  志愿服务: { color: "#166534", bg: "#dcfce7" },
  理论学习: { color: "#9a3412", bg: "#fff7ed" },
  文体活动: { color: "#c2410c", bg: "#fffbeb" },
  组织生活会: { color: "#7f1d1d", bg: "#fff7f0" },
};

const statusPalette: Record<ActivityItem["status"], { color: string; bg: string }> = {
  报名中: { color: "#b91c1c", bg: "#fef2f2" },
  进行中: { color: "#c2410c", bg: "#fff7ed" },
  已结束: { color: "#57534e", bg: "#f5f5f4" },
};

const participationPalette: Record<ParticipationRecord["participationType"], { color: string; bg: string }> = {
  已报名: { color: "#b91c1c", bg: "#fef2f2" },
  已参加: { color: "#166534", bg: "#dcfce7" },
  已签到: { color: "#c2410c", bg: "#fff7ed" },
  已评价: { color: "#7f1d1d", bg: "#fff7f0" },
};

const activityIcon = (type: ActivityType) => {
  switch (type) {
    case "主题党日":
      return <Trophy size={18} />;
    case "志愿服务":
      return <Users size={18} />;
    case "理论学习":
      return <Target size={18} />;
    case "文体活动":
      return <Sparkles size={18} />;
    case "组织生活会":
      return <CheckCircle2 size={18} />;
    default:
      return <Calendar size={18} />;
  }
};

export default function MemberActivityPage() {
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState<ActivityType | "全部">("全部");
  const [joiningActivity, setJoiningActivity] = useState<string | null>(null);

  const stats = useMemo(() => {
    return {
      upcoming: activities.filter((item) => item.status === "报名中" || item.status === "进行中").length,
      participated: participationRecords.filter((item) => item.participationType === "已参加" || item.participationType === "已签到").length,
      totalScore: participationRecords.reduce((sum, item) => sum + item.score, 0),
      monthlyActivities: 3,
    };
  }, []);

  const filteredActivities = useMemo(() => {
    if (activeFilter === "全部") return activities;
    return activities.filter((item) => item.type === activeFilter);
  }, [activeFilter]);

  const availableActivities = useMemo(() => {
    return filteredActivities.filter((item) => item.status === "报名中" || item.status === "进行中");
  }, [filteredActivities]);

  const nextActivity = useMemo(() => {
    return [...activities]
      .filter((item) => item.status !== "已结束")
      .sort((a, b) => dayjs(a.date).valueOf() - dayjs(b.date).valueOf())[0];
  }, []);

  const filterButtons: Array<{ key: ActivityType | "全部"; label: string; count: number }> = [
    { key: "全部", label: "全部活动", count: activities.length },
    { key: "主题党日", label: "主题党日", count: activities.filter((item) => item.type === "主题党日").length },
    { key: "志愿服务", label: "志愿服务", count: activities.filter((item) => item.type === "志愿服务").length },
    { key: "理论学习", label: "理论学习", count: activities.filter((item) => item.type === "理论学习").length },
  ];

  const handleJoinActivity = (activityId: string) => {
    setJoiningActivity(activityId);
    setTimeout(() => {
      message.success("报名成功，请留意活动通知");
      setJoiningActivity(null);
    }, 800);
  };

  const handleViewDetails = (activityId: string) => {
    message.info(`已打开活动详情：${activityId}`);
  };

  return (
    <Space className="lux-shell" direction="vertical" size={24} style={{ width: "100%", padding: 4 }}>
      <Card
        bordered={false}
        styles={{ body: { padding: 28 } }}
        style={{
          borderRadius: 28,
          overflow: "hidden",
          background:
            "radial-gradient(circle at top right, rgba(251,191,36,0.18) 0%, rgba(251,191,36,0) 28%), linear-gradient(135deg, #7f1d1d 0%, #991b1b 42%, #b91c1c 100%)",
          boxShadow: "0 28px 60px rgba(127,29,29,0.22)",
        }}
      >
        <Row gutter={[24, 24]} align="middle">
          <Col xs={24} lg={15}>
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
              <Tag
                bordered={false}
                style={{
                  width: "fit-content",
                  marginInlineEnd: 0,
                  borderRadius: 999,
                  padding: "6px 12px",
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#7f1d1d",
                  background: "rgba(255,245,240,0.92)",
                }}
              >
                组织协同 · 参与活动
              </Tag>
              <div>
                <Title level={2} style={{ margin: 0, color: "#fff7ed" }}>
                  活动报名、参与记录、组织协同一屏整合
                </Title>
                <Paragraph style={{ margin: "12px 0 0", color: "rgba(255,245,240,0.86)", fontSize: 14, lineHeight: 1.85 }}>
                  将主题党日、志愿服务、理论学习和组织生活会集中呈现，突出可报名活动、近期安排和个人参与贡献，让党员更清晰地完成组织协同步骤。
                </Paragraph>
              </div>
              <Space size={12} wrap>
                <Button
                  type="primary"
                  size="large"
                  icon={<ArrowRight size={16} />}
                  onClick={() => (nextActivity ? handleJoinActivity(nextActivity.id) : navigate("/app/member/affairs"))}
                  style={{
                    borderRadius: 14,
                    height: 44,
                    background: "#fff7ed",
                    color: "#7f1d1d",
                    borderColor: "#fff7ed",
                    fontWeight: 700,
                  }}
                >
                  立即参与近期活动
                </Button>
                <Button
                  size="large"
                  onClick={() => navigate("/app/member/affairs")}
                  style={{
                    borderRadius: 14,
                    height: 44,
                    color: "#fff7ed",
                    borderColor: "rgba(255,245,240,0.45)",
                    background: "rgba(255,255,255,0.06)",
                  }}
                >
                  打开我的事务
                </Button>
              </Space>
            </Space>
          </Col>
          <Col xs={24} lg={9}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
              {[
                { label: "近期活动", value: `${stats.upcoming} 场` },
                { label: "本月参与", value: `${stats.monthlyActivities} 次` },
                { label: "累计贡献", value: `${stats.participated} 项` },
                { label: "活动积分", value: `${stats.totalScore} 分` },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    borderRadius: 20,
                    padding: "16px 18px",
                    background: "rgba(255,248,246,0.12)",
                    border: "1px solid rgba(255,240,230,0.18)",
                    backdropFilter: "blur(10px)",
                  }}
                >
                  <Text style={{ display: "block", color: "rgba(255,245,240,0.74)", fontSize: 12 }}>{item.label}</Text>
                  <Text style={{ display: "block", marginTop: 6, color: "#ffffff", fontWeight: 800, fontSize: 24 }}>{item.value}</Text>
                </div>
              ))}
            </div>
          </Col>
        </Row>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="进行中活动" value={stats.upcoming} description="当前可报名或正在开展的组织活动。" accent="#b91c1c" icon={<Calendar size={24} />} />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="已参与事项" value={stats.participated} description="已签到或已参加的组织协同记录。" accent="#166534" icon={<Users size={24} />} />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="活动积分" value={stats.totalScore} description="参与活动带来的积分累计与贡献值。" accent="#c2410c" icon={<Trophy size={24} />} />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="活动申请" value="开放中" description="可通过我的事务提交报名、协同和活动申请。" accent="#9a3412" icon={<Plus size={24} />} />
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={15}>
          <Card bordered={false} style={sectionCardStyle} styles={{ body: { padding: 24 } }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#1f2937" }}>可报名活动</div>
                <Text style={{ color: "#7c6f67", fontSize: 12 }}>按活动类型快速筛选，直接完成报名动作</Text>
              </div>
              <Space wrap size={10}>
                {filterButtons.map((item) => (
                  <Button
                    key={item.key}
                    type={activeFilter === item.key ? "primary" : "default"}
                    danger={activeFilter === item.key}
                    onClick={() => setActiveFilter(item.key)}
                    style={{ borderRadius: 999 }}
                  >
                    {item.label}（{item.count}）
                  </Button>
                ))}
              </Space>
            </div>

            <List
              dataSource={availableActivities}
              locale={{ emptyText: <Empty description="当前暂无可报名活动" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
              renderItem={(item) => {
                const typeStyle = typePalette[item.type];
                const statusStyle = statusPalette[item.status];
                const isJoining = joiningActivity === item.id;
                const isFull = item.participants >= item.maxParticipants;
                return (
                  <List.Item style={{ padding: 0, border: "none", marginBottom: 14 }}>
                    <div style={{ width: "100%", padding: 18, borderRadius: 20, border: "1px solid rgba(127,29,29,0.08)", background: "#fffdfc" }}>
                      <Row gutter={[16, 16]} align="middle">
                        <Col xs={24} md={15}>
                          <Space align="start" size={14}>
                            <div
                              style={{
                                width: 48,
                                height: 48,
                                borderRadius: 16,
                                background: `${typeStyle.color}14`,
                                color: typeStyle.color,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                              }}
                            >
                              {activityIcon(item.type)}
                            </div>
                            <div>
                              <Space size={[8, 8]} wrap>
                                <Text strong style={{ fontSize: 16, color: "#1f2937" }}>{item.title}</Text>
                                <Tag bordered={false} style={{ borderRadius: 999, background: typeStyle.bg, color: typeStyle.color, marginInlineEnd: 0 }}>
                                  {item.type}
                                </Tag>
                                <Tag bordered={false} style={{ borderRadius: 999, background: statusStyle.bg, color: statusStyle.color, marginInlineEnd: 0, fontWeight: 700 }}>
                                  {item.status}
                                </Tag>
                              </Space>
                              <Space size={[14, 8]} wrap style={{ marginTop: 10 }}>
                                <Text style={{ color: "#7c6f67", fontSize: 13 }}><MapPin size={12} style={{ marginRight: 4 }} />{item.location}</Text>
                                <Text style={{ color: "#7c6f67", fontSize: 13 }}>{item.date} {item.time}</Text>
                                <Text style={{ color: "#7c6f67", fontSize: 13 }}>组织方：{item.organizer}</Text>
                                <Text style={{ color: "#b91c1c", fontSize: 13 }}>名额：{item.participants}/{item.maxParticipants}</Text>
                              </Space>
                              <Paragraph style={{ margin: "10px 0 0", color: "#7c6f67", lineHeight: 1.8 }}>{item.description}</Paragraph>
                            </div>
                          </Space>
                        </Col>
                        <Col xs={24} md={9}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                            <Tag bordered={false} style={{ borderRadius: 999, background: "#fff7ed", color: "#c2410c", marginInlineEnd: 0, fontWeight: 700 }}>
                              参与可得 {item.score} 分
                            </Tag>
                            <Space>
                              <Button type="primary" danger disabled={isFull} loading={isJoining} onClick={() => handleJoinActivity(item.id)}>
                                {isFull ? "名额已满" : "立即报名"}
                              </Button>
                              <Button onClick={() => handleViewDetails(item.id)}>查看详情</Button>
                            </Space>
                          </div>
                        </Col>
                      </Row>
                    </div>
                  </List.Item>
                );
              }}
            />
          </Card>
        </Col>

        <Col xs={24} xl={9}>
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Card bordered={false} style={sectionCardStyle} styles={{ body: { padding: 22 } }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#1f2937" }}>近期活动提醒</div>
              <div style={{ ...panelStyle, padding: 16, marginTop: 16 }}>
                <Text style={{ color: "#7f1d1d", fontWeight: 700, fontSize: 12 }}>优先参与</Text>
                <Title level={4} style={{ margin: "8px 0 0", color: "#1f2937" }}>{nextActivity?.title || "暂无待参与活动"}</Title>
                <Paragraph style={{ margin: "10px 0 0", color: "#7c6f67", lineHeight: 1.8 }}>
                  {nextActivity
                    ? `建议优先安排 ${dayjs(nextActivity.date).format("MM 月 DD 日")} 的活动参与，并提前确认签到、行程和协同事项。`
                    : "当前暂无活动安排，可关注支部后续通知。"}
                </Paragraph>
                <Space size={[8, 8]} wrap>
                  <Tag bordered={false} style={{ borderRadius: 999, background: "#fef2f2", color: "#b91c1c", marginInlineEnd: 0 }}>
                    {nextActivity?.date || "待安排"}
                  </Tag>
                  <Tag bordered={false} style={{ borderRadius: 999, background: "#fff7ed", color: "#c2410c", marginInlineEnd: 0 }}>
                    {nextActivity?.location || "待定地点"}
                  </Tag>
                </Space>
              </div>
            </Card>

            <Card bordered={false} style={sectionCardStyle} styles={{ body: { padding: 22 } }}>
              <Space direction="vertical" size={14} style={{ width: "100%" }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#1f2937" }}>协同建议</div>
                  <Text style={{ color: "#7c6f67", fontSize: 12 }}>围绕报名、签到、反馈形成参与闭环</Text>
                </div>
                {[
                  { title: "先报先排期", desc: "对近期主题党日和理论学习活动建议提前报名，便于统一安排时间。", accent: "#b91c1c", icon: <CalendarClock size={16} /> },
                  { title: "完成签到反馈", desc: "参加后及时补充签到与活动反馈，有助于形成完整贡献记录。", accent: "#c2410c", icon: <CheckCircle2 size={16} /> },
                  { title: "同步任务协同", desc: "若活动涉及报名申请或材料补充，可在我的事务继续跟进相关进度。", accent: "#9a3412", icon: <Target size={16} /> },
                ].map((item) => (
                  <div key={item.title} style={{ ...panelStyle, padding: 14 }}>
                    <Space align="start" size={10}>
                      <div
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 12,
                          background: `${item.accent}14`,
                          color: item.accent,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {item.icon}
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#1f2937" }}>{item.title}</div>
                        <Text style={{ color: "#7c6f67", fontSize: 12, lineHeight: 1.75 }}>{item.desc}</Text>
                      </div>
                    </Space>
                  </div>
                ))}
              </Space>
            </Card>
          </Space>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <Card bordered={false} style={sectionCardStyle} styles={{ body: { padding: 22 } }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#1f2937" }}>我的活动记录</div>
                <Text style={{ color: "#7c6f67", fontSize: 12 }}>沉淀报名、签到、参加与反馈情况</Text>
              </div>
              <Badge count={participationRecords.length} color="#b91c1c" />
            </div>
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              {participationRecords.length > 0 ? (
                participationRecords.map((record) => {
                  const palette = participationPalette[record.participationType];
                  return (
                    <div key={record.id} style={{ ...panelStyle, padding: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                        <div>
                          <Text strong style={{ color: "#1f2937" }}>{record.activityTitle}</Text>
                          <Text style={{ display: "block", marginTop: 6, color: "#7c6f67", fontSize: 12 }}>参与时间：{record.date}</Text>
                          {record.feedback ? <Paragraph style={{ margin: "8px 0 0", color: "#7c6f67", lineHeight: 1.8 }}>{record.feedback}</Paragraph> : null}
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <Tag bordered={false} style={{ borderRadius: 999, background: palette.bg, color: palette.color, marginInlineEnd: 0 }}>
                            {record.participationType}
                          </Tag>
                          <Tag bordered={false} style={{ display: "block", marginTop: 8, borderRadius: 999, background: "#fff7ed", color: "#c2410c", marginInlineEnd: 0, fontWeight: 700 }}>
                            +{record.score} 分
                          </Tag>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <Empty description="暂无活动记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              )}
            </Space>
          </Card>
        </Col>

        <Col xs={24} xl={12}>
          <Card bordered={false} style={sectionCardStyle} styles={{ body: { padding: 22 } }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1f2937", marginBottom: 16 }}>快捷入口</div>
            <Row gutter={[12, 12]}>
              <Col xs={12} md={12}>
                <QuickCard title="提交活动申请" description="如需新建活动或补充协同事项，可前往我的事务提交申请。" accent="#b91c1c" icon={<Plus size={22} />} onClick={() => navigate("/app/member/affairs")} />
              </Col>
              <Col xs={12} md={12}>
                <QuickCard title="查看任务中枢" description="将活动参与与个人任务同步管理，避免遗漏重要节点。" accent="#c2410c" icon={<Target size={22} />} onClick={() => navigate("/app/member/tasks")} />
              </Col>
              <Col xs={12} md={12}>
                <QuickCard title="学习建设" description="理论学习类活动可继续进入学习中心进行专题深化。" accent="#9a3412" icon={<Sparkles size={22} />} onClick={() => navigate("/app/member/learning")} />
              </Col>
              <Col xs={12} md={12}>
                <QuickCard title="成长档案" description="活动参与成果可同步沉淀为成长记录与积分。" accent="#7f1d1d" icon={<Trophy size={22} />} onClick={() => navigate("/app/member/growth")} />
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
