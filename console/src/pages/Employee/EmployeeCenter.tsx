import { useEffect, useMemo, useState } from "react";
import {
  Card,
  Input,
  Tabs,
  Tag,
  Avatar,
  Typography,
  Space,
  Row,
  Col,
  Badge,
  Button,
  Empty,
  Spin,
  message,
  Progress,
} from "antd";
import {
  Search,
  Users,
  Mail,
  Building2,
  Briefcase,
  Sparkles,
  ArrowUpRight,
  UserRound,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { authApi, type AdminUserRow } from "../../api/modules/auth";
import { agentOsApi } from "../../api/modules/agentOs";
import PageAiInsightCard from "../../components/employee/ai/PageAiInsightCard";
import { usePageAiContextSync } from "../../components/employee/ai/pageAiContextBridge";
import { openSecretaryWithContext } from "../../features/party/shared/navigation";
import { buildBusinessAvatar, getPersonAvatarSeed } from "../../utils/avatar";

const { Title, Text } = Typography;

interface EmployeeCardItem extends AdminUserRow {
  user_id?: string | number;
}

const normalize = (value: unknown) => String(value || "").trim();

export default function EmployeeCenterPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<EmployeeCardItem[]>([]);
  const [searchText, setSearchText] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [currentUserName, setCurrentUserName] = useState("当前员工");

  useEffect(() => {
    let canceled = false;

    const loadUsers = async () => {
      setLoading(true);
      try {
        const me = await authApi.getMe();
        if (!canceled) {
          setCurrentUserName(normalize(me.name) || "当前员工");
        }

        const pageSize = 200;
        let page = 1;
        let totalExpected: number | null = null;
        const merged: EmployeeCardItem[] = [];

        while (true) {
          const res = await authApi.listAdminUsers({ page, page_size: pageSize });
          const items = ((res as any)?.items || res || []) as EmployeeCardItem[];
          merged.push(...items);

          if (typeof (res as any)?.total === "number") {
            totalExpected = Number((res as any).total);
          }
          if (totalExpected !== null && merged.length >= totalExpected) break;
          if (totalExpected === null && items.length < pageSize) break;
          page += 1;
        }

        if (!canceled) {
          setUsers(
            merged
              .filter((u) => normalize(u.name))
              .map((u) => ({ ...u, name: normalize(u.name) })),
          );
        }
      } catch (err) {
        try {
          const res = await agentOsApi.listActiveUsers();
          const fallback = (res?.items || []).map((u, index) => ({
            id: Number(u.user_id) || index + 1,
            user_id: String(u.user_id || ""),
            profile_id: Number(u.user_id) || index + 1,
            name: normalize(u.name) || `员工${index + 1}`,
            phone: "",
            role: "employee" as const,
            status: "active" as const,
            created_at: "",
            department: normalize(u.department),
            position: normalize(u.position),
          }));
          if (!canceled) {
            setUsers(fallback);
          }
        } catch (fallbackErr) {
          console.error("Failed to load users:", err, fallbackErr);
          if (!canceled) {
            message.error("加载员工列表失败");
            setUsers([]);
          }
        }
      } finally {
        if (!canceled) {
          setLoading(false);
        }
      }
    };

    void loadUsers();
    return () => {
      canceled = true;
    };
  }, []);

  const departments = useMemo(() => {
    const depts = new Set<string>();
    users.forEach((u) => {
      const dept = normalize(u.department);
      if (dept) depts.add(dept);
    });
    return Array.from(depts).sort();
  }, [users]);

  const filteredUsers = useMemo(() => {
    const keyword = searchText.toLowerCase().trim();
    return users.filter((u) => {
      const name = normalize(u.name).toLowerCase();
      const position = normalize(u.position).toLowerCase();
      const dept = normalize(u.department).toLowerCase();
      const matchesSearch = !keyword || name.includes(keyword) || position.includes(keyword) || dept.includes(keyword);
      const matchesTab = activeTab === "all" || normalize(u.department) === activeTab;
      return matchesSearch && matchesTab;
    });
  }, [users, searchText, activeTab]);

  const aiPageContext = useMemo(() => {
    const deptLabel = activeTab === "all" ? "全部部门" : activeTab;
    const keywordLabel = normalize(searchText) || "无关键词";
    const focusNames = filteredUsers
      .slice(0, 3)
      .map((item) => normalize(item.name) || "员工")
      .filter(Boolean);
    const leadName = focusNames[0] || "首位员工";

    return {
      path: "/app/employee-center",
      source: "employee-center",
      title: filteredUsers.length > 0 ? `当前正在查看 ${deptLabel} 的 ${filteredUsers.length} 名员工` : "当前筛选下暂无可协同员工",
      summary: `筛选部门：${deptLabel}；搜索词：${keywordLabel}；当前结果 ${filteredUsers.length} 名；覆盖 ${departments.length} 个部门。`,
      tags: [deptLabel === "全部部门" ? "全员视图" : deptLabel, keywordLabel === "无关键词" ? "未检索" : `检索:${keywordLabel}`],
      insights: [
        `优先关注：${focusNames.join("、") || "请调整筛选条件"}`,
        `当前可直接发起分身协同：${leadName}`,
        `当前结果覆盖 ${departments.length} 个部门`,
      ],
      quickPrompts:
        filteredUsers.length > 0
          ? [
              "基于当前筛选推荐最值得先联络的员工",
              `解释为什么应该优先联系${leadName}`,
              "围绕当前员工视图生成分工建议",
            ]
          : ["当前筛选没有结果，帮我判断应该如何调整搜索条件", "基于全员视图推荐值得优先关注的协同对象"],
      promptContext: [
        "页面：员工中心",
        `当前操作者：${currentUserName}`,
        `筛选部门：${deptLabel}`,
        `搜索关键词：${keywordLabel}`,
        `当前结果数：${filteredUsers.length}`,
        `部门总数：${departments.length}`,
        `优先关注员工：${focusNames.join("、") || "-"}`,
      ].join("\n"),
    };
  }, [activeTab, currentUserName, departments.length, filteredUsers, searchText]);

  usePageAiContextSync(aiPageContext);

  const handleOpenDetail = (user: EmployeeCardItem) => {
    const targetName = normalize(user.name) || normalize(user.department) || "员工";
    const targetUserId = normalize((user as any).user_id) || String(user.id || "").trim();
    if (!targetUserId) {
      message.warning("员工标识缺失，暂时无法查看详情");
      return;
    }

    const nextKey = `employee-center-chat-${targetUserId}`;
    const ts = Date.now();

    sessionStorage.setItem(
      "copaw_scene_start_v1",
      JSON.stringify({
        key: nextKey,
        label: `${targetName} 数字分身`,
        triggerKey: "org-dept-staff",
        sessionName: `${targetName} 数字分身会话`,
        prompt: `我是${currentUserName}，不是${targetName}本人。现在我要和${targetName}的数字分身对话。请你直接以“${targetName}的数字分身”身份向我回应，先简洁说明你能代表${targetName}提供哪些档案事实信息，以及如果我要留言、通知或交办事项，应该如何转达给${targetName}。不要欢迎${targetName}回来，也不要把我当成${targetName}本人。`,
        context: {
          department: normalize(user.department),
          employee: targetName,
          target_name: targetName,
          target_user_name: targetName,
          target_type: "employee",
          scene_target_name: targetName,
          scene_target_user_name: targetName,
          scene_target_user_id: targetUserId,
          scene_target_profile_id: targetUserId,
          current_user_name: currentUserName,
          scene_actor_name: currentUserName,
          scene_actor_user_name: currentUserName,
          scene_actor_user_id:
            sessionStorage.getItem("copaw_user_id") || localStorage.getItem("copaw_user_id") || "",
        },
        skill: "employee_agent_link",
        templateType: "scene",
        ts,
      }),
    );
    navigate(`/app/employee/${encodeURIComponent(nextKey)}?t=${ts}`);
  };

  return (
    <div style={{ padding: 24, maxWidth: 1620, margin: "0 auto" }}>
      <Card
        bordered={false}
        style={{
          borderRadius: 24,
          marginBottom: 20,
          background: "linear-gradient(120deg, #1e1b4b 0%, #3730a3 45%, #4f46e5 100%)",
          boxShadow: "0 20px 45px rgba(49, 46, 129, 0.35)",
        }}
        styles={{ body: { padding: 28 } }}
      >
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} xl={16}>
            <Space direction="vertical" size={8}>
              <Tag color="geekblue" style={{ width: "fit-content", borderRadius: 999, paddingInline: 12 }}>
                <Sparkles size={12} style={{ marginRight: 6 }} /> Employee Collaboration Hub
              </Tag>
              <Title level={2} style={{ color: "#fff", margin: 0, fontWeight: 800 }}>
                员工中心
              </Title>
              <Text style={{ color: "rgba(255,255,255,0.86)", fontSize: 15 }}>
                欢迎你，{currentUserName}。在这里统一查看员工数字分身并发起协作。
              </Text>
            </Space>
          </Col>
          <Col xs={24} xl={8}>
            <Row gutter={12}>
              <Col span={8}>
                <div className="ec-stat-box">
                  <div className="ec-stat-value">{users.length}</div>
                  <div className="ec-stat-label">员工总数</div>
                </div>
              </Col>
              <Col span={8}>
                <div className="ec-stat-box">
                  <div className="ec-stat-value">{departments.length}</div>
                  <div className="ec-stat-label">部门数量</div>
                </div>
              </Col>
              <Col span={8}>
                <div className="ec-stat-box">
                  <div className="ec-stat-value">{filteredUsers.length}</div>
                  <div className="ec-stat-label">当前结果</div>
                </div>
              </Col>
            </Row>
          </Col>
        </Row>
      </Card>

      <PageAiInsightCard
        badge="AI 协同推荐"
        tone="indigo"
        title={filteredUsers.length > 0 ? `红智助手已为你识别 ${filteredUsers.length} 个可协同分身` : "红智助手已识别当前筛选结果为空"}
        description="员工中心现在不仅展示员工列表，还会直接给出协同推荐、分身响应入口与下一步联动建议。"
        insights={[
          `当前结果：${filteredUsers.length} 名员工`,
          `部门覆盖：${departments.length} 个`,
          `优先关注：${filteredUsers.slice(0, 3).map((item) => normalize(item.name) || "员工").join("、") || "请先调整筛选条件"}`,
        ]}
        suggestions={[
          "先联系同部门或职责最匹配的员工分身，再决定是否扩大协同范围。",
          "遇到多人协同场景时，先让秘书推荐分工和通知口径。",
          "如需高阶判断，可从员工协同场景直接切到专家中心。",
        ]}
        actions={[
          {
            key: "employee-recommend",
            label: "让秘书推荐协同对象",
            type: "primary",
            onClick: () =>
              openSecretaryWithContext(
                navigate,
                `员工中心：${currentUserName} 当前正在查看员工协同面板，共筛选出 ${filteredUsers.length} 名员工、覆盖 ${departments.length} 个部门。请推荐优先联络对象、分工方式与后续推进动作。`,
              ),
          },
          {
            key: "employee-first",
            label: filteredUsers[0] ? `让 ${normalize(filteredUsers[0].name) || "首位员工"} 的分身响应` : "查看全部员工",
            onClick: () =>
              filteredUsers[0] ? handleOpenDetail(filteredUsers[0]) : message.info("请先放宽筛选条件后再发起分身协同"),
          },
          { key: "employee-expert", label: "进入专家中心", onClick: () => navigate("/app/expert-center") },
        ]}
      />

      <Row gutter={20}>
        <Col xs={24} lg={17}>
          <Card bordered={false} className="ec-surface-card" style={{ marginBottom: 18 }}>
            <Input
              prefix={<Search size={18} color="#64748b" />}
              placeholder="搜索员工姓名、职位或部门"
              size="large"
              allowClear
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ borderRadius: 12, height: 46 }}
            />
            <div style={{ marginTop: 16 }}>
              <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                items={[
                  { key: "all", label: "全部部门" },
                  ...departments.map((dept) => ({ key: dept, label: dept })),
                ]}
              />
            </div>
          </Card>

          {loading ? (
            <Card bordered={false} className="ec-surface-card" style={{ textAlign: "center", padding: 48 }}>
              <Spin tip="正在加载员工列表..." />
            </Card>
          ) : (
            <Row gutter={[16, 16]}>
              {filteredUsers.length > 0 ? (
                filteredUsers.map((user) => {
                  const name = normalize(user.name) || "未命名员工";
                  const dept = normalize(user.department) || "未分配部门";
                  const position = normalize(user.position) || "员工";
                  const phone = normalize(user.phone) || "暂无联络方式";
                  const seed = getPersonAvatarSeed(user.user_id ?? user.id ?? name, name);
                  const avatar = buildBusinessAvatar({
                    seed,
                    name,
                    gender: (user as any).gender ?? (user as any).sex,
                  });
                  return (
                    <Col xs={24} md={12} xxl={8} key={`${user.id}-${user.user_id || ""}`}>
                      <Card bordered={false} hoverable className="ec-employee-card" onClick={() => handleOpenDetail(user)}>
                        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
                          <Avatar
                            size={56}
                            src={avatar.src}
                            style={{
                              background: avatar.background,
                              boxShadow: "0 10px 24px rgba(79,70,229,0.28)",
                              fontWeight: 700,
                            }}
                          >
                            {avatar.fallback}
                          </Avatar>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <Title level={4} ellipsis style={{ margin: 0, fontSize: 18 }}>{name}</Title>
                            <Text type="secondary" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                              <Briefcase size={12} /> {position}
                            </Text>
                          </div>
                          <Badge status="processing" text="在线分身" />
                        </div>

                        <div className="ec-kv-wrap">
                          <div className="ec-kv-row"><Building2 size={13} /> {dept}</div>
                          <div className="ec-kv-row"><Mail size={13} /> {phone}</div>
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
                          <Tag color="blue" style={{ borderRadius: 8, margin: 0 }}>employee_agent_link</Tag>
                          <Button type="text" style={{ color: "#4f46e5", fontWeight: 600 }}>
                            让分身响应 <ArrowUpRight size={14} />
                          </Button>
                        </div>
                      </Card>
                    </Col>
                  );
                })
              ) : (
                <Col span={24}>
                  <Card bordered={false} className="ec-surface-card">
                    <Empty description="暂未找到符合条件的员工" />
                  </Card>
                </Col>
              )}
            </Row>
          )}
        </Col>

        <Col xs={24} lg={7}>
          <Card bordered={false} className="ec-surface-card" style={{ position: "sticky", top: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <Users size={18} color="#4f46e5" />
              <Text strong style={{ fontSize: 16 }}>部门分布</Text>
            </div>
            {departments.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无部门数据" />
            ) : (
              departments.map((dept) => {
                const count = users.filter((u) => normalize(u.department) === dept).length;
                const percent = users.length ? Math.round((count / users.length) * 100) : 0;
                const active = activeTab === dept;
                return (
                  <div key={dept} className={`ec-dept-item ${active ? "active" : ""}`} onClick={() => setActiveTab(dept)}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <Text strong>{dept}</Text>
                      <Text type="secondary">{count} 人</Text>
                    </div>
                    <Progress percent={percent} size="small" showInfo={false} strokeColor="#4f46e5" />
                  </div>
                );
              })
            )}
            <Button block style={{ marginTop: 12 }} icon={<UserRound size={14} />} onClick={() => setActiveTab("all")}>
              查看全部员工
            </Button>
          </Card>
        </Col>
      </Row>

      <style
        dangerouslySetInnerHTML={{
          __html: `
            .ec-surface-card {
              border-radius: 20px;
              background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
              box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
            }
            .ec-employee-card {
              border-radius: 18px;
              background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
              box-shadow: 0 8px 18px rgba(15, 23, 42, 0.07);
              border: 1px solid #edf2ff;
              transition: all 0.25s ease;
            }
            .ec-employee-card:hover {
              transform: translateY(-4px);
              box-shadow: 0 16px 28px rgba(79, 70, 229, 0.18);
              border-color: #c7d2fe;
            }
            .ec-kv-wrap {
              background: #f8faff;
              border: 1px solid #e7ecff;
              border-radius: 12px;
              padding: 10px 12px;
              display: grid;
              gap: 8px;
            }
            .ec-kv-row {
              display: inline-flex;
              align-items: center;
              gap: 8px;
              color: #475569;
              font-size: 13px;
            }
            .ec-stat-box {
              border: 1px solid rgba(255,255,255,0.22);
              background: rgba(255,255,255,0.1);
              border-radius: 14px;
              padding: 10px;
              text-align: center;
            }
            .ec-stat-value {
              color: #fff;
              font-size: 20px;
              line-height: 1;
              font-weight: 800;
            }
            .ec-stat-label {
              color: rgba(255,255,255,0.8);
              font-size: 12px;
              margin-top: 6px;
            }
            .ec-dept-item {
              border: 1px solid #edf2ff;
              border-radius: 12px;
              padding: 10px;
              margin-bottom: 10px;
              cursor: pointer;
              transition: all .2s ease;
            }
            .ec-dept-item:hover {
              border-color: #c7d2fe;
              background: #f8faff;
            }
            .ec-dept-item.active {
              border-color: #818cf8;
              background: #eef2ff;
            }
          `,
        }}
      />
    </div>
  );
}
