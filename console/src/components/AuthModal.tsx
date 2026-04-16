import { useState } from "react";
import { Modal, Tabs, Form, Input, Button, message, Typography } from "antd";
import type { TabsProps } from "antd";
import { ShieldCheck, Sparkles, Building2, KeyRound, Smartphone, UserRound } from "lucide-react";

interface AuthModalProps {
  open: boolean;
  onAuthenticated: (token: string) => void;
}

const TOKEN_KEY = "copaw_token";
const LOGIN_EPOCH_KEY = "copaw_login_epoch";

const { Title, Text } = Typography;

export function getStoredToken(): string | null {
  if (typeof sessionStorage !== "undefined") {
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (token) return token;
  }
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredLoginEpoch(epoch: string) {
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.setItem(LOGIN_EPOCH_KEY, epoch);
  }
  localStorage.setItem(LOGIN_EPOCH_KEY, epoch);
}

export function getStoredLoginEpoch(): string {
  if (typeof sessionStorage !== "undefined") {
    const epoch = sessionStorage.getItem(LOGIN_EPOCH_KEY);
    if (epoch) return epoch;
  }
  return localStorage.getItem(LOGIN_EPOCH_KEY) || "";
}

export function clearStoredLoginEpoch() {
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.removeItem(LOGIN_EPOCH_KEY);
  }
  localStorage.removeItem(LOGIN_EPOCH_KEY);
}

export function clearStoredToken() {
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.removeItem(TOKEN_KEY);
  }
  localStorage.removeItem(TOKEN_KEY);
  clearStoredLoginEpoch();
}

async function registerApi(values: {
  name: string;
  phone: string;
  password: string;
  confirmPassword: string;
}) {
  const params = new URLSearchParams({
    name: values.name,
    phone: values.phone,
    password: values.password,
    confirm_password: values.confirmPassword,
  });
  const res = await fetch(`/api/auth/register?${params.toString()}`, {
    method: "POST",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "注册失败");
  }
  return res.json();
}

async function loginApi(values: { identifier: string; password: string }) {
  const params = new URLSearchParams({
    identifier: values.identifier,
    password: values.password,
  });
  const res = await fetch(`/api/auth/login?${params.toString()}`, {
    method: "POST",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "登录失败");
  }
  return res.json() as Promise<{
    token: string;
    user_profile: string;
    public_memory: string;
    hasCompleteProfile: boolean;
  }>;
}

