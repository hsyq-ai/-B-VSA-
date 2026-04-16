# Aifscie Agent OS (红智OS)

> 基于 AgentScope 深度改造的**数字员工操作系统** — 让智能分身参与组织协作

---

## 项目简介

Aifscie Agent OS 是一套智能协作执行系统，核心理念是让每个员工拥有一个**数字分身 (PIA)**，通过 **IAP 协议 (Inter-Agent Protocol)** 实现跨 Agent 的任务路由、协作与审计。这不是传统 OA 流程系统，而是一个能够理解意图、自动调度、主动推送的智能协作平台。

### 核心特性

- **双层 Agent 架构** — SO（系统编排器）全局调度 + PIA（个人智能分身）执行任务
- **IAP 协议** — 11 字段标准信封，支持 Agent 间意图路由、审计链追踪
- **12 种消息渠道** — 钉钉、飞书、Discord、Telegram、QQ、iMessage、Matrix、MQTT、语音等
- **语音秘书 (VSA)** — 全双工语音交互，支持 VoxCPM2 可控语音克隆
- **两阶段意图分类** — 先判断功能域，再精确匹配执行函数
- **自演化技能系统** — 16 种内置技能 + 自动技能提取与审计
- **记忆体系** — 公共记忆 + 员工私有记忆 + 自我改进知识库

---

## 系统架构

```
┌───────────────────────────────────────────────────┐
│                  用户 (多渠道)                      │
│  Console │ 钉钉 │ 飞书 │ Discord │ Telegram │ ... │
└──────┬──────────┬──────────┬──────────┬───────────┘
       │          │          │          │
       ▼          ▼          ▼          ▼
┌──────────────────────────────────────────────────┐
│            FastAPI + AgentScope                   │
│  ┌─────────┐  ┌──────────┐  ┌────────────────┐  │
│  │  SO      │  │  PIA×N   │  │  VSA (语音秘书)│  │
│  │ 系统编排 │◄►│ 数字分身  │  │  全双工语音    │  │
│  └────┬────┘  └────┬─────┘  └───────┬────────┘  │
│       │            │                │            │
│       ▼            ▼                ▼            │
│  ┌──────────────────────────────────────────┐    │
│  │        IAP 协议 / 审计链 / 邮箱          │    │
│  └──────────────────────────────────────────┘    │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ 10 LLM   │  │ 16 技能  │  │ 记忆体系      │  │
│  │ 提供商   │  │ 自演化   │  │ 公共+私有     │  │
│  └──────────┘  └──────────┘  └───────────────┘  │
└──────────────────────────────────────────────────┘
```

---

## 技术栈

| 层级 | 技术 |
|------|------|
| **后端** | Python 3.11 · FastAPI · AgentScope 1.0.16 · SQLite |
| **前端** | React 18 · TypeScript · Vite · Ant Design 5 |
| **Agent** | ReAct 推理 · 两阶段意图分类 · IAP 协议 |
| **TTS** | VoxCPM2 (语音克隆) · Edge TTS (备用) |
| **CLI** | Click 命令行工具 (`copaw` 命令) |
| **部署** | HTTPS 自签名 · 单实例 · supervisord 可选 |

---

## 快速开始

### 前置条件

- Python 3.10+
- Node.js 18+
- 至少一个 LLM API Key（OpenAI / DashScope / Ollama 等）

### 安装

```bash
# 1. 克隆代码
git clone https://github.com/hsyq-ai/-B-VSA-.git
cd -B-VSA-

# 2. 安装后端
pip install -e .

# 3. 构建前端
cd console && npm install && npm run build && cd ..

# 4. 生成 SSL 证书
mkdir -p certs
openssl req -x509 -newkey rsa:2048 -keyout certs/key.pem -out certs/cert.pem \
  -days 365 -nodes -subj "/CN=localhost"

# 5. 配置 LLM API Key
mkdir -p ~/copaw_work
echo "DASHSCOPE_API_KEY=sk-xxxxx" > ~/copaw_work/.env
```

### 启动

