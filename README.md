# Aifscie Agent OS / 红智OS — B-VSA

> **数字员工操作系统** | 基于 AgentScope 深度改造的智能协作执行平台
>
> 让每个员工拥有一个数字分身（PIA），通过 IAP 协议实现跨 Agent 的任务路由、协作与审计。支持全双工语音交互（VSA）、主动提醒、12种消息渠道接入。

[![版本](https://img.shields.io/badge/version-4.16-blue)](https://github.com/hsyq-ai/-B-VSA-)
[![Python](https://img.shields.io/badge/Python-3.11+-green)](https://python.org)
[![Node](https://img.shields.io/badge/Node.js-18+-green)](https://nodejs.org)

---

## 一句话介绍

这不是传统 OA 流程系统，而是一个能**理解意图、自动调度、主动推送**的智能协作平台。

---

## 核心能力

### 双层 Agent 架构
| 层级 | 角色 | 职责 |
|------|------|------|
| **SO** (System Orchestrator) | 系统编排器 | 全局路由 / 调度 / 审计 / 协作治理 |
| **PIA** (Personal Intelligent Agent) | 个人数字分身 | 绑定员工档案 / 记忆 / 任务 / 邮箱 |

### 语音秘书 VSA (Voice Secretary Agent)

> 本轮重点重构模块

- **全双工语音交互** — WebSocket 实时语音流 + SoulX-Duplug 端点检测
- **可控语音克隆** — VoxCPM2 TTS 引擎（GPU），Edge TTS 作为备用
- **主动提醒系统** — 事件入队 → 前端拉取 → Dock 提醒卡片 → 语音接管播报
- **两阶段意图分类** — 功能域判断 → 精确函数匹配
- **会话可见性** — 语音交互结果同步到聊天界面

**核心链路闭环：**

```
事件入队 → 前端拉取 → Dock提醒(立即处理/稍后/归档) → 语音接管 → 会话可见结果
```

### 12 种消息渠道

Console · 钉钉 · 飞书 · Discord · Telegram · QQ · iMessage · Matrix · Mattermost · MQTT · Voice(Twilio) · 语音秘书

### 自演化技能系统

16 种内置技能（文档处理、仪表盘、定时任务等）+ 自动技能提取与审计记录

---

## 系统架构

```
┌──────────────────────────────────────────────────────┐
│                    用户 (多渠道)                       │
│  Console │ 钉钉 │ 飞书 │ Discord │ Telegram │ VSA语音 │
└────┬─────────┬─────────┬──────────┬─────────┬────────┘
     │         │         │          │         │
     ▼         ▼         ▼          ▼         ▼
┌──────────────────────────────────────────────────────┐
│              FastAPI + AgentScope                    │
│  ┌───────┐ ┌────────┐ ┌─────────────────────────┐   │
│  │  SO   │ │ PIA×N  │ │    VSA (语音秘书)       │   │
│  │系统编排│◄►│数字分身│ │ 全双工+主动提醒+意图分类│   │
│  └───┬───┘ └───┬────┘ └─────────┬───────────────┘   │
│      │          │               │                    │
│      ▼          ▼               ▼                    │
│  ┌──────────────────────────────────────────────┐    │
│  │  IAP 协议 / 审计链 / 邮箱 / 主动事件存储      │    │
│  └──────────────────────────────────────────────┘    │
│  ┌────────┐ ┌────────┐ ┌──────────┐ ┌───────────┐  │
│  │10 LLM  │ │16 技能  │ │记忆体系  │ │Duplug(VAD)│  │
│  │提供商  │ │自演化   │ │公共+私有 │ │端点检测    │  │
│  └────────┘ └────────┘ └──────────┘ └───────────┘  │
└──────────────────────────────────────────────────────┘
```

---

## 技术栈

| 层级 | 技术 |
|------|------|
| **后端** | Python 3.11 · FastAPI · AgentScope 1.0.16 · SQLite |
| **前端** | React 18 · TypeScript · Vite · Ant Design 5 |
| **Agent** | ReAct 推理 · 两阶段意图分类 · IAP 协议 |
| **TTS/ASR** | VoxCPM2 (可控语音克隆) · Edge TTS · Whisper |
| **VAD** | SoulX-Duplug (端口 8000) |
| **CLI** | Click (`copaw` 命令) |
| **部署** | HTTPS 自签名 · 单实例 · Docker 可选 |

---

## 快速开始

```bash
# 1. 克隆代码
git clone https://github.com/hsyq-ai/-B-VSA-.git
cd -B-VSA-

# 2. 安装后端依赖（详见 4_16_env.md）
pip install -e .

# 3. 安装并构建前端
cd console && npm install && npm run build && cd ..

# 4. 生成 SSL 证书
mkdir -p certs
openssl req -x509 -newkey rsa:2048 -keyout certs/key.pem -out certs/cert.pem \
  -days 365 -nodes -subj "/CN=localhost"

# 5. 配置环境变量
mkdir -p ~/copaw_work
cat > ~/copaw_work/.env << 'EOF'
DASHSCOPE_API_KEY=sk-your-key
OPENAI_API_KEY=sk-your-key  # 可选
EOF

# 6. 启动（一键脚本）
bash 4_16_build_restart.sh            # 构建前端 + 重启服务
bash 4_16_build_restart.sh --skip-build  # 仅重启服务
```

访问 `https://localhost:8088`，第一个注册用户自动成为管理员。

---

## 双端路由

| 路径 | 端 | 说明 |
|------|----|------|
| `/app/*` | 员工端 | 会话、数字员工、语音交互、浮动AI坞 |
| `/admin/*` | 管理端 | 用户管理、技能审计、系统配置 |

---

## VSA 2.0 主动提醒架构

本轮（2026-04-16）重点补全的能力：

### 新增组件

| 文件 | 功能 |
|------|------|
| `src/copaw/app/proactive_event_store.py` | 主动事件存储与去重 |
| `POST /api/vsa/proactive-events/enqueue` | 后端事件入队接口 |
| `GET /api/vsa/proactive-events/pull` | 前端拉取主动事件 |
| `usePushBridge.ts` | 双通道拉取（常规消息 + 主动事件） |
| `FloatingAiDock.tsx` | 主动提醒卡片（立即处理/稍后/归档） |

### 关键修复

1. **会话膨胀修复** — 不再按 message_id 逐条新建会话，改为稳定 conversation_key 归并（`sys:<hash>`）
2. **主动事件去重** — 忽略时间戳比较，同源事件短窗口内只入队一次

---

## 项目结构

```
CoPaw/
├── src/copaw/
│   ├── app/routers/              # 25个路由模块
│   ├── app/channels/voice_secretary/  # VSA语音频道
│   ├── app/proactive_event_store.py  # 主动事件存储 [NEW]
│   ├── agents/                   # CoPawAgent, VSA, SkillsHub, 16种技能
│   ├── providers/                # 10个LLM提供商
│   └── cli/                      # copaw命令行工具
├── console/src/
│   ├── pages/Employee/           # 员工端页面
│   ├── pages/Admin/              # 管理端页面
│   ├── components/employee/ai/FloatingAiDock.tsx  # 浮动AI坞
│   └── features/core/
│       ├── voice/useVoiceSecretary.ts   # VSA前端Hook
│       └── app/usePushBridge.ts         # 推送桥接 [NEW]
├── docs/                         # 文档
│   ├── VSA_update_2026-04-16.md   # 本次更新说明
│   └── VSA_2.0主动通信方案.md
├── scripts/                      # 运维脚本
├── 4_16_build_restart.sh          # 一键构建重启脚本
├── 4_16_env.md                   # 环境依赖详细文档
└── pyproject.toml                # Python包定义
```

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
| v4.0 | 全模态感知 + 语音秘书 VSA 1.0 |
| **v4.16** | **VSA 2.0 主动提醒 + 会话修复 + 去重优化** |

---

## 环境依赖详情

完整安装步骤、依赖版本、常见问题排查，请参阅 [4_16_env.md](./4_16_env.md)。

---

## License

Proprietary — 红智科技 (Aifscie)