export default function AuthModal({ open, onAuthenticated }: AuthModalProps) {
  const [loading, setLoading] = useState(false);
  const [activeKey, setActiveKey] = useState<"login" | "register">("login");
  const [form] = Form.useForm();

  const handleLogin = async (values: { identifier: string; password: string }) => {
    try {
      setLoading(true);
      const data = await loginApi(values);
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem(TOKEN_KEY, data.token);
      }
      localStorage.setItem(TOKEN_KEY, data.token);
      const loginEpoch = String(Date.now());
      setStoredLoginEpoch(loginEpoch);
      (window as any).currentLoginEpoch = loginEpoch;

      // 保存档案上下文到全局 window 对象，供 Chat 页面使用
      (window as any).copaw_archived_context = {
        user_profile: data.user_profile,
        public_memory: data.public_memory,
      };
      
      message.success("登录成功");
      onAuthenticated(data.token);
    } catch (e: any) {
      message.error(e?.message || "登录失败");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (values: {
    name: string;
    phone: string;
    password: string;
    confirmPassword: string;
  }) => {
    try {
      setLoading(true);
      await registerApi(values);
      message.success("注册成功，如为首个用户将自动成为管理员；否则等待审批后再登录");
      setActiveKey("login");
      form.resetFields();
    } catch (e: any) {
      message.error(e?.message || "注册失败");
    } finally {
      setLoading(false);
    }
  };

  const items: TabsProps["items"] = [
    {
      key: "login",
      label: "登录",
      children: (
        <Form
          form={form}
          layout="vertical"
          onFinish={handleLogin}
          style={{ marginTop: 16 }}
        >
          <Form.Item
            label="账号（姓名或手机号）"
            name="identifier"
            rules={[{ required: true, message: "请输入姓名或手机号" }]}
          >
            <Input size="large" prefix={<UserRound size={15} />} placeholder="请输入姓名或手机号" className="auth-input" />
          </Form.Item>
          <Form.Item
            label="密码"
            name="password"
            rules={[{ required: true, message: "请输入密码" }]}
          >
            <Input.Password size="large" prefix={<KeyRound size={15} />} placeholder="请输入密码" className="auth-input" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block size="large" className="auth-submit-btn">
              登录
            </Button>
          </Form.Item>
        </Form>
      ),
    },
    {
      key: "register",
      label: "注册",
      children: (
        <Form
          layout="vertical"
          onFinish={handleRegister}
          style={{ marginTop: 16 }}
        >
          <Form.Item
            label="姓名"
            name="name"
            rules={[{ required: true, message: "请输入姓名" }]}
          >
            <Input size="large" prefix={<UserRound size={15} />} placeholder="请输入姓名" className="auth-input" />
          </Form.Item>
          <Form.Item
            label="手机号"
            name="phone"
            rules={[{ required: true, message: "请输入手机号" }]}
          >
            <Input size="large" prefix={<Smartphone size={15} />} placeholder="请输入手机号" className="auth-input" />
          </Form.Item>
          <Form.Item
            label="密码"
            name="password"
            rules={[{ required: true, message: "请输入密码" }]}
          >
            <Input.Password size="large" prefix={<KeyRound size={15} />} placeholder="至少 6 位密码" className="auth-input" />
          </Form.Item>
          <Form.Item
            label="确认密码"
            name="confirmPassword"
            dependencies={["password"]}
            rules={[
              { required: true, message: "请再次输入密码" },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue("password") === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error("两次输入的密码不一致"));
                },
              }),
            ]}
          >
            <Input.Password size="large" prefix={<KeyRound size={15} />} placeholder="请再次输入密码" className="auth-input" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block size="large" className="auth-submit-btn">
              注册
            </Button>
          </Form.Item>
        </Form>
      ),
    },
  ];

  return (
    <>
      <Modal
        title={null}
        open={open}
        footer={null}
        closable={false}
        maskClosable={false}
        centered
        width={940}
        rootClassName="auth-modal-root"
        styles={{
          mask: {
            background: "rgba(67, 20, 7, 0.68)",
            backdropFilter: "blur(18px)",
          },
          content: {
            padding: 0,
            overflow: "hidden",
            borderRadius: 28,
            background: "rgba(255, 251, 249, 0.98)",
            border: "1px solid rgba(185, 28, 28, 0.16)",
            boxShadow: "0 32px 72px rgba(127, 29, 29, 0.24)",
          },
          body: { padding: 0 },
        }}
      >
        <div className="auth-modal-shell">
          <div className="auth-brand-panel">
            <div className="auth-brand-badge">
              <ShieldCheck size={14} />
              红智 Agent OS
            </div>
            <Title level={2} style={{ color: "#fff7ed", marginBottom: 10 }}>
              欢迎进入红智 OS
            </Title>
            <Text style={{ color: "rgba(255,245,240,0.86)", fontSize: 14, lineHeight: 1.85 }}>
              面向党务协同、组织治理与数字员工联动的一体化工作入口。
            </Text>
            <div className="auth-feature-list">
              <div><Sparkles size={14} /> 党建任务闭环督办</div>
              <div><Building2 size={14} /> 组织学习与成长档案</div>
              <div><ShieldCheck size={14} /> 安全可控的身份认证链路</div>
            </div>
          </div>

          <div className="auth-form-panel">
            <div style={{ marginBottom: 14 }}>
              <Title level={4} style={{ marginBottom: 4, color: "#3f1d14" }}>账号认证</Title>
              <Text type="secondary">请输入组织账号信息进行身份认证</Text>
            </div>
            <Tabs
              activeKey={activeKey}
              onChange={(k) => {
                setActiveKey(k as "login" | "register");
                form.resetFields();
              }}
              items={items}
            />
          </div>
        </div>
      </Modal>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .auth-modal-root .ant-modal {
              max-width: calc(100vw - 32px);
            }
            .auth-modal-root .ant-modal-content {
              padding: 0;
            }
            .auth-modal-shell {
              display: grid;
              grid-template-columns: 0.96fr 1.12fr;
              min-height: 560px;
              background: linear-gradient(180deg, #fffaf8 0%, #fff5f2 100%);
            }
            .auth-brand-panel {
              position: relative;
              overflow: hidden;
              background: linear-gradient(160deg, #6b0f12 0%, #8f1d1f 45%, #b42318 100%);
              padding: 42px 34px;
              color: #fff;
              display: flex;
              flex-direction: column;
              justify-content: center;
              gap: 10px;
            }
            .auth-brand-panel::before {
              content: "";
              position: absolute;
              inset: 0;
              background:
                radial-gradient(circle at top right, rgba(251, 191, 36, 0.18) 0%, rgba(251, 191, 36, 0) 28%),
                linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 52%);
            }
            .auth-brand-panel > * {
              position: relative;
              z-index: 1;
            }
            .auth-brand-badge {
              display: inline-flex;
              align-items: center;
              gap: 6px;
              background: rgba(255,245,240,0.14);
              border: 1px solid rgba(255,245,240,0.2);
              width: fit-content;
              border-radius: 999px;
              padding: 7px 14px;
              font-size: 12px;
              font-weight: 700;
              letter-spacing: 0.04em;
              margin-bottom: 8px;
            }
            .auth-feature-list {
              margin-top: 20px;
              display: flex;
              flex-direction: column;
              gap: 12px;
              font-size: 13px;
              color: rgba(255,245,240,0.92);
            }
            .auth-feature-list > div {
              display: flex;
              align-items: center;
              gap: 8px;
              padding: 12px 14px;
              border-radius: 14px;
              background: rgba(255,255,255,0.08);
              border: 1px solid rgba(255,245,240,0.1);
              backdrop-filter: blur(6px);
            }
            .auth-form-panel {
              padding: 36px 34px 26px;
              background: linear-gradient(180deg, #fffdfa 0%, #fff7f2 100%);
            }
            .auth-input {
              border-radius: 14px !important;
              min-height: 46px;
              border-color: rgba(146, 64, 14, 0.18) !important;
              background: rgba(255,255,255,0.9) !important;
            }
            .auth-submit-btn {
              margin-top: 8px;
              border-radius: 14px !important;
              height: 46px !important;
              background: linear-gradient(135deg, #991b1b 0%, #c2410c 100%) !important;
              border: none !important;
              box-shadow: 0 14px 28px rgba(127, 29, 29, 0.22);
              font-weight: 700;
            }
            .auth-modal-root .ant-tabs-nav::before {
              border-bottom-color: rgba(146, 64, 14, 0.14) !important;
            }
            .auth-modal-root .ant-tabs-tab {
              color: #7c6f67;
            }
            .auth-modal-root .ant-tabs-tab.ant-tabs-tab-active .ant-tabs-tab-btn {
              color: #991b1b !important;
              font-weight: 700;
            }
            .auth-modal-root .ant-tabs-ink-bar {
              background: #b91c1c !important;
            }
            .auth-modal-root .ant-input-affix-wrapper:hover,
            .auth-modal-root .ant-input-affix-wrapper-focused,
            .auth-modal-root .ant-input:hover,
            .auth-modal-root .ant-input:focus {
              border-color: #c2410c !important;
              box-shadow: 0 0 0 2px rgba(194, 65, 12, 0.12) !important;
            }
            .auth-modal-root .ant-form-item-label > label {
              color: #57534e;
              font-weight: 600;
            }
            @media (max-width: 900px) {
              .auth-modal-shell {
                grid-template-columns: 1fr;
              }
              .auth-brand-panel {
                min-height: 210px;
                padding: 30px 24px;
              }
              .auth-form-panel {
                padding: 24px;
              }
            }
          `,
        }}
      />
    </>
  );
}

