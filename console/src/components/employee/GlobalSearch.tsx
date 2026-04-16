import React, { useEffect, useState, useCallback } from "react";
import { Modal, Input, List, Tag, Typography, Empty, Spin } from "antd";
import { Search, Command, Zap, MessagesSquare, FileText, User, Settings, Bell, ClipboardCheck, ClipboardList, Target, LayoutDashboard, UsersRound, HeartHandshake, Brain, Bot } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getApiUrl, getApiToken } from "../../api/config";

const { Text } = Typography;

const iconMap: Record<string, React.ReactNode> = {
  MessagesSquare: <MessagesSquare size={16} />,
  Zap: <Zap size={16} />,
  FileText: <FileText size={16} />,
  User: <User size={16} />,
  Settings: <Settings size={16} />,
  Bell: <Bell size={16} />,
  ClipboardCheck: <ClipboardCheck size={16} />,
  ClipboardList: <ClipboardList size={16} />,
  Target: <Target size={16} />,
  LayoutDashboard: <LayoutDashboard size={16} />,
  UsersRound: <UsersRound size={16} />,
  HeartHandshake: <HeartHandshake size={16} />,
  Brain: <Brain size={16} />,
  Bot: <Bot size={16} />
};

interface SearchResult {
  id: string;
  title: string;
  type: string;
  path: string;
  icon: string;
}

const GlobalSearch: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      setOpen(true);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (!open) return;
    
    let cancelled = false;
    const fetchSearch = async () => {
      setLoading(true);
      try {
        const token = getApiToken();
        const url = getApiUrl(`/employee/search?q=${encodeURIComponent(query)}`);
        const res = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (!res.ok) throw new Error("Search failed");
        const data = await res.json();
        if (!cancelled && data.items) {
          setResults(data.items);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    
    const timer = setTimeout(fetchSearch, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open]);

  const handleSelect = (path: string) => {
    navigate(path);
    setOpen(false);
    setQuery("");
  };

  return (
    <>
      <div 
        onClick={() => setOpen(true)}
        style={{
          background: "rgba(0,0,0,0.05)",
          padding: "4px 12px",
          borderRadius: "6px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          color: "#8c8c8c",
          fontSize: "13px",
          border: "1px solid transparent",
          transition: "all 0.2s"
        }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#1890ff")}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = "transparent")}
      >
        <Search size={14} />
        <span>搜索功能或指令...</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "2px", opacity: 0.6 }}>
          <Command size={12} />
          <span>K</span>
        </div>
      </div>

      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        closable={false}
        styles={{ body: { padding: 0 } }}
        width={600}
        centered
        destroyOnClose
      >
        <div style={{ padding: "16px", borderBottom: "1px solid #f0f0f0" }}>
          <Input
            autoFocus
            prefix={<Search size={20} color="#8c8c8c" />}
            placeholder="输入关键词搜索..."
            variant="borderless"
            style={{ fontSize: "16px" }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div style={{ maxHeight: "400px", overflowY: "auto", padding: "8px" }}>
          {loading ? (
            <div style={{ padding: "40px", textAlign: "center" }}><Spin /></div>
          ) : results.length > 0 ? (
            <List
              dataSource={results}
              renderItem={(item) => (
                <List.Item
                  onClick={() => handleSelect(item.path)}
                  style={{
                    padding: "12px 16px",
                    borderRadius: "8px",
                    cursor: "pointer",
                    border: "none",
                    transition: "background 0.2s"
                  }}
                  className="search-item-hover"
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", width: "100%" }}>
                    <div style={{ color: "#1890ff" }}>{iconMap[item.icon] || <FileText size={16} />}</div>
                    <Text strong style={{ flex: 1 }}>{item.title}</Text>
                    <Tag color="blue">{item.type}</Tag>
                  </div>
                </List.Item>
              )}
            />
          ) : (
            <Empty description="未找到相关结果" style={{ padding: "40px" }} />
          )}
        </div>
        <div style={{ padding: "12px 16px", background: "#fafafa", borderTop: "1px solid #f0f0f0", borderRadius: "0 0 8px 8px", fontSize: "12px", color: "#8c8c8c", display: "flex", gap: "16px" }}>
          <span><Text keyboard style={{ fontSize: "10px" }}>Enter</Text> 选择</span>
          <span><Text keyboard style={{ fontSize: "10px" }}>↑↓</Text> 移动</span>
          <span><Text keyboard style={{ fontSize: "10px" }}>Esc</Text> 退出</span>
        </div>
      </Modal>
      <style>{`
        .search-item-hover:hover {
          background: #f0f7ff !important;
        }
      `}</style>
    </>
  );
};

export default GlobalSearch;
