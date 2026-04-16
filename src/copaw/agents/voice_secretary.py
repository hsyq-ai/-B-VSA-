# -*- coding: utf-8 -*-
"""Voice Secretary Agent (VSA) — LLM 驱动的智能语音秘书。

VSA 是用户与系统之间的第一道智能关口，具备：
- LLM 意图理解：精准分辨打招呼/闲聊/任务指令
- 角色人格：有温度的语音交互伙伴
- 记忆体系：记住用户偏好和交互历史
- 智能调度：作为 manager 调度 SO/PIA 等系统内 Agent
- 主动交互：能主动问候、轻声询问
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from agentscope.message import Msg

from ..app.routers.agent_os import IAPEnvelopeBody, send_iap_envelope
from ..agents.model_factory import create_model_and_formatter

logger = logging.getLogger(__name__)

DEFAULT_VSA_TIMEZONE = "Asia/Shanghai"


def _vsa_now() -> datetime:
    tz_name = str(os.getenv("COPAW_VSA_TIMEZONE", DEFAULT_VSA_TIMEZONE) or DEFAULT_VSA_TIMEZONE).strip()
    try:
        return datetime.now(ZoneInfo(tz_name))
    except Exception:
        logger.warning("Invalid COPAW_VSA_TIMEZONE=%s, fallback to %s", tz_name, DEFAULT_VSA_TIMEZONE)
        return datetime.now(ZoneInfo(DEFAULT_VSA_TIMEZONE))


@dataclass
class VoiceSecretaryResult:
    spoken: str
    screen: dict[str, Any] = field(default_factory=dict)
    audio: dict[str, Any] = field(default_factory=dict)
    trace_id: str = ""
    route_result: str = ""
    target_agent_id: str = ""
    duplicate: bool = False
    iap_item: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# ---------------------------------------------------------------------------
# Intent classification result
# ---------------------------------------------------------------------------

@dataclass
class VSAIntent:
    """VSA 意图分类结果。"""
    intent: str  # chat | task | task_unknown
    confidence: float
    reason: str
    vsa_reply: str  # VSA 自己的回复文本
    target_agent: str  # so | pia | null
    forward_content: str  # 需要转发时的精炼任务描述
    function_id: str = ""  # 第二阶段匹配到的功能 ID


# ---------------------------------------------------------------------------
# Function Registry (第二阶段功能注册表)
# ---------------------------------------------------------------------------

FUNCTION_REGISTRY: list[dict[str, Any]] = [
    # --- 组织级（路由到 SO）---
    {
        "id": "org_structure",
        "name": "组织架构查询",
        "description": "查询公司/部门的组织架构、人员信息",
        "target_agent": "so",
        "examples": ["公司有哪些部门", "研发部有多少人", "张总在哪个部门", "组织架构是什么样的"],
    },
    {
        "id": "org_policy",
        "name": "制度规章查询",
        "description": "查询公司规章制度、流程规范",
        "target_agent": "so",
        "examples": ["报销流程是什么", "年假有几天", "考勤制度是什么", "请假怎么走流程"],
    },
    {
        "id": "org_public",
        "name": "公开信息检索",
        "description": "查询公司公开信息、公告、党建相关",
        "target_agent": "so",
        "examples": ["最近有什么公告", "公司发展历程", "党建活动安排"],
    },
    # --- 个人级（路由到 PIA）---
    {
        "id": "task_manage",
        "name": "任务管理",
        "description": "新建任务、盘点当前工作、总结已完成事项",
        "target_agent": "pia",
        "examples": ["帮我建个任务", "我现在有什么事要做", "帮我总结下这周完成了什么", "新项目立项", "盘点下我的工作"],
    },
    {
        "id": "schedule",
        "name": "日程提醒",
        "description": "日程管理、定时提醒",
        "target_agent": "pia",
        "examples": ["提醒我下午3点开会", "每天早上9点提醒我写日报", "明天有什么安排", "帮我设个闹钟"],
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
        "description": "写文档、做表格、做PPT、写公文",
        "target_agent": "pia",
        "examples": ["帮我写个通知", "做个PPT", "写份周报", "起草一份请示", "帮我做个表格"],
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
        "examples": ["本周学习安排", "党建学习计划", "学习强国"],
    },
    {
        "id": "mental_support",
        "name": "心理关怀",
        "description": "情绪支持、心理辅导建议",
        "target_agent": "pia",
        "examples": ["我最近压力好大", "心情不太好", "有点焦虑", "工作压力太大了"],
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


def _build_function_list_prompt() -> str:
    """从功能注册表生成第二阶段 prompt 中的功能列表。"""
    lines = []
    for func in FUNCTION_REGISTRY:
        examples_str = "、".join(f"「{e}」" for e in func["examples"][:2]) if func["examples"] else "无"
        lines.append(f"- {func['id']}: {func['name']}({func['description']}) 示例:{examples_str}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# VSA prompt builder
# ---------------------------------------------------------------------------

def _build_vsa_system_prompt(user_name: str = "") -> str:
    """构建 VSA 的 System Prompt。

    加载 VSA_SOUL.md 和 VSA_PROFILE.md，并注入运行时上下文。
    """
    from ..constant import WORKING_DIR

    parts = []

    # 加载 VSA_SOUL.md
    soul_path = WORKING_DIR / "VSA_SOUL.md"
    if not soul_path.exists():
        # 回退到内置模板
        soul_path = Path(__file__).parent / "md_files" / "zh" / "VSA_SOUL.md"
    if soul_path.exists():
        content = soul_path.read_text(encoding="utf-8").strip()
        if content.startswith("---"):
            sections = content.split("---", 2)
            if len(sections) >= 3:
                content = sections[2].strip()
        if content:
            parts.append(content)

    # 加载 VSA_PROFILE.md
    profile_path = WORKING_DIR / "VSA_PROFILE.md"
    if not profile_path.exists():
        profile_path = Path(__file__).parent / "md_files" / "zh" / "VSA_PROFILE.md"
    if profile_path.exists():
        content = profile_path.read_text(encoding="utf-8").strip()
        if content.startswith("---"):
            sections = content.split("---", 2)
            if len(sections) >= 3:
                content = sections[2].strip()
        if content:
            parts.append(content)

    # 注入运行时上下文
    now = _vsa_now()
    time_context = (
        f"\n\n## 运行时上下文\n\n"
        f"- 当前时间: {now.strftime('%Y年%m月%d日 %H:%M')}\n"
        f"- 星期: {_weekday_cn(now.weekday())}\n"
        f"- 时段: {_time_period(now.hour)}\n"
        f"- 用户称呼: {user_name or '用户'}\n"
    )
    parts.append(time_context)

    return "\n\n".join(parts) if parts else "你是用户的语音秘书小智，友好、简洁地回应。"


def _weekday_cn(day: int) -> str:
    return ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"][day]


def _time_period(hour: int) -> str:
    if 5 <= hour < 9:
        return "早上"
    if 9 <= hour < 12:
        return "上午"
    if 12 <= hour < 14:
        return "中午"
    if 14 <= hour < 18:
        return "下午"
    if 18 <= hour < 22:
        return "晚上"
    return "深夜"


def _compute_address_name(raw_name: str, department: str) -> str:
    """根据部门和名字长度计算礼貌称呼。

    规则：
      - 总裁办 → 姓+总（如 张三丰 → 张总）
      - 其他部门，2字 → 直呼全名（如 王明 → 王明）
      - 其他部门，3字及以上 → 称名不称姓（如 张三丰 → 三丰）
    """
    name = raw_name.strip()
    if not name or len(name) == 1:
        return name or "用户"

    # 总裁办：姓+总
    dept = department.strip()
    if dept and ("总裁" in dept or "CEO" in dept.upper() or "总经理" in dept):
        return f"{name[0]}总"

    # 其他部门：2字全名，3字以上取名（去掉姓）
    if len(name) == 2:
        return name
    # 3字或更多：去掉第一个字（姓），保留名
    return name[1:]


# ---------------------------------------------------------------------------
# 快速规则分类器（跳过 LLM，毫秒级响应）
# ---------------------------------------------------------------------------

# 打招呼关键词 → chat（包含匹配，"你好，听得见吗" 包含 "你好" 即命中）
_GREETING_KEYWORDS: list[tuple[str, str]] = [
    ("你好", "你好！有什么可以帮你的吗？"),
    ("您好", "您好！有什么可以帮您的吗？"),
    ("早上好", "早上好！有什么需要帮忙的吗？"),
    ("上午好", "上午好！有什么需要帮忙的吗？"),
    ("下午好", "下午好！有什么需要帮忙的吗？"),
    ("晚上好", "晚上好！有什么需要帮忙的吗？"),
    ("早啊", "早啊！有什么需要帮忙的吗？"),
    ("嗨", "嗨！有什么需要帮忙的吗？"),
    ("哈喽", "你好！有什么可以帮你的吗？"),
    ("hello", "你好！有什么可以帮你的吗？"),
    ("hi", "你好！有什么可以帮你的吗？"),
]

# 简短闲聊问答 → chat + 固定回复（包含匹配 + 长度限制防误触）
_QUICK_CHAT_PATTERNS: list[tuple[str, str, int]] = [
    # (关键词, 回复, 最大文本长度——超过则不匹配，防止长句误触)
    ("你是谁", "我是小智，你的语音助理。", 10),
    ("你叫什么", "我叫小智，是你的语音助理。", 10),
    ("你叫什么名字", "我叫小智，是你的语音助理。", 10),
    ("你能做什么", "我可以帮你管任务、设提醒、查邮件、写文档。", 10),
    ("你会做什么", "我可以帮你管任务、设提醒、查邮件、写文档。", 10),
    ("你会什么", "我可以帮你管任务、设提醒、查邮件、写文档。", 10),
    ("在吗", "在的，有什么需要帮忙的吗？", 8),
    ("在不在", "在的，有什么需要帮忙的吗？", 8),
    ("听得见吗", "听得见，请说。", 10),
    ("听得到吗", "听得到，请说。", 10),
    ("听见了吗", "听见了，请说。", 10),
    ("听到了吗", "听到了，请说。", 10),
    ("你是什么", "我是小智，你的语音助理。", 10),
    ("谢谢你", "不客气，有需要随时说。", 8),
    ("谢谢", "不客气，有需要随时说。", 6),
    ("好的", "好的，有需要随时说。", 6),
    ("好", "好的。", 4),
    ("对", "好的，还有其他需要吗？", 4),
    ("对对", "好的，还有其他需要吗？", 6),
    ("对对对", "好的。", 6),
    ("嗯", "嗯，我在听。", 4),
    ("嗯嗯", "嗯，我在听。", 6),
    ("没有了", "好的，那我先待命，有需要随时吩咐。", 8),
    ("没事了", "好的，那我先待命。", 8),
    ("不用了", "好的，有需要再叫我。", 8),
    ("说什么", "没说什么，你有什么需要帮忙的吗？", 8),
    ("说什么呢", "没说什么，你有事吗？", 8),
    ("对不对", "你是在确认什么吗？可以说具体点。", 8),
    ("是不是", "你是在确认什么吗？可以说具体点。", 8),
    ("行不行", "你是在问我能不能做某事吗？说具体点。", 8),
    ("可以吗", "可以的，你说。", 8),
    ("怎么了", "没什么，有什么需要帮忙的吗？", 8),
    ("然后呢", "你想继续聊什么？", 8),
    ("什么意思", "你可以具体说说，我来帮你。", 8),
    ("真的吗", "嗯，你是在确认什么吗？", 8),
    ("好的呀", "好的！有什么需要随时说。", 8),
    ("知道了", "好的，有需要再叫我。", 8),
    ("明白了", "好的，有需要随时说。", 8),
    ("打扰了", "没事，有需要随时说。", 8),
    ("不好意思", "没事，你说。", 8),
    ("辛苦了", "不辛苦，为你服务！有需要随时说。", 8),
]

# 任务触发关键词 → task + 直接映射功能
_TASK_KEYWORD_MAP: list[tuple[str, str, str, str]] = [
    # (关键词, function_id, 确认播报, forward_content模板)
    ("提醒", "schedule", "好的，我帮你设个提醒。", "设置提醒：{text}"),
    ("闹钟", "schedule", "好的，我帮你设个闹钟。", "设置闹钟：{text}"),
    ("日程", "schedule", "好的，我帮你看看日程。", "查看日程：{text}"),
    ("安排", "schedule", "好的，我帮你安排。", "安排：{text}"),
    ("任务", "task_manage", "好的，我帮你处理任务。", "任务管理：{text}"),
    ("待办", "task_manage", "好的，我帮你看看待办。", "查看待办：{text}"),
    ("工作", "task_manage", "好的，我帮你看看工作。", "工作概览：{text}"),
    ("邮件", "email", "好的，我帮你处理邮件。", "邮件：{text}"),
    ("通知", "doc_write", "好的，我帮你写通知。", "写通知：{text}"),
    ("写", "doc_write", "好的，我帮你写。", "写文档：{text}"),
    ("文档", "doc_write", "好的，我帮你处理文档。", "文档处理：{text}"),
    ("PPT", "doc_write", "好的，我帮你做PPT。", "做PPT：{text}"),
    ("ppt", "doc_write", "好的，我帮你做PPT。", "做PPT：{text}"),
    ("周报", "doc_write", "好的，我帮你写周报。", "写周报：{text}"),
    ("报告", "doc_write", "好的，我帮你写报告。", "写报告：{text}"),
    ("表格", "doc_write", "好的，我帮你做表格。", "做表格：{text}"),
    ("文件", "file_process", "好的，我帮你处理文件。", "文件处理：{text}"),
    ("新闻", "news_query", "好的，我帮你查新闻。", "查新闻：{text}"),
    ("部门", "org_structure", "好的，我帮你查部门信息。", "查部门：{text}"),
    ("组织", "org_structure", "好的，我帮你查组织架构。", "查组织架构：{text}"),
    ("制度", "org_policy", "好的，我帮你查制度。", "查制度：{text}"),
    ("流程", "org_policy", "好的，我帮你查流程。", "查流程：{text}"),
    ("报销", "org_policy", "好的，我帮你查报销流程。", "查报销：{text}"),
    ("公告", "org_public", "好的，我帮你查公告。", "查公告：{text}"),
    ("党建", "party_study", "好的，我帮你查党建信息。", "党建：{text}"),
    ("学习", "party_study", "好的，我帮你安排学习。", "学习安排：{text}"),
    ("压力", "mental_support", "辛苦了，需要聊聊吗？", "心理关怀：{text}"),
    ("焦虑", "mental_support", "我理解你的感受，需要聊聊吗？", "心理关怀：{text}"),
    ("心情", "mental_support", "需要聊聊吗？我在。", "心理关怀：{text}"),
]

_WEAK_TASK_KEYWORDS: set[str] = {"写", "通知", "任务", "工作", "文件"}
_TASK_INTENT_HINTS: tuple[str, ...] = (
    "帮我",
    "帮",
    "请",
    "麻烦",
    "给我",
    "需要",
    "安排",
    "设置",
    "提醒",
    "查",
    "查询",
    "处理",
    "生成",
    "写个",
    "写一",
    "做个",
    "做一",
)


_TASK_CONFIRM_HINTS: tuple[str, ...] = (
    "帮我",
    "请",
    "麻烦",
    "给我",
    "需要",
    "想要",
    "处理",
    "安排",
    "设置",
    "生成",
    "写",
    "做",
    "整理",
    "起草",
    "发",
    "发送",
)


_TASK_QUESTION_PATTERNS: tuple[str, ...] = (
    "是什么",
    "什么意思",
    "是什么时候",
    "怎么",
    "吗",
    "么",
    "呢",
    "?",
    "？",
)


def _looks_like_explicit_task(text: str) -> bool:
    normalized = str(text or "").strip()
    if not normalized:
        return False
    if any(hint in normalized for hint in _TASK_INTENT_HINTS):
        return True
    if normalized.endswith(("吧", "一下", "一下子")):
        return True
    return False


def _passes_task_second_gate(text: str) -> bool:
    """弱任务关键词命中后再做一次轻量确认，降低误判为 task 的概率。"""
    normalized = str(text or "").strip()
    if not normalized:
        return False
    if any(hint in normalized for hint in _TASK_CONFIRM_HINTS):
        return True
    if normalized.endswith(("一下", "吧", "给我", "帮我")):
        return True
    # 纯问句倾向 chat，避免“任务是什么”“通知是什么意思”被误判成执行指令
    if any(pattern in normalized for pattern in _TASK_QUESTION_PATTERNS):
        return False
    return False


def _quick_classify(text: str) -> VSAIntent | None:
    """快速规则分类器。对常见简单输入毫秒级返回，跳过 LLM。

    匹配策略：
    - 打招呼：包含匹配（"你好，听得见吗" 包含 "你好" 即命中）
    - 闲聊：包含匹配 + 长度限制（防长句误触）
    - 任务：关键词包含匹配（支持前缀剥离）

    Returns:
        VSAIntent 如果命中规则，否则 None（需要 LLM）
    """
    normalized = str(text or "").strip()
    if not normalized:
        return None

    # 1. 打招呼检测（包含匹配）
    #    "你好，听得见吗" 包含 "你好" → 命中
    #    但要避免长句误触：只在文本≤15字时才做包含匹配
    if len(normalized) <= 15:
        for keyword, reply in _GREETING_KEYWORDS:
            if keyword in normalized:
                return VSAIntent(
                    intent="chat",
                    confidence=1.0,
                    reason="规则：打招呼",
                    vsa_reply=reply,
                    target_agent="null",
                    forward_content="",
                    function_id="",
                )

    # 2. 简短闲聊检测（包含匹配 + 长度限制）
    for keyword, reply, max_len in _QUICK_CHAT_PATTERNS:
        if len(normalized) <= max_len and keyword in normalized:
            return VSAIntent(
                intent="chat",
                confidence=1.0,
                reason="规则：简短闲聊",
                vsa_reply=reply,
                target_agent="null",
                forward_content="",
                function_id="",
            )

    # 3. 任务关键词检测
    # 检查是否以"帮我/帮/请/给"等开头 + 任务关键词
    task_prefixes = ("帮我", "帮", "请", "给", "要", "能不能", "可以")
    task_text = normalized
    has_prefix = False
    for prefix in task_prefixes:
        if normalized.startswith(prefix):
            task_text = normalized[len(prefix):]
            has_prefix = True
            break

    # 也检查"动词+关键词"模式
    for keyword, func_id, confirm, forward_tmpl in _TASK_KEYWORD_MAP:
        # 关键词包含在文本中
        if keyword in task_text or (has_prefix and keyword in task_text):
            if keyword in _WEAK_TASK_KEYWORDS:
                explicit_task = has_prefix or _looks_like_explicit_task(normalized)
                if not explicit_task:
                    continue
                if not _passes_task_second_gate(normalized):
                    continue
            func = VoiceSecretaryAgent._get_function_by_id(func_id)
            if func:
                return VSAIntent(
                    intent="task",
                    confidence=0.95,
                    reason=f"规则：关键词匹配({keyword})",
                    vsa_reply=confirm,
                    target_agent=func.get("target_agent", "pia"),
                    forward_content=forward_tmpl.format(text=normalized),
                    function_id=func_id,
                )

    # 4. 超短文本兜底（≤3字且没命中上面的，大概率是噪声/确认词）
    if len(normalized) <= 3:
        return VSAIntent(
            intent="chat",
            confidence=0.8,
            reason="规则：超短文本兜底",
            vsa_reply="嗯，我在听。",
            target_agent="null",
            forward_content="",
            function_id="",
        )

    # 5. 未命中规则，需要 LLM
    return None


# ---------------------------------------------------------------------------
# Stage 1: chat vs task prompt (第一阶段二分类，LLM fallback)
# ---------------------------------------------------------------------------

STAGE1_CLASSIFICATION_PROMPT = """判断闲聊还是任务。如果是闲聊直接回复。

