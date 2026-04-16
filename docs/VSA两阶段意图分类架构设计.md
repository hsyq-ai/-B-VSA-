# VSA 两阶段意图分类架构设计

> 版本：v1.0 | 日期：2026-04-14 | 状态：待实施

---

## 一、背景与问题

### 1.1 当前架构

VSA（语音秘书·小智）采用**单阶段五分类**意图识别：

```
用户语音 → LLM 五选一分类 → { greeting | chat | self_handle | org_task | employee_task }
```

### 1.2 核心问题

| 问题 | 表现 | 根因 |
|------|------|------|
| **误把闲聊当任务** | 用户说"你是谁"，回复"好的，我帮你处理" | 降级默认走 `employee_task`（最危险路径） |
| **开放域与封闭域混合** | chat/self_handle（无限集）与 employee_task/org_task（有限集）混在一起五选一 | LLM 在无限集和有限集之间做选择，边界模糊 |
| **规则无法穷举** | 每加一条规则只堵一个洞，新 case 永远漏 | 降级逻辑试图用规则覆盖所有情况 |
| **新增功能成本高** | 加一个功能要改 prompt + 改规则 + 改降级逻辑 | 意图类型和系统功能耦合 |

### 1.3 设计原则

1. **默认安全**：不确定时宁可多聊一句，也不要误转任务
2. **开放域归 LLM，封闭域归注册表**：chat 类由 LLM 自由回复，task 类从有限功能表中精确匹配
3. **两阶段解耦**：先判断"聊天还是做事"，再判断"做什么事"
4. **功能可扩展**：新增功能只需往注册表加一条，不改分类逻辑

---

## 二、新架构：两阶段分类

### 2.1 架构总览

```
用户语音
  │
  ▼
┌──────────────────────────────────────────┐
│  第一阶段：chat vs task（二分类）         │
│                                          │
│  用户是在跟我聊天，还是要我做事？          │
│  默认 = chat（安全）                      │
│                                          │
│  chat  → VSA 直接回复（开放域）           │
│  task  → 进入第二阶段                     │
└──────────────┬───────────────────────────┘
               │ task
               ▼
┌──────────────────────────────────────────┐
│  第二阶段：功能匹配（从注册表选）          │
│                                          │
│  路由A: → SO（组织级）                    │
│    ├─ org_structure   组织架构查询        │
│    ├─ org_policy      制度规章查询        │
│    └─ org_public      公开信息检索        │
│                                          │
│  路由B: → PIA（个人级）                   │
│    ├─ task_manage     任务管理            │
│    ├─ schedule        日程提醒            │
│    ├─ email           邮件收发            │
│    ├─ doc_write       文档写作            │
│    ├─ file_process    文件处理            │
│    ├─ news_query      新闻资讯            │
│    ├─ party_study     党建学习            │
│    ├─ mental_support  心理关怀            │
│    └─ unknown         确认后转PIA通用     │
└──────────────────────────────────────────┘
```

### 2.2 为什么两阶段优于单阶段

| 维度 | 单阶段（五选一） | 两阶段 |
|------|-----------------|--------|
| "你是谁" | 可能分到 employee_task ❌ | 第一阶段判 chat ✅ |
| "今天好热" | 可能分到 employee_task ❌ | 第一阶段判 chat ✅ |
| "提醒我开会" | 五选一容易混 | chat/task → task → schedule ✅ |
| 新增功能 | 改 prompt + 改规则 | 加一条功能注册表 ✅ |
| 降级兜底 | 默认 employee_task（危险） | 默认 chat（安全） ✅ |
| 分类准确率 | 二分类 > 五分类 | 数学上更优 ✅ |

---

## 三、第一阶段：chat vs task

### 3.1 Prompt 设计

```
你是一个语音意图分类器。判断用户是在**闲聊**，还是在**要求执行某个任务**。

## 定义

- **chat**：打招呼、问候、闲聊、询问你的身份/能力、情感表达、日常问答、
  任何不要求系统执行具体操作的对话
- **task**：明确要求做某件事（查、设、提醒、发消息、写文档、找资料等）

## 判断原则

1. 不确定时，选 chat
2. 单纯问问题（你是谁、几点了、天气如何）→ chat
3. 要求系统执行操作（帮我查、帮我设、帮我写、提醒我）→ task

## 用户信息
- 用户称呼: {user_name}
- 当前时间: {current_time}

## 用户输入
{text}

## 示例

"你好" → chat
"你是谁" → chat
"你叫什么" → chat
"你能做什么" → chat
"今天好热" → chat
"帮我查一下公司有哪些部门" → task
"提醒我下午3点开会" → task
"给张总发个邮件" → task
"帮我写个通知" → task

## 输出

只返回一个 JSON，不要其他内容：
{"classification": "chat|task", "confidence": 0.0-1.0, "reason": "简短理由"}
```