```bash
# 设置环境变量
export COPAW_WORKING_DIR=~/copaw_work
export PYTHONPATH=$(pwd)/src

# 启动服务
copaw app --host 0.0.0.0 --port 8088 --https \
  --ssl-certfile certs/cert.pem --ssl-keyfile certs/key.pem
```

或使用一键脚本：

```bash
bash 4_16_build_restart.sh            # 构建前端 + 重启服务
bash 4_16_build_restart.sh --skip-build  # 仅重启服务
```

### 访问

打开 `https://localhost:8088`，第一个注册的用户自动成为管理员。

---

## 双端路由

前端采用双端路由设计：

| 路径 | 端 | 说明 |
|------|----|------|
| `/app/*` | 员工端 | 会话、数字员工、语音交互 |
| `/admin/*` | 管理端 | 用户管理、技能审计、系统配置 |

---

## IAP 协议 (Inter-Agent Protocol)

Agent 间通信采用标准信封格式：

```json
{
  "envelope_id": "uuid",
  "from_agent_id": "pia:12",
  "to_agent_id": "so:enterprise",
  "intent": "doc_write",
  "trace_id": "trace-uuid",
  "payload": { "text": "帮我写一份会议纪要" },
  "created_at": "2026-04-16T01:00:00Z"
}
```

---

## 16 种内置技能

| 技能 | 说明 |
|------|------|
| `browser_visible` | 浏览器可见操作 |
| `cron` | 定时任务 |
| `dashboard_doc` | 文档仪表盘 |
| `dashboard_party` | 党建仪表盘 |
| `dashboard_psy` | 心理健康仪表盘 |
| `dingtalk_channel` | 钉钉消息渠道 |
| `docx` | Word 文档处理 |
| `file_reader` | 文件阅读 |
| `himalaya` | 喜马拉雅音频 |
| `news` | 新闻摘要 |
| `pdf` | PDF 处理 |
| `pptx` | PPT 处理 |
| `task_current` | 当前任务 |
| `task_done` | 已完成任务 |
| `task_new` | 新建任务 |
| `xlsx` | Excel 处理 |

---

## 语音秘书 (VSA)

Voice Secretary Agent 提供全双工语音交互能力：

- **意图分类**: 两阶段分类（功能域 → 执行函数）
- **TTS 引擎**: VoxCPM2 可控语音克隆（需 GPU）或 Edge TTS
- **语音去重**: SoulX-Duplug 端点检测服务（port 8000）

---

## 项目结构

```
CoPaw/
├── src/copaw/
│   ├── app/routers/        # FastAPI 路由 (auth, agent_os, chats 等)
│   ├── agents/             # Agent 系统 (CoPawAgent, VSA, SkillsHub)
│   ├── providers/          # LLM 提供商 (OpenAI, Anthropic, Ollama 等)
│   ├── cli/                # copaw 命令行工具
│   └── __version__.py      # 版本号
├── console/src/
│   ├── pages/Employee/     # 员工端页面
│   ├── pages/Admin/        # 管理端页面
│   ├── components/         # 共享组件 (AuthModal, FloatingAiDock 等)
│   └── api/                # API 调用层
├── scripts/                # 运维脚本
├── certs/                  # SSL 证书
├── assets/                 # 静态资源
├── pyproject.toml          # Python 包定义
├── 4_16_build_restart.sh   # 一键构建重启脚本
└── 4_16_env.md             # 环境依赖详细文档
```

---

## 环境依赖详情

完整的环境依赖、安装步骤和常见问题，请参阅 [4_16_env.md](./4_16_env.md)。

---

## 版本历史

| 版本 | 里程碑 |
|------|--------|
| v1.1 | 认证档案体系 |
| v1.2 | 智能引导注册 |
| v1.3 | 并发修复 |
| v1.4 | 主动推送 |
| v1.5 | 推送升级 |
| v1.6 | 链路修复 |
| v3.19 | 双端路由 (/app + /admin) |
| v3.24 | 科研 + 平台融合 |
| v3.25 | P0+P1 AgentOS 验收通过 |
| v4.0 | 全模态感知 + 语音秘书 |

---

## License

Proprietary — 红智科技