输入: {text}

定义: chat=打招呼/闲聊/问身份能力; task=要求执行操作
原则: 不确定选chat; 纯提问→chat; 要求操作→task
回复: chat时口语化20字内，不要称呼用户名; task时reply留空

只返回JSON:
{{"classification": "chat|task", "reply": "chat回复或空字符串"}}"""

STAGE1_TIMEOUT_SECONDS = max(
    float(os.getenv("COPAW_VSA_STAGE1_TIMEOUT_SECONDS", "5.0") or 5.0),
    1.0,
)
CHAT_REPLY_TIMEOUT_SECONDS = max(
    float(os.getenv("COPAW_VSA_CHAT_REPLY_TIMEOUT_SECONDS", "3.0") or 3.0),
    1.0,
)


# ---------------------------------------------------------------------------
# Stage 2: function matching prompt (第二阶段功能匹配)
# ---------------------------------------------------------------------------

STAGE2_FUNCTION_MATCHING_PROMPT = """任务路由：从功能列表中选最匹配的功能。

{function_list}

用户: {user_name} | 时间: {current_time}
输入: {text}

原则: 1.只从列表选id 2.模糊时选unknown 3.优先具体功能

只返回JSON:
{{"function_id": "id", "confidence": 0.0-1.0, "reason": "简短理由", "forward_content": "精炼任务描述"}}"""


# ---------------------------------------------------------------------------
# VSA Memory (lightweight session-level memory)
# ---------------------------------------------------------------------------

class VSAMemory:
    """VSA 的轻量会话记忆。

    存储在 WORKING_DIR/memory/vsa/{user_id}/ 下，包含：
    - interaction_log.json: 近期交互摘要
    - preferences.json: 用户偏好
    """

    def __init__(self, user_id: str):
        from ..constant import WORKING_DIR
        self.user_id = user_id
        self.memory_dir = WORKING_DIR / "memory" / "vsa" / user_id
        self.memory_dir.mkdir(parents=True, exist_ok=True)
        self._log_file = self.memory_dir / "interaction_log.json"
        self._pref_file = self.memory_dir / "preferences.json"
        self._interactions: list[dict] = self._load_json(self._log_file, [])
        self._preferences: dict = self._load_json(self._pref_file, {})

    @staticmethod
    def _load_json(path: Path, default: Any) -> Any:
        if path.exists():
            try:
                return json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                return default
        return default

    def _save_json(self, path: Path, data: Any) -> None:
        try:
            path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception as e:
            logger.warning("VSA memory save failed: %s", e)

    def get_recent_context(self, limit: int = 5) -> str:
        """获取近期交互摘要，用于 LLM 上下文注入。"""
        if not self._interactions:
            return "（首次交互）"
        recent = self._interactions[-limit:]
        lines = []
        for item in recent:
            role = item.get("role", "?")
            text = item.get("text", "")[:60]
            lines.append(f"{role}: {text}")
        return "\n".join(lines)

    def add_interaction(self, role: str, text: str) -> None:
        """记录一条交互。"""
        self._interactions.append({
            "role": role,
            "text": text[:200],
            "time": _vsa_now().isoformat(),
        })
        # 只保留最近 50 条
        if len(self._interactions) > 50:
            self._interactions = self._interactions[-50:]
        self._save_json(self._log_file, self._interactions)

    def get_preference(self, key: str, default: str = "") -> str:
        return self._preferences.get(key, default)

    def set_preference(self, key: str, value: str) -> None:
        self._preferences[key] = value
        self._save_json(self._pref_file, self._preferences)


# ---------------------------------------------------------------------------
# Main VSA Agent
# ---------------------------------------------------------------------------

class VoiceSecretaryAgent:
    """LLM 驱动的语音秘书 Agent（VSA）。

    核心改造：
    - 用 LLM 做意图分类（替代硬编码关键词）
    - 有角色人格（VSA_SOUL.md + VSA_PROFILE.md）
    - 有记忆体系（VSAMemory）
    - 作为 manager 调度系统内 Agent（SO / PIA）
    - 主动交互能力
    """

    def __init__(
        self,
        *,
        request_context: Any,
        current_user: dict[str, Any],
        session_id: str,
    ) -> None:
        self._request_context = request_context
        self._current_user = dict(current_user or {})
        self._session_id = str(session_id or "")
        self.user_id = str(self._current_user.get("user_id") or "").strip()
        self._raw_name = str(self._current_user.get("name") or self.user_id or "用户")
        self.department = str(self._current_user.get("department") or "").strip()
        # 根据部门和名字计算礼貌称呼
        self.user_name = _compute_address_name(self._raw_name, self.department)
        self.agent_id = f"vsa:{self.user_id}"

        # 初始化 LLM
        self._model = None
        self._formatter = None

        # 初始化 VSA 记忆
        self._memory = VSAMemory(self.user_id)

        # 缓存 system prompt
        self._sys_prompt = _build_vsa_system_prompt(self.user_name)

    async def _ensure_model(self):
        """懒加载 LLM model 和 formatter。"""
        if self._model is None:
            self._model, self._formatter = create_model_and_formatter()
        return self._model, self._formatter

    # -------------------------------------------------------------------
    # LLM 两阶段意图分类
    # -------------------------------------------------------------------

    @staticmethod
    def _extract_text_from_response(response: Any) -> str:
        """从 LLM ChatResponse 中提取纯文本（非 stream 模式）。"""
        # AgentScope ChatResponse: content 是 Sequence[TextBlock | ...]
        if hasattr(response, "content"):
            content = response.content
            if isinstance(content, (list, tuple)):
                texts = []
                for block in content:
                    if hasattr(block, "text"):
                        texts.append(str(block.text or ""))
                    elif isinstance(block, dict) and block.get("type") == "text":
                        texts.append(str(block.get("text", "")))
                return "".join(texts).strip()
            if isinstance(content, str):
                return content.strip()
        # Fallback: dict-style response
        if isinstance(response, dict):
            choices = response.get("choices", [])
            if choices:
                return str(choices[0].get("message", {}).get("content", "")).strip()
        return ""

    @staticmethod
    async def _call_llm_and_extract(
        model: Any,
        formatted: list[dict],
        *,
        early_stop_on_json: bool = False,
    ) -> str:
        """调用 LLM 并提取完整文本回复（兼容 stream/非 stream 模式）。

        AgentScope 的 ChatModel 默认是 stream=True，__call__ 返回
        AsyncGenerator[ChatResponse, None]。需要迭代 chunks 拼接文本。
        如果是非 stream 模式，直接提取 ChatResponse.content。

        Args:
            early_stop_on_json: 如果 True，在 stream 模式下检测到完整 JSON
                即提前返回（适用于意图分类等短JSON输出场景）。
        """
        t0 = time.monotonic()
        response = await model(formatted)
        t_first = time.monotonic()

        # Stream 模式：返回 AsyncGenerator
        if hasattr(response, "__aiter__"):
            text = ""
            chunk_count = 0
            async for chunk in response:
                chunk_count += 1
                chunk_text = VoiceSecretaryAgent._extract_text_from_chunk(chunk)
                if chunk_text:
                    text = chunk_text  # 每个 chunk 已是累计全文
                    # 早停：检测到完整 JSON 就不需要继续等了
                    if early_stop_on_json and text.strip().endswith("}"):
                        # 尝试解析，如果成功就是完整 JSON
                        try:
                            json.loads(text.strip())
                            t_done = time.monotonic()
                            logger.info(
                                "VSA LLM early-stop: chunks=%d latency=%.2fs (first=%.2fs, stream=%.2fs) text_len=%d",
                                chunk_count,
                                t_done - t0,
                                t_first - t0,
                                t_done - t_first,
                                len(text),
                            )
                            return text.strip()
                        except (json.JSONDecodeError, ValueError):
                            pass  # 不完整 JSON，继续
            t_done = time.monotonic()
            logger.info(
                "VSA LLM stream done: chunks=%d latency=%.2fs (first=%.2fs, stream=%.2fs) text_len=%d",
                chunk_count,
                t_done - t0,
                t_first - t0,
                t_done - t_first,
                len(text),
            )
            return text.strip()

        # 非 stream 模式：返回 ChatResponse
        text = VoiceSecretaryAgent._extract_text_from_response(response)
        t_done = time.monotonic()
        logger.info(
            "VSA LLM non-stream: latency=%.2fs text_len=%d",
            t_done - t0,
            len(text),
        )
        return text

    @staticmethod
    def _extract_text_from_chunk(chunk: Any) -> str:
        """从 stream chunk 中提取文本。"""
        c = getattr(chunk, "content", None)
        if isinstance(c, str):
            return c
        if isinstance(c, (list, tuple)):
            return "".join(
                b.get("text", "") for b in c
                if isinstance(b, dict) and b.get("type") == "text"
            )
        return ""

    async def classify_intent(self, text: str) -> VSAIntent:
        """两阶段意图分类。

        快速规则分类器优先，命中则毫秒级返回；
        未命中则走 LLM 两阶段分类。
        """
        t0 = time.monotonic()

        # ===== 快速规则分类（毫秒级）=====
        quick_result = _quick_classify(text)
        if quick_result is not None:
            t1 = time.monotonic()
            logger.info(
                "VSA quick-classify hit: latency=%.3fs intent=%s function=%s text=%s",
                t1 - t0,
                quick_result.intent,
                quick_result.function_id,
                text[:40],
            )
            return quick_result

        # ===== 第一阶段：chat vs task =====
        try:
            stage1_result = await asyncio.wait_for(
                self._classify_chat_vs_task(text),
                timeout=STAGE1_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError:
            logger.warning(
                "VSA stage1 timeout: timeout=%.2fs text=%s, fallback to chat",
                STAGE1_TIMEOUT_SECONDS,
                text[:120],
            )
            stage1_result = {
                "classification": self._fallback_stage1(text),
                "reply": self._fast_chat_fallback_reply(text, reason="stage1_timeout"),
            }
        classification = stage1_result.get("classification", "chat")
        chat_reply = str(stage1_result.get("reply", "") or "").strip()

        if classification == "chat":
            if chat_reply:
                reply = chat_reply
            else:
                try:
                    reply = await asyncio.wait_for(
                        self.generate_vsa_reply(text, None),
                        timeout=CHAT_REPLY_TIMEOUT_SECONDS,
                    )
                except asyncio.TimeoutError:
                    logger.warning(
                        "VSA chat reply timeout: timeout=%.2fs text=%s",
                        CHAT_REPLY_TIMEOUT_SECONDS,
                        text[:120],
                    )
                    reply = self._fast_chat_fallback_reply(text, reason="chat_reply_timeout")
            t1 = time.monotonic()
            logger.info("VSA classify_intent(chat): total=%.2fs", t1 - t0)
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
        result = await self._match_function(text)
        t1 = time.monotonic()
        logger.info("VSA classify_intent(task): total=%.2fs function=%s", t1 - t0, result.function_id)
        return result

    async def _classify_chat_vs_task(self, text: str) -> dict[str, Any]:
        """第一阶段：判断用户是在闲聊还是在要求执行任务。

        返回解析后的 dict，包含 classification 和 reply 字段。
        """
        t0 = time.monotonic()
        model, formatter = await self._ensure_model()

        prompt = STAGE1_CLASSIFICATION_PROMPT.format(text=text)

        msg = Msg(name="user", role="user", content=prompt)
        formatted = await formatter.format([msg])
        response_text = await self._call_llm_and_extract(model, formatted, early_stop_on_json=True)

        # 解析 JSON
        parsed = self._parse_json_response(response_text)
        t1 = time.monotonic()
        if parsed and parsed.get("classification") in ("chat", "task"):
            logger.info("VSA stage1 ok: latency=%.2fs classification=%s", t1 - t0, parsed.get("classification"))
            return parsed

        # 降级：默认 chat（安全）
        logger.warning("VSA stage1 parse failed, fallback to chat. latency=%.2fs raw: %s", t1 - t0, response_text[:200])
        return {"classification": self._fallback_stage1(text), "reply": ""}

    def _fallback_stage1(self, text: str) -> str:
        """第一阶段降级：默认 chat（安全）。"""
        normalized = str(text or "").strip()
        # 打招呼一定走 chat
        greetings = ("你好", "您好", "嗨", "哈喽", "hello", "早上好", "上午好", "下午好", "晚上好")
        if any(g in normalized for g in greetings) and len(normalized) <= 10:
            return "chat"
        # 默认 chat（不再默认 task）
        return "chat"

    def _fast_chat_fallback_reply(self, text: str, *, reason: str) -> str:
        """慢链路兜底：在超时或误识别时，优先快速给出可理解答复。"""
        normalized = str(text or "").strip()
        compact = "".join(ch for ch in normalized.lower() if ch.isalnum() or ("\u4e00" <= ch <= "\u9fff"))
        now = _vsa_now()
        weekday = _weekday_cn(now.weekday())

        # 常见时间问句（或无标点变体）直接给出明确答案。
        if any(
            token in compact
            for token in ("今天星期几", "今天周几", "今天礼拜几", "今天几号", "今天多少号")
        ):
            date_text = now.strftime("%Y年%m月%d日")
            return f"今天是{date_text}，{weekday}。"

        # 常见 ASR 误识别“今天星期几” -> “第七集/第几集/第七级”
        if any(token in compact for token in ("第七集", "第几集", "第七级", "第几级")):
            return f"我可能听成了“{normalized}”。如果你想问今天星期几：今天是{weekday}。"

        if reason == "stage1_timeout":
            return "我先按闲聊理解了这句。你可以再说一次，我会更快处理。"
        return "我这次可能没听清，你可以再说一遍，比如：今天星期几。"

    async def _match_function(self, text: str) -> VSAIntent:
        """第二阶段：从功能注册表匹配具体功能。"""
        t0 = time.monotonic()
        model, formatter = await self._ensure_model()
        now = _vsa_now()
        function_list = _build_function_list_prompt()

        prompt = STAGE2_FUNCTION_MATCHING_PROMPT.format(
            function_list=function_list,
            user_name=self.user_name,
            current_time=now.strftime("%Y年%m月%d日 %H:%M"),
            text=text,
        )

        msg = Msg(name="user", role="user", content=prompt)
        formatted = await formatter.format([msg])
        response_text = await self._call_llm_and_extract(model, formatted, early_stop_on_json=True)

        # 解析 JSON
        parsed = self._parse_json_response(response_text)
        t1 = time.monotonic()
        if parsed and parsed.get("function_id"):
            logger.info("VSA stage2 ok: latency=%.2fs function=%s", t1 - t0, parsed.get("function_id"))
            return self._build_intent_from_function_match(parsed, text)

        # 降级：走 unknown 确认
        logger.warning("VSA stage2 parse failed, fallback to unknown. latency=%.2fs raw: %s", t1 - t0, response_text[:200])
        return self._build_unknown_intent(text, "LLM 解析失败")

    def _parse_json_response(self, response_text: str) -> dict[str, Any] | None:
        """从 LLM 响应中提取 JSON dict。"""
        text = str(response_text or "").strip()
        # 尝试从 markdown code block 中提取
        if "```json" in text:
            text = text.split("```json", 1)[-1].split("```", 1)[0].strip()
        elif "```" in text:
            text = text.split("```", 1)[-1].split("```", 1)[0].strip()
        try:
            return json.loads(text)
        except (json.JSONDecodeError, ValueError, TypeError) as e:
            logger.warning("VSA JSON parse failed: %s, raw: %s", e, text[:200])
            return None

    def _build_intent_from_function_match(self, parsed: dict[str, Any], original_text: str) -> VSAIntent:
        """从第二阶段解析结果构建 VSAIntent。"""
        function_id = str(parsed.get("function_id", "unknown"))
        confidence = float(parsed.get("confidence", 0.5))
        reason = str(parsed.get("reason", ""))
        forward_content = str(parsed.get("forward_content", "") or original_text)

        # 查找功能注册表
        func = self._get_function_by_id(function_id)

        if func is None or function_id == "unknown" or confidence < 0.6:
            # 功能模糊 → 确认后转发
            return self._build_unknown_intent(original_text, reason or "功能匹配模糊")

        target_agent = func.get("target_agent", "pia")
        func_name = func.get("name", "")

        return VSAIntent(
            intent="task",
            confidence=confidence,
            reason=reason,
            vsa_reply=f"好的，我帮你{func_name}。",
            target_agent=target_agent,
            forward_content=forward_content,
            function_id=function_id,
        )

    def _build_unknown_intent(self, original_text: str, reason: str) -> VSAIntent:
        """构建 unknown 意图：VSA 先确认，不直接转发。"""
        return VSAIntent(
            intent="task_unknown",
            confidence=0.4,
            reason=f"功能模糊: {reason}",
            vsa_reply="你是想让我帮你做什么？能再说具体一点吗？",
            target_agent="null",
            forward_content="",
            function_id="unknown",
        )

    @staticmethod
    def _get_function_by_id(function_id: str) -> dict[str, Any] | None:
        """从功能注册表查找功能。"""
        for func in FUNCTION_REGISTRY:
            if func["id"] == function_id:
                return func
        return None

    # -------------------------------------------------------------------
    # LLM 自由对话（chat 分支）
    # -------------------------------------------------------------------

    async def generate_vsa_reply(self, text: str, intent: VSAIntent | None) -> str:
        """使用 LLM 生成 VSA 自己的回复（用于 chat 分支）。

        两阶段架构下，chat 分支统一由 LLM 自由生成回复。
        """
        # 如果 intent 有预置回复且置信度够高，直接用（兼容旧逻辑）
        if intent and intent.vsa_reply and intent.confidence >= 0.7:
            return intent.vsa_reply

        t0 = time.monotonic()
        # LLM 自由对话
        model, formatter = await self._ensure_model()

        memory_context = self._memory.get_recent_context()
        now = _vsa_now()

        user_msg_content = (
            f"当前时间: {now.strftime('%Y年%m月%d日 %H:%M')} ({_weekday_cn(now.weekday())} {_time_period(now.hour)})\n"
            f"用户称呼: {self.user_name}\n"
            f"近期交互:\n{memory_context}\n\n"
            f"用户说: {text}\n\n"
            f"请以小智的身份，用口语化的方式回复（50字以内，适合语音播报）："
        )

        messages = [
            Msg(name="system", role="system", content=self._sys_prompt),
            Msg(name="user", role="user", content=user_msg_content),
        ]
        formatted = await formatter.format(messages)
        reply = await self._call_llm_and_extract(model, formatted)

        fallback_reply = "嗯，我在。"
        if intent and intent.vsa_reply:
            fallback_reply = intent.vsa_reply

        t1 = time.monotonic()
        logger.info("VSA generate_vsa_reply: latency=%.2fs", t1 - t0)
        return str(reply or fallback_reply).strip()

    # -------------------------------------------------------------------
    # 主动问候
    # -------------------------------------------------------------------

    async def generate_greeting(self) -> str:
        """生成首次连接时的主动问候语。"""
        now = _vsa_now()
        period = _time_period(now.hour)

        # 根据时段选不同的问候
        greetings = {
            "早上": "早上好！我是小智，你的语音助理。有什么需要帮忙的吗？",
            "上午": "你好！有什么可以帮你的吗？",
            "中午": "中午好！休息一下？还是有什么要处理的？",
            "下午": "下午好！有什么需要我帮忙的吗？",
            "晚上": "晚上好！还在忙吗？有什么我能帮忙的？",
            "深夜": "这么晚还在工作？有什么我能帮忙的吗？",
        }
        return greetings.get(period, "你好！我是小智，有什么可以帮你的吗？")

    # -------------------------------------------------------------------
    # IAP 路由（调度 SO / PIA）
    # -------------------------------------------------------------------

    def _build_iap_payload(self, *, text: str, to_agent_id: str, turn_context: dict[str, Any]) -> tuple[str, dict[str, Any]]:
        normalized = str(text or "").strip()
        if to_agent_id == "so:enterprise":
            return (
                "vsa.query_status",
                {
                    "title": "语音秘书查询",
                    "topic": "语音秘书查询",
                    "question": normalized,
                    "content": normalized,
                    "original_text": normalized,
                    "source": "voice_secretary",
                    "source_mode": "speech",
                    "vsa_session_id": self._session_id,
                    "vsa_agent_id": self.agent_id,
                    "turn_context": turn_context,
                },
            )
        return (
            "vsa.voice_command",
            {
                "title": "语音秘书转办",
                "topic": "语音指令",
                "content": normalized,
                "message": normalized,
                "original_text": normalized,
                "source": "voice_secretary",
                "source_mode": "speech",
                "vsa_session_id": self._session_id,
                "vsa_agent_id": self.agent_id,
                "turn_context": turn_context,
            },
        )

    def _build_spoken_text(
        self,
        *,
        text: str,
        to_agent_id: str,
        route_result: str,
        duplicate: bool,
        response_payload: dict[str, Any],
    ) -> str:
        if duplicate:
            return "这个请求我刚刚已经转出去了，屏幕侧会继续更新。"
        if route_result == "so_replied":
            reply = str(response_payload.get("reply") or "").strip()
            if reply:
                return reply[:120]
            return "我已经帮你查到了，详细内容在屏幕侧。"
        if route_result == "target_offline":
            return "我先记下了，但当前目标代理还没准备好，建议你稍后再试。"
        if to_agent_id == "so:enterprise":
            return "我正在帮你查询组织侧信息，结果已经同步到屏幕侧。"
        return "好的，我已经转给红智秘书继续处理，详细结果会同步到屏幕侧。"

    def _build_screen_card(
        self,
        *,
        text: str,
        to_agent_id: str,
        iap_result: dict[str, Any],
        spoken: str,
    ) -> dict[str, Any]:
        item = dict(iap_result.get("item") or {})
        response_payload = item.get("response_payload") if isinstance(item.get("response_payload"), dict) else {}
        route_result = str(item.get("route_result") or "")
        return {
            "kind": "voice_secretary_result",
            "title": "语音秘书已接手",
            "summary": spoken,
            "originalText": str(text or ""),
            "targetAgentId": to_agent_id,
            "routeResult": route_result,
            "traceId": str(item.get("trace_id") or ""),
            "reply": str(response_payload.get("reply") or ""),
            "iap": item,
        }

    # -------------------------------------------------------------------
    # 核心：处理语音指令
    # -------------------------------------------------------------------

    async def process_voice_command(
        self,
        text: str,
        turn_context: dict[str, Any] | None = None,
    ) -> VoiceSecretaryResult:
        """处理一条语音指令（核心入口）。

        两阶段分类流程：
        1. 空文本 → 静默
        2. 第一阶段：chat vs task
           - chat → VSA 直接 LLM 回复
           - task → 第二阶段
        3. 第二阶段：功能匹配
           - 精确匹配 → IAP 路由到 SO/PIA
           - unknown → VSA 确认后重新分类
        4. 记录交互到记忆
        """
        normalized = str(text or "").strip()
        if not normalized:
            return VoiceSecretaryResult(
                spoken="",
                screen={
                    "kind": "voice_secretary_result",
                    "title": "未识别到有效语音",
                    "summary": "当前没有返回可执行的完整语音文本。",
                    "originalText": "",
                },
            )

        # Step 1: 两阶段意图分类
        t_process_start = time.monotonic()
        try:
            intent = await self.classify_intent(normalized)
        except Exception as e:
            logger.warning("VSA intent classification failed: %s, fallback to chat", e)
            # 整体异常降级：走 chat
            reply = "嗯，我在。"
            return VoiceSecretaryResult(
                spoken=reply,
                screen={
                    "kind": "voice_secretary_result",
                    "title": "语音秘书回复",
                    "summary": reply,
                    "originalText": normalized,
                    "intent": "chat",
                },
                route_result="vsa_handled",
                target_agent_id=self.agent_id,
            )

        logger.info(
            "VSA intent: user=%s text=%s intent=%s confidence=%.2f target=%s function=%s",
            self.user_id,
            normalized[:80],
            intent.intent,
            intent.confidence,
            intent.target_agent,
            intent.function_id,
        )

        # 记录用户输入到记忆
        self._memory.add_interaction("user", normalized)

        # Step 2: 根据意图路由
        if intent.intent == "chat":
            # VSA 自己处理 — 已经在 classify_intent 中生成了回复
            vsa_reply = intent.vsa_reply
            self._memory.add_interaction("vsa", vsa_reply)
            t_process = time.monotonic() - t_process_start
            logger.info("VSA process_voice_command(chat): total=%.2fs", t_process)

            if not vsa_reply.strip():
                return VoiceSecretaryResult(
                    spoken="",
                    screen={
                        "kind": "voice_secretary_result",
                        "title": "已收到语音",
                        "summary": "当前语句不包含明确指令，静默处理。",
                        "originalText": normalized,
                    },
                    route_result="vsa_handled",
                    target_agent_id=self.agent_id,
                )

            return VoiceSecretaryResult(
                spoken=vsa_reply,
                screen={
                    "kind": "voice_secretary_result",
                    "title": "语音秘书回复",
                    "summary": vsa_reply,
                    "originalText": normalized,
                    "intent": "chat",
                },
                route_result="vsa_handled",
                target_agent_id=self.agent_id,
            )

        if intent.intent == "task_unknown":
            # 功能模糊 → VSA 确认，不直接转发
            vsa_reply = intent.vsa_reply
            self._memory.add_interaction("vsa", vsa_reply)
            return VoiceSecretaryResult(
                spoken=vsa_reply,
                screen={
                    "kind": "voice_secretary_result",
                    "title": "需要确认",
                    "summary": vsa_reply,
                    "originalText": normalized,
                    "intent": "task_unknown",
                    "function_id": "unknown",
                },
                route_result="vsa_handled",
                target_agent_id=self.agent_id,
            )

        # Step 3: 精确任务 → IAP 路由到 SO / PIA
        to_agent_id = "so:enterprise" if intent.target_agent == "so" else f"pia:{self.user_id}"
        forward_text = intent.forward_content or normalized

        trace_id = f"vsa-{uuid.uuid4().hex}"
        intent_type, payload = self._build_iap_payload(
            text=forward_text,
            to_agent_id=to_agent_id,
            turn_context=dict(turn_context or {}),
        )
        envelope = IAPEnvelopeBody(
            to_agent_id=to_agent_id,
            from_agent_id=self.agent_id,
            intent=intent_type,
            trace_id=trace_id,
            payload=payload,
            allow_cross_user=False,
        )
        logger.info(
            "VSA route: user=%s target=%s function=%s intent=%s text=%s",
            self.user_id,
            to_agent_id,
            intent.function_id,
            intent_type,
            forward_text[:120],
        )

        # 确认播报
        confirm_reply = intent.vsa_reply or "好的，我来处理。"
        self._memory.add_interaction("vsa", confirm_reply)

        try:
            iap_result = await send_iap_envelope(
                body=envelope,
                request=self._request_context,
                current_user=self._current_user,
            )
        except Exception as e:
            logger.exception("VSA IAP send failed: user=%s", self.user_id)
            return VoiceSecretaryResult(
                spoken="抱歉，转发任务时出了点问题，请稍后再试。",
                screen={
                    "kind": "voice_secretary_result",
                    "title": "转发失败",
                    "summary": str(e),
                    "originalText": normalized,
                },
                trace_id=trace_id,
                route_result="error",
                target_agent_id=to_agent_id,
            )

        item = dict(iap_result.get("item") or {})
        response_payload = item.get("response_payload") if isinstance(item.get("response_payload"), dict) else {}
        route_result = str(item.get("route_result") or "")
        duplicate = bool(iap_result.get("duplicate"))

        # 如果 SO 已经同步回复了，优先使用 SO 的回复
        if route_result == "so_replied":
            so_reply = str(response_payload.get("reply") or "").strip()
            if so_reply:
                spoken = so_reply[:120]
            else:
                spoken = confirm_reply
        else:
            spoken = confirm_reply

        screen = self._build_screen_card(
            text=forward_text,
            to_agent_id=to_agent_id,
            iap_result=iap_result,
            spoken=spoken,
        )
        return VoiceSecretaryResult(
            spoken=spoken,
            screen=screen,
            trace_id=trace_id,
            route_result=route_result,
            target_agent_id=to_agent_id,
            duplicate=duplicate,
            iap_item=item,
        )

    # -------------------------------------------------------------------
    # 保留 should_ignore_utterance 接口兼容（handler 层调用）
    # -------------------------------------------------------------------

    def should_ignore_utterance(self, text: str) -> bool:
        """快速预过滤：极短/空文本在 LLM 调用前先过滤掉。

        这是性能优化，避免对明显无意义的 ASR 噪声调 LLM。
        """
        normalized = str(text or "").strip()
        if not normalized:
            return True
        # 极短（≤1字）的噪声
        if len(normalized) <= 1:
            return True
        return False
