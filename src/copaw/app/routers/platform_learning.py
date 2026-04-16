# -*- coding: utf-8 -*-
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field

from .auth import _require_admin, get_current_user
from ..platform_skill_evolution_service import (
    evolve_skill_candidate_for_chat,
    get_session_evolution_scheduler_status,
)
from ..platform_skill_audit_store import (
    append_platform_skill_audit,
    list_platform_skill_audits,
)
from ..platform_skill_runtime_store import (
    get_runtime_skill,
    list_runtime_skills,
    update_runtime_skill,
)
from ..prompt_templates_store import upsert_template_by_trigger

router = APIRouter(prefix="/platform-learning", tags=["platform-learning"])


def _get_chat_context(request: Request) -> tuple[Any, Any]:
    chat_manager = getattr(request.app.state, "chat_manager", None)
    runner = getattr(request.app.state, "runner", None)
    session = getattr(runner, "session", None) if runner is not None else None
    if chat_manager is None or session is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Chat manager or session is not initialized",
        )
    return chat_manager, session


class RuntimeSkillStatusPayload(BaseModel):
    status: str = Field(..., min_length=1)


def _actor_of(current: Dict[str, Any]) -> tuple[str, str]:
    return (
        str(current.get("user_id") or ""),
        str(current.get("name") or ""),
    )