### 3.2 降级规则

LLM 解析失败时：

1. 包含打招呼词 → `chat`
2. 默认 → `chat`（**不再默认 task**）

```python
def _fallback_stage1(self, text: str) -> str:
    """第一阶段降级：默认 chat"""
    greetings = ("你好", "您好", "嗨", "哈喽", "hello", "早上好", "上午好", "下午好", "晚上好")
    if any(g in text for g in greetings) and len(text) <= 10:
        return "chat"
    return "chat"  # 默认安全
```

### 3.3 chat 分支处理

判定为 chat 后，VSA 直接用 LLM 生成回复，**不转发任何 Agent**：

```
chat → VSA LLM 自由回复 → 流式返回用户
```

VSA 回复 prompt 中携带自身人设（VSA_PROFILE.md），能自然回答"你是谁"、"你能做什么"等问题。

---

## 四、第二阶段：功能匹配

### 4.1 功能注册表

```yaml
# ============================================
# VSA 功能注册表
# 新增功能只需在此表中添加一条记录
# ============================================

# ------ 组织级（路由到 SO）------
- id: org_structure
  name: 组织架构查询
  description: 查询公司/部门的组织架构、人员信息
  target_agent: so
  examples:
    - "公司有哪些部门"
    - "研发部有多少人"
    - "张总在哪个部门"
    - "组织架构是什么样的"

- id: org_policy
  name: 制度规章查询
  description: 查询公司规章制度、流程规范
  target_agent: so
  examples:
    - "报销流程是什么"
    - "年假有几天"
    - "考勤制度是什么"
    - "请假怎么走流程"

- id: org_public
  name: 公开信息检索
  description: 查询公司公开信息、公告、党建相关
  target_agent: so
  examples:
    - "最近有什么公告"
    - "公司发展历程"
    - "党建活动安排"

# ------ 个人级（路由到 PIA）------
- id: task_manage
  name: 任务管理
  description: 新建任务、盘点当前工作、总结已完成事项
  target_agent: pia
  examples:
    - "帮我建个任务"
    - "我现在有什么事要做"
    - "帮我总结下这周完成了什么"
    - "新项目立项"
    - "盘点下我的工作"

- id: schedule
  name: 日程提醒
  description: 日程管理、定时提醒
  target_agent: pia
  examples:
    - "提醒我下午3点开会"
    - "每天早上9点提醒我写日报"
    - "明天有什么安排"
    - "帮我设个闹钟"

- id: email
  name: 邮件收发
  description: 查看邮件、发送邮件、搜索邮件
  target_agent: pia
  examples:
    - "我有新邮件吗"
    - "给张总发封邮件"
    - "帮我看看最近的邮件"

- id: doc_write
  name: 文档写作
  description: 写文档、做表格、做PPT、写公文、处理文件
  target_agent: pia
  examples:
    - "帮我写个通知"
    - "做个PPT"
    - "写份周报"
    - "起草一份请示"
    - "帮我做个表格"

- id: file_process
  name: 文件处理
  description: 读取文件内容、文件格式转换
  target_agent: pia
  examples:
    - "帮我看看这个文件"
    - "这个PDF讲了什么"
    - "把文档转成PDF"

- id: news_query
  name: 新闻资讯
  description: 查看最新新闻
  target_agent: pia
  examples:
    - "今天有什么新闻"
    - "科技新闻"
    - "财经要闻"

- id: party_study
  name: 党建学习
  description: 党建学习计划、学习要点
  target_agent: pia
  examples:
    - "本周学习安排"
    - "党建学习计划"
    - "学习强国"

- id: mental_support
  name: 心理关怀
  description: 情绪支持、心理辅导建议
  target_agent: pia
  examples:
    - "我最近压力好大"
    - "心情不太好"
    - "有点焦虑"
    - "工作压力太大了"

# ------ 兜底 ------
- id: unknown
  name: 通用任务
  description: 无法匹配到具体功能时的兜底
  target_agent: confirm_then_pia
  examples: []
```

