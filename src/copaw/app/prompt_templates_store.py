# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from ..config.utils import get_prompt_templates_path


_LOCK = threading.Lock()
_VALID_TEMPLATE_TYPES = {"scene", "skill"}


_DEFAULT_TEMPLATES: List[Dict[str, Any]] = [
    {
        "id": "tmpl-work-new",
        "trigger_key": "work-new",
        "display_name": "新建任务",
        "prompt_text": "请协助我新建任务。先用简洁的问题收集任务目标、截止时间、优先级、相关人，然后生成任务清单。",
        "skill": "task_new",
        "session_name": "新建任务",
        "template_type": "scene",
        "category": "work",
        "agent_key": "",
        "agent_name": "",
        "source": "builtin",
        "version": 1,
        "runtime_profile": "standard",
        "enabled": True,
    },
    {
        "id": "tmpl-work-current",
        "trigger_key": "work-current",
        "display_name": "当前任务",
        "prompt_text": "请基于我的记忆档案梳理我当前正在进行的工作任务，按优先级列出，并给出下一步建议。",
        "skill": "task_current",
        "session_name": "当前任务梳理",
        "template_type": "scene",
        "category": "work",
        "agent_key": "",
        "agent_name": "",
        "source": "builtin",
        "version": 1,
        "runtime_profile": "standard",
        "enabled": True,
    },
    {
        "id": "tmpl-work-done",
        "trigger_key": "work-done",
        "display_name": "已办结",
        "prompt_text": "请基于我的记忆档案整理已办结事项，按时间顺序生成摘要，并提炼关键贡献点。",
        "skill": "task_done",
        "session_name": "已办结总结",
        "template_type": "scene",
        "category": "work",
        "agent_key": "",
        "agent_name": "",
        "source": "builtin",
        "version": 1,
        "runtime_profile": "standard",
        "enabled": True,
    },
    {
        "id": "tmpl-work-schedule",
        "trigger_key": "work-schedule",
        "display_name": "定时任务",
        "prompt_text": "请协助我设置定时任务。先询问任务内容、执行时间、频率、数据来源（是否联网）、输出方式，然后生成任务配置建议。",
        "skill": "",
        "session_name": "定时任务",
        "template_type": "scene",
        "category": "scheduler",
        "agent_key": "",
        "agent_name": "",
        "source": "builtin",
        "version": 1,
        "runtime_profile": "standard",
        "enabled": True,
    },
    {
        "id": "tmpl-dashboard-doc",
        "trigger_key": "dashboard-doc",
        "display_name": "公文写作",
        "prompt_text": "请作为公文写作助手，先询问公文类型、目的、对象、核心要点，然后生成结构化草稿。",
        "skill": "dashboard_doc",
        "session_name": "公文写作",
        "template_type": "scene",
        "category": "dashboard",
        "agent_key": "",
        "agent_name": "",
        "source": "builtin",
        "version": 1,
        "runtime_profile": "standard",
        "enabled": True,
    },
    {
        "id": "tmpl-dashboard-party",
        "trigger_key": "dashboard-party",
        "display_name": "党建学习",
        "prompt_text": "请作为党建学习助手，为我制定本周学习计划，并提供学习要点与自测问题。",
        "skill": "dashboard_party",
        "session_name": "党建学习",
        "template_type": "scene",
        "category": "dashboard",
        "agent_key": "",
        "agent_name": "",
        "source": "builtin",
        "version": 1,
        "runtime_profile": "standard",
        "enabled": True,
    },
    {
        "id": "tmpl-dashboard-psy",
        "trigger_key": "dashboard-psy",
        "display_name": "心理辅导",
        "prompt_text": "请作为心理辅导助手，先用温和的问题了解我的状态，再提供可执行的情绪调节建议。",
        "skill": "dashboard_psy",
        "session_name": "心理辅导",
        "template_type": "scene",
        "category": "dashboard",
        "agent_key": "",
        "agent_name": "",
        "source": "builtin",
        "version": 1,
        "runtime_profile": "standard",
        "enabled": True,
    },
    {
        "id": "tmpl-dashboard-research-assistant",
        "trigger_key": "dashboard-research-assistant",
        "display_name": "科研助理",
        "prompt_text": "请作为科研助理，先澄清研究方向、目标与已有资料，再给出研究方案、实验设计与下一步计划。",
        "skill": "file_reader",
        "session_name": "科研助理",
        "template_type": "scene",
        "category": "dashboard",
        "agent_key": "",
        "agent_name": "",
        "source": "builtin",
        "version": 1,
        "runtime_profile": "standard",
        "enabled": True,
    },
    {
        "id": "tmpl-dashboard-paper-review",
        "trigger_key": "dashboard-paper-review",
        "display_name": "论文解读",
        "prompt_text": "请作为论文解读助手，先询问论文主题/标题、研究问题与期望输出形式，再给出要点摘要、方法解读与可复现建议。",
        "skill": "file_reader",
        "session_name": "论文解读",
        "template_type": "scene",
        "category": "dashboard",
        "agent_key": "",
        "agent_name": "",
        "source": "builtin",
        "version": 1,
        "runtime_profile": "standard",
        "enabled": True,
    },
    {
        "id": "tmpl-dashboard-research-topic",
        "trigger_key": "dashboard-research-topic",
        "display_name": "选题研判",
        "prompt_text": "请作为选题研判助手，先通过主动提问澄清研究方向、资源边界与目标期刊，再给出科研问题甄选建议、项目卡点排障路径与下一步行动清单。",
        "skill": "file_reader",
        "session_name": "选题研判",
        "template_type": "scene",
        "category": "dashboard",
        "agent_key": "",
        "agent_name": "",
        "source": "builtin",
        "version": 1,
        "runtime_profile": "standard",
        "enabled": True,
    },
    {
        "id": "tmpl-dashboard-research-quality",
        "trigger_key": "dashboard-research-quality",
        "display_name": "质量评估",
        "prompt_text": "请作为质量评估助手，先询问研究问题、实验设置和评价指标，再输出论文质量评估、实验设计缺陷检查与批判性分析建议。",
        "skill": "file_reader",
        "session_name": "质量评估",
        "template_type": "scene",
        "category": "dashboard",
        "agent_key": "",
        "agent_name": "",
        "source": "builtin",
        "version": 1,
        "runtime_profile": "standard",
        "enabled": True,
    },
    {
        "id": "tmpl-dashboard-research-brainstorm",
        "trigger_key": "dashboard-research-brainstorm",
        "display_name": "头脑风暴",
        "prompt_text": "请作为头脑风暴助手，围绕我的研究方向做多路径发散，先给出问题重述与假设，再提供可验证的科研灵感与实验切入点。",
        "skill": "file_reader",
        "session_name": "头脑风暴",
        "template_type": "scene",
        "category": "dashboard",
        "agent_key": "",
        "agent_name": "",
        "source": "builtin",
        "version": 1,
        "runtime_profile": "standard",
        "enabled": True,
    },
    {
        "id": "tmpl-dashboard-research-search",
        "trigger_key": "dashboard-research-search",
        "display_name": "知识检索",
        "prompt_text": "请作为知识检索助手，围绕我的主题制定查文献和查论文策略，输出关键词组合、检索路径、代表文献与结论摘要。",
        "skill": "file_reader",
        "session_name": "知识检索",
        "template_type": "scene",
        "category": "dashboard",
        "agent_key": "",
        "agent_name": "",
        "source": "builtin",
        "version": 1,
        "runtime_profile": "standard",
        "enabled": True,
    },
    {
        "id": "tmpl-dashboard-research-data",
        "trigger_key": "dashboard-research-data",
        "display_name": "数据分析",
        "prompt_text": "请作为数据分析助手，支持上传图片、文档和其他文件，先识别数据结构与问题，再给出分析结论、可视化建议与下一步实验建议。",
        "skill": "file_reader",
        "session_name": "数据分析",
        "template_type": "scene",
        "category": "dashboard",
        "agent_key": "",
        "agent_name": "",
        "source": "builtin",
        "version": 1,
        "runtime_profile": "standard",
        "enabled": True,
    },
    {
        "id": "tmpl-dashboard-research-writing",
        "trigger_key": "dashboard-research-writing",
        "display_name": "科研创作",
        "prompt_text": "请作为科研创作助手，先确认写作目标与结构，再协助生成可编辑的科研文稿，优先产出 Word 文档并支持导出 PDF。",
        "skill": "docx",
        "session_name": "科研创作",
        "template_type": "scene",
        "category": "dashboard",
        "agent_key": "",
        "agent_name": "",
        "source": "builtin",
        "version": 1,
        "runtime_profile": "standard",
        "enabled": True,
    },
    {
        "id": "tmpl-dashboard-research-paper-gen",
        "trigger_key": "dashboard-research-paper-gen",
        "display_name": "论文生成",
        "prompt_text": "请作为论文生成助手，先梳理相关论文资料与研究证据，再按论文结构生成可修改草稿，并明确待补充证据与实验。",
        "skill": "file_reader",
        "session_name": "论文生成",
        "template_type": "scene",
        "category": "dashboard",
        "agent_key": "",
        "agent_name": "",
        "source": "builtin",
        "version": 1,
        "runtime_profile": "standard",
        "enabled": True,
    },
    {
        "id": "tmpl-dashboard-research-tracking",
        "trigger_key": "dashboard-research-tracking",
        "display_name": "业界跟踪",
        "prompt_text": "请作为业界跟踪助手，持续跟进最新科研进展，给出关键动态、方法趋势、潜在影响及我可立即执行的跟进动作。",
        "skill": "news",
        "session_name": "业界跟踪",
        "template_type": "scene",
        "category": "dashboard",
        "agent_key": "",
        "agent_name": "",
        "source": "builtin",
        "version": 1,
        "runtime_profile": "standard",
        "enabled": True,
    },
    {
        "id": "tmpl-enterprise-report",
        "trigger_key": "enterprise-report",
        "display_name": "工作汇报",
        "prompt_text": "请汇总当前企业所有部门的工作进展、风险和下一步建议，输出要点清单。",
        "skill": "",
        "session_name": "企业工作汇报",
        "template_type": "scene",
        "category": "enterprise",
        "agent_key": "",
        "agent_name": "",
        "source": "builtin",
        "version": 1,
        "runtime_profile": "standard",
        "enabled": True,
    },
    {
        "id": "tmpl-enterprise-assign",
        "trigger_key": "enterprise-assign",
        "display_name": "任务下达",
        "prompt_text": "请协助我下达任务。先询问任务目标、截止时间、相关人员与协作方式，然后用“通知某某 + 内容”的格式生成通知草稿。",
        "skill": "",
        "session_name": "任务下达",
        "template_type": "scene",
        "category": "enterprise",
        "agent_key": "",
        "agent_name": "",
        "source": "builtin",
        "version": 1,
        "runtime_profile": "standard",
        "enabled": True,
    },
    {
        "id": "tmpl-org-dept-status",
        "trigger_key": "org-dept-status",
        "display_name": "部门汇总（红智秘书）",
        "prompt_text": "该部门汇总入口已由红智秘书接管。如需部门状态汇总、跨成员信息归纳或协调推进，请通过红智秘书处理。",
        "skill": "department_board",
        "session_name": "{{department}} 汇总会话",
        "template_type": "scene",
        "category": "enterprise",
        "agent_key": "",
        "agent_name": "",
        "source": "builtin",
        "version": 1,
        "runtime_profile": "standard",
        "enabled": True,
    },
    {
        "id": "tmpl-org-dept-staff",
        "trigger_key": "org-dept-staff",
        "display_name": "员工数字分身",
        "prompt_text": "你现在是【{{employee}}】的既有数字分身。当前操作者是登录用户，不是{{employee}}本人。你不是在切换当前用户，也不是在欢迎{{employee}}登录。你要直接以“{{employee}}的数字分身”身份回应操作者，并且默认操作者是在向你了解{{employee}}的档案事实、状态信息，或向{{employee}}留言/转达事项。不要说“{{employee}}，欢迎回来”“已切换到{{employee}}会话”“请问{{employee}}今天有什么需要”等把操作者误当成{{employee}}本人的话。不要先去检查档案、读取欢迎页、总结切换成功，也不要主动帮用户办事，不要发起待办、流程或协同任务，不要创建或改写 profile/welcome/daily_logs 之类的入职文件；如果信息缺失，就直接说明档案里未记录。回答要简洁、事实化，优先提供姓名、部门、职位、联系方式、偏好、项目经历、工作背景等特有信息。",
        "skill": "employee_agent_link",
        "session_name": "{{employee}} 数字分身会话",
        "template_type": "scene",
        "category": "enterprise",
        "agent_key": "",
        "agent_name": "",
        "source": "builtin",
        "version": 1,
        "runtime_profile": "standard",
        "enabled": True,
    },
    {
        "id": "tmpl-contact-collab",
        "trigger_key": "contact-collab",
        "display_name": "协同任务",
        "prompt_text": "请协助我发起协同任务。先询问任务目标、参与人、时间节点与分工，然后生成通知草稿，格式为：通知某某 + 内容。如涉及总裁办员工，请用其姓氏+总的尊称并保持礼貌语气。",
        "skill": "",
        "session_name": "协同任务",
        "template_type": "scene",
        "category": "contact",
        "agent_key": "",
        "agent_name": "",
        "source": "builtin",
        "version": 1,
        "runtime_profile": "standard",
        "enabled": True,
    },
    {
        "id": "tmpl-contact-event",
        "trigger_key": "contact-event",
        "display_name": "活动事项",
        "prompt_text": "请协助我发起活动事项。先询问活动目标、时间地点、参与人员、注意事项，然后生成通知草稿，格式为：通知某某 + 内容。如涉及总裁办员工，请用其姓氏+总的尊称并保持礼貌语气。",
        "skill": "",
        "session_name": "活动事项",
        "template_type": "scene",
        "category": "contact",
        "agent_key": "",
        "agent_name": "",
        "source": "builtin",
        "version": 1,
        "runtime_profile": "standard",
        "enabled": True,
    },
    {
        "id": "tmpl-contact-meeting",
        "trigger_key": "contact-meeting",
        "display_name": "通知会议",
        "prompt_text": "请协助我发起会议通知。先询问会议主题、时间、地点、参会人员与议程，然后生成通知草稿，格式为：通知某某 + 内容。如涉及总裁办员工，请用其姓氏+总的尊称并保持礼貌语气。",
        "skill": "",
        "session_name": "会议通知",
        "template_type": "scene",
        "category": "contact",
        "agent_key": "",
        "agent_name": "",
        "source": "builtin",
        "version": 1,
        "runtime_profile": "standard",
        "enabled": True,
    },
    {
        "id": "tmpl-contact-vote",
        "trigger_key": "contact-vote",
        "display_name": "投票",
        "prompt_text": "请协助我发起投票。先询问投票主题、选项、截止时间、参与人员，然后生成通知草稿，格式为：通知某某 + 内容。如涉及总裁办员工，请用其姓氏+总的尊称并保持礼貌语气。",
        "skill": "",
        "session_name": "投票",
        "template_type": "scene",
        "category": "contact",
        "agent_key": "",
        "agent_name": "",
        "source": "builtin",
        "version": 1,
        "runtime_profile": "standard",
        "enabled": True,
    },
    {
        "id": "tmpl-contact-staff",
        "trigger_key": "contact-staff",
        "display_name": "指定员工协同",
        "prompt_text": "请协助我通知【{{employee}}】协同处理任务。先询问任务目标与截止时间，然后生成通知内容，格式为：通知{{employee}} + 内容。若该员工属于总裁办，请使用其姓氏+总的尊称并保持礼貌语气。",
        "skill": "",
        "session_name": "联系{{employee}}",
        "template_type": "scene",
        "category": "contact",
        "agent_key": "",
        "agent_name": "",
        "source": "builtin",
        "version": 1,
        "runtime_profile": "standard",
        "enabled": True,
    },
    {
        "id": "tmpl-digital-strategy",
        "trigger_key": "digital-strategy",
        "display_name": "战略专家",
        "prompt_text": "你是企业数字专家团队中的“战略专家”。请先澄清分析主题、时间范围、输出形式，然后给出结构化战略分析、风险提示与下一步建议。",
        "skill": "news",
        "session_name": "数字专家·战略专家",
        "template_type": "skill",
        "category": "digital-employee",
        "agent_key": "digital-expert",
        "agent_name": "数字专家",
        "source": "builtin",
        "version": 1,
        "runtime_profile": "isolated",
        "expert_profile": "擅长公司级战略规划、竞争分析与组织战略落地，偏好结构化要点输出。",
        "enabled": True,
    },
    {
        "id": "tmpl-digital-product",
        "trigger_key": "digital-product",
        "display_name": "产品专家",
        "prompt_text": "你是企业数字专家团队中的“产品专家”。请先确认产品目标、目标用户、约束条件与时间计划，再输出产品策略、需求拆解与优先级建议。",
        "skill": "docx",
        "session_name": "数字专家·产品专家",
        "template_type": "skill",
        "category": "digital-employee",
        "agent_key": "digital-expert",
        "agent_name": "数字专家",
        "source": "builtin",
        "version": 1,
        "runtime_profile": "isolated",
        "expert_profile": "擅长需求洞察、产品规划与用户旅程设计，关注可执行性与里程碑。",
        "enabled": True,
    },
    {
        "id": "tmpl-digital-legal",
        "trigger_key": "digital-legal",
        "display_name": "法务专家",
        "prompt_text": "你是企业数字专家团队中的“法务专家”。请先确认业务背景、合同/合规目标与风险点，再输出合规要点、风险提示与处置建议。",
        "skill": "file_reader",
        "session_name": "数字专家·法务专家",
        "template_type": "skill",
        "category": "digital-employee",
        "agent_key": "digital-expert",
        "agent_name": "数字专家",
        "source": "builtin",
        "version": 1,
        "runtime_profile": "isolated",
        "expert_profile": "擅长合规审查、合同风险控制与监管要求解读，强调合规与风险提示。",
        "enabled": True,
    },
    {
        "id": "tmpl-digital-rd",
        "trigger_key": "digital-rd",
        "display_name": "研发专家",
        "prompt_text": "你是企业数字专家团队中的“研发专家”。请先澄清技术目标、架构约束和交付时间，再输出技术方案、实施步骤与风险点。",
        "skill": "browser_visible",
        "session_name": "数字专家·研发专家",
        "template_type": "skill",
        "category": "digital-employee",
        "agent_key": "digital-expert",
        "agent_name": "数字专家",
        "source": "builtin",
        "version": 1,
        "runtime_profile": "isolated",
        "expert_profile": "擅长技术方案评估、架构设计与落地执行，重视可扩展性与风险控制。",
        "enabled": True,
    },
    {
        "id": "tmpl-digital-marketing",
        "trigger_key": "digital-marketing",
        "display_name": "市场专家",
        "prompt_text": "你是企业数字专家团队中的“市场专家”。请先确认目标市场、受众画像与预算范围，再输出市场策略、传播建议与执行要点。",
        "skill": "news",
        "session_name": "数字专家·市场专家",
        "template_type": "skill",
        "category": "digital-employee",
        "agent_key": "digital-expert",
        "agent_name": "数字专家",
        "source": "builtin",
        "version": 1,
        "runtime_profile": "isolated",
        "expert_profile": "擅长品牌定位、市场策略与传播节奏规划，关注转化与可执行落地。",
        "enabled": True,
    },
    {
        "id": "tmpl-digital-finance",
        "trigger_key": "digital-finance",
        "display_name": "财务专家",
        "prompt_text": "你是企业数字专家团队中的“财务专家”。请先确认财务目标、数据口径与时间范围，再输出预算建议、成本结构与风险提示。",
        "skill": "xlsx",
        "session_name": "数字专家·财务专家",
        "template_type": "skill",
        "category": "digital-employee",
        "agent_key": "digital-expert",
        "agent_name": "数字专家",
        "source": "builtin",
        "version": 1,
        "runtime_profile": "isolated",
        "expert_profile": "擅长预算管理、成本控制与资金风险提示，强调数据口径统一。",
        "enabled": True,
    },
    {
        "id": "tmpl-digital-procurement",
        "trigger_key": "digital-procurement",
        "display_name": "采购专家",
        "prompt_text": "你是企业数字专家团队中的“采购专家”。请先确认采购目标、供应商范围与交付周期，再输出采购策略、成本控制与风险提示。",
        "skill": "file_reader",
        "session_name": "数字专家·采购专家",
        "template_type": "skill",
        "category": "digital-employee",
        "agent_key": "digital-expert",
        "agent_name": "数字专家",
        "source": "builtin",
        "version": 1,
        "runtime_profile": "isolated",
        "expert_profile": "擅长供应商管理与采购策略制定，关注交付周期、成本与风险控制。",
        "enabled": True,
    },
]


