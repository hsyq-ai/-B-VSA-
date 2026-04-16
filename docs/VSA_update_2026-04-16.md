# VSA 更新说明（2026-04-16）

## 1. 本次目标

本轮以“先补全主功能、再做联调验收”为目标，重点覆盖：

- 语音秘书主动提醒主链路补全
- 红智秘书会话可见性与状态同步
- 会话异常膨胀问题修复
- 主动事件重复提醒抑制

---

## 2. 已完成改造

### 2.1 主动提醒后端能力补全

- 新增主动事件存储：`src/copaw/app/proactive_event_store.py`
- 应用初始化挂载 `ProactiveEventStore`：`src/copaw/app/_app.py`
- 新增接口：
  - `POST /api/vsa/proactive-events/enqueue`
  - `GET /api/vsa/proactive-events/pull`
  - `POST /api/vsa/proactive-events/test`

### 2.2 前端拉取与联动补全

- `usePushBridge` 增强为双通道拉取：
  - 常规消息：`/messages/pull`
  - 主动事件：`/vsa/proactive-events/pull`
- 统一派发 `copaw-push-session-updated` 事件，补充 `messageCount/proactiveCount/samples/proactiveEvents`
- Dock 增加“主动提醒卡片”与三种操作：
  - `立即处理`
  - `稍后提醒`
  - `静默归档`

涉及文件：

- `console/src/features/core/app/usePushBridge.ts`
- `console/src/components/employee/ai/FloatingAiDock.tsx`
- `console/src/features/core/voice/useVoiceSecretary.ts`

### 2.3 语音侧主动事件处理补全

- 语音 WS 支持接收 `proactive_event`
- 增加 `proactive_notify` 阶段态映射
- 主动事件可转为语音播报与会话结果卡片

涉及文件：

- `src/copaw/app/channels/voice_secretary/handler.py`
- `console/src/features/core/voice/useVoiceSecretary.ts`

### 2.4 会话膨胀修复（关键）

- 修正 `/api/messages/pull` 中系统消息会话键策略：
  - 不再默认按 `message_id` 逐条新建 `notif:*` 会话
  - 改为稳定 `conversation_key`（`sys:<hash>`）归并
- 结果：同源同主题消息可复用同一通知会话，避免“说几句话生成几十个会话”

涉及文件：

- `src/copaw/app/_app.py`

### 2.5 主动事件去重修复（关键）

- 原先去重对比包含 `ts`，导致同一事件重复入队仍被视为不同
- 现已改为去重比较时忽略 `ts`
- 结果：短窗口内重复事件只入队一次，减少重复播报和抖动

涉及文件：

- `src/copaw/app/proactive_event_store.py`

---

## 3. 联调验收结果

### 3.1 已通过

- 后端语法检查通过：`py_compile`
- 前端构建检查通过：`tsc -b`
- 消息拉取后会话键已出现 `sys:*` 归并形态（非逐条 `notif:uuid`）
- 主动事件去重逻辑经代码级验证通过：
  - 第一次入队：`True`
  - 第二次同事件入队：`False`
  - 拉取数量：`1`

### 3.2 联调过程发现并确认的风险

- 在线环境存在多进程/旧进程并存可能，若未加载最新代码，可能观察到旧行为
- 轮询较密时会增加“处理中”体感时延，建议后续继续做节流与聚合优化

---

## 4. 当前仍建议继续优化（非本轮阻塞项）

- 轮询频率统一收敛（避免多页面叠加导致高频 pull）
- 主动策略参数化（按时段、会议状态、用户偏好）
- 任务词二次门控继续细化（降低宽词误判）
- 主动事件来源扩展（外部新闻、同事消息、日程系统统一打分）

---

## 5. 本轮改造结论

本轮“重要功能补全”已完成，核心链路可闭环：

`事件入队 -> 前端拉取 -> Dock提醒 -> 语音接管 -> 会话可见结果`

并已修复两项关键稳定性问题：

1. 会话异常膨胀  
2. 主动提醒重复入队

