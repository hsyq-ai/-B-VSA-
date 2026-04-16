import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  FileText,
  HeartHandshake,
  RefreshCw,
  Sparkles,
  Target,
  Trophy,
  Siren,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Badge,
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
import { directiveCenterApi } from "../../api/modules/directiveCenter";
import { partyAffairsApi } from "../../api/modules/partyAffairs";
import {
  loadLocal as loadMemberAffairsLocal,
  sortByTimeDesc,
} from "../../features/party/member-affairs";
import {
  loadLocal as loadMemberDirectivesLocal,
  sortByPublishAt,
} from "../../features/party/member-directives";
import {
  type LearningPlan,
  type TaskItem,
  type TaskStatus,
  OfficialStatCard,
  QuickNavCard,
  buildActivityItems,
  buildGrowthMoments,
  buildReminders,
  calcOverallLearningProgress,
  calcTaskStats,
  getDemoLearningPlans,
  getDemoTasks,
  getTaskTargetPath,
  parseDaysToDeadline,
  priorityPalette,
  sectionCardStyle,
  softPanelStyle,
  sortTasks,
  statusPalette,
  transformDirectiveTask,
  transformPartyTask,
} from "../../features/party/member-tasks";
import { allowPartyLocalFallback } from "../../utils/runtimeFlags";

const { Paragraph, Text, Title } = Typography;