### 4.2 第二阶段 Prompt 设计

```
你是一个任务路由器。用户要求执行一个任务，请从功能列表中选择最匹配的功能。

## 可选功能列表

{function_list}

## 用户输入
{text}

## 选择原则

1. 只从上面列表中选择一个 id
2. 如果用户意图模糊，无法明确匹配任何功能，选 unknown
3. 优先匹配更具体的功能，而非笼统的功能

## 输出

只返回一个 JSON：
{"function_id": "从列表中选择的id", "confidence": 0.0-1.0, "reason": "简短理由", "forward_content": "提取的精炼任务描述"}
```

其中 `{function_list}` 由功能注册表动态生成，格式如：

```
- org_structure: 组织架构查询 - 查询公司/部门的组织架构、人员信息
- org_policy: 制度规章查询 - 查询公司规章制度、流程规范
- task_manage: 任务管理 - 新建任务、盘点当前工作、总结已完成事项
- schedule: 日程提醒 - 日程管理、定时提醒
...
```

### 4.3 unknown 处理：确认后转发

当第二阶段匹配结果为 `unknown` 时，**不直接转发 PIA**，而是 VSA 先确认：

```
用户: "帮我搞一下那个东西"
  → 第二阶段: unknown (confidence 0.3)
  → VSA: "你是想让我帮你做什么？能再说具体一点吗？"
```

确认后用户补充了信息，重新进入两阶段分类流程。

### 4.4 功能注册表的动态生成

```python
def build_function_list_prompt(self) -> str:
    """从功能注册表生成第二阶段 prompt 中的功能列表"""
    lines = []
    for func in FUNCTION_REGISTRY:
        examples_str = "、".join(f"「{e}」" for e in func["examples"][:3])
        lines.append(f"- {func['id']}: {func['name']} - {func['description']} 示例: {examples_str}")
    return "\n".join(lines)
```

---

## 五、完整数据流

```
用户语音
  │
  ▼
┌─────────────────────────────────────────────────────┐
│  VSA.classify_intent()                              │
│                                                     │
│  1. 第一阶段 LLM: chat vs task                      │
│     ├─ chat  → VSA 直接 LLM 回复 → 返回            │
│     └─ task  → 继续                                 │
│                                                     │
│  2. 第二阶段 LLM: 从功能注册表选一个                  │
│     ├─ 具体功能 (confidence ≥ 0.6)                  │
│     │   ├─ target_agent=so   → 转发 SO             │
│     │   └─ target_agent=pia  → 转发 PIA            │
│     │                                               │
│     ├─ unknown (confidence < 0.6)                   │
│     │   → VSA 确认: "你能再说具体一点吗？"           │
│     │   → 用户补充后重新分类                         │
│     │                                               │
│     └─ 解析失败                                     │
│         → 降级: 确认后转发 PIA 通用                  │
└─────────────────────────────────────────────────────┘
```

---

## 六、代码改造要点

### 6.1 需要修改的文件

| 文件 | 改动 |
|------|------|
| `src/copaw/agents/voice_secretary.py` | 核心改造：`classify_intent` 拆为两阶段、降级逻辑、功能注册表 |
| `src/copaw/agents/voice_secretary.py` | 新增常量：`FUNCTION_REGISTRY`、两阶段 prompt |
| `src/copaw/agents/voice_secretary.py` | 修改 `VSAIntent` dataclass：新增 `function_id` 字段 |

### 6.2 VSAIntent 扩展

```python
@dataclass
class VSAIntent:
    intent: str              # chat | task
    confidence: float
    reason: str
    vsa_reply: str           # VSA 直接回复的文本
    target_agent: str        # so | pia | null
    forward_content: str     # 转发给下游的任务描述
    function_id: str = ""    # 新增：匹配到的功能 ID（第二阶段）
```

### 6.3 classify_intent 重构