def _normalize_template_type(value: Any) -> str:
    v = str(value or "").strip().lower()
    if v in _VALID_TEMPLATE_TYPES:
        return v
    return "scene"


def _normalize_template(item: Dict[str, Any]) -> Dict[str, Any]:
    normalized = dict(item)
    normalized["id"] = str(normalized.get("id") or str(uuid.uuid4()))
    normalized["trigger_key"] = str(normalized.get("trigger_key") or "").strip()
    normalized["display_name"] = str(normalized.get("display_name") or "").strip()
    normalized["prompt_text"] = str(normalized.get("prompt_text") or "").strip()
    normalized["skill"] = str(normalized.get("skill") or "").strip()
    normalized["session_name"] = str(normalized.get("session_name") or "").strip()
    normalized["template_type"] = _normalize_template_type(normalized.get("template_type"))
    normalized["category"] = str(normalized.get("category") or "").strip()
    normalized["agent_key"] = str(normalized.get("agent_key") or "").strip()
    normalized["agent_name"] = str(normalized.get("agent_name") or "").strip()
    normalized["source"] = str(normalized.get("source") or "manual").strip()
    normalized["runtime_profile"] = str(normalized.get("runtime_profile") or "standard").strip()
    normalized["expert_profile"] = str(normalized.get("expert_profile") or "").strip()
    try:
        normalized["version"] = max(1, int(normalized.get("version") or 1))
    except Exception:
        normalized["version"] = 1
    normalized["enabled"] = bool(normalized.get("enabled", True))
    normalized.setdefault("updated_at", time.time())
    return normalized


