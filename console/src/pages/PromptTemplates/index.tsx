import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  message,
} from "antd";
import api from "../../api";
import type { PromptTemplate, PromptTemplateScanResponse } from "../../api/types";

const { TextArea } = Input;

export default function PromptTemplatesPage({
  title = "Skill 模板（提示词）",
  filterCategory,
  filterAgentKey,
  allowImport = true,
  excludeCategories,
}: {
  title?: string;
  filterCategory?: string;
  filterAgentKey?: string;
  allowImport?: boolean;
  excludeCategories?: string[];
}) {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<PromptTemplate | null>(null);
  const [importingSkills, setImportingSkills] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<PromptTemplateScanResponse | null>(null);
  const [form] = Form.useForm();

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const res: any = await api.listPromptTemplates();
      const items = Array.isArray(res) ? res : res.items || [];
      const filtered = items.filter((item: PromptTemplate) => {
        if (filterCategory && item.category !== filterCategory) return false;
        if (filterAgentKey && item.agent_key !== filterAgentKey) return false;
        if (excludeCategories && excludeCategories.includes(item.category || "")) return false;
        return true;
      });
      setTemplates(filtered);
    } catch (e: any) {
      message.error(e?.message || "加载提示词模板失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, [filterCategory, filterAgentKey]);

  const openCreate = () => {
    setEditing(null);
    setScanResult(null);
    form.resetFields();
      form.setFieldsValue({
      enabled: true,
      template_type: "scene",
      category: "general",
      source: "manual",
      version: 1,
      runtime_profile: "standard",
    });
    setModalOpen(true);
  };

  const openEdit = (record: PromptTemplate) => {
    setEditing(record);
    setScanResult(null);
    form.setFieldsValue({
      trigger_key: record.trigger_key,
      display_name: record.display_name,
      prompt_text: record.prompt_text,
      skill: record.skill || "",
      session_name: record.session_name || "",
      template_type: record.template_type || "scene",
      category: record.category || "",
      agent_key: record.agent_key || "",
      agent_name: record.agent_name || "",
      source: record.source || "manual",
      version: record.version || 1,
      runtime_profile: record.runtime_profile || "standard",
      expert_profile: record.expert_profile || "",
      enabled: record.enabled,
    });
    setModalOpen(true);
  };

  const handleImportSkills = async () => {
    try {
      setImportingSkills(true);
      const result: any = await api.importSkillsAsTemplates({
        overwrite: false,
        include_disabled: false,
      });
      message.success(
        `已导入技能模板：新增 ${result?.created ?? 0}，更新 ${result?.updated ?? 0}，跳过 ${result?.skipped ?? 0}`,
      );
      await loadTemplates();
    } catch (e: any) {
      message.error(e?.message || "导入技能失败");
    } finally {
      setImportingSkills(false);
    }
  };

  const handleScan = async () => {
    const promptText = String(form.getFieldValue("prompt_text") || "").trim();
    const runtimeProfile = String(form.getFieldValue("runtime_profile") || "standard");
    if (!promptText) {
      message.warning("请先填写提示词内容");
      return;
    }
    try {
      setScanning(true);
      const result = await api.scanPromptTemplate({
        prompt_text: promptText,
        runtime_profile: runtimeProfile as "standard" | "isolated",
      });
      setScanResult(result);
      if (result.risk_level === "HIGH") {
        message.warning("扫描完成：存在高风险片段，请先处理");
      } else {
        message.success("扫描完成");
      }
    } catch (e: any) {
      message.error(e?.message || "扫描失败");
    } finally {
      setScanning(false);
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      if (editing) {
        await api.updatePromptTemplate(editing.id, values);
        message.success("已更新模板");
      } else {
        await api.createPromptTemplate(values);
        message.success("已创建模板");
      }
      setModalOpen(false);
      await loadTemplates();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (record: PromptTemplate) => {
    try {
      await api.deletePromptTemplate(record.id);
      message.success("已删除");
      await loadTemplates();
    } catch (e: any) {
      message.error(e?.message || "删除失败");
    }
  };

  const columns = useMemo(
    () => [
      { title: "名称", dataIndex: "display_name", key: "display_name" },
      { title: "触发键", dataIndex: "trigger_key", key: "trigger_key" },
      {
        title: "模板类型",
        dataIndex: "template_type",
        key: "template_type",
        width: 120,
        render: (value?: string) => (
          <Tag color={value === "skill" ? "purple" : "default"}>
            {value === "skill" ? "Skill" : "Scene"}
          </Tag>
        ),
      },
      {
        title: "分类",
        dataIndex: "category",
        key: "category",
        width: 140,
        render: (value?: string) => (value ? <Tag>{value}</Tag> : "-"),
      },
      {
        title: "Agent",
        dataIndex: "agent_name",
        key: "agent_name",
        width: 150,
        render: (_: unknown, record: PromptTemplate) =>
          record.agent_name || record.agent_key || "-",
      },
      {
        title: "技能",
        dataIndex: "skill",
        key: "skill",
        render: (value: string) => (value ? <Tag color="blue">{value}</Tag> : "-") ,
      },
      {
        title: "状态",
        dataIndex: "enabled",
        key: "enabled",
        render: (value: boolean) => (
          <Tag color={value ? "green" : "red"}>{value ? "启用" : "停用"}</Tag>
        ),
      },
      {
        title: "更新时间",
        dataIndex: "updated_at",
        key: "updated_at",
        render: (value?: number) =>
          value ? new Date(value * 1000).toLocaleString() : "-",
      },
      {
        title: "操作",
        key: "actions",
        render: (_: unknown, record: PromptTemplate) => (
          <Space>
            <Button size="small" onClick={() => openEdit(record)}>
              编辑
            </Button>
            <Popconfirm
              title="确认删除该模板？"
              okText="确认"
              cancelText="取消"
              onConfirm={() => handleDelete(record)}
            >
              <Button size="small" danger>
                删除
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [],
  );

  return (
    <Card
      title={title}
      extra={
        <Space>
          <Button onClick={loadTemplates} loading={loading} size="small">
            刷新
          </Button>
          {allowImport ? (
            <Button
              onClick={handleImportSkills}
              loading={importingSkills}
              size="small"
            >
              自动发现并导入技能
            </Button>
          ) : null}
          <Button type="primary" onClick={openCreate} size="small">
            新建模板
          </Button>
        </Space>
      }
    >
      <Table
        rowKey="id"
        columns={columns}
        dataSource={templates}
        loading={loading}
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title={editing ? "编辑模板" : "新建模板"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        width={680}
      >
        <Form layout="vertical" form={form}>
          <Form.Item
            label="触发键"
            name="trigger_key"
            rules={[{ required: true, message: "请输入触发键" }]}
          >
            <Input placeholder="例如 work-new / enterprise-report" />
          </Form.Item>
          <Form.Item
            label="名称"
            name="display_name"
            rules={[{ required: true, message: "请输入名称" }]}
          >
            <Input placeholder="用于后台展示" />
          </Form.Item>
          <Form.Item label="技能" name="skill">
            <Input placeholder="可选，如 task_new" />
          </Form.Item>
          <Form.Item label="会话名称" name="session_name">
            <Input placeholder="可选，如 新建任务" />
          </Form.Item>
          <Form.Item label="模板类型" name="template_type">
            <Select
              options={[
                { label: "Scene（导航触发）", value: "scene" },
                { label: "Skill（能力模板）", value: "skill" },
              ]}
            />
          </Form.Item>
          <Form.Item label="分类" name="category">
            <Input placeholder="如 work / contact / digital-employee / imported-skill" />
          </Form.Item>
          <Form.Item label="Agent Key" name="agent_key">
            <Input placeholder="可选，如 digital-chief" />
          </Form.Item>
          <Form.Item label="Agent 名称" name="agent_name">
            <Input placeholder="可选，如 红智秘书" />
          </Form.Item>
          <Form.Item label="来源" name="source">
            <Input placeholder="manual / builtin / skill-auto-discovery" />
          </Form.Item>
          <Form.Item label="版本" name="version">
            <InputNumber min={1} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item label="运行策略" name="runtime_profile">
            <Select
              options={[
                { label: "标准模式（standard）", value: "standard" },
                { label: "隔离模式（isolated）", value: "isolated" },
              ]}
            />
          </Form.Item>
          <Form.Item label="专家档案" name="expert_profile">
            <TextArea rows={4} placeholder="用于数字专家的档案内容（可选）" />
          </Form.Item>
          <Form.Item
            label="提示词内容"
            name="prompt_text"
            rules={[{ required: true, message: "请输入提示词内容" }]}
          >
            <TextArea rows={6} placeholder="支持占位符，如 {{department}} / {{employee}}" />
          </Form.Item>
          <Form.Item>
            <Button onClick={handleScan} loading={scanning}>
              安全扫描
            </Button>
          </Form.Item>
          {scanResult ? (
            <Form.Item>
              <Alert
                type={scanResult.risk_level === "HIGH" ? "warning" : "info"}
                showIcon
                message={`风险等级：${scanResult.risk_level}`}
                description={
                  scanResult.findings.length > 0
                    ? scanResult.findings
                        .map(
                          (item) =>
                            `[${item.severity}] ${item.description}（命中：${item.snippet}）`,
                        )
                        .join("\n")
                    : "未发现高风险命令片段。"
                }
              />
            </Form.Item>
          ) : null}
          <Form.Item label="启用" name="enabled" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
