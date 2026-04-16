import { useEffect, useMemo, useState } from "react";
import { Button, Card, Empty, Input, Segmented, Select, Space, Table, Tag } from "antd";
import sessionApi from "../Chat/sessionApi";
import { getApiToken, getApiUrl } from "../../api/config";

interface SessionOption {
  label: string;
  value: string;
}

interface FileRow {
  key: string;
  name: string;
  fileId: string;
  size: number;
  mimeType: string;
  createdAt: string;
  sessionId: string;
  sessionName: string;
}

export default function EmployeeFiles() {
  const [sessions, setSessions] = useState<SessionOption[]>([]);
  const [selectedSession, setSelectedSession] = useState<string>("");
  const [files, setFiles] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState<"current" | "all">("current");
  const [searchScope, setSearchScope] = useState<"user" | "all">("user");

  const loadSessions = async () => {
    const list = await sessionApi.getSessionList();
    const options: SessionOption[] = (list || []).map((s) => ({
      label: String((s as any).name || "未命名会话"),
      value: String((s as any).sessionId || ""),
    }));
    setSessions(options);
    if (!selectedSession && options.length) {
      setSelectedSession(options[0].value);
    }
  };

  const loadFiles = async (sessionId: string) => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const token = getApiToken();
      const url = getApiUrl(`/chat-files/session/${encodeURIComponent(sessionId)}`);
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const data = res.ok ? await res.json() : { files: [] };
      const rows: FileRow[] = (data.files || []).map((f: any) => ({
        key: String(f.file_id),
        name: String(f.original_name || f.name || f.file_id),
        fileId: String(f.file_id),
        size: Number(f.file_size || f.size || 0),
        mimeType: String(f.mime_type || ""),
        createdAt: String(f.created_at || ""),
        sessionId,
        sessionName:
          sessions.find((s) => s.value === sessionId)?.label || "当前会话",
      }));
      setFiles(rows);
    } finally {
      setLoading(false);
    }
  };

  const loadAllFiles = async () => {
    if (!query) return;
    setLoading(true);
    try {
      const token = getApiToken();
      const params = new URLSearchParams({
        q: query,
        scope: searchScope,
        limit: "50",
      });
      const url = getApiUrl(`/chat-files/search?${params.toString()}`);
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const data = res.ok ? await res.json() : { files: [] };
      const rows: FileRow[] = (data.files || []).map((f: any) => ({
        key: String(f.file_id),
        name: String(f.original_name || f.name || f.file_id),
        fileId: String(f.file_id),
        size: Number(f.file_size || f.size || 0),
        mimeType: String(f.mime_type || ""),
        createdAt: String(f.timestamp_ms || f.created_at || ""),
        sessionId: String(f.session_id || ""),
        sessionName:
          sessions.find((s) => s.value === String(f.session_id || ""))?.label || "会话",
      }));
      setFiles(rows);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    if (viewMode === "current" && selectedSession) {
      loadFiles(selectedSession);
    }
  }, [selectedSession, viewMode]);

  const filteredFiles = useMemo(() => {
    return files.filter((row) => {
      if (!query) return true;
      const q = query.toLowerCase();
      return (
        row.name.toLowerCase().includes(q) ||
        row.sessionName.toLowerCase().includes(q)
      );
    });
  }, [files, query]);

  const columns = useMemo(
    () => {
      const base = [
        {
          title: "会话",
          dataIndex: "sessionName",
          key: "sessionName",
          render: (value: string) => (
            <Tag color="blue">{value || "会话"}</Tag>
          ),
        },
      ];
      const core = [
      { title: "文件名", dataIndex: "name", key: "name" },
      { title: "类型", dataIndex: "mimeType", key: "mimeType" },
      { title: "大小", dataIndex: "size", key: "size" },
      {
        title: "操作",
        key: "action",
        render: (_: unknown, row: FileRow) => {
          const token = getApiToken();
          const suffix = token ? `?access_token=${encodeURIComponent(token)}` : "";
          const downloadUrl = getApiUrl(`/chat-files/${row.fileId}/download${suffix}`);
          return (
            <Button size="small" onClick={() => window.open(downloadUrl, "_blank")}>
              下载
            </Button>
          );
        },
      },
    ];
      return viewMode === "all" ? [...base, ...core] : core;
    },
    [viewMode],
  );

  return (
    <Card title="文件与知识">
      <Space style={{ marginBottom: 16 }} wrap>
        <Segmented
          size="small"
          options={[
            { label: "当前会话", value: "current" },
            { label: "全局检索", value: "all" },
          ]}
          value={viewMode}
          onChange={(value) => setViewMode(value as "current" | "all")}
        />
        {viewMode === "current" ? (
          <>
            <span>选择会话：</span>
            <Select
              style={{ minWidth: 260 }}
              placeholder="选择一个会话"
              options={sessions}
              value={selectedSession || undefined}
              onChange={(value) => setSelectedSession(value)}
            />
            <Button onClick={() => loadFiles(selectedSession)} loading={loading} size="small">
              刷新
            </Button>
          </>
        ) : (
          <>
            <Select
              style={{ minWidth: 120 }}
              value={searchScope}
              onChange={(value) => setSearchScope(value)}
              options={[
                { label: "仅自己", value: "user" },
                { label: "全局", value: "all" },
              ]}
            />
            <Button onClick={loadAllFiles} loading={loading} size="small">
              按名称检索
            </Button>
          </>
        )}
        <Input.Search
          allowClear
          placeholder={viewMode === "all" ? "输入文件名关键字" : "搜索文件名"}
          onSearch={(value) => setQuery(value)}
          onChange={(e) => setQuery(e.target.value)}
          value={query}
          style={{ width: 200 }}
        />
      </Space>
      {filteredFiles.length === 0 ? (
        <Empty description="暂无文件，先在对话中上传附件" />
      ) : (
        <Table
          rowKey="key"
          columns={columns}
          dataSource={filteredFiles}
          loading={loading}
          pagination={{ pageSize: 8 }}
        />
      )}
    </Card>
  );
}
