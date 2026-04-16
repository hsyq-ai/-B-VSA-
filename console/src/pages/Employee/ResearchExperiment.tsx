import {
  Activity,
  CheckCircle2,
  Clock,
  PlayCircle,
  Plus,
  RefreshCw,
  Search,
  Users,
  Zap,
  MessagesSquare,
  FileText,
  BookHeart,
  HeartHandshake
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Card,
  Empty,
  Form,
  Input,
  Popconfirm,
  Progress,
  Space,
  Steps,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useNavigate, useParams } from "react-router-dom";
import { dashboardSkillApi } from "../../api/modules/dashboardSkills";
import { researchExperimentApi } from "../../api/modules/researchExperiments";
import type { ResearchExperimentJob } from "../../api/types";
import PageAiInsightCard from "../../components/employee/ai/PageAiInsightCard";
import { usePageAiContextSync } from "../../components/employee/ai/pageAiContextBridge";
import { openSecretaryWithContext } from "../../features/party/shared/navigation";

const { TextArea } = Input;
const { Title, Paragraph, Text } = Typography;

const SCENE_PENDING_STORAGE = "copaw_scene_pending_v1";

interface QuickAppConfig {
  key: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  desc: string;
}

const DEFAULT_QUICK_APP_KEYS = ["dashboard-doc", "dashboard-party", "dashboard-psy"];

const QUICK_APP_META: Record<string, Omit<QuickAppConfig, "key">> = {
  "dashboard-doc": {
    label: "公文写作",
    icon: <FileText size={20} />,
    color: "#6366f1",
    desc: "AI 辅助公文撰写",
  },
  "dashboard-party": {
    label: "党建学习",
    icon: <BookHeart size={20} />,
    color: "#ef4444",
    desc: "党建知识在线学习",
  },
  "dashboard-psy": {
    label: "心理辅导",
    icon: <HeartHandshake size={20} />,
    color: "#ec4899",
    desc: "专业心理咨询辅助",
  },
  "dashboard-research-topic": {
    label: "选题研判",
    icon: <Search size={20} />,
    color: "#2563eb",
    desc: "聚焦方向判断与研究问题拆解",
  },
  "dashboard-research-quality": {
    label: "质量评估",
    icon: <CheckCircle2 size={20} />,
    color: "#16a34a",
    desc: "评估方案质量与风险缺口",
  },
  "dashboard-research-brainstorm": {
    label: "头脑风暴",
    icon: <MessagesSquare size={20} />,
    color: "#7c3aed",
    desc: "快速发散方案与实验思路",
  },
  "dashboard-research-search": {
    label: "知识检索",
    icon: <Search size={20} />,
    color: "#0ea5e9",
    desc: "检索资料、论文与关键线索",
  },
  "dashboard-research-data": {
    label: "数据分析",
    icon: <Activity size={20} />,
    color: "#14b8a6",
    desc: "面向实验与业务数据分析",
  },
  "dashboard-research-writing": {
    label: "科研创作",
    icon: <FileText size={20} />,
    color: "#f97316",
    desc: "辅助撰写科研方案与材料",
  },
  "dashboard-research-paper-gen": {
    label: "论文生成",
    icon: <BookHeart size={20} />,
    color: "#8b5cf6",
    desc: "沉淀结构化论文初稿内容",
  },
  "dashboard-research-tracking": {
    label: "业界跟踪",
    icon: <RefreshCw size={20} />,
    color: "#f59e0b",
    desc: "持续跟踪行业与课题动态",
  },
};

const toQuickAppConfig = (key: string): QuickAppConfig => {
  const preset = QUICK_APP_META[key];
  if (preset) {
    return { key, ...preset };
  }
  const normalizedKey = String(key || "").trim();
  const label =
    normalizedKey
      .replace(/^dashboard-/, "")
      .split("-")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ") || "动态入口";
  return {
    key: normalizedKey,
    label,
    icon: <Zap size={20} />,
    color: "#6366f1",
    desc: "由后台规则动态下发的工作台入口",
  };
};

const statusColorMap: Record<string, string> = {
  created: "default",
  diagnosed: "processing",
  repaired: "warning",
  verified: "success",
  failed: "error",
};

const statusLabelMap: Record<string, string> = {
  created: "目标澄清",
  diagnosed: "方案研判",
  repaired: "执行产出",
  verified: "复核归档",
  failed: "执行异常",
};

const businessStateColorMap: Record<string, string> = {
  active: "blue",
  paused: "orange",
  closed: "default",
};

const businessStateLabelMap: Record<string, string> = {
  active: "进行中",
  paused: "已暂停",
  closed: "已关闭",
};

const historyEventLabelMap: Record<string, string> = {
  created: "任务创建",
  diagnosed: "阶段研判",
  repaired: "结果反馈",
  verified: "阶段总结",
  failed: "执行失败",
  paused: "任务暂停",
  resumed: "任务恢复",
  closed: "任务关闭",
};


const formatTs = (ts: number): string => {
  if (!ts) return "-";
  return new Date(ts * 1000).toLocaleString();
};

const isTerminalStatus = (status: string) => status === "verified" || status === "failed";

