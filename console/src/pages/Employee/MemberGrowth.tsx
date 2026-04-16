import {
  ArrowRight,
  Award,
  BookOpen,
  ChevronRight,
  Medal,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import {
  Button,
  Card,
  Col,
  Empty,
  Progress,
  Row,
  Space,
  Tag,
  Timeline,
  Typography,
} from "antd";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import PageAiInsightCard from "../../components/employee/ai/PageAiInsightCard";
import { openSecretaryWithContext } from "../../features/party/shared/navigation";

const { Paragraph, Text, Title } = Typography;

type GrowthType = "学习进步" | "任务完成" | "活动参与" | "荣誉获得" | "考核优秀";

interface GrowthRecord {
  id: string;
  type: GrowthType;
  title: string;
  description: string;
  date: string;
  score: number;
  icon: string;
}

interface Honor {
  id: string;
  title: string;
  level: "国家级" | "省级" | "市级" | "单位级";
  issuedBy: string;
  issueDate: string;
  description: string;
}

interface SkillTag {
  id: string;
  name: string;
  level: number;
  category: "理论知识" | "实践能力" | "组织协调" | "思想品德";
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

function AdviceCard({
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
            width: 46,
            height: 46,
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

const journeySteps = [
  { key: "learning", title: "学什么", description: "回学习中心继续积累", active: false },
  { key: "growth", title: "学成什么", description: "这里看结果档案与画像", active: true },
] as const;

const growthRecords: GrowthRecord[] = [
  {
    id: "g1",
    type: "荣誉获得",
    title: "年度优秀党员",
    description: "因在年度工作中表现突出，被评为优秀党员。",
    date: "2026-03-28",
    score: 50,
    icon: "🎖️",
  },
  {
    id: "g2",
    type: "学习进步",
    title: "党史学习标兵",
    description: "完成党史专题学习，形成高质量学习心得。",
    date: "2026-03-20",
    score: 30,
    icon: "📚",
  },
  {
    id: "g3",
    type: "任务完成",
    title: "组织生活任务完成",
    description: "按时完成三会一课相关任务，获得支部好评。",
    date: "2026-03-15",
    score: 25,
    icon: "✅",
  },
  {
    id: "g4",
    type: "活动参与",
    title: "志愿服务活动",
    description: "参与社区志愿服务活动，累计服务 10 小时。",
    date: "2026-03-10",
    score: 20,
    icon: "🤝",
  },
  {
    id: "g5",
    type: "考核优秀",
    title: "季度考核优秀",
    description: "季度党员考核中获评优秀等次。",
    date: "2026-02-28",
    score: 40,
    icon: "🌟",
  },
];

const honors: Honor[] = [
  {
    id: "h1",
    title: "优秀党员证书",
    level: "单位级",
    issuedBy: "党委组织部",
    issueDate: "2026-03-28",
    description: "2025 年度优秀党员",
  },
  {
    id: "h2",
    title: "党史学习优秀学员",
    level: "省级",
    issuedBy: "省委组织部",
    issueDate: "2026-03-15",
    description: "党史专题学习优秀学员",
  },
  {
    id: "h3",
    title: "志愿服务证书",
    level: "市级",
    issuedBy: "市文明办",
    issueDate: "2026-02-10",
    description: "累计志愿服务时长 100 小时",
  },
  {
    id: "h4",
    title: "理论武装先进个人",
    level: "单位级",
    issuedBy: "党委宣传部",
    issueDate: "2026-01-25",
    description: "新时代思想理论武装先进个人",
  },
];

const skillTags: SkillTag[] = [
  { id: "s1", name: "党史理解", level: 4, category: "理论知识" },
  { id: "s2", name: "政策解读", level: 3, category: "理论知识" },
  { id: "s3", name: "组织协调", level: 4, category: "组织协调" },
  { id: "s4", name: "实践能力", level: 5, category: "实践能力" },
  { id: "s5", name: "团队协作", level: 4, category: "组织协调" },
  { id: "s6", name: "思想觉悟", level: 5, category: "思想品德" },
  { id: "s7", name: "理论学习", level: 3, category: "理论知识" },
  { id: "s8", name: "志愿服务", level: 5, category: "实践能力" },
];

const typePalette: Record<GrowthType, { color: string; bg: string }> = {
  学习进步: { color: "#b91c1c", bg: "#fef2f2" },
  任务完成: { color: "#166534", bg: "#dcfce7" },
  活动参与: { color: "#c2410c", bg: "#fff7ed" },
  荣誉获得: { color: "#9a3412", bg: "#fef3c7" },
  考核优秀: { color: "#7f1d1d", bg: "#fff7f0" },
};

const levelPalette: Record<Honor["level"], { color: string; bg: string }> = {
  国家级: { color: "#991b1b", bg: "#fef2f2" },
  省级: { color: "#b45309", bg: "#fffbeb" },
  市级: { color: "#b91c1c", bg: "#fef2f2" },
  单位级: { color: "#166534", bg: "#dcfce7" },
};

const renderSkillStars = (level: number) => (
  <div style={{ display: "flex", gap: 2 }}>
    {Array.from({ length: 5 }).map((_, index) => (
      <Star
        key={index}
        size={12}
        color={index < level ? "#c2410c" : "#d6d3d1"}
        fill={index < level ? "#c2410c" : "none"}
      />
    ))}
  </div>
);

export default function MemberGrowthPage() {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState<GrowthType | "全部">("全部");

  const stats = useMemo(() => {
    return {
      totalScore: growthRecords.reduce((sum, item) => sum + item.score, 0),
      totalHonors: honors.length,
      growthCount: growthRecords.length,
      currentLevel: "三级",
      nextLevelScore: 220,
      currentScore: 165,
      progressToNextLevel: 75,
      rank: "前 10%",
      monthlyGrowth: "+12 分",
    };
  }, []);

  const filteredRecords = useMemo(() => {
    if (activeCategory === "全部") return growthRecords;
    return growthRecords.filter((item) => item.type === activeCategory);
  }, [activeCategory]);

  const categoryButtons: Array<{ key: GrowthType | "全部"; label: string; count: number }> = [
    { key: "全部", label: "全部记录", count: growthRecords.length },
    { key: "学习进步", label: "学习进步", count: growthRecords.filter((item) => item.type === "学习进步").length },
    { key: "荣誉获得", label: "荣誉获得", count: growthRecords.filter((item) => item.type === "荣誉获得").length },
    { key: "活动参与", label: "活动参与", count: growthRecords.filter((item) => item.type === "活动参与").length },
    { key: "任务完成", label: "任务完成", count: growthRecords.filter((item) => item.type === "任务完成").length },
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
                学习与成长 · 我的成长
              </Tag>
              <div>
                <Title level={2} style={{ margin: 0, color: "#fff7ed" }}>
                  这里记录你的学习成果、成长轨迹与个人画像
                </Title>
                <Paragraph style={{ margin: "12px 0 0", color: "rgba(255,245,240,0.86)", fontSize: 14, lineHeight: 1.85 }}>
                  这不是学习执行页，而是成长结果页。系统会把学习、任务、活动和荣誉沉淀为积分、等级、证书与能力画像，方便你长期查看、对比与归档。
                </Paragraph>
              </div>
              <Space size={12} wrap>
                <Button
                  type="primary"
                  size="large"
                  icon={<ArrowRight size={16} />}
                  onClick={() => navigate("/app/member/learning")}
                  style={{
                    borderRadius: 14,
                    height: 44,
                    background: "#fff7ed",
                    color: "#7f1d1d",
                    borderColor: "#fff7ed",
                    fontWeight: 700,
                  }}
                >
                  回学习中心继续积累
                </Button>
                <Button
                  size="large"
                  onClick={() => navigate("/app/member/activity")}
                  style={{
                    borderRadius: 14,
                    height: 44,
                    color: "#fff7ed",
                    borderColor: "rgba(255,245,240,0.45)",
                    background: "rgba(255,255,255,0.06)",
                  }}
                >
                  查看活动贡献沉淀
                </Button>
              </Space>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, width: "100%" }}>
                {journeySteps.map((step, index) => (
                  <div
                    key={step.key}
                    style={{
                      borderRadius: 20,
                      padding: "16px 18px",
                      background: step.active ? "rgba(255,247,237,0.18)" : "rgba(255,255,255,0.08)",
                      border: step.active ? "1px solid rgba(255,247,237,0.32)" : "1px solid rgba(255,255,255,0.12)",
                    }}
                  >
                    <Text style={{ display: "block", color: step.active ? "#fff7ed" : "rgba(255,245,240,0.72)", fontSize: 12 }}>0{index + 1}</Text>
                    <Text style={{ display: "block", marginTop: 6, color: "#ffffff", fontSize: 16, fontWeight: 700 }}>{step.title}</Text>
                    <Text style={{ display: "block", marginTop: 6, color: step.active ? "rgba(255,245,240,0.92)" : "rgba(255,245,240,0.72)", fontSize: 12, lineHeight: 1.75 }}>{step.description}</Text>
                  </div>
                ))}
              </div>
            </Space>
          </Col>
          <Col xs={24} lg={9}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
              {[
                { label: "当前等级", value: stats.currentLevel },
                { label: "累计积分", value: `${stats.totalScore} 分` },
                { label: "成长排名", value: stats.rank },
                { label: "本月成长", value: stats.monthlyGrowth },
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

      <PageAiInsightCard
        badge="AI 成长诊断"
        tone="crimson"
        title={`红智助手已识别你的当前成长位势：${stats.rank}，距离下一等级还差 ${stats.nextLevelScore - stats.currentScore} 分`}
        description="这里不再只是结果归档页，系统会直接解释成长差距、建议最有效的补齐动作，并帮助你生成下一阶段计划。"
        insights={[
          `累计积分：${stats.totalScore} 分`,
          `当前等级：${stats.currentLevel}`,
          `本月成长：${stats.monthlyGrowth}`,
        ]}
        suggestions={[
          "优先补齐学习、任务与活动三条路径中最短板的一项，拉动升级效率最高。",
          "如果想提升排名，先聚焦可快速沉淀结果的动作，而不是平均分配精力。",
          "在查看证书与记录时同步让秘书解释变化原因，便于形成可执行计划。",
        ]}
        actions={[
          {
            key: "growth-diagnosis",
            label: "让秘书解读成长差距",
            type: "primary",
            onClick: () =>
              openSecretaryWithContext(
                navigate,
                `我的成长：当前累计积分 ${stats.totalScore} 分，当前等级 ${stats.currentLevel}，距离下一等级还差 ${stats.nextLevelScore - stats.currentScore} 分，当前排名 ${stats.rank}。请解释差距原因并生成未来两周成长计划。`,
              ),
          },
          { key: "growth-learning", label: "回学习中心补齐", onClick: () => navigate("/app/member/learning") },
          { key: "growth-activity", label: "查看活动沉淀", onClick: () => navigate("/app/member/activity") },
        ]}
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="累计积分" value={stats.totalScore} description="这里汇总你已沉淀的学习、任务、活动与荣誉结果。" accent="#b91c1c" icon={<Trophy size={24} />} />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="荣誉证书" value={stats.totalHonors} description="系统统一归档的荣誉与证书数量。" accent="#c2410c" icon={<Award size={24} />} />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="成长记录" value={stats.growthCount} description="近期已收录的关键成长里程碑。" accent="#9a3412" icon={<Sparkles size={24} />} />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="等级进阶" value={`${stats.progressToNextLevel}%`} description="距离下一等级还差 ${stats.nextLevelScore - stats.currentScore} 分。" accent="#166534" icon={<TrendingUp size={24} />} />
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={10}>
          <Card bordered={false} style={sectionCardStyle} styles={{ body: { padding: 22 } }}>
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#1f2937" }}>成长档案总览</div>
                <Text style={{ color: "#7c6f67", fontSize: 12 }}>集中查看积分、等级、排名与下一阶段差距</Text>
              </div>
              <div style={{ ...panelStyle, padding: 18 }}>
                <Text style={{ color: "#7f1d1d", fontWeight: 700, fontSize: 12 }}>当前等级</Text>
                <Title level={3} style={{ margin: "8px 0 0", color: "#1f2937" }}>{stats.currentLevel}党员成长级别</Title>
                <Paragraph style={{ margin: "10px 0 0", color: "#7c6f67", lineHeight: 1.8 }}>
                  当前已累计 {stats.currentScore} 分，本页会把已经沉淀下来的结果集中留档，方便你与上月表现、下一等级目标进行持续对比。
                </Paragraph>
                <Progress percent={stats.progressToNextLevel} showInfo={false} strokeColor="#b91c1c" trailColor="#f3e8e2" />
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, gap: 12, flexWrap: "wrap" }}>
                  <Text style={{ color: "#7c6f67", fontSize: 12 }}>距离下一等级 {stats.nextLevelScore - stats.currentScore} 分</Text>
                  <Text style={{ color: "#7f1d1d", fontSize: 12, fontWeight: 700 }}>{stats.rank}</Text>
                </div>
              </div>
              <Space size={[8, 8]} wrap>
                <Tag bordered={false} style={{ borderRadius: 999, background: "#fef2f2", color: "#b91c1c", marginInlineEnd: 0 }}>
                  本月新增 {stats.monthlyGrowth}
                </Tag>
                <Tag bordered={false} style={{ borderRadius: 999, background: "#fff7ed", color: "#c2410c", marginInlineEnd: 0 }}>
                  目标等级 四级
                </Tag>
                <Tag bordered={false} style={{ borderRadius: 999, background: "#dcfce7", color: "#166534", marginInlineEnd: 0 }}>
                  当前排名 {stats.rank}
                </Tag>
              </Space>
            </Space>
          </Card>
        </Col>

        <Col xs={24} xl={14}>
          <Card bordered={false} style={sectionCardStyle} styles={{ body: { padding: 22 } }}>
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#1f2937" }}>能力图谱</div>
                  <Text style={{ color: "#7c6f67", fontSize: 12 }}>通过多维标签展现个人优势与短板</Text>
                </div>
                <Button
                  type="link"
                  danger
                  onClick={() =>
                    openSecretaryWithContext(
                      navigate,
                      `我的成长能力图谱：请结合当前能力标签、等级与成长记录，解释我的优势、短板和优先补齐方向。`,
                    )
                  }
                >
                  让 AI 解释画像
                </Button>
              </div>
              {skillTags.map((skill) => (
                <div key={skill.id} style={{ ...panelStyle, padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
                    <div>
                      <Text strong style={{ color: "#1f2937" }}>{skill.name}</Text>
                      <div style={{ marginTop: 4, color: "#7c6f67", fontSize: 12 }}>{skill.category}</div>
                    </div>
                    <Space size={10}>
                      {renderSkillStars(skill.level)}
                      <Tag bordered={false} style={{ borderRadius: 999, background: "#fff7ed", color: "#c2410c", marginInlineEnd: 0 }}>
                        Lv.{skill.level}
                      </Tag>
                    </Space>
                  </div>
                  <Progress percent={skill.level * 20} showInfo={false} strokeColor={skill.level >= 4 ? "#b91c1c" : "#c2410c"} trailColor="#f3e8e2" style={{ marginTop: 12 }} />
                </div>
              ))}
            </Space>
          </Card>
        </Col>
      </Row>

      <Card bordered={false} style={sectionCardStyle} styles={{ body: { padding: 24 } }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1f2937" }}>成长里程碑</div>
            <Text style={{ color: "#7c6f67", fontSize: 12 }}>按结果类型查看近期个人沉淀节点</Text>
          </div>
          <Space wrap size={10}>
            {categoryButtons.map((item) => (
              <Button
                key={item.key}
                type={activeCategory === item.key ? "primary" : "default"}
                danger={activeCategory === item.key}
                onClick={() => setActiveCategory(item.key)}
                style={{ borderRadius: 999 }}
              >
                {item.label}（{item.count}）
              </Button>
            ))}
          </Space>
        </div>

        <Row gutter={[16, 16]}>
          <Col xs={24} xl={15}>
            <div style={{ ...panelStyle, padding: 18, minHeight: "100%" }}>
              {filteredRecords.length > 0 ? (
                <Timeline
                  mode="left"
                  items={filteredRecords.map((record) => {
                    const palette = typePalette[record.type];
                    return {
                      color: palette.color,
                      children: (
                        <div style={{ paddingLeft: 12 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                            <div>
                              <Space size={[8, 8]} wrap>
                                <Text strong style={{ color: "#1f2937" }}>{record.title}</Text>
                                <Tag bordered={false} style={{ borderRadius: 999, background: palette.bg, color: palette.color, marginInlineEnd: 0 }}>
                                  {record.type}
                                </Tag>
                              </Space>
                              <Paragraph style={{ margin: "8px 0 0", color: "#7c6f67", lineHeight: 1.8 }}>{record.description}</Paragraph>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <Text style={{ display: "block", color: "#7c6f67", fontSize: 12 }}>{dayjs(record.date).format("MM-DD")}</Text>
                              <Tag bordered={false} style={{ borderRadius: 999, background: "#fff7ed", color: "#c2410c", marginTop: 6, marginInlineEnd: 0, fontWeight: 700 }}>
                                +{record.score} 分
                              </Tag>
                            </div>
                          </div>
                        </div>
                      ),
                    };
                  })}
                />
              ) : (
                <Empty description="暂无成长记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              )}
            </div>
          </Col>
          <Col xs={24} xl={9}>
            <Space direction="vertical" size={14} style={{ width: "100%" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#1f2937" }}>荣誉与证书</div>
              {honors.map((honor) => {
                const palette = levelPalette[honor.level];
                return (
                  <div key={honor.id} style={{ ...panelStyle, padding: 14 }}>
                    <Space align="start" size={12}>
                      <div
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 14,
                          background: `${palette.color}14`,
                          color: palette.color,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <Medal size={20} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <Text strong style={{ color: "#1f2937" }}>{honor.title}</Text>
                        <Space size={[8, 8]} wrap style={{ display: "flex", marginTop: 8 }}>
                          <Tag bordered={false} style={{ borderRadius: 999, background: palette.bg, color: palette.color, marginInlineEnd: 0 }}>
                            {honor.level}
                          </Tag>
                          <Text style={{ color: "#7c6f67", fontSize: 12 }}>{honor.issuedBy}</Text>
                        </Space>
                        <Text style={{ display: "block", marginTop: 6, color: "#7c6f67", fontSize: 12 }}>颁发日期：{honor.issueDate}</Text>
                        <Text style={{ display: "block", marginTop: 4, color: "#7c6f67", fontSize: 12, lineHeight: 1.7 }}>{honor.description}</Text>
                      </div>
                    </Space>
                  </div>
                );
              })}
            </Space>
          </Col>
        </Row>
      </Card>

      <Card bordered={false} style={sectionCardStyle} styles={{ body: { padding: 22 } }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#1f2937", marginBottom: 16 }}>下一阶段目标</div>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={12} md={8}>
            <AdviceCard title="补足学习成果" description="如果想继续抬升档案厚度，可补齐理论武装与政策解读类课程结果。" accent="#b91c1c" icon={<BookOpen size={22} />} onClick={() => navigate("/app/member/learning")} />
          </Col>
          <Col xs={24} sm={12} md={8}>
            <AdviceCard title="闭环重点任务" description="按时完成重点任务，能更快补充积分与关键成长记录。" accent="#c2410c" icon={<Target size={22} />} onClick={() => navigate("/app/member/tasks")} />
          </Col>
          <Col xs={24} sm={12} md={8}>
            <AdviceCard title="增加实践沉淀" description="通过志愿服务和组织活动，补充更丰富的实践经历与协同贡献。" accent="#9a3412" icon={<Users size={22} />} onClick={() => navigate("/app/member/activity")} />
          </Col>
        </Row>
        <div style={{ marginTop: 18, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <Text style={{ color: "#7c6f67" }}>如果想冲击下一等级，可从学习、任务、活动三条路径继续补充新的沉淀结果。</Text>
          <Button type="link" danger icon={<ChevronRight size={16} />} onClick={() => navigate("/app/member/learning")}>回到学习中心</Button>
        </div>
      </Card>
    </Space>
  );
}
