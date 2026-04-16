# 红智OS v3.1 最小闭环验证清单

> 说明：本清单用于验证 v3.1 “事件驱动 + 审计 + 记忆闭环”的最小闭环是否可用。**无需重启服务即可阅读本清单**。

## 0. 验证前提
- 事件流文件存在：`/home/featurize/work/aifscie/copaw_work/event_stream.jsonl`
- 事件日志文件存在：`/home/featurize/work/aifscie/copaw_work/events/YYYY-MM-DD.jsonl`
- 记忆目录存在：
  - `copaw_work/memory/employees/<user_id>/daily/`
  - `copaw_work/memory/org/daily/`

> 可选：若要启用事件流消费与记忆投影，需要重启服务并设置环境变量：
> - `COPAW_EVENT_CONSUMER=1`
> - `COPAW_MEMORY_FROM_STREAM=1`
>（当前用户要求不重启，以下为“可选验证步骤”）

---

## 1. 事件采集链路验证（无需重启）

### 1.1 用户发消息 → 事件入流
**操作**：用户在聊天框发送一句普通消息或上传附件。

**预期结果**：
- `event_stream.jsonl` 中新增一条 `event_type=chat_user_message` 或 `file_upload` 事件
- 事件包含：`event_id / ts_utc / actor_user_id / summary / intent_tag / event_hash`

**检查命令**：
```bash
# 查看最新 3 条事件
 tail -n 3 /home/featurize/work/aifscie/copaw_work/event_stream.jsonl
```

### 1.2 通知命令 → 事件入流
**操作**：用户输入 “通知某人 …”。

**预期结果**：
- `event_stream.jsonl` 中新增 `event_type=notification`
- 事件 payload 中包含 `target_user`、`task_id`

---

## 2. 审计字段完整性检查

### 2.1 事件结构检查
**预期字段**：
- `event_version`
- `event_id`
- `ts_utc`
- `actor_user_id`
- `event_type`
- `summary`
- `intent_tag`
- `source`
- `payload`
- `event_hash`

**检查示例**：
```bash
tail -n 1 /home/featurize/work/aifscie/copaw_work/event_stream.jsonl | jq
```

---

## 3. 记忆沉淀验证（当前默认模式）

### 3.1 员工记忆
**预期结果**：
- `copaw_work/memory/employees/<user_id>/daily/YYYY-MM-DD.md` 存在
- 文件中包含刚刚的事件摘要行

### 3.2 组织记忆
**预期结果**：
- `copaw_work/memory/org/daily/YYYY-MM-DD.md` 存在
- 文件中包含刚刚的事件摘要行

### 3.3 组织摘要
**预期结果**：
- `copaw_work/memory/org/daily/YYYY-MM-DD.summary.md` 存在
- 文件中包含统计汇总

---

## 4. 事件流驱动模式验证（需重启服务后执行）

> 仅在你允许重启后执行。

### 4.1 启用事件消费者
```bash
export COPAW_EVENT_CONSUMER=1
export COPAW_MEMORY_FROM_STREAM=1
# 然后重启服务
```

### 4.2 验证事件投影
- 发送消息 → `event_stream.jsonl` 生成事件
- 事件消费者读取事件 → 生成员工/组织记忆

**检查**：
- 记忆文件是否依赖事件投影生成（而非直接写）

---

## 5. 最小闭环达标标准

- [ ] 任意消息会生成事件
- [ ] 事件包含审计字段与 hash
- [ ] 组织与员工记忆可见
- [ ] 日志可回溯（event_stream + events 双写）
- [ ] 通知任务可写入事件流（待启用事件消费者验证）

---

如需下一步，我可以补充：
- v3.1 最小闭环演示脚本
- 自动化健康检查脚本
- 事件回放与重建流程文档

