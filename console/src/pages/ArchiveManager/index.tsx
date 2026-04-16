import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Col,
  Input,
  message,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Typography,
} from "antd";
import api from "../../api";
import type { AdminUserRow, UpdateEmployeeProfilePayload } from "../../api/modules/auth";

const { Text } = Typography;
const { TextArea } = Input;

const DEPARTMENT_OPTIONS = [
  { value: "研发部", label: "研发部" },
  { value: "科研部", label: "科研部" },
  { value: "行政部", label: "行政部" },
  { value: "财务部", label: "财务部" },
  { value: "法务部", label: "法务部" },
  { value: "品牌运营部", label: "品牌运营部" },
  { value: "总裁办", label: "总裁办" },
  { value: "管理员", label: "管理员" },
];

export default function ArchiveManagerPage() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [employeeMemory, setEmployeeMemory] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [form, setForm] = useState<UpdateEmployeeProfilePayload>({
    english_name: "",
    nickname: "",
    aliases: "",
    title: "",
    department: "",
    position: "",
    is_executive: 0,
  });

  const selectedUser = useMemo(
    () => users.find((u) => u.profile_id === selectedProfileId) || null,
    [users, selectedProfileId],
  );

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await api.listAdminUsers({
        page,
        page_size: pageSize,
        q: query,
      });
      const normalized =
        Array.isArray(res)
          ? {
              items: res,
              total: res.length,
              page,
              page_size: pageSize,
            }
          : res;
      let rows = normalized?.items || [];
      if (Array.isArray(res) && query) {
        const q = query.toLowerCase();
        rows = rows.filter(
          (u) =>
            String(u.name || "").toLowerCase().includes(q) ||
            String(u.phone || "").toLowerCase().includes(q),
        );
      }
      setUsers(rows);
      setTotal(normalized?.total || 0);
      if (!selectedProfileId && rows.length > 0) {
        setSelectedProfileId(rows[0].profile_id);
      }
    } catch (e: any) {
      message.error(e?.message || "加载员工档案列表失败");
    } finally {
      setLoading(false);
    }
  };

  const loadEmployeeMemory = async (profileId: number) => {
    try {
      const res = await api.getEmployeeMemory(profileId);
      setEmployeeMemory(res.content || "");
    } catch (e: any) {
      message.error(e?.message || "加载员工档案失败");
    }
  };

  useEffect(() => {
    loadUsers();
  }, [page, pageSize, query]);

  useEffect(() => {
    if (selectedProfileId) {
      loadEmployeeMemory(selectedProfileId);
    }
  }, [selectedProfileId]);

  useEffect(() => {
    if (!selectedUser) return;
    setForm({
      english_name: selectedUser.english_name || "",
      nickname: selectedUser.nickname || "",
      aliases: selectedUser.aliases || "",
      title: selectedUser.title || "",
      department: selectedUser.department || "",
      position: selectedUser.position || "",
      is_executive: Number(selectedUser.is_executive || 0),
    });
  }, [selectedUser]);

  const saveProfile = async () => {
    if (!selectedProfileId) return;
    setSavingProfile(true);
    try {
      await api.updateEmployeeProfile(selectedProfileId, {
        english_name: form.english_name || "",
        nickname: form.nickname || "",
        aliases: form.aliases || "",
        title: form.title || "",
        department: form.department || "",
        position: form.position || "",
        is_executive: form.is_executive ? 1 : 0,
      });
      message.success("档案信息已保存");
      await loadUsers();
    } catch (e: any) {
      message.error(e?.message || "保存档案失败（请确认后端已重启）");
    } finally {
      setSavingProfile(false);
    }
  };

  const saveMemory = async () => {
    if (!selectedProfileId) return;
    try {
      await api.saveEmployeeMemory(selectedProfileId, employeeMemory);
      message.success("员工档案内容已保存");
    } catch (e: any) {
      message.error(e?.message || "保存档案内容失败");
    }
  };

  const userColumns = [
    {
      title: "姓名",
      dataIndex: "name",
      key: "name",
    },
    {
      title: "部门",
      dataIndex: "department",
      key: "department",
    },
    {
      title: "职位",
      dataIndex: "position",
      key: "position",
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Row gutter={[16, 16]}>
        <Col span={8}>
          <Card
            title="员工列表"
            extra={
              <Input
                placeholder="搜索姓名/手机号"
                value={query}
                onChange={(e) => {
                  setPage(1);
                  setQuery(e.target.value);
                }}
                style={{ width: 160 }}
              />
            }
          >
            <Table
              rowKey="profile_id"
              dataSource={users}
              columns={userColumns as any}
              loading={loading}
              pagination={{
                current: page,
                pageSize,
                total,
                onChange: (p, ps) => {
                  setPage(p);
                  setPageSize(ps || 20);
                },
              }}
              onRow={(record) => ({
                onClick: () => setSelectedProfileId(record.profile_id),
              })}
              rowClassName={(record) =>
                record.profile_id === selectedProfileId ? "row-selected" : ""
              }
            />
          </Card>
        </Col>

        <Col span={16}>
          <Card
            title="员工档案信息"
            extra={
              <Space>
                <Button type="primary" onClick={saveProfile} loading={savingProfile}>
                  保存档案
                </Button>
              </Space>
            }
          >
            {selectedUser ? (
              <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                <Text strong>姓名：</Text> <span>{selectedUser.name}</span>
                <Text strong>手机号：</Text> <span>{selectedUser.phone}</span>

                <Row gutter={[12, 12]}>
                  <Col span={12}>
                    <Text>英文名</Text>
                    <Input
                      value={form.english_name}
                      onChange={(e) => setForm({ ...form, english_name: e.target.value })}
                      placeholder="如 Leo"
                    />
                  </Col>
                  <Col span={12}>
                    <Text>昵称</Text>
                    <Input
                      value={form.nickname}
                      onChange={(e) => setForm({ ...form, nickname: e.target.value })}
                      placeholder="如 小贺"
                    />
                  </Col>
                  <Col span={12}>
                    <Text>别名/称呼（逗号分隔）</Text>
                    <Input
                      value={form.aliases}
                      onChange={(e) => setForm({ ...form, aliases: e.target.value })}
                      placeholder="如 贺柏鑫,小贺,Leo"
                    />
                  </Col>
                  <Col span={12}>
                    <Text>职衔/称谓</Text>
                    <Input
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      placeholder="如 总经理"
                    />
                  </Col>
                  <Col span={12}>
                    <Text>部门</Text>
                    <Select
                      style={{ width: "100%" }}
                      value={form.department || "未设置"}
                      onChange={(v) => setForm({ ...form, department: v })}
                      options={DEPARTMENT_OPTIONS}
                    />
                  </Col>
                  <Col span={12}>
                    <Text>职位</Text>
                    <Input
                      value={form.position}
                      onChange={(e) => setForm({ ...form, position: e.target.value })}
                      placeholder="如 总裁助理"
                    />
                  </Col>
                  <Col span={12}>
                    <Text>总裁办尊称</Text>
                    <div style={{ marginTop: 6 }}>
                      <Switch
                        checked={Boolean(form.is_executive)}
                        onChange={(checked) =>
                          setForm({ ...form, is_executive: checked ? 1 : 0 })
                        }
                      />
                      <Text style={{ marginLeft: 8 }} type="secondary">
                        开启后将以“姓氏+总”称呼
                      </Text>
                    </div>
                  </Col>
                </Row>
              </Space>
            ) : (
              <Text type="secondary">请选择一名员工</Text>
            )}
          </Card>

          <Card
            title="员工档案内容（MEMORY.md）"
            style={{ marginTop: 16 }}
            extra={
              <Button type="primary" onClick={saveMemory} disabled={!selectedUser}>
                保存档案内容
              </Button>
            }
          >
            <TextArea
              rows={12}
              value={employeeMemory}
              onChange={(e) => setEmployeeMemory(e.target.value)}
              placeholder="请输入员工档案内容"
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