```python
async def classify_intent(self, text: str, context: dict) -> VSAIntent:
    """两阶段意图分类"""
    
    # ===== 第一阶段：chat vs task =====
    stage1 = await self._classify_chat_vs_task(text, context)
    
    if stage1 == "chat":
        # VSA 直接回复
        reply = await self._generate_chat_reply(text, context)
        return VSAIntent(
            intent="chat",
            confidence=0.9,
            reason="第一阶段：闲聊",
            vsa_reply=reply,
            target_agent="null",
            forward_content="",
            function_id="",
        )
    
    # ===== 第二阶段：功能匹配 =====
    func_result = await self._match_function(text, context)
    
    if func_result["function_id"] == "unknown" or func_result["confidence"] < 0.6:
        # 确认后转发
        return VSAIntent(
            intent="task_unknown",
            confidence=func_result["confidence"],
            reason=f"第二阶段：功能模糊 - {func_result['reason']}",
            vsa_reply="你是想让我帮你做什么？能再说具体一点吗？",
            target_agent="null",
            forward_content="",
            function_id="unknown",
        )
    
    # 精确匹配到功能
    func = self._get_function(func_result["function_id"])
    return VSAIntent(
        intent="task",
        confidence=func_result["confidence"],
        reason=func_result["reason"],
        vsa_reply=f"好的，我帮你{func['name']}。",
        target_agent=func["target_agent"],
        forward_content=func_result["forward_content"],
        function_id=func["function_id"],
    )
```

### 6.4 功能注册表数据结构

```python
FUNCTION_REGISTRY = [
    # --- 组织级 ---
    {
        "id": "org_structure",
        "name": "组织架构查询",
        "description": "查询公司/部门的组织架构、人员信息",
        "target_agent": "so",
        "examples": ["公司有哪些部门", "研发部有多少人", "张总在哪个部门"],
    },
    {
        "id": "org_policy",
        "name": "制度规章查询",
        "description": "查询公司规章制度、流程规范",
        "target_agent": "so",
        "examples": ["报销流程是什么", "年假有几天", "考勤制度是什么"],
    },
    {
        "id": "org_public",
        "name": "公开信息检索",
        "description": "查询公司公开信息、公告、党建相关",
        "target_agent": "so",
        "examples": ["最近有什么公告", "公司发展历程", "党建活动安排"],
    },
    # --- 个人级 ---
    {
        "id": "task_manage",
        "name": "任务管理",
        "description": "新建任务、盘点当前工作、总结已完成事项",
        "target_agent": "pia",
        "examples": ["帮我建个任务", "我现在有什么事要做", "帮我总结下这周完成了什么"],
    },
    {
        "id": "schedule",
        "name": "日程提醒",
        "description": "日程管理、定时提醒",
        "target_agent": "pia",
        "examples": ["提醒我下午3点开会", "每天早上9点提醒我写日报", "明天有什么安排"],
    },
    {
        "id": "email",
        "name": "邮件收发",
        "description": "查看邮件、发送邮件、搜索邮件",
        "target_agent": "pia",
        "examples": ["我有新邮件吗", "给张总发封邮件", "帮我看看最近的邮件"],
    },
    {
        "id": "doc_write",
        "name": "文档写作",
        "description": "写文档、做表格、做PPT、写公文、处理文件",
        "target_agent": "pia",
        "examples": ["帮我写个通知", "做个PPT", "写份周报", "起草一份请示"],
    },
    {
        "id": "file_process",
        "name": "文件处理",
        "description": "读取文件内容、文件格式转换",
        "target_agent": "pia",
        "examples": ["帮我看看这个文件", "这个PDF讲了什么", "把文档转成PDF"],
    },
    {
        "id": "news_query",
        "name": "新闻资讯",
        "description": "查看最新新闻",
        "target_agent": "pia",
        "examples": ["今天有什么新闻", "科技新闻", "财经要闻"],
    },
    {
        "id": "party_study",
        "name": "党建学习",
        "description": "党建学习计划、学习要点",
        "target_agent": "pia",
        "examples": ["本周学习安排", "党建学习计划"],
    },
    {
        "id": "mental_support",
        "name": "心理关怀",
        "description": "情绪支持、心理辅导建议",
        "target_agent": "pia",
        "examples": ["我最近压力好大", "心情不太好", "有点焦虑"],
    },
    # --- 兜底 ---
    {
        "id": "unknown",
        "name": "通用任务",
        "description": "无法匹配到具体功能时的兜底",
        "target_agent": "confirm_then_pia",
        "examples": [],
    },
]
```

---

## 七、新功能介绍

### 7.1 功能更新摘要