export default function MemberTasksPage() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [learningPlans, setLearningPlans] = useState<LearningPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState<TaskStatus | "全部">("全部");

  const loadTasks = async () => {
    setLoading(true);
    const demoLearningPlans = getDemoLearningPlans();
    try {
      const [partyTasksRes, directivesRes] = await Promise.allSettled([
        partyAffairsApi.list({ assignee: "current" }),
        directiveCenterApi.list({}),
      ]);

      const partyItems =
        partyTasksRes.status === "fulfilled"
          ? sortByTimeDesc(partyTasksRes.value)
          : allowPartyLocalFallback
            ? sortByTimeDesc(loadMemberAffairsLocal())
            : [];
      const directiveItems =
        directivesRes.status === "fulfilled"
          ? sortByPublishAt(directivesRes.value)
          : allowPartyLocalFallback
            ? sortByPublishAt(loadMemberDirectivesLocal())
            : [];
      const allTasks = [
        ...partyItems.map(transformPartyTask),
        ...directiveItems.map(transformDirectiveTask),
      ];

      setTasks(allTasks.length > 0 ? allTasks : getDemoTasks());
      setLearningPlans(demoLearningPlans);

      if (partyTasksRes.status === "rejected" || directivesRes.status === "rejected") {
        if (allowPartyLocalFallback && allTasks.length > 0) {
          message.warning("部分接口不可用，已回退到本地暂存数据");
        } else if (allTasks.length === 0) {
          message.warning("接口暂不可用，已展示示例任务");
        }
      }
    } catch {
      message.warning("加载失败，已展示示例任务");
      setTasks(getDemoTasks());
      setLearningPlans(demoLearningPlans);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  const stats = useMemo(() => calcTaskStats(tasks), [tasks]);

  const overallLearningProgress = useMemo(
    () => calcOverallLearningProgress(learningPlans),
    [learningPlans],
  );

  const filteredTasks = useMemo(() => {
    if (activeFilter === "全部") return sortTasks(tasks);
    return sortTasks(tasks.filter((item) => item.status === activeFilter));
  }, [activeFilter, tasks]);

  const focusTasks = useMemo(
    () => sortTasks(tasks.filter((item) => item.status !== "已完成")).slice(0, 4),
    [tasks],
  );

  const focusTask = focusTasks[0];
  const weekPlan = focusTasks.slice(0, 3);

  const growthMoments = useMemo(
    () => buildGrowthMoments(tasks, learningPlans),
    [learningPlans, tasks],
  );

  const reminders = useMemo(
    () =>
      buildReminders({
        focusTask,
        overallLearningProgress,
        overdue: stats.overdue,
      }),
    [focusTask, overallLearningProgress, stats.overdue],
  );

  const activityItems = useMemo(() => buildActivityItems(tasks), [tasks]);

  const filterButtons: Array<{ key: TaskStatus | "全部"; label: string; count: number }> = [
    { key: "全部", label: "全部事项", count: tasks.length },
    { key: "待办", label: "待办", count: stats.todo },
    { key: "进行中", label: "执行中", count: stats.doing },
    { key: "已完成", label: "已完成", count: stats.done },
    { key: "已逾期", label: "逾期预警", count: stats.overdue },
  ];

  const handleTaskAction = (task: TaskItem) => {
    const targetPath = getTaskTargetPath(task);
    navigate(targetPath);
    message.info(`已为你打开“${task.title}”相关办理页面`);
  };

  const startTodayWork = () => {
    if (focusTask) {
      handleTaskAction(focusTask);
      return;
    }
    navigate("/app/member/learning");
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
            "radial-gradient(circle at top right, rgba(251,191,36,0.16) 0%, rgba(251,191,36,0) 28%), linear-gradient(135deg, #7f1d1d 0%, #991b1b 46%, #b91c1c 100%)",
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
                党员工作台 · 稳重政务视图
              </Tag>
              <div>
                <Title level={2} style={{ margin: 0, color: "#fff7ed" }}>
                  今日重点、学习推进、组织协同一屏掌握
                </Title>
                <Paragraph style={{ margin: "12px 0 0", color: "rgba(255,245,240,0.86)", fontSize: 14, lineHeight: 1.85 }}>
                  围绕“任务闭环、学习建设、组织协同”重构党员首页，将原有分散页面整合为个人驾驶舱式工作中枢，优先呈现今天最需要处理的事项。
                </Paragraph>
              </div>
              <Space size={12} wrap>
                <Button
                  type="primary"
                  size="large"
                  icon={<ArrowRight size={16} />}
                  onClick={startTodayWork}
                  style={{
                    borderRadius: 14,
                    height: 44,
                    background: "#fff7ed",
                    color: "#7f1d1d",
                    borderColor: "#fff7ed",
                    fontWeight: 700,
                    boxShadow: "0 12px 28px rgba(15,23,42,0.18)",
                  }}
                >
                  开始处理今日任务
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
                  查看我的事务
                </Button>
              </Space>
            </Space>
          </Col>
          <Col xs={24} lg={9}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 12,
              }}
            >
              {[
                { label: "今日待办", value: `${stats.todo} 项` },
                { label: "本周完成率", value: `${stats.completionRate}%` },
                { label: "学习进度", value: `${overallLearningProgress}%` },
                { label: "成长积分", value: `${stats.totalScore} 分` },
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
          <OfficialStatCard
            title="待办事项"
            value={stats.todo}
            description="需要优先跟进的个人任务与上级交办"
            accent="#b91c1c"
            icon={<ClipboardCheck size={24} />}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <OfficialStatCard
            title="执行推进"
            value={stats.doing}
            description="正在办理或等待审核的事项"
            accent="#c2410c"
            icon={<Target size={24} />}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <OfficialStatCard
            title="学习建设"
            value={`${overallLearningProgress}%`}
            description="本周期学习计划平均完成度"
            accent="#7c2d12"
            icon={<BookOpen size={24} />}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <OfficialStatCard
            title="风险提醒"
            value={stats.overdue}
            description="逾期事项与督办提醒集中展示"
            accent="#991b1b"
            icon={<Siren size={24} />}
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={15}>
          <Card
            bordered={false}
            style={sectionCardStyle}
            styles={{ body: { padding: 24 } }}
            title={
              <Space size={10}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 14,
                    background: "rgba(185,28,28,0.1)",
                    color: "#b91c1c",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <ClipboardCheck size={18} />
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#1f2937" }}>任务督办清单</div>
                  <Text style={{ color: "#7c6f67", fontSize: 12 }}>按紧急程度优先展示，支持直接跳转办理</Text>
                </div>
              </Space>
            }
            extra={
              <Space>
                <Button icon={<RefreshCw size={14} />} loading={loading} onClick={loadTasks}>
                  刷新
                </Button>
                <Button type="primary" danger onClick={() => navigate("/app/member/directives")}>
                  打开我的指示
                </Button>
              </Space>
            }
          >
            <Space wrap size={10} style={{ marginBottom: 18 }}>
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

            <List
              loading={loading}
              dataSource={filteredTasks}
              locale={{ emptyText: <Empty description="当前暂无待处理事项" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
              renderItem={(item) => {
                const statusStyle = statusPalette[item.status];
                const priorityStyle = priorityPalette[item.priority];
                const days = parseDaysToDeadline(item.deadline);
                const deadlineText = Number.isFinite(days)
                  ? days < 0
                    ? `已逾期 ${Math.abs(days)} 天`
                    : days === 0
                      ? "今日截止"
                      : `还有 ${days} 天截止`
                  : "截止时间待补充";

                return (
                  <List.Item style={{ padding: 0, border: "none", marginBottom: 14 }}>
                    <div
                      style={{
                        width: "100%",
                        padding: 20,
                        borderRadius: 20,
                        border: "1px solid rgba(127,29,29,0.08)",
                        background: item.status === "已逾期" ? "#fff7f7" : "#fffdfc",
                      }}
                    >
                      <Row gutter={[16, 16]} align="middle">
                        <Col xs={24} md={15}>
                          <Space align="start" size={14}>
                            <div
                              style={{
                                width: 48,
                                height: 48,
                                borderRadius: 16,
                                background: `${statusStyle.border}14`,
                                color: statusStyle.border,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                              }}
                            >
                              {item.type === "学习任务" ? <BookOpen size={20} /> : item.type === "主题活动" ? <CalendarDays size={20} /> : item.source === "上级指示" ? <FileText size={20} /> : <Sparkles size={20} />}
                            </div>
                            <div>
                              <Space wrap size={[8, 8]}>
                                <Text strong style={{ fontSize: 16, color: "#1f2937" }}>
                                  {item.title}
                                </Text>
                                <Tag bordered={false} style={{ borderRadius: 999, background: "#f5f5f4", color: "#57534e", marginInlineEnd: 0 }}>
                                  {item.type}
                                </Tag>
                                <Tag
                                  bordered={false}
                                  style={{
                                    borderRadius: 999,
                                    marginInlineEnd: 0,
                                    background: statusStyle.bg,
                                    color: statusStyle.color,
                                    fontWeight: 700,
                                  }}
                                >
                                  {item.status}
                                </Tag>
                              </Space>
                              <Space size={[14, 8]} wrap style={{ marginTop: 10 }}>
                                <Text style={{ color: "#7c6f67", fontSize: 13 }}>来源：{item.source}</Text>
                                <Text style={{ color: days <= 1 ? "#b91c1c" : "#7c6f67", fontSize: 13 }}>截止：{item.deadline}</Text>
                                <Text style={{ color: days <= 1 ? "#b91c1c" : "#7c6f67", fontSize: 13 }}>{deadlineText}</Text>
                                {item.completedAt ? <Text style={{ color: "#166534", fontSize: 13 }}>完成于：{item.completedAt}</Text> : null}
                              </Space>
                            </div>
                          </Space>
                        </Col>
                        <Col xs={24} md={9}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                            <Tag
                              bordered={false}
                              style={{
                                borderRadius: 999,
                                padding: "4px 10px",
                                marginInlineEnd: 0,
                                background: priorityStyle.bg,
                                color: priorityStyle.color,
                                fontWeight: 700,
                              }}
                            >
                              {item.priority}优先级
                            </Tag>
                            <Space>
                              {item.score && item.status === "已完成" ? (
                                <Tag bordered={false} style={{ borderRadius: 999, background: "#dcfce7", color: "#166534", marginInlineEnd: 0 }}>
                                  +{item.score} 分
                                </Tag>
                              ) : null}
                              <Button type="primary" danger={item.status !== "已完成"} onClick={() => handleTaskAction(item)}>
                                {item.status === "已完成" ? "查看详情" : item.status === "待审核" ? "查看进度" : "立即办理"}
                              </Button>
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
              <Space direction="vertical" size={16} style={{ width: "100%" }}>
                <div>
                  <Text style={{ color: "#7f1d1d", fontWeight: 700, fontSize: 13 }}>今日主办事项</Text>
                  <Title level={4} style={{ margin: "8px 0 0", color: "#1f2937" }}>
                    {focusTask ? focusTask.title : "当前无高优先级待办"}
                  </Title>
                  <Paragraph style={{ margin: "10px 0 0", color: "#7c6f67", lineHeight: 1.8 }}>
                    {focusTask
                      ? `来源于 ${focusTask.source}，建议优先在 ${focusTask.deadline} 前完成关键动作，保持个人任务闭环。`
                      : "本周期待办压力较低，可转入学习建设或成长沉淀。"}
                  </Paragraph>
                </div>
                <div style={{ ...softPanelStyle, padding: 16 }}>
                  <Space direction="vertical" size={10} style={{ width: "100%" }}>
                    {weekPlan.length > 0 ? (
                      weekPlan.map((item, index) => (
                        <div key={item.id} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                          <div>
                            <Text style={{ color: "#7f1d1d", fontWeight: 700, fontSize: 12 }}>节点 {index + 1}</Text>
                            <div style={{ marginTop: 4, fontWeight: 600, color: "#1f2937" }}>{item.title}</div>
                            <Text style={{ color: "#7c6f67", fontSize: 12 }}>{item.deadline} 前完成</Text>
                          </div>
                          <Tag bordered={false} style={{ borderRadius: 999, background: statusPalette[item.status].bg, color: statusPalette[item.status].color, marginInlineEnd: 0, height: 24 }}>
                            {item.status}
                          </Tag>
                        </div>
                      ))
                    ) : (
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前暂无计划节点" />
                    )}
                  </Space>
                </div>
              </Space>
            </Card>

            <Card bordered={false} style={sectionCardStyle} styles={{ body: { padding: 22 } }}>
              <Space direction="vertical" size={16} style={{ width: "100%" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#1f2937" }}>学习进度与成长沉淀</div>
                  <Text style={{ color: "#7c6f67", fontSize: 12 }}>围绕学习计划与成长档案统一推进</Text>
                </div>
                <Button type="link" danger onClick={() => navigate("/app/member/growth")}>
                  查看我的成长
                </Button>

                </div>
                {learningPlans.map((plan) => (
                  <div key={plan.id} style={{ ...softPanelStyle, padding: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                      <Text strong style={{ color: "#1f2937" }}>{plan.title}</Text>
                      <Tag bordered={false} style={{ borderRadius: 999, background: plan.status === "已完成" ? "#dcfce7" : "#fef3c7", color: plan.status === "已完成" ? "#166534" : "#92400e", marginInlineEnd: 0 }}>
                        {plan.status}
                      </Tag>
                    </div>
                    <Progress percent={plan.progress} showInfo={false} strokeColor="#b91c1c" trailColor="#f3e8e2" />
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                      <Text style={{ color: "#7c6f67", fontSize: 12 }}>{plan.completedHours}/{plan.totalHours} 学时</Text>
                      <Text style={{ color: "#7f1d1d", fontSize: 12, fontWeight: 700 }}>{plan.progress}%</Text>
                    </div>
                  </div>
                ))}
              </Space>
            </Card>

            <Card bordered={false} style={sectionCardStyle} styles={{ body: { padding: 22 } }}>
              <Space direction="vertical" size={14} style={{ width: "100%" }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#1f2937" }}>组织支持与风险提醒</div>
                  <Text style={{ color: "#7c6f67", fontSize: 12 }}>将支持服务、逾期预警与学习建议集中呈现</Text>
                </div>
                {reminders.map((item) => (
                  <div key={item.title} style={{ ...softPanelStyle, padding: 14 }}>
                    <Space align="start" size={10}>
                      <div
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 12,
                          background: `${item.tone}14`,
                          color: item.tone,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <HeartHandshake size={16} />
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#1f2937" }}>{item.title}</div>
                        <Text style={{ color: "#7c6f67", fontSize: 12, lineHeight: 1.75 }}>{item.desc}</Text>
                      </div>
                    </Space>
                  </div>
                ))}
                <Button block onClick={() => navigate("/app/member/support")}>打开组织支持</Button>
              </Space>
            </Card>
          </Space>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <Card bordered={false} style={sectionCardStyle} styles={{ body: { padding: 22 } }}>
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#1f2937" }}>成长档案</div>
                  <Text style={{ color: "#7c6f67", fontSize: 12 }}>保留近期完成成果、学习进度与个人沉淀</Text>
                </div>
                <Button type="link" danger icon={<ChevronRight size={16} />} onClick={() => navigate("/app/member/growth")}>查看成长</Button>
              </div>
              <Space wrap size={[8, 8]}>
                <Tag bordered={false} style={{ borderRadius: 999, background: "#fef2f2", color: "#b91c1c", marginInlineEnd: 0 }}>
                  本月积分 {stats.totalScore}
                </Tag>
                <Tag bordered={false} style={{ borderRadius: 999, background: "#fff7ed", color: "#c2410c", marginInlineEnd: 0 }}>
                  完成率 {stats.completionRate}%
                </Tag>
                <Tag bordered={false} style={{ borderRadius: 999, background: "#fdf2f8", color: "#be185d", marginInlineEnd: 0 }}>
                  学习进度 {overallLearningProgress}%
                </Tag>
              </Space>
              <Space direction="vertical" size={12} style={{ width: "100%" }}>
                {growthMoments.length > 0 ? (
                  growthMoments.map((item, index) => (
                    <div key={`${item.title}-${index}`} style={{ ...softPanelStyle, padding: 14 }}>
                      <Space align="start" size={12}>
                        <div
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 12,
                            background: "rgba(185,28,28,0.1)",
                            color: "#b91c1c",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          {index % 2 === 0 ? <Trophy size={16} /> : <BookOpen size={16} />}
                        </div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "#1f2937" }}>{item.title}</div>
                          <Text style={{ color: "#7c6f67", fontSize: 12, lineHeight: 1.75 }}>{item.desc}</Text>
                        </div>
                      </Space>
                    </div>
                  ))
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无成长记录" />
                )}
              </Space>
            </Space>
          </Card>
        </Col>

        <Col xs={24} xl={12}>
          <Card bordered={false} style={sectionCardStyle} styles={{ body: { padding: 22 } }}>
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#1f2937" }}>活动参与与快捷入口</div>
                  <Text style={{ color: "#7c6f67", fontSize: 12 }}>将活动报名、学习入口与服务协同集中在右侧操作区</Text>
                </div>
                <Badge count={activityItems.length} color="#b91c1c" />
              </div>

              <Space direction="vertical" size={12} style={{ width: "100%" }}>
                {activityItems.map((item) => (
                  <div key={item.id} style={{ ...softPanelStyle, padding: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#1f2937" }}>{item.title}</div>
                        <Text style={{ color: "#7c6f67", fontSize: 12 }}>{item.source} · {item.deadline}</Text>
                      </div>
                      <Button size="small" onClick={() => navigate("/app/member/activity")}>去参与</Button>
                    </div>
                  </div>
                ))}
              </Space>

              <Row gutter={[12, 12]}>
                <Col xs={12} md={12}>
                  <QuickNavCard
                    title="学习中心"
                    description="查看专题课程、学习进度与测验结果"
                    accent="#b91c1c"
                    icon={<BookOpen size={22} />}
                    onClick={() => navigate("/app/member/learning")}
                  />
                </Col>
                <Col xs={12} md={12}>
                  <QuickNavCard
                    title="我的成长"
                    description="查看积分、档案、成果与荣誉沉淀"
                    accent="#c2410c"
                    icon={<Trophy size={22} />}
                    onClick={() => navigate("/app/member/growth")}
                  />
                </Col>
                <Col xs={12} md={12}>
                  <QuickNavCard
                    title="参与活动"
                    description="进入活动协同，补充实践经历与组织贡献"
                    accent="#9a3412"
                    icon={<CalendarDays size={22} />}
                    onClick={() => navigate("/app/member/activity")}
                  />
                </Col>
                <Col xs={12} md={12}>
                  <QuickNavCard
                    title="组织支持"
                    description="进入支持申请、提醒与沟通反馈专区"
                    accent="#7f1d1d"
                    icon={<HeartHandshake size={22} />}
                    onClick={() => navigate("/app/member/support")}
                  />
                </Col>
              </Row>
            </Space>
          </Card>
        </Col>
      </Row>

      <Card bordered={false} style={sectionCardStyle} styles={{ body: { padding: 20 } }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} lg={18}>
            <Space align="start" size={14}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 16,
                  background: "rgba(185,28,28,0.1)",
                  color: "#b91c1c",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Clock3 size={20} />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#1f2937" }}>页面重构说明</div>
                <Text style={{ color: "#7c6f67", lineHeight: 1.8 }}>
                  当前党员工作台已按“今日任务中枢 / 学习与成长 / 组织协同”的驾驶舱逻辑重组，后续可继续接入真实角标数据、优先级算法与个性化推荐。
                </Text>
              </div>
            </Space>
          </Col>
          <Col xs={24} lg={6}>
            <Button block type="primary" danger icon={<ArrowRight size={16} />} onClick={() => navigate("/app/member/activity")}>
              查看活动协同
            </Button>
          </Col>
        </Row>
      </Card>
    </Space>
  );
}