def _normalize_templates(data: Any) -> List[Dict[str, Any]]:
    if isinstance(data, dict):
        items = data.get("templates")
        if isinstance(items, list):
            return items
    if isinstance(data, list):
        return data
    return []


def _merge_defaults(existing: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Merge built-in defaults into persisted templates.

    - Append missing default templates.
    - For digital-employee defaults, overwrite persisted builtins to keep names aligned.
    """
    existing_by_trigger = {
        str(item.get("trigger_key") or "").strip(): item for item in existing
    }
    merged = list(existing)
    for item in _DEFAULT_TEMPLATES:
        default_item = _normalize_template(item)
        trigger_key = str(default_item.get("trigger_key") or "").strip()
        if not trigger_key:
            continue
        current = existing_by_trigger.get(trigger_key)
        if current is None:
            merged.append(default_item)
            existing_by_trigger[trigger_key] = default_item
            continue
        if str(default_item.get("category") or "") == "digital-employee":
            # For digital experts, backfill required metadata without clobbering
            # admin-edited prompt/skill/session fields.
            patched = dict(current)
            # Enforce canonical classification so admin page filtering and
            # sidebar grouping remain stable.
            patched["template_type"] = "skill"
            patched["category"] = "digital-employee"
            patched["agent_key"] = "digital-expert"
            for field in ("agent_name", "runtime_profile"):
                if not str(patched.get(field) or "").strip():
                    patched[field] = default_item.get(field)
            for field in ("display_name", "prompt_text", "session_name", "skill", "expert_profile"):
                if not str(patched.get(field) or "").strip():
                    patched[field] = default_item.get(field)
            if "enabled" not in patched:
                patched["enabled"] = bool(default_item.get("enabled", True))
            if patched != current:
                patched = _normalize_template(patched)
                patched["updated_at"] = time.time()
                merged = [patched if (t is current) else t for t in merged]
                existing_by_trigger[trigger_key] = patched
    return merged


def _ensure_defaults() -> List[Dict[str, Any]]:
    templates: List[Dict[str, Any]] = []
    for item in _DEFAULT_TEMPLATES:
        record = _normalize_template(item)
        templates.append(record)
    return templates


def _load_templates(path: Path) -> List[Dict[str, Any]]:
    if not path.exists():
        templates = _ensure_defaults()
        _save_templates(path, templates)
        return templates
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        templates = _normalize_templates(data)
        if not templates:
            raise ValueError("empty templates")
        normalized = [_normalize_template(item) for item in templates]
        merged = _merge_defaults(normalized)
        if merged != normalized:
            _save_templates(path, merged)
        return merged
    except Exception:
        templates = _ensure_defaults()
        _save_templates(path, templates)
        return templates


def _save_templates(path: Path, templates: List[Dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "version": 1,
        "templates": templates,
        "updated_at": time.time(),
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


def list_templates() -> List[Dict[str, Any]]:
    path = get_prompt_templates_path()
    with _LOCK:
        return list(_load_templates(path))


def _write_templates(templates: List[Dict[str, Any]]) -> None:
    path = get_prompt_templates_path()
    with _LOCK:
        _save_templates(path, templates)


def create_template(data: Dict[str, Any]) -> Dict[str, Any]:
    templates = list_templates()
    new_item = _normalize_template(data)
    new_item["updated_at"] = time.time()
    templates.append(new_item)
    _write_templates(templates)
    return new_item


def update_template(template_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    templates = list_templates()
    for item in templates:
        if str(item.get("id")) == str(template_id):
            for key in (
                "trigger_key",
                "display_name",
                "prompt_text",
                "skill",
                "session_name",
                "template_type",
                "category",
                "agent_key",
                "agent_name",
                "source",
                "version",
                "runtime_profile",
                "expert_profile",
                "enabled",
            ):
                if key in updates and updates[key] is not None:
                    item[key] = updates[key]
            normalized = _normalize_template(item)
            item.update(normalized)
            item["updated_at"] = time.time()
            _write_templates(templates)
            return item
    return None


def upsert_template_by_trigger(
    data: Dict[str, Any],
    *,
    overwrite: bool = False,
) -> Dict[str, Any]:
    """Create a template if trigger_key not exists; update when overwrite=True."""
    trigger_key = str(data.get("trigger_key") or "").strip()
    if not trigger_key:
        raise ValueError("trigger_key is required")

    templates = list_templates()
    for idx, item in enumerate(templates):
        if str(item.get("trigger_key") or "").strip() != trigger_key:
            continue
        if not overwrite:
            return item
        merged = dict(item)
        merged.update({k: v for k, v in data.items() if v is not None})
        merged = _normalize_template(merged)
        merged["updated_at"] = time.time()
        templates[idx] = merged
        _write_templates(templates)
        return merged

    created = _normalize_template(data)
    created["updated_at"] = time.time()
    templates.append(created)
    _write_templates(templates)
    return created


def delete_template(template_id: str) -> bool:
    templates = list_templates()
    next_items = [t for t in templates if str(t.get("id")) != str(template_id)]
    if len(next_items) == len(templates):
        return False
    _write_templates(next_items)
    return True


def resolve_template(trigger_key: str, context: Dict[str, str]) -> Optional[Dict[str, Any]]:
    trigger = str(trigger_key or "").strip()
    if not trigger:
        return None
    templates = list_templates()
    found = None
    for item in templates:
        if str(item.get("trigger_key")) == trigger and bool(item.get("enabled", True)):
            found = dict(item)
            break
    if not found:
        return None

    def _apply(text: str) -> str:
        rendered = text
        for k, v in context.items():
            placeholder = "{{" + k + "}}"
            rendered = rendered.replace(placeholder, v)
            rendered = rendered.replace("{" + k + "}", v)
        return rendered

    prompt_text = _apply(str(found.get("prompt_text") or ""))
    session_name = _apply(str(found.get("session_name") or ""))
    found["prompt_text"] = prompt_text
    if session_name:
        found["session_name"] = session_name
    return found
