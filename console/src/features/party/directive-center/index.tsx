import { ArrowRight, ExternalLink, Sparkles } from "lucide-react";
import { Button, Card, Space, Tag, Typography } from "antd";
import type { Dayjs } from "dayjs";
import type {
  DirectiveCenterItem,
  DirectiveSla,
  DirectiveStatus,
} from "../../../api/modules/directiveCenter";
import { loadLocalList, saveLocalList } from "../shared/local-cache";

const { Text } = Typography;
const LOCAL_KEY = "copaw_directive_center_mvp_v1";

export interface NewsHeadlineItem {
  id: string;
  title: string;
  publishedAt?: string;
  originUrl?: string;
}

export interface NewsWindowConfig {
  key: string;
  eyebrow: string;
  channel: string;
  source: string;
  level: string;
  policyType: string;
  title: string;
  description: string;
  digest: string;
  footer: string;
  accent: string;
  accentSoft: string;
  suggestion: string;
  documentLabel: string;
  publishedAt?: string;
  articleId?: string;
  originUrl?: string;
  syncStatus?: string;
  syncedAt?: string;
  syncError?: string;
  headlineItems?: NewsHeadlineItem[];
  record?: DirectiveCenterItem;
}

export interface DirectiveFormValues {
  title: string;
  publish_at: Dayjs;
  sla: DirectiveSla;
  summary?: string;
  enterprise_report_title?: string;
}

export const slaOptions: DirectiveSla[] = ["T+1", "T+3"];
export const statusOptions: DirectiveStatus[] = ["待响应", "分析中", "已完成"];

export const loadLocal = (): DirectiveCenterItem[] =>
  loadLocalList<DirectiveCenterItem>(LOCAL_KEY);

export const saveLocal = (items: DirectiveCenterItem[]): void => {
  saveLocalList(LOCAL_KEY, items);
};

export const sortByPublishAt = (
  items: DirectiveCenterItem[],
): DirectiveCenterItem[] => {
  return [...items].sort((a, b) => {
    const aTs = new Date(a.publish_at || a.updated_at || 0).getTime();
    const bTs = new Date(b.publish_at || b.updated_at || 0).getTime();
    return bTs - aTs;
  });
};

export const formatTime = (value?: string): string => {
  if (!value) return "-";
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts) || ts <= 0) return "-";
  return new Date(ts).toLocaleString("zh-CN", { hour12: false });
};

export const calcSlaLabel = (item: DirectiveCenterItem): string => {
  const publishTs = new Date(item.publish_at || 0).getTime();
  if (!Number.isFinite(publishTs) || publishTs <= 0) return "-";
  const elapsedHours = Math.floor((Date.now() - publishTs) / (1000 * 60 * 60));
  const limit = item.sla === "T+1" ? 24 : 72;
  return elapsedHours <= limit ? `达标（${elapsedHours}h）` : `预警（${elapsedHours}h）`;
};

export const defaultNewsWindows: NewsWindowConfig[] = [
  {
    key: "central",
    eyebrow: "中央权威发布",
    channel: "中央精神头条",
    source: "新华社 / 国务院 / 中央部署",
    level: "国家级",
    policyType: "战略部署",
    title: "高质量发展与科技创新协同推进",
    description: "聚焦科技创新、现代化产业体系和成果转化效率，要求把党建引领嵌入经营一线和创新链路。",
    digest: "强调‘科技创新 + 产业升级 + 党建引领’一体推进，要求形成责任闭环和阶段成果。",
    footer: "建议输出：贯彻简报 + 责任分解表",
    accent: "#b91c1c",
    accentSoft: "linear-gradient(145deg, #fff7f7 0%, #ffffff 100%)",
    suggestion: "围绕科研攻关、产业升级和成果转化形成责任分解与阶段安排",
    documentLabel: "高质量发展贯彻简报",
  },
  {
    key: "sasac",
    eyebrow: "国资监管专窗",
    channel: "监管政策快讯",
    source: "中国政府网 / 最新政策",
    level: "部委级",
    policyType: "监管要求",
    title: "围绕监管要求形成执行清单",
    description: "结合监管政策、合规治理和经营调度要求，形成今日可执行、可分派、可追踪的贯彻动作。",
    digest: "聚焦执行口径、风险治理和阶段督办要求，强调把监管要求拆解为可追踪的部门任务。",
    footer: "建议输出：执行清单 + 周督办提纲",
    accent: "#1d4ed8",
    accentSoft: "linear-gradient(145deg, #eff6ff 0%, #ffffff 100%)",
    suggestion: "对标监管政策、经营指标和风险治理，输出可量化的执行清单",
    documentLabel: "监管政策执行清单",
  },
  {
    key: "local",
    eyebrow: "地方部署快讯",
    channel: "基层治理与专项督办",
    source: "地方党委 / 行业主管部门",
    level: "省市级",
    policyType: "专项行动",
    title: "围绕基层治理和风险防控形成督办安排",
    description: "聚焦基层治理、作风建设、安全生产和专项整治要求，形成宣贯口径、督办台账与阶段复盘材料。",
    digest: "突出基层治理协同和风险前置防控，强调‘督办台账 + 周期复盘 + 责任反馈’。",
    footer: "建议输出：督办专报 + 宣贯提纲",
    accent: "#7c3aed",
    accentSoft: "linear-gradient(145deg, #f5f3ff 0%, #ffffff 100%)",
    suggestion: "针对基层治理、风险防控和作风建设明确阶段任务与宣贯重点",
    documentLabel: "基层治理督办专报",
  },
];

