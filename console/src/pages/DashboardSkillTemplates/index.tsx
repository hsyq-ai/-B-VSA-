import { useEffect, useMemo, useState } from "react";
import { Button, Card, Checkbox, Divider, message, Space, Tag } from "antd";
import api from "../../api";
import type { DashboardSkillRules, DashboardSkillTemplate } from "../../api/types";
import { authApi, type AdminUserRow } from "../../api/modules/auth";
import PromptTemplatesPage from "../PromptTemplates";

const DEFAULT_RULES: DashboardSkillRules = {
  default: [],
  departments: {},
};

function normalizeRules(rules?: DashboardSkillRules): DashboardSkillRules {
  if (!rules) return { ...DEFAULT_RULES };
  return {
    default: Array.isArray(rules.default) ? rules.default : [],
    departments: rules.departments && typeof rules.departments === "object" ? rules.departments : {},
  };
}

export default function DashboardSkillTemplatesPage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rules, setRules] = useState<DashboardSkillRules>({ ...DEFAULT_RULES });
  const [templates, setTemplates] = useState<DashboardSkillTemplate[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);

  const loadDepartments = async () => {
    const pageSize = 200;
    let page = 1;
    let allUsers: AdminUserRow[] = [];
    let totalExpected: number | null = null;
    let retries = 0;
    const maxRetries = 3;
    while (true) {
      let res: any = null;
      try {
        res = await authApi.listAdminUsers({ page, page_size: pageSize });
      } catch (err) {
        retries += 1;
        if (retries <= maxRetries) {
          await new Promise((r) => setTimeout(r, 300 * retries));
          continue;
        }
        throw err;
      }
      retries = 0;
      const items = (res as any).items || res || [];
      if (typeof (res as any).total === "number") {
        totalExpected = (res as any).total;
      }
      allUsers = allUsers.concat(items);
      if (totalExpected !== null && allUsers.length >= totalExpected) break;
      if (totalExpected === null && items.length < pageSize) break;
      page += 1;
    }
    const deptSet = new Set<string>();
    allUsers.forEach((u) => {
      const dept = String(u.department || "").trim();
      if (!dept || dept === "管理员") return;
      deptSet.add(dept);
    });
    return Array.from(deptSet).sort();
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [ruleRes, deptList] = await Promise.all([
        api.getRules(),
        loadDepartments(),
      ]);
      const normalized = normalizeRules(ruleRes.rules);
      // Ensure default/科研部有基础配置
      if (!normalized.default?.length) {
        normalized.default = ["dashboard-doc", "dashboard-party", "dashboard-psy"];
      }
      if (!normalized.departments["科研部"]?.length) {
        normalized.departments["科研部"] = [
          "dashboard-research-topic",
          "dashboard-research-quality",
          "dashboard-research-brainstorm",
          "dashboard-research-search",
          "dashboard-research-data",
          "dashboard-research-writing",
          "dashboard-research-paper-gen",
          "dashboard-research-tracking",
        ];
      }
      setRules(normalized);

      let tpl = ruleRes.templates || [];
      if (!tpl.length) {
        const promptRes: any = await api.listPromptTemplates();
        const items = Array.isArray(promptRes) ? promptRes : promptRes.items || [];
        tpl = items.filter((item: any) => item.category === "dashboard");
      }
      setTemplates(tpl);
      setDepartments(deptList);
    } catch (err: any) {
      message.error(err?.message || "加载仪表台Skill配置失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const templateOptions = useMemo(
    () =>
      templates
        .filter((t) => t.enabled !== false)
        .map((t) => ({
          label: t.display_name,
          value: t.trigger_key,
        })),
    [templates],
  );

  const handleDefaultChange = (checked: (string | number)[]) => {
    setRules((prev) => ({
      ...prev,
      default: checked.map(String),
    }));
  };

  const handleDepartmentChange = (dept: string, checked: (string | number)[]) => {
    setRules((prev) => ({
      ...prev,
      departments: {
        ...prev.departments,
        [dept]: checked.map(String),
      },
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await api.updateRules(rules);
      message.success("已保存仪表台Skill配置");
    } catch (err: any) {
      message.error(err?.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Card
          title="仪表台Skill（按部门展示）"
          extra={
            <Space>
              <Button onClick={loadData} loading={loading}>
                刷新
              </Button>
              <Button type="primary" onClick={handleSave} loading={saving}>
                保存配置
              </Button>
            </Space>
          }
        >
          <div style={{ marginBottom: 12 }}>
            <Tag color="blue">默认（通用部门）</Tag>
          </div>
          <Checkbox.Group
            options={templateOptions}
            value={rules.default}
            onChange={handleDefaultChange}
          />

          <Divider />

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {departments.map((dept) => (
              <div key={dept}>
                <div style={{ marginBottom: 8 }}>
                  <Tag color="geekblue">{dept}</Tag>
                </div>
                <Checkbox.Group
                  options={templateOptions}
                  value={rules.departments[dept] || []}
                  onChange={(checked) => handleDepartmentChange(dept, checked)}
                />
              </div>
            ))}
          </div>
        </Card>

        <PromptTemplatesPage
          title="仪表台Skill 模板"
          filterCategory="dashboard"
          allowImport={false}
        />
      </Space>
    </div>
  );
}
