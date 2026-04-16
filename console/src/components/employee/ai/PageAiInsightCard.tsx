import type { ReactNode } from "react";
import { Button, Card, Col, Row, Space, Tag, Typography } from "antd";
import { ArrowRight, Sparkles } from "lucide-react";

const { Paragraph, Text, Title } = Typography;

type Tone = "indigo" | "crimson" | "violet" | "emerald";

const TONE_MAP: Record<Tone, { accent: string; soft: string; border: string; background: string }> = {
  indigo: {
    accent: "#4f46e5",
    soft: "rgba(79,70,229,0.10)",
    border: "rgba(79,70,229,0.14)",
    background: "linear-gradient(135deg, rgba(238,242,255,0.95) 0%, rgba(255,255,255,0.98) 100%)",
  },
  crimson: {
    accent: "#b91c1c",
    soft: "rgba(185,28,28,0.08)",
    border: "rgba(185,28,28,0.14)",
    background: "linear-gradient(135deg, rgba(254,242,242,0.94) 0%, rgba(255,255,255,0.98) 100%)",
  },
  violet: {
    accent: "#7c3aed",
    soft: "rgba(124,58,237,0.10)",
    border: "rgba(124,58,237,0.14)",
    background: "linear-gradient(135deg, rgba(245,243,255,0.95) 0%, rgba(255,255,255,0.98) 100%)",
  },
  emerald: {
    accent: "#059669",
    soft: "rgba(5,150,105,0.10)",
    border: "rgba(5,150,105,0.14)",
    background: "linear-gradient(135deg, rgba(236,253,245,0.95) 0%, rgba(255,255,255,0.98) 100%)",
  },
};

export interface PageAiAction {
  key: string;
  label: string;
  onClick: () => void;
  type?: "primary" | "default";
  icon?: ReactNode;
}

interface PageAiInsightCardProps {
  badge: string;
  title: string;
  description: string;
  insights: string[];
  suggestions: string[];
  actions: PageAiAction[];
  tone?: Tone;
}

export default function PageAiInsightCard({
  badge,
  title,
  description,
  insights,
  suggestions,
  actions,
  tone = "indigo",
}: PageAiInsightCardProps) {
  const theme = TONE_MAP[tone];

  return (
    <Card
      bordered={false}
      style={{
        borderRadius: 24,
        border: `1px solid ${theme.border}`,
        background: theme.background,
        boxShadow: "0 16px 38px rgba(15, 23, 42, 0.08)",
      }}
      styles={{ body: { padding: 24 } }}
    >
      <Row gutter={[20, 20]} align="top">
        <Col xs={24} xl={15}>
          <Space direction="vertical" size={14} style={{ width: "100%" }}>
            <Tag
              bordered={false}
              style={{
                width: "fit-content",
                marginInlineEnd: 0,
                borderRadius: 999,
                padding: "6px 12px",
                background: theme.soft,
                color: theme.accent,
                fontWeight: 700,
              }}
            >
              <Sparkles size={12} style={{ marginRight: 6 }} />
              {badge}
            </Tag>
            <div>
              <Title level={4} style={{ margin: 0, color: "#0f172a" }}>
                {title}
              </Title>
              <Paragraph style={{ margin: "10px 0 0", color: "#475569", lineHeight: 1.8 }}>
                {description}
              </Paragraph>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
              {insights.map((item) => (
                <div
                  key={item}
                  style={{
                    borderRadius: 18,
                    padding: "14px 16px",
                    background: "rgba(255,255,255,0.82)",
                    border: `1px solid ${theme.border}`,
                  }}
                >
                  <Text style={{ color: theme.accent, fontSize: 12, fontWeight: 700 }}>AI 已识别</Text>
                  <div style={{ marginTop: 8, color: "#1e293b", fontWeight: 600, lineHeight: 1.7 }}>{item}</div>
                </div>
              ))}
            </div>
          </Space>
        </Col>

        <Col xs={24} xl={9}>
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <div
              style={{
                borderRadius: 18,
                padding: 18,
                background: "rgba(255,255,255,0.86)",
                border: `1px solid ${theme.border}`,
              }}
            >
              <Text strong style={{ color: "#0f172a", fontSize: 15 }}>
                建议下一步
              </Text>
              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                {suggestions.map((item, index) => (
                  <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 999,
                        background: theme.soft,
                        color: theme.accent,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        fontWeight: 700,
                        flexShrink: 0,
                        marginTop: 1,
                      }}
                    >
                      {index + 1}
                    </div>
                    <Text style={{ color: "#475569", lineHeight: 1.75 }}>{item}</Text>
                  </div>
                ))}
              </div>
            </div>

            <div
              style={{
                borderRadius: 18,
                padding: 18,
                background: "rgba(255,255,255,0.92)",
                border: `1px solid ${theme.border}`,
              }}
            >
              <Text strong style={{ color: "#0f172a", fontSize: 15 }}>
                AI 可直接帮你做
              </Text>
              <Space direction="vertical" size={10} style={{ width: "100%", marginTop: 14 }}>
                {actions.map((action) => (
                  <Button
                    key={action.key}
                    type={action.type || "default"}
                    block
                    onClick={action.onClick}
                    icon={action.icon || <ArrowRight size={15} />}
                    style={{
                      height: 40,
                      borderRadius: 12,
                      justifyContent: "space-between",
                    }}
                  >
                    {action.label}
                  </Button>
                ))}
              </Space>
            </div>
          </Space>
        </Col>
      </Row>
    </Card>
  );
}
