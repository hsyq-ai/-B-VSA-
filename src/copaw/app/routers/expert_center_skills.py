# -*- coding: utf-8 -*-
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from .auth import _require_admin, get_current_user
from ..expert_center_skill_rules_store import (
    get_rules,
    list_expert_center_templates,
    resolve_for_department,
    save_rules,
)


router = APIRouter(prefix="/expert-center-skills", tags=["expert-center-skills"])


class ExpertCenterSkillRulesPayload(BaseModel):
    default: list[str] = Field(default_factory=list)
    departments: Dict[str, list[str]] = Field(default_factory=dict)


def _resolve_department_for_user(current: Dict[str, Any], requested: str) -> str:
    dept = str(current.get("department") or "").strip()
    if dept:
        return dept
    return str(requested or "").strip()


@router.get("")
def get_expert_center_skill_rules(
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    _require_admin(current)
    templates = [
        {
            "trigger_key": str(t.get("trigger_key") or ""),
            "display_name": str(t.get("display_name") or ""),
            "skill": str(t.get("skill") or ""),
            "enabled": bool(t.get("enabled", True)),
            "department": str(t.get("department") or ""),
        }
        for t in list_expert_center_templates()
        if t.get("trigger_key")
    ]
    return {"rules": get_rules(), "templates": templates}


@router.put("")
def update_expert_center_skill_rules(
    payload: ExpertCenterSkillRulesPayload,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    _require_admin(current)
    rules = save_rules(payload.model_dump())
    return {"rules": rules}


@router.get("/resolve")
def resolve_expert_center_skills(
    department: str = "",
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    effective_department = _resolve_department_for_user(current, department)
    triggers = resolve_for_department(effective_department)
    return {"triggers": triggers}
