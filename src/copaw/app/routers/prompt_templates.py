# -*- coding: utf-8 -*-
from __future__ import annotations

import re
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field

from ...agents.skills_manager import SkillService, list_available_skills
from .auth import _require_admin, get_current_user
from ..expert_center_skill_rules_store import list_expert_center_templates
from ..prompt_templates_store import (
    create_template,
    delete_template,
    list_templates,
    resolve_template,
    upsert_template_by_trigger,
    update_template,
)

router = APIRouter(prefix="/prompt-templates", tags=["prompt-templates"])


class PromptTemplateCreate(BaseModel):
    trigger_key: str = Field(..., min_length=1)
    display_name: str = Field(..., min_length=1)
    prompt_text: str = Field(..., min_length=1)
    skill: Optional[str] = ""
    session_name: Optional[str] = ""
    template_type: str = "scene"
    category: Optional[str] = ""
    agent_key: Optional[str] = ""
    agent_name: Optional[str] = ""
    source: Optional[str] = "manual"
    version: int = 1
    runtime_profile: str = "standard"
    expert_profile: Optional[str] = ""
    enabled: bool = True


class PromptTemplateUpdate(BaseModel):
    trigger_key: Optional[str] = None
    display_name: Optional[str] = None
    prompt_text: Optional[str] = None
    skill: Optional[str] = None
    session_name: Optional[str] = None
    template_type: Optional[str] = None
    category: Optional[str] = None
    agent_key: Optional[str] = None
    agent_name: Optional[str] = None
    source: Optional[str] = None
    version: Optional[int] = None
    runtime_profile: Optional[str] = None
    expert_profile: Optional[str] = None
    enabled: Optional[bool] = None


class PromptTemplateScanRequest(BaseModel):
    prompt_text: str = Field(..., min_length=1)
    runtime_profile: str = "standard"


class PromptTemplateImportSkillRequest(BaseModel):
    overwrite: bool = False
    include_disabled: bool = False
    category: str = "imported-skill"
    agent_key: str = "digital-general"
    agent_name: str = "通用数字员工"


class PromptTemplateScanFinding(BaseModel):
    rule_id: str
    severity: str
    description: str
    snippet: str


class PromptTemplateScanResponse(BaseModel):
    risk_level: str
    findings: list[PromptTemplateScanFinding]
    recommend_runtime_profile: str
    require_approval: bool


_SCAN_RULES: list[tuple[str, str, re.Pattern[str], str]] = [
    (
        "dangerous-delete",
        "HIGH",
        re.compile(r"rm\s+-rf|del\s+/f\s+/q|format\s+[a-z]:", re.IGNORECASE),
        "检测到潜在破坏性删除命令。",
    ),
    (
        "shell-pipe-exec",
        "HIGH",
        re.compile(r"(curl|wget).*(\||\|&)\s*(bash|sh|zsh|python)", re.IGNORECASE),
        "检测到下载后直接执行脚本的高风险模式。",
    ),
    (
        "privileged-command",
        "MEDIUM",
        re.compile(r"\bsudo\b|\bchmod\s+777\b|\bchown\b", re.IGNORECASE),
        "检测到需要高权限的命令，建议审批后执行。",
    ),
    (
        "network-exfiltration",
        "MEDIUM",
        re.compile(r"(scp|rsync|nc|ncat|curl)\s+.*(token|secret|password)", re.IGNORECASE),
        "检测到可能外传敏感信息的命令。",
    ),
]

_RESEARCH_ONLY_DEPARTMENT = "科研部"
_RESEARCH_EXPERT_TRIGGER_KEYS = {
    "digital-research-secretary",
    "digital-literature-intel",
    "digital-experiment-steward",
    "digital-data-specialist",
}


