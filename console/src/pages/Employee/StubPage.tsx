import { Card, Typography } from "antd";

const { Title, Paragraph } = Typography;

interface StubPageProps {
  title: string;
  description: string;
}

export default function StubPage({ title, description }: StubPageProps) {
  return (
    <div className="lux-shell">
      <Card style={{ maxWidth: 960, borderRadius: 20 }}>
        <Title level={3}>{title}</Title>
        <Paragraph>{description}</Paragraph>
      </Card>
    </div>
  );
}
