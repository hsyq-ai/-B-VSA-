import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, Space, Tag, Typography } from "antd";
import { ArrowRight, Brain, ChevronDown, Sparkles, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { openSecretaryWithContext } from "../../../features/party/shared/navigation";
import { getCurrentEmployeeName, resolveAiSceneMeta } from "./aiSceneMeta";
import { buildPageAiContextPrompt, useCurrentPageAiContext } from "./pageAiContextBridge";

const { Text } = Typography;
const EXPANDED_STORAGE_KEY = "copaw_global_ai_bar_expanded_v1";

interface GlobalAiCopilotBarProps {
  selectedKey: string;
  currentPath: string;
}

const mergeUniqueTexts = (items: Array<string | undefined>, limit: number) => {
  const next: string[] = [];
  items.forEach((item) => {
    const normalized = String(item || "").trim();
    if (!normalized || next.includes(normalized)) return;
    next.push(normalized);
  });
  return next.slice(0, limit);
};

const renderActionIcon = (icon?: string) =>
  icon === "brain" ? <Brain size={14} /> : icon === "zap" ? <Zap size={14} /> : icon === "sparkles" ? <Sparkles size={14} /> : <ArrowRight size={14} />;

export default function GlobalAiCopilotBar({ selectedKey, currentPath }: GlobalAiCopilotBarProps) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(() => {
    try {
      return sessionStorage.getItem(EXPANDED_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const pageContext = useCurrentPageAiContext(currentPath);
  const scene = useMemo(
    () => resolveAiSceneMeta({ selectedKey, currentPath, currentUserName: getCurrentEmployeeName() }),
    [currentPath, selectedKey],
  );
  const mergedTags = useMemo(
    () => mergeUniqueTexts([...scene.tags, ...(pageContext?.tags || [])], 6),
    [pageContext?.tags, scene.tags],
  );
  const mergedInsights = useMemo(
    () => mergeUniqueTexts([...(pageContext?.insights || []), ...scene.insights], 5),
    [pageContext?.insights, scene.insights],
  );
  const mergedTitle = pageContext?.title || scene.title;
  const mergedDescription = pageContext?.summary ? `${scene.description} 当前页焦点：${pageContext.summary}` : scene.description;
  const previewTags = useMemo(() => mergedTags.slice(0, 3), [mergedTags]);
  const previewInsights = useMemo(() => mergedInsights.slice(0, 3), [mergedInsights]);
  const primaryAction = scene.actions[0];
  const buildSecretaryPrompt = useCallback(
    (prompt: string) => {
      const liveContext = buildPageAiContextPrompt(pageContext);
      return [prompt, liveContext].filter(Boolean).join("\n");
    },
    [pageContext],
  );
  const handleActionClick = useCallback(
    (action: (typeof scene.actions)[number]) => {
      if (action.mode === "navigate" && action.path) {
        navigate(action.path);
        return;
      }
      if (action.prompt) {
        openSecretaryWithContext(navigate, buildSecretaryPrompt(action.prompt));
      }
    },
    [buildSecretaryPrompt, navigate, scene.actions],
  );

  useEffect(() => {
    try {
      sessionStorage.setItem(EXPANDED_STORAGE_KEY, expanded ? "1" : "0");
    } catch {
      // ignore storage errors
    }
  }, [expanded]);

  return (
    <Card
      bordered={false}
      style={{
        borderRadius: 14,
        marginBottom: 10,
        border: "1px solid rgba(99,102,241,0.10)",
        background: "linear-gradient(135deg, rgba(241,245,255,0.96) 0%, rgba(255,255,255,0.98) 62%, rgba(250,245,255,0.96) 100%)",
        boxShadow: "0 8px 20px rgba(79,70,229,0.08)",
      }}
      styles={{ body: { padding: "10px 14px" } }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
        <Space size={[8, 8]} wrap style={{ flex: "1 1 520px", minWidth: 0 }}>
          <Tag color="processing" style={{ marginInlineEnd: 0, borderRadius: 999 }}>
            <Sparkles size={12} style={{ marginRight: 6 }} />
            {scene.badge}
          </Tag>
          <Text strong style={{ color: "#0f172a", fontSize: 14 }}>
            {mergedTitle}
          </Text>
          {previewTags.map((tag) => (
            <Tag key={tag} style={{ marginInlineEnd: 0, borderRadius: 999, background: "#fff", color: "#4f46e5", borderColor: "#c7d2fe" }}>
              {tag}
            </Tag>
          ))}
          <div
            style={{
              flex: "1 1 260px",
              minWidth: 180,
              color: "#475569",
              fontSize: 13,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={previewInsights[0] || mergedDescription}
          >
            {previewInsights[0] || mergedDescription}
          </div>
        </Space>

        <Space size={[8, 8]} wrap>
          {primaryAction ? (
            <Button size="small" type={primaryAction.type || "default"} onClick={() => handleActionClick(primaryAction)} icon={renderActionIcon(primaryAction.icon)}>
              {primaryAction.label}
            </Button>
          ) : null}
          <Button
            size="small"
            type="text"
            onClick={() => setExpanded((value) => !value)}
            icon={<ChevronDown size={14} style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }} />}
          >
            {expanded ? "收起" : "展开"}
          </Button>
        </Space>
      </div>

      {expanded ? (
        <div
          style={{
            marginTop: 10,
            paddingTop: 10,
            borderTop: "1px solid rgba(226,232,240,0.9)",
            display: "grid",
            gap: 10,
          }}
        >
          <div style={{ display: "grid", gap: 8 }}>
            <Text strong style={{ color: "#1e293b", fontSize: 13 }}>
              <Brain size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} />
              AI 当前判断
            </Text>
            {previewInsights.length ? (
              previewInsights.map((item) => (
                <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ width: 6, height: 6, borderRadius: 999, background: "#6366f1", marginTop: 7, flexShrink: 0 }} />
                  <Text style={{ color: "#475569", lineHeight: 1.65, fontSize: 13 }}>{item}</Text>
                </div>
              ))
            ) : (
              <Text style={{ color: "#475569", lineHeight: 1.65, fontSize: 13 }}>{mergedDescription}</Text>
            )}
          </div>

          <Space wrap size={[8, 8]}>
            {scene.actions.map((action) => (
              <Button
                key={action.key}
                type={action.type || "default"}
                size="small"
                onClick={() => handleActionClick(action)}
                icon={renderActionIcon(action.icon)}
                style={{ borderRadius: 10 }}
              >
                {action.label}
              </Button>
            ))}
          </Space>
        </div>
      ) : null}
    </Card>
  );
}