def _slugify_skill_name(name: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", name.strip()).strip("-").lower()
    return slug or "unnamed"


def _scan_prompt_text(text: str, runtime_profile: str) -> PromptTemplateScanResponse:
    findings: list[PromptTemplateScanFinding] = []
    for rule_id, severity, pattern, description in _SCAN_RULES:
        for match in pattern.finditer(text):
            findings.append(
                PromptTemplateScanFinding(
                    rule_id=rule_id,
                    severity=severity,
                    description=description,
                    snippet=match.group(0)[:120],
                ),
            )
            if len(findings) >= 8:
                break
        if len(findings) >= 8:
            break

    risk_level = "LOW"
    if any(f.severity == "HIGH" for f in findings):
        risk_level = "HIGH"
    elif any(f.severity == "MEDIUM" for f in findings):
        risk_level = "MEDIUM"

    recommended_profile = "isolated" if findings else "standard"
    require_approval = risk_level in {"HIGH", "MEDIUM"}
    if runtime_profile == "isolated" and risk_level == "MEDIUM":
        # 已经隔离时，降低为可控风险
        risk_level = "LOW"
        require_approval = False

    return PromptTemplateScanResponse(
        risk_level=risk_level,
        findings=findings,
        recommend_runtime_profile=recommended_profile,
        require_approval=require_approval,
    )


def _is_research_only_trigger(trigger_key: str) -> bool:
    trigger = str(trigger_key or "").strip()
    if not trigger:
        return False
    if trigger.startswith("dashboard-research-"):
        return True
    if trigger in _RESEARCH_EXPERT_TRIGGER_KEYS:
        return True
    return False


@router.get("")
def get_templates(current=Depends(get_current_user)) -> Dict[str, Any]:  # type: ignore[no-untyped-def]
    _require_admin(current)
    items = list_templates()
    return {"items": items, "total": len(items)}


@router.post("")
def create_prompt_template(
    body: PromptTemplateCreate,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    _require_admin(current)
    created = create_template(body.model_dump())
    return {"item": created}


@router.put("/{template_id}")
def update_prompt_template(
    template_id: str,
    body: PromptTemplateUpdate,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    _require_admin(current)
    updated = update_template(template_id, body.model_dump(exclude_unset=True))
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    return {"item": updated}


@router.delete("/{template_id}")
def delete_prompt_template(
    template_id: str,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    _require_admin(current)
    ok = delete_template(template_id)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    return {"success": True, "id": template_id}


@router.get("/resolve")
def resolve_prompt_template(
    trigger_key: str = Query(..., min_length=1),
    request: Request = None,  # type: ignore[assignment]
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    user_department = str(current.get("department") or "").strip()
    if _is_research_only_trigger(trigger_key) and user_department != _RESEARCH_ONLY_DEPARTMENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Current department is not allowed to access this research scene",
        )
    context: Dict[str, str] = {}
    if request is not None:
        for k, v in request.query_params.items():
            if k == "trigger_key":
                continue
            context[k] = v
    resolved = resolve_template(trigger_key, context)
    if not resolved:
        return {"found": False, "template": None}
    return {"found": True, "template": resolved}


@router.get("/digital-employees")
def list_digital_employees(
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    _ = current
    # 先触发专家模板默认值注入，避免员工端首次加载时因前端并发请求顺序导致列表为空。
    list_expert_center_templates()
    grouped: Dict[str, Dict[str, Any]] = {}
    for item in list_templates():
        if not bool(item.get("enabled", True)):
            continue
        template_type = str(item.get("template_type") or "scene")
        category = str(item.get("category") or "")
        trigger_key = str(item.get("trigger_key") or "")
        agent_key = str(item.get("agent_key") or "").strip()
        if template_type != "skill":
            continue
        is_digital = (
            category == "digital-employee"
            or trigger_key.startswith("digital-")
            or agent_key.startswith("digital-")
        )
        if not is_digital:
            continue
        group_key = agent_key or trigger_key or str(item.get("id"))
        if group_key not in grouped:
            grouped[group_key] = {
                "agent_key": group_key,
                "agent_name": str(item.get("agent_name") or item.get("display_name") or "数字员工"),
                "templates": [],
            }
        grouped[group_key]["templates"].append(
            {
                "id": str(item.get("id") or ""),
                "trigger_key": trigger_key,
                "display_name": str(item.get("display_name") or "数字员工"),
                "session_name": str(item.get("session_name") or ""),
                "skill": str(item.get("skill") or ""),
                "runtime_profile": str(item.get("runtime_profile") or "standard"),
            }
        )
    items = sorted(grouped.values(), key=lambda x: str(x.get("agent_name") or ""))
    for group in items:
        group["templates"] = sorted(
            group.get("templates", []),
            key=lambda x: str(x.get("display_name") or ""),
        )
    return {"items": items, "total": len(items)}


@router.post("/import-skills")
def import_skills_to_templates(
    body: PromptTemplateImportSkillRequest,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    _require_admin(current)
    all_skills = SkillService.list_all_skills()
    enabled_skills = set(list_available_skills())
    existing_by_trigger = {
        str(item.get("trigger_key") or ""): item for item in list_templates()
    }

    created = 0
    updated = 0
    skipped = 0
    imported: list[str] = []
    for skill in all_skills:
        if not body.include_disabled and skill.name not in enabled_skills:
            continue
        trigger_key = f"skill-{_slugify_skill_name(skill.name)}"
        exists = trigger_key in existing_by_trigger
        template_payload: Dict[str, Any] = {
            "trigger_key": trigger_key,
            "display_name": f"技能·{skill.name}",
            "prompt_text": f"请调用技能「{skill.name}」协助我完成目标。先澄清任务目标、输入条件和交付格式，再输出执行结果。",
            "skill": skill.name,
            "session_name": f"技能协作·{skill.name}",
            "template_type": "skill",
            "category": body.category,
            "agent_key": body.agent_key,
            "agent_name": body.agent_name,
            "source": "skill-auto-discovery",
            "version": 1,
            "runtime_profile": "isolated",
            "enabled": True,
        }
        if exists and not body.overwrite:
            skipped += 1
            continue
        upsert_template_by_trigger(template_payload, overwrite=body.overwrite)
        if exists:
            updated += 1
        else:
            created += 1
        imported.append(skill.name)
    return {
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "imported": imported,
    }


@router.post("/scan", response_model=PromptTemplateScanResponse)
def scan_prompt_template(
    body: PromptTemplateScanRequest,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> PromptTemplateScanResponse:
    _require_admin(current)
    return _scan_prompt_text(body.prompt_text, body.runtime_profile)
