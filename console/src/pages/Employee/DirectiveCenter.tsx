import {
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Plus,
  RefreshCw,
  Search,
  MessagesSquare,
  Sparkles,
  ExternalLink,
  FileText,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Card,
  DatePicker,
  Drawer,
  Form,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import {
  directiveCenterApi,
  type DirectiveCenterItem,
  type DirectiveSla,
  type DirectiveStatus,
} from "../../api/modules/directiveCenter";
import {
  directiveNewsApi,
  type DirectiveNewsArticleItem,
  type DirectiveNewsWindowItem,
} from "../../api/modules/directiveNews";
import { allowPartyLocalFallback } from "../../utils/runtimeFlags";
import {
  type DirectiveFormValues,
  type NewsHeadlineItem,
  type NewsWindowConfig,
  NewsWindowCard,
  calcSlaLabel,
  defaultNewsWindows,
  formatTime,
  loadLocal,
  saveLocal,
  slaOptions,
  sortByPublishAt,
  statusOptions,
} from "../../features/party/directive-center";
import { openSecretaryWithContext } from "../../features/party/shared/navigation";

const { Title, Text, Paragraph } = Typography;

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
        border: "1px solid rgba(148,163,184,0.18)",
        background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.96) 100%)",
        boxShadow: "0 20px 40px rgba(15,23,42,0.06)",
      }}
    >
      <Space direction="vertical" size={14} style={{ width: "100%" }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 16,
            background: `${color}18`,
            color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon}
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#64748b", letterSpacing: "0.04em" }}>{title}</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#0f172a", lineHeight: 1.2, marginTop: 4 }}>{value}</div>
          <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.6, color: "#94a3b8" }}>{description}</div>
        </div>
      </Space>
    </Card>
  );
}

function buildHeadlineItems(items: DirectiveNewsArticleItem[]): NewsHeadlineItem[] {
  return items.slice(0, 4).map((item) => ({
    id: item.id,
    title: item.title,
    publishedAt: item.published_at,
    originUrl: item.origin_url,
  }));
}

