import { Card, Col, Row, Typography } from "antd";

const { Paragraph, Title } = Typography;

export default function EmployeeMemory() {
  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={12}>
        <Card>
          <Title level={4}>个人记忆</Title>
          <Paragraph>
            这里将展示你的日常工作摘要与关键贡献。你可以在工作台中继续对话，
            系统会自动沉淀为个人记忆。
          </Paragraph>
        </Card>
      </Col>
      <Col xs={24} lg={12}>
        <Card>
          <Title level={4}>组织摘要</Title>
          <Paragraph>
            这里汇总组织级的关键事件与变化趋势，支持日报/周报视图。
          </Paragraph>
        </Card>
      </Col>
    </Row>
  );
}
