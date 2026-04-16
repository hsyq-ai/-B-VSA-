import {
  ArrowRight,
  BookOpen,
  Brain,
  CalendarClock,
  CheckCircle2,
  Compass,
  GraduationCap,
  Target,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import {
  Button,
  Card,
  Col,
  Empty,
  List,
  Progress,
  Row,
  Space,
  Tag,
  Typography,
  message,
} from "antd";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import PageAiInsightCard from "../../components/employee/ai/PageAiInsightCard";
import { openSecretaryWithContext } from "../../features/party/shared/navigation";

const { Paragraph, Text, Title } = Typography;

type LearningType = "政策解读" | "党史学习" | "理论武装" | "实践技能" | "专题研讨";
type LearningStatus = "未开始" | "进行中" | "已完成" | "已逾期";

interface LearningItem {
  id: string;
  title: string;
  type: LearningType;
  status: LearningStatus;
  progress: number;
  totalHours: number;
  completedHours: number;
  deadline?: string;
  score: number;
  teacher: string;
  department: string;
}

interface LearningPlan {
  id: string;
  title: string;
  description: string;
  target: string;
  progress: number;
  status: "进行中" | "已完成" | "准备中";
  startDate: string;
  endDate: string;
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

const journeySteps = [
  { key: "learning", title: "学什么", description: "必修课程与学习计划", active: true },
  { key: "growth", title: "学成什么", description: "结果沉淀到成长档案", active: false },
] as const;

const learningItems: LearningItem[] = [
  {
    id: "l1",
    title: "党的二十大精神专题学习",
    type: "政策解读",
    status: "进行中",
    progress: 75,
    totalHours: 20,
    completedHours: 15,
    deadline: "2026-04-15",
    score: 30,
    teacher: "李教授",
    department: "党委宣传部",
  },
  {
    id: "l2",
    title: "党史经典著作研读",
    type: "党史学习",
    status: "已完成",
    progress: 100,
    totalHours: 30,
    completedHours: 30,
    deadline: "2026-03-28",
    score: 45,
    teacher: "张研究员",
    department: "党校教研室",
  },
  {
    id: "l3",
    title: "新时代党的创新理论武装",
    type: "理论武装",
    status: "进行中",
    progress: 40,
    totalHours: 25,
    completedHours: 10,
    deadline: "2026-05-10",
    score: 25,
    teacher: "王讲师",
    department: "理论学习中心组",
  },
  {
    id: "l4",
    title: "基层党组织工作实务",
    type: "实践技能",
    status: "未开始",
    progress: 0,
    totalHours: 18,
    completedHours: 0,
    deadline: "2026-04-30",
    score: 20,
    teacher: "赵委员",
    department: "组织部",
  },
  {
    id: "l5",
    title: "党性修养与作风建设研讨",
    type: "专题研讨",
    status: "已完成",
    progress: 100,
    totalHours: 12,
    completedHours: 12,
    deadline: "2026-03-20",
    score: 18,
    teacher: "孙处长",
    department: "纪检联络组",
  },
];

const learningPlans: LearningPlan[] = [
  {
    id: "p1",
    title: "2026 年度党员学习计划",
    description: "围绕理论武装、党史学习和组织实践三条主线推进全年学习。",
    target: "完成 40 小时理论学习，沉淀 3 次专题复盘。",
    progress: 65,
    status: "进行中",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
  },
  {
    id: "p2",
    title: "党史专题学习方案",
    description: "聚焦红色基因传承与党史经典著作研读。",
    target: "完成 30 小时党史学习，形成 1 份个人心得。",
    progress: 100,
    status: "已完成",
    startDate: "2026-01-15",
    endDate: "2026-03-15",
  },
  {
    id: "p3",
    title: "新时代思想理论武装计划",
    description: "将政策解读与岗位实践结合，形成月度学习闭环。",
    target: "完成 25 小时理论学习，参与 2 次研讨交流。",
    progress: 40,
    status: "进行中",
    startDate: "2026-02-01",
    endDate: "2026-06-30",
  },
];

const typePalette: Record<LearningType, { color: string; bg: string }> = {
  政策解读: { color: "#b91c1c", bg: "#fef2f2" },
  党史学习: { color: "#c2410c", bg: "#fff7ed" },
  理论武装: { color: "#7c2d12", bg: "#fff7f0" },
  实践技能: { color: "#166534", bg: "#dcfce7" },
  专题研讨: { color: "#9a3412", bg: "#fef3c7" },
};

const statusPalette: Record<LearningStatus, { color: string; bg: string }> = {
  未开始: { color: "#57534e", bg: "#f5f5f4" },
  进行中: { color: "#b91c1c", bg: "#fef2f2" },
  已完成: { color: "#166534", bg: "#dcfce7" },
  已逾期: { color: "#991b1b", bg: "#fef2f2" },
};

const typeIcon = (type: LearningType) => {
  switch (type) {
    case "政策解读":
      return <BookOpen size={18} />;
    case "党史学习":
      return <Compass size={18} />;
    case "理论武装":
      return <Brain size={18} />;
    case "实践技能":
      return <Target size={18} />;
    case "专题研讨":
      return <TrendingUp size={18} />;
    default:
      return <BookOpen size={18} />;
  }
};

export default function MemberLearningPage() {
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState<LearningStatus | "全部">("全部");

  const stats = useMemo(() => {
    const total = learningItems.length;
    const inProgress = learningItems.filter((item) => item.status === "进行中").length;
    const completed = learningItems.filter((item) => item.status === "已完成").length;
    const totalHours = learningItems.reduce((sum, item) => sum + item.totalHours, 0);
    const completedHours = learningItems.reduce((sum, item) => sum + item.completedHours, 0);
    const completionRate = Math.round((completed / total) * 100);
    return { total, inProgress, completed, totalHours, completedHours, completionRate };
  }, []);

  const filteredItems = useMemo(() => {
    if (activeFilter === "全部") return learningItems;
    return learningItems.filter((item) => item.status === activeFilter);
  }, [activeFilter]);

  const focusCourse = useMemo(() => {
    return [...learningItems]
      .filter((item) => item.status !== "已完成")
      .sort((a, b) => dayjs(a.deadline).valueOf() - dayjs(b.deadline).valueOf())[0];
  }, []);

  const overallPlanProgress = useMemo(() => {
    return Math.round(learningPlans.reduce((sum, item) => sum + item.progress, 0) / learningPlans.length);
  }, []);

  const handleStartLearning = (item: LearningItem) => {
    if (item.status === "已完成") {
      message.info(`《${item.title}》已完成，可前往“我的成长”查看归档成果`);
      navigate("/app/member/growth");
      return;
    }

    message.success(`已为你定位到《${item.title}》，请按当前课程清单继续完成学时`);
  };

  const filterButtons: Array<{ key: LearningStatus | "全部"; label: string; count: number }> = [
    { key: "全部", label: "全部课程", count: learningItems.length },
    { key: "进行中", label: "进行中", count: stats.inProgress },
    { key: "已完成", label: "已完成", count: stats.completed },
    { key: "未开始", label: "未开始", count: learningItems.filter((item) => item.status === "未开始").length },
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
            "radial-gradient(circle at top right, rgba(251,191,36,0.18) 0%, rgba(251,191,36,0) 28%), linear-gradient(135deg, #7f1d1d 0%, #991b1b 44%, #b91c1c 100%)",
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
                学习与成长 · 学习中心
              </Tag>
              <div>
                <Title level={2} style={{ margin: 0, color: "#fff7ed" }}>
                  今天该完成哪些课程与学习计划
                </Title>
                <Paragraph style={{ margin: "12px 0 0", color: "rgba(255,245,240,0.86)", fontSize: 14, lineHeight: 1.85 }}>
                  这里专注展示必修课程、阶段计划、截止节点和完成动作，帮助你先把今天要学的内容按节奏推进；学完后的结果可直接去“我的成长”沉淀。
                </Paragraph>
              </div>
              <Space size={12} wrap>
                <Button
                  type="primary"
                  size="large"
                  icon={<ArrowRight size={16} />}
                  onClick={() => (focusCourse ? handleStartLearning(focusCourse) : message.info("当前暂无待推进课程"))}
                  style={{
                    borderRadius: 14,
                    height: 44,
                    background: "#fff7ed",
                    color: "#7f1d1d",
                    borderColor: "#fff7ed",
                    fontWeight: 700,
                  }}
                >
                  继续重点课程
                </Button>
                <Button
                  size="large"
                  onClick={() => navigate("/app/member/growth")}
                  style={{
                    borderRadius: 14,
                    height: 44,
                    color: "#fff7ed",
                    borderColor: "rgba(255,245,240,0.45)",
                    background: "rgba(255,255,255,0.06)",
                  }}
                >
                  查看我的成长沉淀
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
                { label: "计划进度", value: `${overallPlanProgress}%` },
                { label: "已学时长", value: `${stats.completedHours}h` },
                { label: "待完成课程", value: `${stats.total - stats.completed} 门` },
                { label: "最近截止", value: focusCourse?.deadline ? dayjs(focusCourse.deadline).format("MM-DD") : "-" },
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
        badge="AI 学习编排"
        tone="crimson"
        title={focusCourse ? `红智助手已识别你当前最该推进的课程：${focusCourse.title}` : "红智助手已识别当前学习节奏较平稳"}
        description="打开学习中心即可直接看到 AI 对课程节奏、截止压力与结果沉淀路径的判断，不再需要先进入会话页。"
        insights={[
          `重点课程：${focusCourse?.title || "暂无待推进课程"}`,
          `学时进度：${stats.completedHours}/${stats.totalHours}h`,
          `待完成课程：${Math.max(stats.total - stats.completed, 0)} 门`,
        ]}
        suggestions={[
          focusCourse
            ? `优先在 ${focusCourse.deadline || "本周"} 前补齐《${focusCourse.title}》的关键学时。`
            : "当前可继续保持稳定节奏，并整理已完成课程的阶段笔记。",
          "每完成一门课程就同步整理要点，避免学习结果无法复用。",
          "学完后及时回到“我的成长”，把课程成果沉淀为积分与画像。",
        ]}
        actions={[
          {
            key: "learning-plan",
            label: "让秘书生成今日学习计划",
            type: "primary",
            onClick: () =>
              openSecretaryWithContext(
                navigate,
                `学习中心：当前重点课程是《${focusCourse?.title || "暂无"}》，已完成 ${stats.completedHours}/${stats.totalHours} 学时，剩余 ${Math.max(stats.total - stats.completed, 0)} 门课程。请给出今日学习编排、节奏建议与学后复盘提纲。`,
              ),
          },
          {
            key: "learning-focus",
            label: focusCourse ? `继续《${focusCourse.title}》` : "查看学习计划",
            onClick: () =>
              focusCourse ? handleStartLearning(focusCourse) : message.info("当前暂无待推进课程，可先对齐年度学习计划"),
          },
          { key: "learning-growth", label: "查看成长沉淀", onClick: () => navigate("/app/member/growth") },
        ]}
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="进行中课程" value={stats.inProgress} description="本周需要持续推进的课程与专题任务。" accent="#b91c1c" icon={<BookOpen size={24} />} />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="已完成课程" value={stats.completed} description="已完成课程会保留在学习记录中，便于后续复盘。" accent="#166534" icon={<CheckCircle2 size={24} />} />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="学习总学时" value={`${stats.completedHours}/${stats.totalHours}h`} description="按照年度计划统计的阶段学时完成情况。" accent="#c2410c" icon={<GraduationCap size={24} />} />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="任务完成率" value={`${stats.completionRate}%`} description="当前课程与计划的执行完成度。" accent="#9a3412" icon={<Trophy size={24} />} />
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={15}>
          <Card bordered={false} style={sectionCardStyle} styles={{ body: { padding: 24 } }}>
            <Space direction="vertical" size={18} style={{ width: "100%" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#1f2937" }}>学习计划</div>
                  <Text style={{ color: "#7c6f67", fontSize: 12 }}>先对齐阶段目标，再安排本周课程节奏</Text>
                </div>
                <Button type="primary" danger onClick={() => setActiveFilter("进行中")}>查看进行中课程</Button>
              </div>
              {learningPlans.map((plan) => (
                <div key={plan.id} style={{ ...panelStyle, padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <Text strong style={{ fontSize: 15, color: "#1f2937" }}>{plan.title}</Text>
                      <Paragraph style={{ margin: "8px 0 0", color: "#7c6f67", lineHeight: 1.8 }}>{plan.description}</Paragraph>
                    </div>
                    <Tag
                      bordered={false}
                      style={{
                        borderRadius: 999,
                        marginInlineEnd: 0,
                        background: plan.status === "已完成" ? "#dcfce7" : plan.status === "进行中" ? "#fef2f2" : "#f5f5f4",
                        color: plan.status === "已完成" ? "#166534" : plan.status === "进行中" ? "#b91c1c" : "#57534e",
                        height: 28,
                        lineHeight: "20px",
                        paddingInline: 10,
                        fontWeight: 700,
                      }}
                    >
                      {plan.status}
                    </Tag>
                  </div>
                  <Text style={{ display: "block", marginTop: 6, color: "#7f1d1d", fontSize: 12 }}>学习目标：{plan.target}</Text>
                  <Progress percent={plan.progress} showInfo={false} strokeColor="#b91c1c" trailColor="#f3e8e2" style={{ marginTop: 12 }} />
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, gap: 12, flexWrap: "wrap" }}>
                    <Text style={{ color: "#7c6f67", fontSize: 12 }}>
                      {dayjs(plan.startDate).format("YYYY-MM-DD")} 至 {dayjs(plan.endDate).format("YYYY-MM-DD")}
                    </Text>
                    <Text style={{ color: "#7f1d1d", fontSize: 12, fontWeight: 700 }}>{plan.progress}%</Text>
                  </div>
                </div>
              ))}
            </Space>
          </Card>
        </Col>

        <Col xs={24} xl={9}>
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Card bordered={false} style={sectionCardStyle} styles={{ body: { padding: 22 } }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#1f2937" }}>今日待学主线</div>
              <div style={{ ...panelStyle, padding: 16, marginTop: 16 }}>
                <Text style={{ color: "#7f1d1d", fontWeight: 700, fontSize: 12 }}>优先课程</Text>
                <Title level={4} style={{ margin: "8px 0 0", color: "#1f2937" }}>{focusCourse?.title || "暂无待推进课程"}</Title>
                <Paragraph style={{ margin: "10px 0 0", color: "#7c6f67", lineHeight: 1.8 }}>
                  {focusCourse
                    ? `建议先把 ${focusCourse.completedHours}/${focusCourse.totalHours} 学时补齐到下一节点，再处理后续课程，避免临近截止集中冲刺。`
                    : "当前学习安排已较完整，可回看已完成课程并整理本周笔记。"}
                </Paragraph>
                <Space size={[8, 8]} wrap>
                  <Tag bordered={false} style={{ borderRadius: 999, background: "#fef2f2", color: "#b91c1c", marginInlineEnd: 0 }}>
                    截止 {focusCourse?.deadline || "待安排"}
                  </Tag>
                  <Tag bordered={false} style={{ borderRadius: 999, background: "#fff7ed", color: "#c2410c", marginInlineEnd: 0 }}>
                    主讲 {focusCourse?.teacher || "-"}
                  </Tag>
                </Space>
                <Button type="primary" danger style={{ marginTop: 16, borderRadius: 12 }} onClick={() => (focusCourse ? handleStartLearning(focusCourse) : message.info("当前暂无待推进课程"))}>
                  {focusCourse?.status === "未开始" ? "开始这门课" : "继续这门课"}
                </Button>
              </div>
            </Card>

            <Card bordered={false} style={sectionCardStyle} styles={{ body: { padding: 22 } }}>
              <Space direction="vertical" size={14} style={{ width: "100%" }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#1f2937" }}>本周执行提醒</div>
                  <Text style={{ color: "#7c6f67", fontSize: 12 }}>只聚焦课程推进、截止节点和完成动作</Text>
                </div>
                {[
                  { title: "先处理临近截止", desc: focusCourse ? `优先推进《${focusCourse.title}》，确保在 ${focusCourse.deadline} 前完成关键学时。` : "当前暂无临近截止课程，可继续保持学习节奏。", accent: "#b91c1c", icon: <CalendarClock size={16} /> },
                  { title: "补齐本周学时", desc: `本周至少再完成 ${Math.max((focusCourse?.totalHours || 0) - (focusCourse?.completedHours || 0), 0)} 学时，保证阶段计划不断档。`, accent: "#c2410c", icon: <Target size={16} /> },
                  { title: "学完即做记录", desc: "每完成一门课程，及时整理笔记与要点，方便后续复盘与归档。", accent: "#9a3412", icon: <CheckCircle2 size={16} /> },
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

      <Card bordered={false} style={sectionCardStyle} styles={{ body: { padding: 24 } }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1f2937" }}>我的课程</div>
            <Text style={{ color: "#7c6f67", fontSize: 12 }}>按照学习状态查看当前课程推进情况</Text>
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
          dataSource={filteredItems}
          locale={{ emptyText: <Empty description="暂无课程安排" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
          renderItem={(item) => {
            const typeStyle = typePalette[item.type];
            const statusStyle = statusPalette[item.status];
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
                          {typeIcon(item.type)}
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
                            <Text style={{ color: "#7c6f67", fontSize: 13 }}>主讲：{item.teacher}</Text>
                            <Text style={{ color: "#7c6f67", fontSize: 13 }}>来源：{item.department}</Text>
                            <Text style={{ color: "#7c6f67", fontSize: 13 }}>学时：{item.completedHours}/{item.totalHours}h</Text>
                            <Text style={{ color: "#b91c1c", fontSize: 13 }}>截止：{item.deadline || "待安排"}</Text>
                          </Space>
                          <div style={{ maxWidth: 360, marginTop: 12 }}>
                            <Progress percent={item.progress} showInfo={false} strokeColor="#b91c1c" trailColor="#f3e8e2" />
                            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                              <Text style={{ color: "#7c6f67", fontSize: 12 }}>当前进度</Text>
                              <Text style={{ color: "#7f1d1d", fontSize: 12, fontWeight: 700 }}>{item.progress}%</Text>
                            </div>
                          </div>
                        </div>
                      </Space>
                    </Col>
                    <Col xs={24} md={9}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                        <div>
                          {item.status === "已完成" ? (
                            <Tag bordered={false} style={{ borderRadius: 999, background: "#dcfce7", color: "#166534", marginInlineEnd: 0, fontWeight: 700 }}>
                              已获得 {item.score} 积分
                            </Tag>
                          ) : (
                            <Tag bordered={false} style={{ borderRadius: 999, background: "#fff7ed", color: "#c2410c", marginInlineEnd: 0 }}>
                              完成后可得 {item.score} 积分
                            </Tag>
                          )}
                        </div>
                        <Button type="primary" danger={item.status !== "已完成"} onClick={() => handleStartLearning(item)}>
                          {item.status === "未开始" ? "开始学习" : item.status === "已完成" ? "查看归档" : "继续学习"}
                        </Button>
                      </div>
                    </Col>
                  </Row>
                </div>
              </List.Item>
            );
          }}
        />
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <Card bordered={false} style={sectionCardStyle} styles={{ body: { padding: 22 } }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1f2937", marginBottom: 16 }}>学习配套入口</div>
            <Row gutter={[12, 12]}>
              <Col xs={12} md={12}>
                <QuickCard title="回看学习计划" description="重新对齐全年与阶段目标，避免课程推进跑偏。" accent="#c2410c" icon={<Compass size={22} />} onClick={() => message.info("请结合上方学习计划安排本周课程节奏")} />
              </Col>
              <Col xs={12} md={12}>
                <QuickCard title="学习任务" description="查看个人待办任务与课程执行节奏。" accent="#b91c1c" icon={<BookOpen size={22} />} onClick={() => navigate("/app/member/tasks")} />
              </Col>
              <Col xs={12} md={12}>
                <QuickCard title="查看成长沉淀" description="课程完成后可直接查看积分、荣誉与成长画像。" accent="#9a3412" icon={<Trophy size={22} />} onClick={() => navigate("/app/member/growth")} />
              </Col>
              <Col xs={12} md={12}>
                <QuickCard title="完成后看成长" description="课程完成后再去沉淀积分、荣誉与成长画像。" accent="#7f1d1d" icon={<Trophy size={22} />} onClick={() => navigate("/app/member/growth")} />
              </Col>
            </Row>
          </Card>
        </Col>

        <Col xs={24} xl={12}>
          <Card bordered={false} style={sectionCardStyle} styles={{ body: { padding: 22 } }}>
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#1f2937" }}>截止提醒</div>
                <Text style={{ color: "#7c6f67", fontSize: 12 }}>帮助你把本周该完成的学习动作落到实处</Text>
              </div>
              {[
                { title: "优先完成重点课", desc: focusCourse ? `本周先完成《${focusCourse.title}》剩余学时，再处理其他课程。` : "当前暂无重点课程，可按照计划平稳推进。", icon: <CalendarClock size={16} />, accent: "#b91c1c" },
                { title: "同步整理笔记", desc: "每门课程完成后整理 1 份要点摘要，避免学完即忘。", icon: <CheckCircle2 size={16} />, accent: "#c2410c" },
                { title: "结果再去沉淀", desc: "课程全部完成后，再进入“我的成长”查看积分和成果归档。", icon: <Trophy size={16} />, accent: "#9a3412" },
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
        </Col>
      </Row>
    </Space>
  );
}
