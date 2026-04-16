import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { authApi } from "../../api/modules/auth";
import { 
  Button, 
  Card, 
  Form, 
  Input, 
  Select, 
  message,
  Space,
  Typography 
} from "antd";
import { UserOutlined, PhoneOutlined, HomeOutlined, IdcardOutlined } from "@ant-design/icons";

const { Title, Paragraph } = Typography;
const { TextArea } = Input;

interface UserInfo {
  user_id: number;
  profile_id: number;
  name: string;
  phone: string;
  role: string;
  status: string;
  department?: string | null;
}

export default function ProfileEditor() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    loadUserInfo();
  }, []);

  const loadUserInfo = async () => {
    try {
      const data = await authApi.getMe();
      setUserInfo(data);
      
      // 填充表单默认值
      form.setFieldsValue({
        department: data.department || undefined,
        position: undefined,
        workBackground: undefined,
        tools: undefined,
        helpExpectation: undefined,
        communicationStyle: undefined,
      });
    } catch (error) {
      console.error("加载用户信息失败:", error);
      message.error("加载用户信息失败");
    }
  };

  const handleSubmit = async (values: any) => {
    setLoading(true);
    try {
      // 调用后端接口更新档案
      const response = await fetch("/api/me/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("copaw_token")}`,
        },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        throw new Error("更新失败");
      }

      message.success("档案保存成功！");
      
      // 延迟跳转到聊天页面
      setTimeout(() => {
        navigate("/chat");
      }, 1000);
    } catch (error: any) {
      message.error(`保存失败：${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!userInfo) {
    return <div style={{ padding: 50, textAlign: "center" }}>加载中...</div>;
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "40px 20px" }}>
      <Card>
        <div style={{ textAlign: "center", marginBottom: 30 }}>
          <Title level={2}>完善您的个人档案</Title>
          <Paragraph type="secondary">
            为了更好地为您提供帮助，请填写以下信息～
          </Paragraph>
        </div>

        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          size="large"
        >
          {/* 基本信息区域 */}
          <div style={{ marginBottom: 24 }}>
            <Title level={5}>📋 基本信息</Title>
            
            <Form.Item
              label="姓名"
              style={{ marginBottom: 16 }}
            >
              <Input 
                value={userInfo.name} 
                disabled 
                prefix={<UserOutlined />}
              />
            </Form.Item>

            <Form.Item
              label="手机号"
              style={{ marginBottom: 16 }}
            >
              <Input 
                value={userInfo.phone} 
                disabled 
                prefix={<PhoneOutlined />}
              />
            </Form.Item>

            <Form.Item
              name="department"
              label="部门"
              rules={[{ required: true, message: "请选择您的部门" }]}
              style={{ marginBottom: 16 }}
            >
              <Select 
                placeholder="请选择部门"
                prefix={<HomeOutlined />}
              >
                <Select.Option value="研发部">研发部</Select.Option>
                <Select.Option value="市场部">市场部</Select.Option>
                <Select.Option value="行政部">行政部</Select.Option>
                <Select.Option value="总裁办">总裁办</Select.Option>
                <Select.Option value="财务部">财务部</Select.Option>
                <Select.Option value="人力资源部">人力资源部</Select.Option>
                <Select.Option value="课题组">课题组</Select.Option>
                <Select.Option value="其他">其他</Select.Option>
              </Select>
            </Form.Item>

            <Form.Item
              name="position"
              label="职位"
              rules={[{ required: true, message: "请输入您的职位" }]}
              style={{ marginBottom: 16 }}
            >
              <Input 
                placeholder="例如：工程师、产品经理、研究员等"
                prefix={<IdcardOutlined />}
              />
            </Form.Item>
          </div>

          {/* 工作背景区域 */}
          <div style={{ marginBottom: 24 }}>
            <Title level={5}>💼 工作背景（可选）</Title>
            
            <Form.Item
              name="workBackground"
              label="主要工作内容"
              tooltip="简单描述您的日常工作重点"
            >
              <TextArea 
                rows={3}
                placeholder="例如：负责技术开发、项目管理、市场拓展等..."
              />
            </Form.Item>

            <Form.Item
              name="tools"
              label="常用工具"
              tooltip="工作中经常使用的软件或系统"
            >
              <TextArea 
                rows={2}
                placeholder="例如：VSCode、Office、钉钉、Git 等..."
              />
            </Form.Item>
          </div>

          {/* 偏好设置区域 */}
          <div style={{ marginBottom: 24 }}>
            <Title level={5}>⚙️ 偏好设置（可选）</Title>
            
            <Form.Item
              name="helpExpectation"
              label="希望获得的帮助"
              tooltip="最希望 AI 在哪些方面提供帮助"
            >
              <TextArea 
                rows={2}
                placeholder="例如：技术问题解答、文档撰写、数据分析等..."
              />
            </Form.Item>

            <Form.Item
              name="communicationStyle"
              label="沟通风格偏好"
            >
              <Select placeholder="请选择偏好的沟通方式">
                <Select.Option value="direct">直接给答案，快速解决问题</Select.Option>
                <Select.Option value="detailed">详细解释，一起探讨过程</Select.Option>
                <Select.Option value="formal">正式严谨的分析</Select.Option>
                <Select.Option value="casual">轻松幽默的交流</Select.Option>
              </Select>
            </Form.Item>
          </div>

          <Form.Item style={{ marginTop: 32 }}>
            <Space style={{ width: "100%", justifyContent: "center" }}>
              <Button 
                type="primary" 
                htmlType="submit" 
                loading={loading}
                size="large"
              >
                保存并开始使用
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
