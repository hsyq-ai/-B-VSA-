import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Col,
  Input,
  message,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import api from "../../api";
import type { AdminUserRow } from "../../api/modules/auth";

const { Title, Text } = Typography;
const { TextArea } = Input;

function statusColor(status: AdminUserRow["status"]) {
  switch (status) {
    case "active":
      return "green";
    case "pending":
      return "orange";
    case "disabled":
      return "red";
    case "rejected":
      return "default";
    default:
      return "default";
  }
}

export default function ManagerPage() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [publicMemory, setPublicMemory] = useState("");
  const [employeeMemory, setEmployeeMemory] = useState("");
  const [newPassword, setNewPassword] = useState("");

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
      message.error(e?.message || "加载用户列表失败");
    } finally {
      setLoading(false);
    }
  };

  const loadPublicMemory = async () => {
    try {
      const res = await api.getPublicMemory();
      setPublicMemory(res.content || "");
    } catch (e: any) {
      message.error(e?.message || "加载公共档案失败");
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
    loadPublicMemory();
  }, []);

  useEffect(() => {
    if (selectedProfileId) {
      loadEmployeeMemory(selectedProfileId);
    }
  }, [selectedProfileId]);

  const onApprove = async (userId: number) => {
    await api.approveUser(userId);
    message.success("审批通过");
    await loadUsers();
  };

  const onReject = async (userId: number) => {
    await api.rejectUser(userId);
    message.success("已拒绝");
    await loadUsers();
  };

  const onToggleStatus = async (u: AdminUserRow) => {
    const nextStatus = u.status === "disabled" ? "active" : "disabled";
    await api.updateUserStatus(u.id, nextStatus);
    message.success("状态已更新");
    await loadUsers();
  };

  const onDepartmentChange = async (u: AdminUserRow, department: string) => {
    try {
      await api.updateUserDepartment(u.id, department);
      message.success("部门已更新");
      await loadUsers();
    } catch (e: any) {
      message.error(e?.message || "部门更新失败（请确认后端已重启）");
    }
  };

  const onResetPassword = async (u: AdminUserRow) => {
    if (!newPassword || newPassword.length < 6) {
      message.warning("请输入至少6位新密码");
      return;
    }
    await api.resetPassword(u.id, newPassword);
    message.success("密码已重置");
    setNewPassword("");
  };

  const userColumns = [
    {
      title: "姓名",
      dataIndex: "name",
      key: "name",
    },
    {
      title: "手机号",
      dataIndex: "phone",
      key: "phone",
    },
    {
      title: "部门",
      dataIndex: "department",
      key: "department",
      render: (department: AdminUserRow["department"], row: AdminUserRow) => (
        <Select
          value={department || undefined}
          placeholder="未设置"
          allowClear
          style={{ width: 140 }}
          popupMatchSelectWidth={false}
          onChange={(value) => onDepartmentChange(row, value || "")}
          options={[
            { value: "研发部", label: "研发部" },
            { value: "科研部", label: "科研部" },
            { value: "行政部", label: "行政部" },
            { value: "财务部", label: "财务部" },
            { value: "法务部", label: "法务部" },
            { value: "品牌运营部", label: "品牌运营部" },
            { value: "总裁办", label: "总裁办" },
            { value: "管理员", label: "管理员" },
          ]}
        />
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      render: (status: AdminUserRow["status"]) => (
        <Tag color={statusColor(status)}>{status}</Tag>
      ),
    },
    {
      title: "操作",
      key: "actions",
      render: (_: unknown, row: AdminUserRow) => (
        <Space wrap>
          <Button
            size="small"
            type="primary"
            disabled={row.status === "active"}
            onClick={() => onApprove(row.id)}
          >
            通过
          </Button>
          <Button
            size="small"
            danger
            disabled={row.status === "rejected"}
            onClick={() => onReject(row.id)}
          >
            拒绝
          </Button>
          <Button size="small" onClick={() => onToggleStatus(row)}>
            {row.status === "disabled" ? "启用" : "禁用"}
          </Button>
          <Popconfirm
            title="确认重置密码？"
            onConfirm={() => onResetPassword(row)}
            okText="确认"
            cancelText="取消"
          >
            <Button size="small">重置密码</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Title level={3} style={{ margin: 0 }}>
        管理后台
      </Title>

      <Card>
        <Space direction="vertical" style={{ width: "100%" }}>
          <Space>
            <Text>搜索：</Text>
            <Input.Search
              allowClear
              placeholder="姓名或手机号"
              style={{ width: 260 }}
              enterButton="搜索"
              onSearch={(value) => {
                setQuery(value.trim());
                setPage(1);
              }}
              onChange={(e) => {
                const next = e.target.value || "";
                if (!next) {
                  setQuery("");
                  setPage(1);
                }
              }}
            />
          </Space>
          <Space>
            <Text>重置密码输入框：</Text>
            <Input.Password
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              style={{ width: 240 }}
              placeholder="至少 6 位"
            />
            <Text type="secondary">点击某行“重置密码”时生效</Text>
          </Space>
          <Table
            rowKey="id"
            loading={loading}
            columns={userColumns}
            dataSource={users}
            pagination={{
              current: page,
              pageSize,
              total,
              showSizeChanger: true,
              showQuickJumper: true,
              onChange: (nextPage, nextSize) => {
                setPage(nextPage);
                setPageSize(nextSize || pageSize);
              },
            }}
          />
        </Space>
      </Card>

      <Row gutter={16}>
        <Col span={12}>
          <Card
            title="公司公共档案"
            extra={
              <Button
                type="primary"
                onClick={async () => {
                  await api.savePublicMemory(publicMemory);
                  message.success("公共档案已保存");
                }}
              >
                保存
              </Button>
            }
          >
            <TextArea
              value={publicMemory}
              onChange={(e) => setPublicMemory(e.target.value)}
              autoSize={{ minRows: 12, maxRows: 20 }}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card
            title="员工私有档案"
            extra={
              <Space>
                <Select
                  style={{ width: 260 }}
                  value={selectedProfileId || undefined}
                  onChange={(v) => setSelectedProfileId(v)}
                  options={users.map((u) => ({
                    value: u.profile_id,
                    label: `${u.name} (${u.department || "未设置"})`,
                  }))}
                />
                <Button
                  type="primary"
                  disabled={!selectedUser}
                  onClick={async () => {
                    if (!selectedUser) return;
                    await api.saveEmployeeMemory(
                      selectedUser.profile_id,
                      employeeMemory,
                    );
                    message.success("员工档案已保存");
                  }}
                >
                  保存
                </Button>
              </Space>
            }
          >
            <TextArea
              value={employeeMemory}
              onChange={(e) => setEmployeeMemory(e.target.value)}
              autoSize={{ minRows: 12, maxRows: 20 }}
            />
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