const buildTaskMemoryPrompt = (task: ResearchExperimentJob): string => {
  const historyLines = (task.history || [])
    .slice(-20)
    .map((h) => `- ${formatTs(Number(h.ts || 0))} | ${historyEventLabelMap[h.event] || h.event}: ${h.detail}`)
    .join("\n");

  return [
    "你现在是该任务的跟进助手，请基于以下任务记忆继续推进任务，并与用户交互确认下一步行动。",
    `任务名称：${task.title || "-"}`,
    `任务目标：${task.experiment_goal || "-"}`,
    `业务状态：${businessStateLabelMap[task.business_state] || task.business_state || "-"}`,
    `运行状态：${task.running_state || statusLabelMap[task.status] || task.status || "-"}`,
    `阶段研判：${task.diagnosis || "-"}`,
    `结果反馈：${task.result_feedback || task.suggested_patch || task.repair_plan || "-"}`,
    `阶段总结：${task.stage_summary || task.verification_summary || "-"}`,
    "进展追踪：",
    historyLines || "- 暂无进展记录",
    "请先给出：1）当前任务判断 2）下一步建议 3）需用户补充的信息。",
  ].join("\n");
};

function TaskChatDrawer({
  src,
  title,
  onClose,
}: {
  src: string;
  title: string;
  onClose: () => void;
}) {
  const [frameLoading, setFrameLoading] = useState(true);
  const [loadingPercent, setLoadingPercent] = useState(18);

  useEffect(() => {
    if (!src) return;
    setFrameLoading(true);
    setLoadingPercent(18);
    const timer = window.setInterval(() => {
      setLoadingPercent((prev) => (prev >= 88 ? prev : prev + 7));
    }, 180);
    return () => window.clearInterval(timer);
  }, [src]);

  if (!src) return null;
  return (
    <Card
      title={<Space><MessagesSquare size={18} color="#6366f1" /> <span style={{ fontWeight: 700 }}>任务会话区</span></Space>}
      extra={<Text type="secondary" style={{ fontSize: 12 }}>消息流容器 · 上下文持续挂载</Text>}
      bordered={false}
      style={{ borderRadius: 20, border: "1px solid #e2e8f0", boxShadow: "0 10px 30px rgba(15,23,42,0.06)", overflow: "hidden", background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)" }}
      styles={{ body: { padding: 0, overflow: "hidden" } }}
    >
      <div style={{ padding: "12px 18px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Space size={8} wrap>
          <Tag color="blue" style={{ marginInlineEnd: 0 }}>当前会话</Tag>
          <Text style={{ fontSize: 13, color: "#334155", fontWeight: 600 }}>{title || "任务会话"}</Text>
        </Space>
        <Button size="small" onClick={onClose}>
          收起会话
        </Button>
      </div>
      {frameLoading ? (
        <div style={{ padding: "14px 18px", background: "linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%)", borderBottom: "1px solid #dbeafe" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1e3a8a", marginBottom: 4 }}>任务会话正在同步</div>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>正在恢复阶段进展、挂载上下文并准备消息流容器...</div>
          <Progress percent={loadingPercent} size="small" showInfo={false} strokeColor={{ from: "#60a5fa", to: "#2563eb" }} trailColor="#dbeafe" status="active" />
        </div>
      ) : null}
      <div style={{ padding: "16px", background: "#f1f5f9" }}>
        <div style={{ borderRadius: 16, overflow: "hidden", border: "1px solid #dbe2ea", boxShadow: "0 10px 30px rgba(15,23,42,0.08)", background: "#fff" }}>
          <iframe
            src={src}
            title="任务会话窗"
            onLoad={() => {
              setLoadingPercent(100);
              window.setTimeout(() => setFrameLoading(false), 320);
            }}
            style={{ width: "100%", height: "70vh", border: "none", background: "#fff" }}
          />
        </div>
      </div>
    </Card>
  );
}

function StatCard({ title, value, icon, color }: { title: string; value: string | number; icon: React.ReactNode; color: string }) {
  return (
    <Card 
      styles={{ body: { padding: "20px" } }} 
      bordered={false} 
      style={{ 
        borderRadius: "20px",
        boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
        border: "1px solid #f1f5f9",
        background: "#fff"
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <div style={{ 
          width: "48px",
          height: "48px",
          borderRadius: "14px", 
          background: `${color}15`, 
          color, 
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0
        }}>
          {icon}
        </div>
        <div>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.025em" }}>{title}</div>
          <div style={{ fontSize: "24px", fontWeight: 800, color: "#1e293b", lineHeight: 1.2 }}>{value}</div>
        </div>
      </div>
    </Card>
  );
}

function ResearchExperimentWorkbenchPage() {
  const navigate = useNavigate();
  const askSecretary = () => {
    openSecretaryWithContext(
      navigate,
      "智能工作台：当前正在管理与调度数字分身协作任务，请优先识别最该推进的任务、风险点和下一步编排动作。",
    );
  };
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [stateUpdatingId, setStateUpdatingId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [items, setItems] = useState<ResearchExperimentJob[]>([]);
  const [chatTitle, setChatTitle] = useState("任务会话");
  const [chatSrc, setChatSrc] = useState("");
  const [quickAppKeys, setQuickAppKeys] = useState<string[]>(DEFAULT_QUICK_APP_KEYS);
  const [form] = Form.useForm();
  const chatAnchorRef = useRef<HTMLDivElement | null>(null);

  const scrollToCreateForm = () => {
    form.scrollToField("title");
  };

  const stats = useMemo(() => {
    const active = items.filter(i => i.business_state === "active").length;
    const completed = items.filter(i => i.status === "verified").length;
    return { active, completed, total: items.length };
  }, [items]);

  const quickApps = useMemo(
    () =>
      Array.from(new Set(quickAppKeys.map((key) => String(key || "").trim()).filter(Boolean))).map(
        (key) => toQuickAppConfig(key),
      ),
    [quickAppKeys],
  );

  const handleQuickAppClick = (key: string) => {
    const ts = Date.now();
    const app = quickApps.find(a => a.key === key);
    sessionStorage.setItem("copaw_scene_start_v1", JSON.stringify({
      key,
      label: app?.label,
      triggerKey: key,
      sessionName: app?.label,
      templateType: "scene",
      ts
    }));
    navigate(`/app/workspace?scene=${encodeURIComponent(key)}&t=${ts}`);
  };

  const currentDepartment =
    sessionStorage.getItem("copaw_department") ||
    localStorage.getItem("copaw_department") ||
    "";

  const taskPlaceholders = useMemo(() => {
    const dept = String(currentDepartment || "").trim();
    const fallback = {
      title: "例如：跨部门协同推进任务",
      goal: "例如：明确目标、关键节点与所需协同资源",
    };
    const map: Record<string, { title: string; goal: string }> = {
      科研部: {
        title: "例如：固态电池氧化物研究",
        goal: "例如：梳理最新氧化物电解质研究进展并给出阶段结论",
      },
      研发部: {
        title: "例如：AI平台性能优化",
        goal: "例如：定位高并发下的响应瓶颈并制定优化方案",
      },
      法务部: {
        title: "例如：合同条款风险评估",
        goal: "例如：识别关键风险条款并给出修改建议",
      },
      行政部: {
        title: "例如：办公流程优化",
        goal: "例如：整理现有流程痛点并提出改进建议",
      },
      财务部: {
        title: "例如：季度成本复盘",
        goal: "例如：梳理主要成本项并输出降本机会清单",
      },
      总裁办: {
        title: "例如：重点项目进度汇总",
        goal: "例如：汇总关键项目进展、风险与决策建议",
      },
      品牌运营部: {
        title: "例如：品牌活动复盘",
        goal: "例如：总结传播效果并输出下阶段优化要点",
      },
    };
    return map[dept] || fallback;
  }, [currentDepartment]);

  const focusJob = useMemo(
    () => items.find((item) => item.business_state === "active") || items[0] || null,
    [items],
  );
  const riskCount = useMemo(
    () => items.filter((item) => item.status === "failed" || item.business_state === "paused").length,
    [items],
  );
  const aiPageContext = useMemo(() => {
    const deptLabel = String(currentDepartment || "").trim() || "当前组织";
    const focusTitle = focusJob?.title || "暂无重点任务";
    return {
      path: "/app/research-experiment",
      source: "research-workbench",
      title: focusJob ? `当前工作台聚焦任务：${focusJob.title}` : "当前工作台暂无活跃任务，适合发起新任务",
      summary: `部门视角：${deptLabel}；总任务 ${stats.total} 个；进行中 ${stats.active} 个；已完成 ${stats.completed} 个；风险任务 ${riskCount} 个。`,
      tags: [deptLabel, stats.active > 0 ? "任务推进中" : "待编排", riskCount > 0 ? `风险:${riskCount}` : "风险可控"],
      insights: [
        `优先任务：${focusTitle}`,
        `当前进行中任务：${stats.active} 个`,
        focusJob ? `重点任务状态：${focusJob.running_state || statusLabelMap[focusJob.status] || focusJob.status}` : "当前暂无重点任务",
      ],
      quickPrompts: focusJob
        ? [
            `请优先分析任务《${focusJob.title}》下一步`,
            "解释当前工作台里最需要先处理的风险",
            `基于任务《${focusJob.title}》给出编排建议`,
          ]
        : ["当前适合创建什么类型的新任务", "请帮我给当前工作台做一个优先级排序"],
      promptContext: [
        "页面：智能工作台",
        `部门视角：${deptLabel}`,
        `任务总数：${stats.total}`,
        `进行中任务：${stats.active}`,
        `已完成任务：${stats.completed}`,
        `风险任务：${riskCount}`,
        focusJob ? `重点任务：${focusJob.title}` : "重点任务：-",
        focusJob ? `重点任务上下文：\n${buildTaskMemoryPrompt(focusJob)}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    };
  }, [currentDepartment, focusJob, riskCount, stats.active, stats.completed, stats.total]);

  usePageAiContextSync(aiPageContext);

  const reload = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await researchExperimentApi.list(true);
      const nextItems = Array.isArray(res?.items) ? res.items : [];
      setItems(nextItems);
    } catch (err) {
      console.error(err);
      if (!silent) message.error("加载任务失败");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void reload(false);
  }, []);

  useEffect(() => {
    let canceled = false;
    const loadQuickApps = async () => {
      try {
        const res = await dashboardSkillApi.resolve(String(currentDepartment || "").trim());
        const nextKeys = Array.isArray(res?.triggers)
          ? Array.from(new Set(res.triggers.map((item) => String(item || "").trim()).filter(Boolean)))
          : [];
        if (!canceled) {
          setQuickAppKeys(nextKeys.length ? nextKeys : DEFAULT_QUICK_APP_KEYS);
        }
      } catch (err) {
        console.warn("Failed to resolve dashboard quick apps:", err);
        if (!canceled) {
          setQuickAppKeys(DEFAULT_QUICK_APP_KEYS);
        }
      }
    };
    void loadQuickApps();
    return () => {
      canceled = true;
    };
  }, [currentDepartment]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const hasRunning = items.some(
        (item) => item.business_state === "active" && !isTerminalStatus(item.status),
      );
      if (!hasRunning) return;
      void reload(true);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [items]);

  const jumpToTaskChat = () => {
    window.setTimeout(() => {
      chatAnchorRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 80);
  };

  const openTaskChat = (job: ResearchExperimentJob) => {
    if (!job.followup_chat_id) {
      message.warning("任务会话尚未初始化，请刷新后重试");
      return;
    }
    const prompt = buildTaskMemoryPrompt(job);
    sessionStorage.setItem(
      SCENE_PENDING_STORAGE,
      JSON.stringify({
        id: job.followup_chat_id,
        prompt,
        processingText: "正在同步任务上下文、恢复阶段进展与消息流...",
        ts: Date.now(),
      }),
    );
    setChatTitle(`任务会话 · ${job.title}`);
    setChatSrc(`/app/workspace-embed/${encodeURIComponent(job.followup_chat_id)}?task=${encodeURIComponent(job.id)}&simple=1&t=${Date.now()}`);
    jumpToTaskChat();
  };

  const handleCreateAndRun = async (values: { title: string; experiment_goal?: string }) => {
    setSubmitting(true);
    try {
      const created = await researchExperimentApi.create({
        title: values.title,
        experiment_goal: values.experiment_goal || "",
      });
      const jobId = created?.item?.id || "";
      if (!jobId) throw new Error("missing created job id");

      await researchExperimentApi.run(jobId);
      const latest = await researchExperimentApi.get(jobId);
      const latestJob = (latest?.item || created?.item) as ResearchExperimentJob;

      message.success("任务已创建，系统正在后台处理");
      if (latestJob?.followup_chat_id) {
        openTaskChat(latestJob);
      } else {
        message.info("任务会话正在初始化，可稍后点击“会话交互”继续");
      }

      form.resetFields();
      await reload(true);
    } catch (err) {
      console.error(err);
      message.error("创建任务失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  const handleBusinessState = async (
    job: ResearchExperimentJob,
    nextState: "active" | "paused" | "closed",
  ) => {
    setStateUpdatingId(`${job.id}:${nextState}`);
    try {
      await researchExperimentApi.updateBusinessState(job.id, {
        business_state: nextState,
      });
      const actionLabel =
        nextState === "paused" ? "已暂停任务" : nextState === "closed" ? "已关闭任务" : "已恢复任务";
      message.success(actionLabel);
      await reload(true);
    } catch (err) {
      console.error(err);
      message.error("状态更新失败，请稍后重试");
    } finally {
      setStateUpdatingId("");
    }
  };

  const handleDelete = async (job: ResearchExperimentJob) => {
    setDeletingId(job.id);
    try {
      await researchExperimentApi.remove(job.id);
      message.success("任务已删除");
      setItems((prev) => prev.filter((item) => item.id !== job.id));
      if (chatSrc.includes(`task=${encodeURIComponent(job.id)}`)) {
        setChatSrc("");
        setChatTitle("任务会话");
      }
    } catch (err) {
      console.error(err);
      message.error("删除任务失败，请稍后重试");
    } finally {
      setDeletingId("");
    }
  };

  const columns: ColumnsType<ResearchExperimentJob> = [
    {
      title: "任务",
      dataIndex: "title",
      key: "title",
      ellipsis: true,
    },
    {
      title: "业务状态",
      dataIndex: "business_state",
      key: "business_state",
      width: 120,
      render: (value: string) => (
        <Tag color={businessStateColorMap[value] || "default"}>
          {businessStateLabelMap[value] || value || "-"}
        </Tag>
      ),
    },
    {
      title: "运行状态",
      dataIndex: "status",
      key: "status",
      width: 180,
      render: (_: string, record) => (
        <Tag color={statusColorMap[record.status] || "default"}>
          {record.running_state || statusLabelMap[record.status] || record.status}
        </Tag>
      ),
    },
    {
      title: "更新时间",
      dataIndex: "updated_at",
      key: "updated_at",
      width: 180,
      render: (value: number) => formatTs(value),
    },
    {
      title: "操作",
      key: "actions",
      width: 380,
      render: (_: unknown, record) => (
        <Space>
          {record.business_state === "active" ? (
            <Button
              size="small"
              loading={stateUpdatingId === `${record.id}:paused`}
              onClick={(event) => {
                event.stopPropagation();
                void handleBusinessState(record, "paused");
              }}
            >
              暂停任务
            </Button>
          ) : null}
          {record.business_state === "paused" ? (
            <Button
              size="small"
              type="primary"
              loading={stateUpdatingId === `${record.id}:active`}
              onClick={(event) => {
                event.stopPropagation();
                void handleBusinessState(record, "active");
              }}
            >
              恢复任务
            </Button>
          ) : null}
          {record.business_state !== "closed" ? (
            <Popconfirm
              title="确认关闭该任务？"
              okText="确认"
              cancelText="取消"
              onConfirm={() => void handleBusinessState(record, "closed")}
            >
              <Button
                size="small"
                danger
                loading={stateUpdatingId === `${record.id}:closed`}
                onClick={(event) => event.stopPropagation()}
              >
                关闭任务
              </Button>
            </Popconfirm>
          ) : null}
          <Button
            size="small"
            disabled={record.business_state === "closed"}
            onClick={(event) => {
              event.stopPropagation();
              openTaskChat(record);
            }}
          >
            会话交互
          </Button>
          <Popconfirm
            title="确认删除该任务？删除后不可恢复。"
            okText="确认删除"
            cancelText="取消"
            onConfirm={() => void handleDelete(record)}
          >
            <Button
              size="small"
              danger
              loading={deletingId === record.id}
              onClick={(event) => event.stopPropagation()}
            >
              删除任务
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Space className="lux-shell" direction="vertical" size={24} style={{ width: "100%", padding: "4px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <Title level={2} style={{ margin: 0, fontWeight: 800, letterSpacing: "-0.02em", color: "#1e293b" }}>
            智能工作台
          </Title>
          <Text style={{ color: "#64748b", fontSize: 14 }}>Agent OS 任务调度中心 · 数字员工实时协作面板</Text>
        </div>
        <Space size={12}>
          <Button 
            icon={<MessagesSquare size={16} />} 
            onClick={askSecretary}
            style={{ borderRadius: 10, height: 40, fontWeight: 600 }}
          >
            咨询秘书
          </Button>
          <Button 
            icon={<RefreshCw size={16} />} 
            onClick={() => void reload(false)} 
            loading={loading}
            style={{ borderRadius: 10, height: 40, fontWeight: 600 }}
          >
            刷新
          </Button>
          <Button 
            type="primary" 
            icon={<Plus size={16} />} 
            onClick={scrollToCreateForm}
            style={{ borderRadius: 10, height: 40, fontWeight: 600, background: "#6366f1", borderColor: "#6366f1" }}
          >
            新建任务
          </Button>
        </Space>
      </div>

      <PageAiInsightCard
        badge="AI 任务编排"
        tone="indigo"
        title={stats.active > 0 ? `红智助手已识别 ${stats.active} 个任务正在推进` : "红智助手已识别当前工作台处于待编排状态"}
        description="现在打开工作台就能直接看到 AI 对任务态势的判断、优先级建议与接管入口，而不是先进入会话后才感知智能能力。"
        insights={[
          `进行中任务：${stats.active} 个`,
          `已完成任务：${stats.completed} 个`,
          `最近任务：${items[0]?.title || "暂无任务，适合直接发起新指令"}`,
        ]}
        suggestions={[
          stats.active > 0
            ? "优先清理仍在执行中的任务阻塞，再继续扩展新任务。"
            : "当前适合直接发起新任务，让 AI 先完成目标澄清与方案研判。",
          "跨角色任务建议先让秘书给出编排建议，再决定是否拉专家进入。",
          "复杂任务保留会话交互入口，持续沉淀上下文和阶段记忆。",
        ]}
        actions={[
          { key: "workbench-secretary", label: "让秘书接管当前工作台", type: "primary", onClick: askSecretary },
          { key: "workbench-create", label: "新建任务", onClick: scrollToCreateForm },
          { key: "workbench-expert", label: "查看专家中心", onClick: () => navigate("/app/expert-center") },
        ]}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
        <StatCard title="正在运行" value={stats.active} icon={<Activity size={24} />} color="#6366f1" />
        <StatCard title="已完成" value={stats.completed} icon={<CheckCircle2 size={24} />} color="#22c55e" />
        <StatCard title="总任务数" value={stats.total} icon={<Clock size={24} />} color="#8b5cf6" />
        <StatCard title="活跃 Agent" value={stats.active > 0 ? 1 : 0} icon={<Users size={24} />} color="#f59e0b" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
        {quickApps.map(app => (
          <Card 
            key={app.key}
            hoverable
            onClick={() => handleQuickAppClick(app.key)}
            style={{ borderRadius: "16px", border: "1px solid #f1f5f9", overflow: "hidden" }}
            styles={{ body: { padding: "20px" } }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <div style={{ 
                width: "48px", 
                height: "48px", 
                borderRadius: "12px", 
                background: `${app.color}10`, 
                color: app.color,
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}>
                {app.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: "16px", color: "#1e293b" }}>{app.label}</div>
                <div style={{ fontSize: "13px", color: "#64748b", marginTop: "2px" }}>{app.desc}</div>
              </div>
              <Zap size={16} color="#cbd5e1" />
            </div>
          </Card>
        ))}
      </div>

      <Card
        styles={{
          body: {
            padding: "32px",
            borderRadius: 24,
            background: "linear-gradient(135deg, #ffffff 0%, #f8faff 100%)",
          },
        }}
        bordered={false}
        style={{ 
          borderRadius: 24,
          boxShadow: "0 10px 15px -3px rgba(0,0,0,0.05)",
          border: "1px solid #f1f5f9"
        }}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) =>
            void handleCreateAndRun(
              values as {
                title: string;
                experiment_goal?: string;
              },
            )
          }
        >
          <div style={{ display: "flex", gap: "16px", alignItems: "flex-end" }}>
            <Form.Item
              label={<span style={{ fontWeight: 700, color: "#1e293b" }}>任务指令</span>}
              name="title"
              rules={[{ required: true, message: "请输入任务指令或名称" }]}
              style={{ flex: 1, marginBottom: 0 }}
            >
              <Input 
                placeholder={taskPlaceholders.title} 
                size="large" 
                style={{ borderRadius: 12, height: 48, border: "1px solid #e2e8f0" }} 
              />
            </Form.Item>
            <Form.Item style={{ marginBottom: 0 }}>
              <Button 
                type="primary" 
                htmlType="submit" 
                size="large" 
                loading={submitting} 
                icon={<Plus size={18} />}
                style={{ borderRadius: 12, height: 48, padding: "0 32px", fontWeight: 700, background: "#6366f1", borderColor: "#6366f1" }}
              >
                发布指令
              </Button>
            </Form.Item>
          </div>
          <Form.Item 
            label={<span style={{ fontWeight: 700, color: "#1e293b" }}>详细目标 (可选)</span>} 
            name="experiment_goal" 
            style={{ marginTop: "20px", marginBottom: 0 }}
          >
            <TextArea 
              rows={3} 
              placeholder={taskPlaceholders.goal} 
              style={{ borderRadius: 12, border: "1px solid #e2e8f0", padding: "12px" }} 
            />
          </Form.Item>
        </Form>
      </Card>

      <div ref={chatAnchorRef}>
        <TaskChatDrawer
          src={chatSrc}
          title={chatTitle}
          onClose={() => {
            setChatSrc("");
            setChatTitle("任务会话");
          }}
        />
      </div>

      <Card
        title={
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ background: "#f1f5f9", padding: "6px", borderRadius: "8px", display: "flex" }}>
              <Search size={18} color="#64748b" />
            </div>
            <span style={{ fontWeight: 700, fontSize: 16 }}>任务调度队列</span>
          </div>
        }
        bordered={false}
        style={{ 
          borderRadius: 24, 
          boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.05)",
          border: "1px solid #f1f5f9"
        }}
        styles={{ header: { borderBottom: "1px solid #f1f5f9", padding: "16px 24px" }, body: { padding: "12px 0" } }}
      >
        <Table<ResearchExperimentJob>
          rowKey="id"
          size="large"
          loading={loading}
          columns={columns}
          dataSource={items}
          pagination={{ 
            pageSize: 5, 
            hideOnSinglePage: true,
            style: { paddingRight: 24 }
          }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无活跃任务" /> }}
          onRow={(record) => ({
            onClick: () => navigate(`/app/research-experiment/${record.id}`),
            style: { cursor: "pointer" }
          })}
          style={{ padding: "0 8px" }}
        />
      </Card>
    </Space>
  );
}

function ResearchExperimentDetailPage({ jobId }: { jobId: string }) {
  const navigate = useNavigate();
  const askSecretary = () => {
    sessionStorage.setItem("copaw_secretary_scene_context", `任务详情页：正在审查任务 #${jobId.substring(0, 8)} 的执行进度与产出结果`);
    navigate("/app/secretary");
  };
  const [loading, setLoading] = useState(false);
  const [stateUpdatingId, setStateUpdatingId] = useState("");
  const [item, setItem] = useState<ResearchExperimentJob | null>(null);
  const [chatTitle, setChatTitle] = useState("任务会话");
  const [chatSrc, setChatSrc] = useState("");
  const chatAnchorRef = useRef<HTMLDivElement | null>(null);

  const reload = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await researchExperimentApi.get(jobId);
      setItem(res?.item || null);
    } catch (err) {
      console.error(err);
      if (!silent) message.error("加载任务看板失败");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void reload(false);
  }, [jobId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!item) return;
      if (item.business_state !== "active" || isTerminalStatus(item.status)) return;
      void reload(true);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [item, jobId]);

  const runningLabel = item?.running_state || (item ? statusLabelMap[item.status] : "-");
  const resultFeedback =
    item?.result_feedback || item?.suggested_patch || item?.repair_plan || "系统处理中，暂无结果反馈";
  const stageSummary =
    item?.stage_summary || item?.verification_summary || "系统处理中，阶段总结尚未生成";
  const objectiveText = item?.experiment_goal?.trim() || "未填写任务目标";
  const acceptanceCriteria = objectiveText
    .split(/[；;。]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 3);
  const executionPlan = [
    {
      phase: "目标澄清",
      output: "明确研究问题、边界与验收标准",
      state: item?.status === "created" ? "当前阶段" : "待办/已完成",
    },
    {
      phase: "资料研判",
      output: "形成阶段诊断、路线建议与证据支撑",
      state: item?.status === "diagnosed" ? "当前阶段" : "待办/已完成",
    },
    {
      phase: "执行产出",
      output: "生成结果反馈、关键结论与可复用材料",
      state: item?.status === "repaired" ? "当前阶段" : "待办/已完成",
    },
    {
      phase: "复核总结",
      output: "输出阶段总结与后续建议",
      state: item?.status === "verified" ? "当前阶段" : "待办/已完成",
    },
  ];
  const currentStepIndex = (() => {
    if (!item) return 0;
    if (item.status === "created") return 0;
    if (item.status === "diagnosed") return 1;
    if (item.status === "repaired") return 2;
    if (item.status === "verified") return 3;
    return 0;
  })();
  const riskItems: string[] = [];
  if (item?.status === "failed") {
    riskItems.push("任务执行失败，建议先处理错误原因并重试。");
  }
  if (item?.business_state === "paused") {
    riskItems.push("任务当前已暂停，需恢复后继续推进。");
  }
  if (item?.business_state === "closed") {
    riskItems.push("任务当前已关闭，如需继续请新建任务。");
  }
  if (item?.diagnosis) {
    riskItems.push(`诊断提示：${item.diagnosis}`);
  }
  if (!riskItems.length) {
    riskItems.push("暂无显著阻塞，建议继续按阶段推进并补齐关键输入。");
  }
  const resultOutputs = [
    { label: "结果反馈", value: resultFeedback },
    { label: "阶段总结", value: stageSummary },
    { label: "复核结论", value: item?.verification_summary || "-" },
    { label: "复用脚本", value: item?.reproduce_script || "-" },
  ];
  const aiPageContext = useMemo(() => {
    const shortJobId = jobId.substring(0, 8);
    const primaryRisk = riskItems[0] || "暂无显著阻塞";
    return {
      path: `/app/research-experiment/${jobId}`,
      source: "research-detail",
      title: item ? `当前正在审查任务《${item.title}》` : `正在加载任务 #${shortJobId}`,
      summary: item
        ? `业务状态：${businessStateLabelMap[item.business_state] || item.business_state}；运行状态：${runningLabel}；当前风险：${primaryRisk}`
        : `正在读取任务 #${shortJobId} 的执行进度与产出结果。`,
      tags: item ? [businessStateLabelMap[item.business_state] || item.business_state, runningLabel] : ["加载中", `#${shortJobId}`],
      insights: item
        ? [
            `任务目标：${item.experiment_goal?.trim() || "未填写任务目标"}`,
            `阶段诊断：${item.diagnosis || "系统正在研判"}`,
            `阶段总结：${stageSummary}`,
          ]
        : [`任务 ID：#${shortJobId}`],
      quickPrompts: item
        ? [
            `解释任务《${item.title}》当前最关键的风险`,
            `基于任务《${item.title}》给出下一步动作`,
            `总结任务《${item.title}》当前还缺什么输入`,
          ]
        : ["请先帮我梳理当前任务详情页应该重点关注什么"],
      promptContext: item ? buildTaskMemoryPrompt(item) : `页面：任务详情页\n任务ID：${jobId}`,
    };
  }, [item, jobId, riskItems, runningLabel, stageSummary]);

  usePageAiContextSync(aiPageContext);

  const historyColumns: ColumnsType<ResearchExperimentJob["history"][number]> = [
    {
      title: "时间",
      dataIndex: "ts",
      key: "ts",
      width: 170,
      render: (value: number) => formatTs(value),
    },
    {
      title: "阶段",
      dataIndex: "event",
      key: "event",
      width: 120,
      render: (value: string) => historyEventLabelMap[value] || value || "-",
    },
    {
      title: "说明",
      dataIndex: "detail",
      key: "detail",
      ellipsis: true,
    },
  ];

  const handleBusinessState = async (nextState: "active" | "paused" | "closed") => {
    if (!item) return;
    setStateUpdatingId(nextState);
    try {
      await researchExperimentApi.updateBusinessState(item.id, {
        business_state: nextState,
      });
      const actionLabel =
        nextState === "paused" ? "已暂停任务" : nextState === "closed" ? "已关闭任务" : "已恢复任务";
      message.success(actionLabel);
      await reload(true);
    } catch (err) {
      console.error(err);
      message.error("状态更新失败，请稍后重试");
    } finally {
      setStateUpdatingId("");
    }
  };

  const openTaskChat = (job: ResearchExperimentJob) => {
    if (!job.followup_chat_id) {
      message.warning("任务会话尚未初始化，请刷新后重试");
      return;
    }
    const prompt = buildTaskMemoryPrompt(job);
    sessionStorage.setItem(
      SCENE_PENDING_STORAGE,
      JSON.stringify({
        id: job.followup_chat_id,
        prompt,
        processingText: "正在同步任务上下文、恢复阶段进展与消息流...",
        ts: Date.now(),
      }),
    );
    setChatTitle(`任务会话 · ${job.title}`);
    setChatSrc(`/app/workspace-embed/${encodeURIComponent(job.followup_chat_id)}?task=${encodeURIComponent(job.id)}&simple=1&t=${Date.now()}`);
    window.setTimeout(() => {
      chatAnchorRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 80);
  };

  const topActions = useMemo(() => {
    if (!item) return null;
    return (
      <Space>
        <Button icon={<MessagesSquare size={14} />} onClick={askSecretary}>让秘书接管</Button>
        <Button onClick={() => navigate("/app/research-experiment")} icon={<Clock size={14} />}>返回工作台</Button>
        {item.business_state === "active" ? (
          <Button loading={stateUpdatingId === "paused"} onClick={() => void handleBusinessState("paused")} icon={<Activity size={14} />}>
            暂停执行
          </Button>
        ) : null}
        {item.business_state === "paused" ? (
          <Button
            type="primary"
            loading={stateUpdatingId === "active"}
            onClick={() => void handleBusinessState("active")}
            icon={<PlayCircle size={14} />}
          >
            继续执行
          </Button>
        ) : null}
        <Button
          type="primary"
          disabled={!item || item.business_state === "closed"}
          onClick={() => item && openTaskChat(item)}
          icon={<Zap size={14} />}
        >
          实时交互
        </Button>
      </Space>
    );
  }, [item, navigate, stateUpdatingId]);

  if (!item && !loading) {
    return (
      <Card bordered={false} style={{ textAlign: "center", padding: "40px" }}>
        <Empty description="任务 ID 无效或已被归档" />
        <Button onClick={() => navigate("/app/research-experiment")} type="primary" style={{ marginTop: "16px" }}>
          返回工作台
        </Button>
      </Card>
    );
  }

  return (
    <Space className="lux-shell" direction="vertical" size={16} style={{ width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <Tag color="blue">Agent OS Task</Tag>
            <Text type="secondary">#{item?.id.substring(0, 8)}</Text>
          </div>
          <Title level={3} style={{ margin: 0 }}>{item?.title || "加载中..."}</Title>
        </div>
        {topActions}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "16px" }}>
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Card loading={loading} title="任务执行流 (Agent Flow)" bordered={false} style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
            <Steps
              size="small"
              current={currentStepIndex}
              status={item?.status === "failed" ? "error" : "process"}
              items={executionPlan.map((step) => ({
                title: step.phase,
                description: step.state === "当前阶段" ? "Agent 正在处理" : "",
              }))}
              style={{ marginBottom: "24px" }}
            />
            
            <div style={{ background: "#f8faff", padding: "16px", borderRadius: "8px", border: "1px solid #e6f0ff" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <Activity size={16} color="#1890ff" />
                <Text strong>当前执行状态：{runningLabel}</Text>
              </div>
              <Paragraph style={{ margin: 0, color: "#595959" }}>
                {item?.diagnosis || "Agent 正在根据任务目标进行自动化研判与逻辑推导..."}
              </Paragraph>
            </div>
          </Card>

          <Card loading={loading} title="执行产出与证据 (Artifacts)" bordered={false} style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              {resultOutputs.map((output) => (
                <div key={output.label} style={{ padding: "12px", background: "#fcfcfc", borderRadius: "8px", border: "1px solid #f0f0f0" }}>
                  <Text type="secondary" style={{ fontSize: "12px", display: "block", marginBottom: "4px" }}>{output.label}</Text>
                  <Paragraph style={{ margin: 0, fontSize: "14px" }} ellipsis={{ rows: 3, expandable: true }}>
                    {output.value}
                  </Paragraph>
                </div>
              ))}
            </div>
          </Card>

          <Card loading={loading} title="协作日志" bordered={false} style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
            <Table
              rowKey={(record) => `${String(record.ts || "")}-${String(record.event || "")}`}
              size="small"
              pagination={false}
              columns={historyColumns}
              dataSource={Array.isArray(item?.history) ? item?.history : []}
            />
          </Card>
        </Space>

        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Card loading={loading} title="任务锚点" bordered={false} style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
            <Paragraph style={{ whiteSpace: "pre-wrap", color: "#595959" }}>
              {objectiveText}
            </Paragraph>
            <div style={{ marginTop: "16px" }}>
              <Text strong style={{ display: "block", marginBottom: "8px" }}>验收条件</Text>
              {acceptanceCriteria.map((criterion, index) => (
                <div key={index} style={{ display: "flex", gap: "8px", marginBottom: "4px" }}>
                  <CheckCircle2 size={14} color="#52c41a" style={{ marginTop: "4px" }} />
                  <Text style={{ fontSize: 12 }}>{criterion}</Text>
                </div>
              ))}
            </div>
          </Card>

          <Card loading={loading} title="治理与风控" bordered={false} style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
            {riskItems.map((risk, index) => (
              <div key={index} style={{ display: "flex", gap: "8px", marginBottom: "8px", padding: "8px", background: "#fff1f0", borderRadius: "4px" }}>
                <Activity size={14} color="#ff4d4f" style={{ marginTop: "4px" }} />
                <Text type="danger" style={{ fontSize: 12 }}>{risk}</Text>
              </div>
            ))}
          </Card>
        </Space>
      </div>

      <div ref={chatAnchorRef} style={{ marginTop: "16px" }}>
        <TaskChatDrawer
          src={chatSrc}
          title={chatTitle}
          onClose={() => {
            setChatSrc("");
            setChatTitle("任务会话");
          }}
        />
      </div>
    </Space>
  );
}

export default function ResearchExperimentPage() {
  const { jobId } = useParams<{ jobId?: string }>();
  if (jobId) {
    return <ResearchExperimentDetailPage jobId={jobId} />;
  }
  return <ResearchExperimentWorkbenchPage />;
}