export function NewsWindowCard({
  eyebrow,
  channel,
  source,
  level,
  policyType,
  accent,
  accentSoft,
  publishedAt,
  syncedAt,
  syncStatus,
  syncError,
  headlineItems = [],
  onOpenDetail,
  onHeadlineClick,
  onHeadlineAdvice,
  onHeadlineOriginal,
}: Omit<NewsWindowConfig, "key"> & {
  onOpenDetail: () => void;
  onHeadlineClick: (headline: NewsHeadlineItem) => void;
  onHeadlineAdvice: (headline: NewsHeadlineItem) => void;
  onHeadlineOriginal: (headline: NewsHeadlineItem) => void;
}) {
  const timeLabel = publishedAt ? formatTime(publishedAt) : "等待同步";
  const syncLabel = syncedAt
    ? `最近同步：${formatTime(syncedAt)}${syncStatus && syncStatus !== "success" ? ` · ${syncStatus}` : ""}`
    : syncError || "等待首次同步";

  return (
    <Card
      bordered={false}
      styles={{ body: { padding: 22 } }}
      style={{
        height: "100%",
        borderRadius: 20,
        border: "1px solid rgba(226,232,240,0.95)",
        background: "#ffffff",
        boxShadow: "0 14px 28px rgba(15,23,42,0.06)",
      }}
    >
      <Space direction="vertical" size={18} style={{ width: "100%" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "flex-start",
          }}
        >
          <Space direction="vertical" size={10} style={{ flex: 1, minWidth: 0 }}>
            <Tag
              bordered={false}
              style={{
                width: "fit-content",
                marginInlineEnd: 0,
                borderRadius: 999,
                padding: "5px 12px",
                fontWeight: 700,
                color: accent,
                background: `${accent}12`,
              }}
            >
              {eyebrow}
            </Tag>
            <div>
              <Text style={{ display: "block", color: "#0f172a", fontSize: 18, fontWeight: 700, lineHeight: 1.4 }}>
                {channel}
              </Text>
              <Text style={{ display: "block", marginTop: 6, color: "#64748b", fontSize: 13, lineHeight: 1.6 }}>
                {source}
              </Text>
            </div>
          </Space>
          <Space size={[8, 8]} wrap style={{ justifyContent: "flex-end" }}>
            <Tag bordered={false} style={{ borderRadius: 999, background: "#f8fafc", color: "#475569", marginInlineEnd: 0 }}>
              {timeLabel === "等待同步" ? timeLabel : `发布时间 ${timeLabel}`}
            </Tag>
            <Tag bordered={false} style={{ borderRadius: 999, background: "#f8fafc", color: "#64748b", marginInlineEnd: 0 }}>
              {level}
            </Tag>
            <Tag bordered={false} style={{ borderRadius: 999, background: `${accent}10`, color: accent, marginInlineEnd: 0 }}>
              {policyType}
            </Tag>
          </Space>
        </div>

        <div
          style={{
            padding: "16px 18px",
            borderRadius: 18,
            background: accentSoft,
            border: `1px solid ${accent}14`,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 6 }}>
            <Text style={{ color: "#0f172a", fontSize: 14, fontWeight: 700 }}>最新动态</Text>
            <Text style={{ color: "#94a3b8", fontSize: 12 }}>{headlineItems.length > 0 ? `${headlineItems.length} 条预览` : "等待同步"}</Text>
          </div>

          <Space direction="vertical" size={0} style={{ width: "100%" }}>
            {headlineItems.length > 0 ? (
              headlineItems.map((headline, index) => (
                <div
                  key={headline.id}
                  style={{
                    padding: "14px 0",
                    borderTop: index === 0 ? "none" : "1px solid rgba(226,232,240,0.72)",
                  }}
                >
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        marginTop: 8,
                        background: accent,
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Button
                        type="link"
                        onClick={() => onHeadlineClick(headline)}
                        style={{
                          padding: 0,
                          height: "auto",
                          color: "#0f172a",
                          fontWeight: 600,
                          whiteSpace: "normal",
                          textAlign: "left",
                        }}
                      >
                        {headline.title}
                      </Button>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
                        <Text style={{ color: "#94a3b8", fontSize: 12 }}>
                          {headline.publishedAt ? formatTime(headline.publishedAt) : "待同步发布时间"}
                        </Text>
                        <Space size={4} wrap>
                          <Button
                            type="link"
                            size="small"
                            icon={<Sparkles size={14} />}
                            style={{ paddingInline: 0, color: accent }}
                            onClick={() => onHeadlineAdvice(headline)}
                          >
                            AI分析
                          </Button>
                          <Button
                            type="link"
                            size="small"
                            icon={<ExternalLink size={14} />}
                            style={{ paddingInline: 0, color: "#475569" }}
                            onClick={() => onHeadlineOriginal(headline)}
                          >
                            查看原文
                          </Button>
                        </Space>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <Text style={{ display: "block", paddingTop: 10, color: "#64748b", lineHeight: 1.8 }}>
                当前栏目还没有同步到文章内容，点击“查看更多”可进入栏目详情查看最新同步结果。
              </Text>
            )}
          </Space>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Text style={{ color: "#94a3b8", fontSize: 12 }}>{syncLabel}</Text>
          <Button type="link" icon={<ArrowRight size={14} />} onClick={onOpenDetail} style={{ paddingInline: 0, color: accent }}>
            查看更多
          </Button>
        </div>
      </Space>
    </Card>
  );
}