export default function EmployeeDirectiveCenterPage() {
  const [form] = Form.useForm<DirectiveFormValues>();
  const [items, setItems] = useState<DirectiveCenterItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newsLoading, setNewsLoading] = useState(false);
  const [syncingNews, setSyncingNews] = useState(false);
  const [newsSyncedAt, setNewsSyncedAt] = useState("");
  const [newsWindows, setNewsWindows] = useState<NewsWindowConfig[]>(() =>
    defaultNewsWindows.map((item) => ({ ...item })),
  );
  const [activeNewsKey, setActiveNewsKey] = useState<string | null>(null);
  const [activeArticles, setActiveArticles] = useState<DirectiveNewsArticleItem[]>([]);
  const [activeArticleId, setActiveArticleId] = useState<string | null>(null);
  const [articlesLoading, setArticlesLoading] = useState(false);
  const [promotingArticleId, setPromotingArticleId] = useState("");

  const navigate = useNavigate();
  const askSecretary = (context?: string) => {
    openSecretaryWithContext(
      navigate,
      context || "指示直达：正在处理最新指示研判、任务分解与贯彻文稿生成",
    );
  };
  const scrollToCreateForm = () => {
    form.scrollToField("title");
  };

  const buildNewsWindows = (
    windows: DirectiveNewsWindowItem[],
    articleMap: Map<string, DirectiveNewsArticleItem[]>,
  ): NewsWindowConfig[] => {
    const windowMap = new Map(windows.map((item) => [item.channel_key, item]));
    return defaultNewsWindows.map((column) => {
      const current = windowMap.get(column.key);
      const recentArticles = articleMap.get(column.key) || [];
      if (!current) {
        return {
          ...column,
          headlineItems: buildHeadlineItems(recentArticles),
        };
      }
      return {
        ...column,
        title: current.title || column.title,
        source: current.source || column.source,
        description: current.summary || column.description,
        digest: current.digest || current.summary || column.digest,
        footer: current.document_label ? `建议输出：${current.document_label}` : column.footer,
        publishedAt: current.published_at || "",
        level: current.level || column.level,
        policyType: current.policy_type || column.policyType,
        suggestion: current.suggestion || column.suggestion,
        documentLabel: current.document_label || column.documentLabel,
        articleId: current.article_id,
        originUrl: current.origin_url,
        syncStatus: current.sync_status,
        syncedAt: current.synced_at || undefined,
        syncError: current.sync_error,
        headlineItems: buildHeadlineItems(recentArticles),
      };
    });
  };

  const reloadDirectives = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const remote = await directiveCenterApi.list();
      const sorted = sortByPublishAt(remote);
      setItems(sorted);
      saveLocal(sorted);
    } catch {
      if (allowPartyLocalFallback) {
        const local = sortByPublishAt(loadLocal());
        setItems(local);
        if (!silent) message.warning("接口不可用，已切换为本地暂存模式");
      } else if (!silent) {
        message.error("加载失败，请检查后端服务或联系管理员");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const reloadNews = async (silent = false) => {
    if (!silent) setNewsLoading(true);
    try {
      const remote = await directiveNewsApi.listWindows();
      const articleEntries = await Promise.all(
        defaultNewsWindows.map(async (column): Promise<[string, DirectiveNewsArticleItem[]]> => {
          try {
            const articles = await directiveNewsApi.listArticles({ channel: column.key, limit: 4 });
            return [column.key, articles];
          } catch {
            return [column.key, []];
          }
        }),
      );
      setNewsSyncedAt(remote.synced_at ? formatTime(remote.synced_at) : "");
      setNewsWindows(buildNewsWindows(remote.windows, new Map(articleEntries)));
    } catch {
      setNewsSyncedAt("");
      setNewsWindows(buildNewsWindows([], new Map()));
      if (!silent) {
        message.warning("新闻栏目暂未同步成功，当前展示默认栏目模板");
      }
    } finally {
      if (!silent) setNewsLoading(false);
    }
  };

  useEffect(() => {
    void Promise.all([reloadDirectives(false), reloadNews(false)]);
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void reloadNews(true);
    }, 5 * 60 * 1000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void reloadNews(true);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const handleCreate = async (values: DirectiveFormValues) => {
    setSubmitting(true);
    const payload = {
      title: values.title.trim(),
      publish_at: values.publish_at.toISOString(),
      sla: values.sla,
      status: "待响应" as DirectiveStatus,
      summary: values.summary?.trim() || "",
      enterprise_report_title: values.enterprise_report_title?.trim() || "",
    };
    try {
      const created = await directiveCenterApi.create(payload);
      const next = sortByPublishAt([created, ...items]);
      setItems(next);
      saveLocal(next);
      form.resetFields();
      message.success("最新指示已登记");
    } catch {
      if (allowPartyLocalFallback) {
        const now = new Date().toISOString();
        const localItem: DirectiveCenterItem = {
          id: `local-${Date.now()}`,
          title: payload.title,
          publish_at: payload.publish_at,
          sla: payload.sla,
          status: payload.status,
          summary: payload.summary,
          enterprise_report_title: payload.enterprise_report_title,
          created_at: now,
          updated_at: now,
        };
        const next = sortByPublishAt([localItem, ...items]);
        setItems(next);
        saveLocal(next);
        form.resetFields();
        message.success("最新指示已登记（本地暂存）");
      } else {
        message.error("创建失败，请稍后重试");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (record: DirectiveCenterItem, status: DirectiveStatus) => {
    const now = new Date().toISOString();
    const applyLocal = () => {
      const next = items.map((item) =>
        item.id === record.id ? { ...item, status, updated_at: now } : item,
      );
      const sorted = sortByPublishAt(next);
      setItems(sorted);
      saveLocal(sorted);
    };
    try {
      await directiveCenterApi.update(record.id, { status });
      applyLocal();
      message.success("贯彻状态已更新");
    } catch {
      if (allowPartyLocalFallback) {
        applyLocal();
        message.success("贯彻状态已更新（本地暂存）");
      } else {
        message.error("状态更新失败，请稍后重试");
      }
    }
  };

  const stats = useMemo(() => {
    const total = items.length;
    const completed = items.filter((item) => item.status === "已完成").length;
    const inSla = items.filter((item) => calcSlaLabel(item).startsWith("达标")).length;
    const generatedDocs = items.filter((item) => Boolean(item.enterprise_report_title)).length;
    return { total, completed, inSla, generatedDocs };
  }, [items]);

  const handleWindowAdvice = (column: NewsWindowConfig, articleTitle?: string) => {
    const focusTitle = articleTitle || column.title;
    askSecretary(`指示直达：请围绕“${focusTitle}”结合${column.suggestion}输出企业对标建议、责任分解与风险提示`);
  };

  const handleOpenOriginal = (originUrl?: string) => {
    if (!originUrl) {
      message.info("当前文章暂无可打开的原文链接");
      return;
    }
    window.open(originUrl, "_blank", "noopener,noreferrer");
  };

  const handlePromoteArticle = async (article: DirectiveNewsArticleItem) => {
    const articleId = String(article.id || "").trim();
    if (!articleId) {
      message.warning("当前文章缺少可转化的标识");
      return;
    }
    setPromotingArticleId(articleId);
    try {
      const res = await directiveNewsApi.promote(articleId);
      await Promise.all([reloadDirectives(true), reloadNews(true)]);
      if (res?.duplicate) {
        message.success("该文章已存在对应指示事项，已为你刷新台账");
      } else {
        message.success("已转化为指示事项");
      }
    } catch {
      message.error("转化失败，请稍后重试");
    } finally {
      setPromotingArticleId("");
    }
  };

  const loadChannelArticles = async (channelKey: string): Promise<DirectiveNewsArticleItem[]> => {
    setArticlesLoading(true);
    try {
      const remote = await directiveNewsApi.listArticles({ channel: channelKey, limit: 12 });
      setActiveArticles(remote);
      return remote;
    } catch {
      setActiveArticles([]);
      message.error("栏目详情加载失败，请稍后重试");
      return [];
    } finally {
      setArticlesLoading(false);
    }
  };

  const activeNews = useMemo(
    () => newsWindows.find((item) => item.key === activeNewsKey) || null,
    [activeNewsKey, newsWindows],
  );

  const orderedActiveArticles = useMemo(() => {
    if (activeArticles.length === 0 || !activeArticleId) {
      return activeArticles;
    }
    const selected = activeArticles.find((item) => item.id === activeArticleId);
    if (!selected) {
      return activeArticles;
    }
    return [selected, ...activeArticles.filter((item) => item.id !== activeArticleId)];
  }, [activeArticleId, activeArticles]);

  const drawerArticles = useMemo(() => {
    if (orderedActiveArticles.length > 0) {
      return orderedActiveArticles;
    }
    if (!activeNews) {
      return [];
    }
    return [
      {
        id: activeNews.articleId || `${activeNews.key}-headline`,
        channel_key: activeNews.key,
        title: activeNews.title,
        source: activeNews.source,
        origin_url: activeNews.originUrl,
        published_at: activeNews.publishedAt,
        summary: activeNews.description,
        digest: activeNews.digest,
        description: activeNews.description,
        level: activeNews.level,
        policy_type: activeNews.policyType,
        suggestion: activeNews.suggestion,
        document_label: activeNews.documentLabel,
      } as DirectiveNewsArticleItem,
    ];
  }, [orderedActiveArticles, activeNews]);

  const handleOpenNewsWindow = (column: NewsWindowConfig, initialArticleId?: string) => {
    setActiveNewsKey(column.key);
    setActiveArticleId(initialArticleId || column.articleId || null);
    void loadChannelArticles(column.key).then((loadedArticles) => {
      const preferredId = initialArticleId || column.articleId || loadedArticles[0]?.id || null;
      const matched = loadedArticles.find((article) => article.id === preferredId);
      setActiveArticleId(matched?.id || loadedArticles[0]?.id || preferredId);
    });
  };

  const columns: ColumnsType<DirectiveCenterItem> = [
    {
      title: "指示主题",
      dataIndex: "title",
      key: "title",
      width: 220,
      ellipsis: true,
    },
    {
      title: "发布时间",
      dataIndex: "publish_at",
      key: "publish_at",
      width: 170,
      render: (value: string) => formatTime(value),
    },
    {
      title: "研判节奏",
      dataIndex: "sla",
      key: "sla",
      width: 100,
      render: (value: DirectiveSla) => <Tag color={value === "T+1" ? "red" : "gold"}>{value}</Tag>,
    },
    {
      title: "贯彻状态",
      dataIndex: "status",
      key: "status",
      width: 150,
      render: (value: DirectiveStatus, record) => (
        <Select<DirectiveStatus>
          size="small"
          value={value}
          style={{ width: 108 }}
          options={statusOptions.map((option) => ({ label: option, value: option }))}
          onChange={(next) => void handleStatusChange(record, next)}
        />
      ),
    },
    {
      title: "时效结果",
      key: "sla_result",
      width: 120,
      render: (_: unknown, record) => {
        const label = calcSlaLabel(record);
        return <Tag color={label.startsWith("达标") ? "success" : "error"}>{label}</Tag>;
      },
    },
    {
      title: "配套文稿",
      dataIndex: "enterprise_report_title",
      key: "enterprise_report_title",
      ellipsis: true,
      render: (value?: string) => value || "待生成",
    },
    {
      title: "操作",
      key: "action",
      width: 120,
      render: (_: unknown, record) => (
        <Button
          type="link"
          size="small"
          icon={<FileText size={14} />}
          onClick={() =>
            message.success(
              `已为“${record.title}”准备文稿生成指令${record.enterprise_report_title ? "，可继续补充内容" : ""}`,
            )
          }
        >
          生成文稿
        </Button>
      ),
    },
  ];

  return (
    <Space className="lux-shell" direction="vertical" size={18} style={{ width: "100%" }}>
      <Card
        bordered={false}
        style={{
          borderRadius: 28,
          overflow: "hidden",
          border: "1px solid rgba(248,113,113,0.16)",
          background: "linear-gradient(135deg, #fff8f8 0%, #ffffff 46%, #fff3f3 100%)",
          boxShadow: "0 18px 36px rgba(15,23,42,0.06)",
        }}
        styles={{ body: { padding: 28 } }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
          <Space direction="vertical" size={14} style={{ maxWidth: 760 }}>
            <Tag
              bordered={false}
              style={{
                marginInlineEnd: 0,
                width: "fit-content",
                color: "#b91c1c",
                background: "rgba(185,28,28,0.08)",
                borderRadius: 999,
                padding: "6px 12px",
                fontWeight: 700,
              }}
            >
              书记驾驶舱 · 党务看板
            </Tag>
            <div>
              <Title level={2} style={{ margin: 0, color: "#111827" }}>
                指示直达
              </Title>
              <Paragraph style={{ margin: "12px 0 0", color: "#475569", lineHeight: 1.9, fontSize: 15 }}>
                聚焦上级最新指示、中央精神传达与企业贯彻落地，按栏目持续追踪重点资讯，并直接把具体文章转成可分析、可执行、可回看的企业动作入口。
              </Paragraph>
              <Text style={{ color: "#94a3b8", fontSize: 12 }}>
                后端定时自动抓取栏目数据，页面每 5 分钟自动刷新一次；切回当前页面时会立即检查更新。
                {newsSyncedAt ? ` 当前最近同步：${newsSyncedAt}` : ""}
              </Text>
            </div>
            <Space size={[8, 8]} wrap>
              <Tag color="red" style={{ borderRadius: 999, paddingInline: 10 }}>中央权威发布</Tag>
              <Tag color="blue" style={{ borderRadius: 999, paddingInline: 10 }}>国资监管专窗</Tag>
              <Tag color="purple" style={{ borderRadius: 999, paddingInline: 10 }}>地方部署快讯</Tag>
            </Space>
          </Space>
          <Space wrap size={[12, 12]}>
            <Button icon={<MessagesSquare size={14} />} onClick={() => askSecretary()}>
              咨询秘书
            </Button>
            <Button
              icon={<RefreshCw size={14} />}
              onClick={async () => {
                setSyncingNews(true);
                try {
                  await directiveNewsApi.sync({ force: true });
                  await reloadNews(true);
                  message.success("新闻栏目已同步最新数据");
                } catch {
                  message.error("同步失败，请稍后重试");
                } finally {
                  setSyncingNews(false);
                }
              }}
              loading={syncingNews || newsLoading}
            >
              同步数据
            </Button>
            <Button type="primary" danger icon={<Plus size={14} />} onClick={scrollToCreateForm}>
              登记最新指示
            </Button>
          </Space>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        <StatCard title="在办指示" value={stats.total} icon={<ShieldCheck size={20} />} color="#b91c1c" description="持续监测书记批示、上级任务和最新政策要求。" />
        <StatCard title="按时推进" value={stats.inSla} icon={<CheckCircle2 size={20} />} color="#0f766e" description="按节奏推进研判、分解和跟踪的事项数量。" />
        <StatCard title="预警事项" value={Math.max(stats.total - stats.inSla, 0)} icon={<AlertCircle size={20} />} color="#d97706" description="需要重点关注时效、协同和资源投入的事项。" />
        <StatCard title="配套文稿" value={stats.generatedDocs} icon={<FileText size={20} />} color="#7c3aed" description="已沉淀贯彻简报、汇报材料和对标报告的数量。" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
        {newsWindows.map((item) => {
          const { key, ...cardProps } = item;
          return (
            <NewsWindowCard
              key={key}
              {...cardProps}
              onOpenDetail={() => handleOpenNewsWindow(item)}
              onHeadlineClick={(headline) => handleOpenNewsWindow(item, headline.id)}
              onHeadlineAdvice={(headline) => handleWindowAdvice(item, headline.title)}
              onHeadlineOriginal={(headline) => handleOpenOriginal(headline.originUrl || item.originUrl)}
            />
          );
        })}
      </div>


      <Card
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Plus size={16} />
            登记最新指示
          </div>
        }
        bordered={false}
        style={{ borderRadius: 24, boxShadow: "0 14px 28px rgba(15,23,42,0.05)" }}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ sla: "T+1", publish_at: dayjs() }}
          onFinish={(values) => void handleCreate(values)}
        >
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 16 }}>
            <Form.Item
              label="指示主题"
              name="title"
              rules={[{ required: true, message: "请输入指示主题" }]}
              style={{ marginBottom: 16 }}
            >
              <Input maxLength={120} placeholder="例如：关于提升基层治理质效的最新要求" />
            </Form.Item>
            <Form.Item
              label="发布时间"
              name="publish_at"
              rules={[{ required: true, message: "请选择发布时间" }]}
              style={{ marginBottom: 16 }}
            >
              <DatePicker showTime style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item
              label="研判节奏"
              name="sla"
              rules={[{ required: true, message: "请选择研判节奏" }]}
              style={{ marginBottom: 16 }}
            >
              <Select options={slaOptions.map((option) => ({ label: option, value: option }))} />
            </Form.Item>
          </div>
          <Form.Item label="精神要点与企业落点" name="summary" style={{ marginBottom: 16 }}>
            <Input.TextArea rows={3} maxLength={500} placeholder="记录上级指示重点、企业当前状态、需重点对标的问题和建议动作" />
          </Form.Item>
          <div style={{ display: "flex", gap: 16, alignItems: "flex-end" }}>
            <Form.Item label="拟输出文稿标题" name="enterprise_report_title" style={{ flex: 1, marginBottom: 0 }}>
              <Input maxLength={150} placeholder="例如：贯彻最新指示精神阶段性落实报告（2026年4月）" />
            </Form.Item>
            <Button type="primary" danger htmlType="submit" loading={submitting} icon={<Plus size={14} />}>
              生成跟进事项
            </Button>
          </div>
        </Form>
      </Card>

      <Card
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Search size={16} />
            指示转化台账
          </div>
        }
        bordered={false}
        style={{ borderRadius: 24, boxShadow: "0 14px 28px rgba(15,23,42,0.05)" }}
      >
        <Table<DirectiveCenterItem>
          rowKey="id"
          size="middle"
          loading={loading}
          columns={columns}
          dataSource={items}
          pagination={{ pageSize: 8, hideOnSinglePage: true }}
          locale={{ emptyText: "暂无最新指示，建议先登记上级最新精神或重点任务" }}
        />
      </Card>

      <Drawer
        title={activeNews ? `${activeNews.eyebrow} · 栏目详情` : "栏目详情"}
        width={680}
        onClose={() => {
          setActiveNewsKey(null);
          setActiveArticles([]);
          setActiveArticleId(null);
        }}
        open={Boolean(activeNews)}
      >
        {activeNews ? (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Card size="small" style={{ borderRadius: 16, borderColor: `${activeNews.accent}26`, background: activeNews.accentSoft }}>
              <Space direction="vertical" size={10} style={{ width: "100%" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <Text style={{ color: activeNews.accent, fontWeight: 700 }}>{activeNews.channel}</Text>
                    <Title level={5} style={{ margin: "10px 0 0", color: "#0f172a" }}>
                      {activeNews.eyebrow}
                    </Title>
                  </div>
                  <Tag color={activeNews.syncStatus === "success" ? "success" : "default"}>
                    同步状态：{activeNews.syncStatus === "success" ? "已同步" : activeNews.syncStatus || "未同步"}
                  </Tag>
                </div>
                <Paragraph style={{ margin: 0, color: "#475569", lineHeight: 1.8 }}>
                  {activeNews.description}
                </Paragraph>
                <Space size={[8, 8]} wrap>
                  <Tag color="blue">栏目层级：{activeNews.level}</Tag>
                  <Tag color="purple">栏目类型：{activeNews.policyType}</Tag>
                  <Tag>{`文章数量：${drawerArticles.length}`}</Tag>
                </Space>
                <Text type="secondary">
                  {activeNews.syncedAt ? `最近同步：${formatTime(activeNews.syncedAt)}` : activeNews.syncError || "等待首次同步"}
                </Text>
              </Space>
            </Card>

            <Card size="small" style={{ borderRadius: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                <Text strong>栏目文章</Text>
                <Text style={{ color: "#94a3b8", fontSize: 12 }}>
                  {articlesLoading ? "正在更新列表..." : `共 ${drawerArticles.length} 篇`}
                </Text>
              </div>
              <Space direction="vertical" size={12} style={{ width: "100%", marginTop: 12 }}>
                {articlesLoading ? (
                  <Paragraph style={{ margin: 0, color: "#64748b" }}>正在加载栏目最近文章...</Paragraph>
                ) : drawerArticles.length > 0 ? (
                  drawerArticles.map((article, index) => {
                    const selected = article.id === activeArticleId || (!activeArticleId && index === 0);
                    const articleSummary = article.summary || article.digest || article.description;
                    return (
                      <Card
                        key={article.id}
                        size="small"
                        hoverable
                        onClick={() => setActiveArticleId(article.id)}
                        style={{
                          borderRadius: 14,
                          background: selected ? `${activeNews.accent}0d` : "#ffffff",
                          borderColor: selected ? `${activeNews.accent}44` : "#e2e8f0",
                          boxShadow: selected ? "0 12px 24px rgba(15,23,42,0.06)" : "none",
                          cursor: "pointer",
                        }}
                      >
                        <Space direction="vertical" size={8} style={{ width: "100%" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                            <Text strong style={{ color: "#0f172a", fontSize: 15 }}>
                              {article.title}
                            </Text>
                            <Text type="secondary">{formatTime(article.published_at)}</Text>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                            <Text type="secondary">来源：{article.source || activeNews.source}</Text>
                            <Space size={[8, 8]} wrap>
                              <Tag bordered={false} style={{ borderRadius: 999, marginInlineEnd: 0, background: "#eff6ff", color: "#2563eb" }}>
                                {article.level || activeNews.level}
                              </Tag>
                              <Tag bordered={false} style={{ borderRadius: 999, marginInlineEnd: 0, background: `${activeNews.accent}10`, color: activeNews.accent }}>
                                {article.policy_type || activeNews.policyType}
                              </Tag>
                            </Space>
                          </div>
                          {articleSummary ? (
                            <Paragraph style={{ margin: 0, color: "#64748b", lineHeight: 1.75 }}>
                              {articleSummary}
                            </Paragraph>
                          ) : null}
                          <Space wrap size={[8, 8]}>
                            <Button
                              icon={<Sparkles size={14} />}
                              style={{ borderColor: `${activeNews.accent}40`, color: activeNews.accent }}
                              onClick={(event) => {
                                event.stopPropagation();
                                handleWindowAdvice(activeNews, article.title);
                              }}
                            >
                              AI分析
                            </Button>
                            <Button
                              type="primary"
                              ghost
                              icon={<Plus size={14} />}
                              loading={promotingArticleId === article.id}
                              onClick={(event) => {
                                event.stopPropagation();
                                void handlePromoteArticle(article);
                              }}
                            >
                              转成指示
                            </Button>
                            <Button
                              icon={<ExternalLink size={14} />}
                              onClick={(event) => {
                                event.stopPropagation();
                                handleOpenOriginal(article.origin_url || activeNews.originUrl);
                              }}
                            >
                              查看原文
                            </Button>
                          </Space>
                        </Space>
                      </Card>
                    );
                  })
                ) : (
                  <Paragraph style={{ margin: 0, color: "#94a3b8" }}>
                    当前栏目暂无最近文章，请先点击页面顶部“同步数据”。
                  </Paragraph>
                )}
              </Space>
            </Card>
          </Space>
        ) : null}
      </Drawer>
    </Space>
  );
}