| 更新项 | 旧版 | 新版 |
|--------|------|------|
| 意图分类 | 单阶段五选一 | 两阶段（chat/task + 功能匹配） |
| 降级默认 | `employee_task`（误转风险） | `chat`（安全） |
| 模糊任务 | 直接转发 PIA | VSA 确认后再转发 |
| 新增功能 | 改 prompt + 改规则 + 改降级 | 功能注册表加一条 |
| VSA 自我介绍 | 靠规则匹配 | chat 分支 LLM 自然回复 |

### 7.2 新增功能一览

| 功能 | 说明 | 对应原有技能 |
|------|------|-------------|
| 组织架构查询 | 查公司/部门/人员 | SO 原有能力 |
| 制度规章查询 | 查规章制度流程 | SO 原有能力 |
| 公开信息检索 | 查公告/党建信息 | SO 原有能力 |
| 任务管理 | 建任务/盘点/总结 | task_new + task_current + task_done |
| 日程提醒 | 提醒/日程/闹钟 | cron |
| 邮件收发 | 查邮件/发邮件 | himalaya |
| 文档写作 | 写文档/PPT/表格/公文 | docx + xlsx + pptx + pdf + dashboard_doc |
| 文件处理 | 读文件/格式转换 | file_reader + pdf |
| 新闻资讯 | 查看最新新闻 | news |
| 党建学习 | 学习计划/学习要点 | dashboard_party |
| 心理关怀 | 情绪支持/心理辅导 | dashboard_psy |

### 7.3 用户体验对比

**旧版**：

```
用户: "你是谁"
VSA:  "好的，我帮你处理。"        ← 误转任务 ❌

用户: "今天好热"
VSA:  "好的，我帮你处理。"        ← 误转任务 ❌

用户: "帮我搞一下那个东西"
VSA:  "好的，我帮你处理。"        ← 盲转 PIA ❌
```

**新版**：

```
用户: "你是谁"
VSA:  "我是小智，你的语音助理，随时可以帮你处理工作上的事情。"  ← 自然回复 ✅

用户: "今天好热"
VSA:  "是挺热的，注意防暑哦。有什么工作上的事需要帮忙吗？"    ← 自然回复 ✅

用户: "帮我搞一下那个东西"
VSA:  "你是想让我帮你做什么？能再说具体一点吗？"              ← 确认后转发 ✅

用户: "提醒我下午3点开会"
VSA:  "好的，我帮你设置日程提醒。"                            ← 精确路由 ✅
```

---

## 八、实施计划

### 8.1 改造步骤

| 步骤 | 内容 | 预估工时 |
|------|------|---------|
| **Step 1** | 定义 `FUNCTION_REGISTRY` 常量 + 扩展 `VSAIntent` | 15min |
| **Step 2** | 实现第一阶段 prompt + `_classify_chat_vs_task` 方法 | 30min |
| **Step 3** | 实现第二阶段 prompt + `_match_function` 方法 | 30min |
| **Step 4** | 重构 `classify_intent` 为两阶段调用 | 20min |
| **Step 5** | 修复降级逻辑：默认 chat | 5min |
| **Step 6** | 实现 unknown 确认机制 | 20min |
| **Step 7** | 调整 `process_query` 适配新 VSAIntent | 20min |
| **Step 8** | 测试验证 | 30min |

### 8.2 兼容性

- 改动集中在 `voice_secretary.py`，不影响 SO、PIA、IAP 等其他模块
- `VSAIntent` 新增 `function_id` 字段有默认值，不影响已有代码
- PIA 侧不需要改动，仍通过 `forward_content` 接收任务描述

### 8.3 后续扩展

- 功能注册表可从代码常量迁移到 YAML/JSON 配置文件，支持运行时热加载
- 新增功能只需在注册表中加一条，第二阶段 prompt 自动更新
- 可以为每个功能定义更细粒度的参数 schema，实现 Function Calling 级别的精确调用

---

## 九、风险与注意事项

| 风险 | 应对 |
|------|------|
| 两阶段 LLM 调用增加延迟 | 第一阶段用小模型/快速模型，第二阶段才用大模型；或第一阶段用规则预判 |
| 第二阶段 LLM 仍可能返回非法 JSON | 降级走 unknown 确认路径，不会误转 |
| unknown 确认可能循环 | 最多确认 2 次，第 3 次直接转 PIA 通用 |
| 功能注册表 examples 覆盖不全 | 不影响，LLM 基于 description 也能匹配，examples 只是辅助 |
