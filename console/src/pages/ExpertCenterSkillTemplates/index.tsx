import { useEffect, useMemo, useState } from "react";
import { Button, Card, Checkbox, message, Space, Tag, Typography } from "antd";
import type { ExpertCenterSkillRules, ExpertCenterSkillTemplate } from "../../api/types";
import { authApi, type AdminUserRow } from "../../api/modules/auth";
import { expertCenterSkillApi } from "../../api/modules/expertCenterSkills";
import PromptTemplatesPage from "../PromptTemplates";

const DEFAULT_RULES: ExpertCenterSkillRules = {
  default: [],
  departments: {},
};

function normalizeRules(rules?: ExpertCenterSkillRules): ExpertCenterSkillRules {
  if (!rules) return { ...DEFAULT_RULES };
  return {
    default: Array.isArray(rules.default) ? rules.default : [],
    departments: rules.departments && typeof rules.departments === "object" ? rules.departments : {},
  };
}

export default function ExpertCenterSkillTemplatesPage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rules, setRules] = useState<ExpertCenterSkillRules>({ ...DEFAULT_RULES });
  const [templates, setTemplates] = useState<ExpertCenterSkillTemplate[]>([]);
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
        expertCenterSkillApi.getExpertCenterRules(),
        loadDepartments(),
      ]);
      const normalized = normalizeRules(ruleRes.rules);
      normalized.default = [];
      setRules(normalized);
      setTemplates(ruleRes.templates || []);
      setDepartments(deptList);
    } catch (err: any) {
      message.error(err?.message || "加载专家中心Skill配置失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const deptOptionsMap = useMemo(() => {
    const byDept: Record<string, Array<{ label: string; value: string }>> = {};
    templates
      .filter((t) => t.enabled !== false)
      .forEach((t) => {
        const dept = String(t.department || "").trim();
        if (!dept) return;
        if (!byDept[dept]) byDept[dept] = [];
        byDept[dept].push({
          label: t.display_name,
          value: t.trigger_key,
        });
      });
    return byDept;
  }, [templates]);

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
      await expertCenterSkillApi.updateExpertCenterRules({
        ...rules,
        default: [],
      });
      message.success("已保存专家中心Skill配置");
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
          title="专家中心Skill（按部门展示）"
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
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {departments.map((dept) => (
              <div key={dept}>
                <div style={{ marginBottom: 8 }}>
                  <Tag color="geekblue">{dept}</Tag>
                </div>
                {deptOptionsMap[dept]?.length ? (
                  <Checkbox.Group
                    options={deptOptionsMap[dept]}
                    value={rules.departments[dept] || []}
                    onChange={(checked) => handleDepartmentChange(dept, checked)}
                  />
                ) : (
                  <Typography.Text type="secondary">
                    当前部门尚未配置专家候选项
                  </Typography.Text>
                )}
              </div>
            ))}
          </div>
        </Card>

        <PromptTemplatesPage
          title="专家中心Skill 模板"
          filterCategory="digital-employee"
          filterAgentKey="digital-expert"
          allowImport={false}
        />
      </Space>
    </div>
  );
}
