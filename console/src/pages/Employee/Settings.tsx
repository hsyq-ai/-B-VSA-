import { Card, List } from "antd";

const settings = [
  "通知方式：系统提醒 / 人际消息 / 任务卡",
  "隐私偏好：个人记忆可见范围",
  "语言与显示：界面语言与时区",
];

export default function EmployeeSettings() {
  return (
    <Card title="设置">
      <List dataSource={settings} renderItem={(item) => <List.Item>{item}</List.Item>} />
    </Card>
  );
}