@router.get("/skills")
async def list_platform_runtime_skills(
    department: str = Query(default=""),
    status_filter: str = Query(default="", alias="status"),
    limit: int = Query(default=200, ge=1, le=1000),
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    _require_admin(current)
    items = await list_runtime_skills(
        department=department,
        status=status_filter,
        limit=limit,
    )
    return {"items": items, "total": len(items)}


@router.get("/scheduler/status")
async def get_platform_learning_scheduler_status(
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    _require_admin(current)
    return await get_session_evolution_scheduler_status()


@router.post("/evolve/chat/{chat_id}")
async def evolve_platform_skill_from_chat(
    chat_id: str,
    request: Request,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    _require_admin(current)
    chat_manager, session = _get_chat_context(request)
    chat = await chat_manager.get_chat(chat_id)
    if chat is None:
        raise HTTPException(status_code=404, detail="Chat not found")
    item = await evolve_skill_candidate_for_chat(
        chat_manager=chat_manager,
        session=session,
        session_id=str(chat.session_id),
        user_id=str(chat.user_id),
        channel=str(chat.channel or "console"),
    )
    if item:
        actor_user_id, actor_name = _actor_of(current)
        await append_platform_skill_audit(
            {
                "action": "manual_evolve_from_chat",
                "skill_id": str(item.get("id") or ""),
                "skill_name": str(item.get("name") or ""),
                "status_to": str(item.get("status") or ""),
                "source_chat_id": str(chat_id),
                "actor_user_id": actor_user_id,
                "actor_name": actor_name,
                "note": "管理员从指定会话手动触发演化",
            }
        )
    return {"item": item}


@router.get("/audits")
async def list_platform_skill_audit_logs(
    skill_id: str = Query(default=""),
    limit: int = Query(default=200, ge=1, le=1000),
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    _require_admin(current)
    items = await list_platform_skill_audits(skill_id=skill_id, limit=limit)
    return {"items": items, "total": len(items)}


@router.post("/skills/{skill_id}/status")
async def update_platform_runtime_skill_status(
    skill_id: str,
    payload: RuntimeSkillStatusPayload,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    _require_admin(current)
    next_status = str(payload.status or "").strip()
    allowed = {"candidate", "rejected", "published", "disabled"}
    if next_status not in allowed:
        raise HTTPException(status_code=400, detail=f"Unsupported status: {next_status}")
    before = await get_runtime_skill(skill_id)
    item = await update_runtime_skill(skill_id, {"status": next_status})
    if item is None:
        raise HTTPException(status_code=404, detail="Runtime skill not found")
    actor_user_id, actor_name = _actor_of(current)
    await append_platform_skill_audit(
        {
            "action": "status_update",
            "skill_id": str(item.get("id") or ""),
            "skill_name": str(item.get("name") or ""),
            "status_from": str((before or {}).get("status") or ""),
            "status_to": str(item.get("status") or ""),
            "source_chat_id": str(item.get("source_chat_id") or ""),
            "actor_user_id": actor_user_id,
            "actor_name": actor_name,
            "note": "管理员修改候选技能状态",
        }
    )
    return {"item": item}


@router.post("/skills/{skill_id}/publish")
async def publish_platform_runtime_skill(
    skill_id: str,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    _require_admin(current)
    before = await get_runtime_skill(skill_id)
    item = before
    if item is None:
        raise HTTPException(status_code=404, detail="Runtime skill not found")

    name = str(item.get("name") or "").strip() or f"runtime-skill-{skill_id}"
    display_name = f"平台技能·{name[:24]}"
    trigger_key = str(item.get("published_trigger_key") or "").strip() or f"platform-skill-{skill_id}"
    description = str(item.get("description") or "").strip()
    content = str(item.get("content") or "").strip()
    prompt_text = content or description or "请基于该平台技能给出可执行建议。"

    tmpl = upsert_template_by_trigger(
        {
            "trigger_key": trigger_key,
            "display_name": display_name,
            "prompt_text": prompt_text,
            "skill": "",
            "session_name": display_name,
            "template_type": "skill",
            "category": "platform-learning",
            "agent_key": "platform-learning",
            "agent_name": "平台学习",
            "source": "platform-learning",
            "version": 1,
            "runtime_profile": "standard",
            "expert_profile": description,
            "enabled": True,
        },
        overwrite=True,
    )

    updated = await update_runtime_skill(
        skill_id,
        {
            "status": "published",
            "published_trigger_key": trigger_key,
        },
    )
    actor_user_id, actor_name = _actor_of(current)
    await append_platform_skill_audit(
        {
            "action": "publish_prompt_template",
            "skill_id": str((updated or item).get("id") or ""),
            "skill_name": str((updated or item).get("name") or ""),
            "status_from": str((before or {}).get("status") or ""),
            "status_to": str((updated or item).get("status") or "published"),
            "trigger_key": trigger_key,
            "source_chat_id": str(item.get("source_chat_id") or ""),
            "actor_user_id": actor_user_id,
            "actor_name": actor_name,
            "note": "发布到 PromptTemplate",
        }
    )
    return {"item": updated, "template": tmpl}


@router.post("/skills/{skill_id}/re-evolve")
async def re_evolve_platform_runtime_skill(
    skill_id: str,
    request: Request,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    _require_admin(current)
    item = await get_runtime_skill(skill_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Runtime skill not found")

    chat_manager, session = _get_chat_context(request)

    source_chat_id = str(item.get("source_chat_id") or "").strip()
    source_session_id = str(item.get("source_session_id") or "").strip()
    source_user_id = str(item.get("source_user_id") or "").strip()
    source_channel = "console"

    if source_chat_id:
        chat = await chat_manager.get_chat(source_chat_id)
        if chat is not None:
            source_session_id = str(chat.session_id or "")
            source_user_id = str(chat.user_id or "")
            source_channel = str(chat.channel or "console")

    if not source_session_id or not source_user_id:
        raise HTTPException(status_code=400, detail="Skill has no usable source session")

    evolved = await evolve_skill_candidate_for_chat(
        chat_manager=chat_manager,
        session=session,
        session_id=source_session_id,
        user_id=source_user_id,
        channel=source_channel,
    )
    if evolved is None:
        raise HTTPException(status_code=400, detail="Unable to evolve from source session")

    actor_user_id, actor_name = _actor_of(current)
    await append_platform_skill_audit(
        {
            "action": "manual_re_evolve",
            "skill_id": str(evolved.get("id") or ""),
            "skill_name": str(evolved.get("name") or ""),
            "status_to": str(evolved.get("status") or ""),
            "source_chat_id": source_chat_id,
            "actor_user_id": actor_user_id,
            "actor_name": actor_name,
            "note": "按来源会话重新演化",
        }
    )
    return {"item": evolved}
