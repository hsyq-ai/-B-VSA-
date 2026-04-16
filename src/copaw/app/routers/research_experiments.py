# -*- coding: utf-8 -*-
from __future__ import annotations

from uuid import uuid4
from typing import Any, Dict, List
from datetime import datetime, timezone
import re

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from .auth import get_current_user
from ...constant import WORKING_DIR
from ..runner.models import ChatSpec
from ..research_experiment_store import (
    create_experiment_job,
    delete_experiment_job,
    get_experiment_job,
    list_experiment_jobs,
    run_experiment_pipeline,
    update_experiment_job_business_state,
)
from ..event_logger import log_event


router = APIRouter(prefix="/research/experiment-jobs", tags=["research-experiments"])

_BIZ_STATE_ALLOWED = {"active", "paused", "closed"}


def _department_of(current: Dict[str, Any]) -> str:
    return str(current.get("department") or "").strip()


def _is_admin(current: Dict[str, Any]) -> bool:
    return str(current.get("role") or "").strip() == "admin"


def _can_access(item: Any, current: Dict[str, Any]) -> bool:
    if _is_admin(current):
        return True
    current_user_id = str(current.get("user_id") or "")
    if str(item.created_by_user_id or "") == current_user_id:
        return True
    current_dept = _department_of(current)
    return bool(current_dept and str(item.department or "") == current_dept)


def _actor_user_id(current: Dict[str, Any]) -> str:
    return str(current.get("user_id") or "")


def _profile_id(current: Dict[str, Any]) -> str:
    return str(current.get("profile_id") or "").strip()


def _safe_segment(value: str) -> str:
    cleaned = re.sub(r"[\\/\0]+", "_", str(value or "").strip())
    cleaned = re.sub(r"\s+", "_", cleaned)
    cleaned = cleaned.strip("._ ")
    return cleaned or "unknown"


def _append_md_line(path: str, line: str) -> None:
    from pathlib import Path

    file = Path(path)
    file.parent.mkdir(parents=True, exist_ok=True)
    if not file.exists():
        file.write_text("# 任务学习记录\n\n", encoding="utf-8")
    with file.open("a", encoding="utf-8") as f:
        f.write(line)


def _log_self_improving(current: Dict[str, Any], title: str, action: str) -> None:
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    uid = _profile_id(current) or _actor_user_id(current) or "unknown"
    dept = _department_of(current) or "未分配"
    note = f"- {ts} [{action}] 任务：{title}\n"

    employee_path = WORKING_DIR / "self-improving" / "employees" / uid / "learning.md"
    org_path = WORKING_DIR / "self-improving" / "organization" / "learning.md"
    dept_path = WORKING_DIR / "self-improving" / "organization" / "departments" / _safe_segment(dept) / "learning.md"

    _append_md_line(str(employee_path), note)
    _append_md_line(str(org_path), note)
    _append_md_line(str(dept_path), note)


async def _create_followup_chat_id(request: Request, current: Dict[str, Any], title: str) -> tuple[str, str]:
    chat_manager = getattr(request.app.state, "chat_manager", None)
    if chat_manager is None:
        return "", ""
    user_id = str(current.get("user_id") or "")
    if not user_id:
        return "", ""
    session_id = f"task:{user_id}:{uuid4().hex[:12]}"
    chat_name = f"任务跟进·{str(title or '新任务').strip()[:24]}"
    spec = ChatSpec(
        name=chat_name,
        session_id=session_id,
        user_id=user_id,
        channel="console",
        meta={
            "task_followup": True,
            "source": "research-experiment",
        },
    )
    created = await chat_manager.create_chat(spec)
    return str(created.id or ""), str(created.session_id or "")


class ExperimentJobCreatePayload(BaseModel):
    title: str = Field(..., min_length=1, max_length=100)
    experiment_goal: str = ""
    error_log: str = ""
    code_snippet: str = ""
    reproduce_command: str = ""
    attachments: List[str] = Field(default_factory=list)


class ExperimentJobBusinessStatePayload(BaseModel):
    business_state: str = Field(..., min_length=1, max_length=16)


@router.get("")
async def list_jobs(
    mine_only: bool = True,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    department = _department_of(current)
    user_id = str(current.get("user_id") or "")
    jobs = await list_experiment_jobs(
        department=department,
        created_by_user_id=user_id if mine_only else None,
    )
    return {"items": [item.model_dump() for item in jobs], "total": len(jobs)}


@router.post("")
async def create_job(
    payload: ExperimentJobCreatePayload,
    request: Request,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    department = _department_of(current)
    followup_chat_id, followup_session_id = await _create_followup_chat_id(
        request,
        current,
        payload.title,
    )
    item = await create_experiment_job(
        {
            "title": payload.title,
            "department": department,
            "created_by_user_id": str(current.get("user_id") or ""),
            "created_by_name": str(current.get("name") or ""),
            "experiment_goal": payload.experiment_goal,
            "error_log": payload.error_log,
            "code_snippet": payload.code_snippet,
            "reproduce_command": payload.reproduce_command,
            "attachments": payload.attachments,
            "followup_chat_id": followup_chat_id,
            "followup_session_id": followup_session_id,
        }
    )
    log_event(
        event_type="research_task_created",
        actor_user_id=_actor_user_id(current),
        session_id=str(item.followup_session_id or ""),
        summary=f"创建任务：{item.title}",
        intent_tag="research-workbench",
        source="research-experiment",
        payload={
            "job_id": item.id,
            "title": item.title,
            "department": item.department,
            "business_state": item.business_state,
            "status": item.status.value if hasattr(item.status, "value") else str(item.status),
            "goal": item.experiment_goal,
        },
    )
    _log_self_improving(current, item.title, "任务创建")
    return {"item": item.model_dump()}


@router.get("/{job_id}")
async def get_job(
    job_id: str,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    item = await get_experiment_job(job_id)
    if not item or not _can_access(item, current):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Experiment job not found")
    return {"item": item.model_dump()}


@router.post("/{job_id}/run")
async def run_job_pipeline(
    job_id: str,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    item = await get_experiment_job(job_id)
    if not item or not _can_access(item, current):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Experiment job not found")
    result = await run_experiment_pipeline(job_id)
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Experiment job not found")
    log_event(
        event_type="research_task_run_requested",
        actor_user_id=_actor_user_id(current),
        session_id=str(result.followup_session_id or ""),
        summary=f"启动任务自动化：{result.title}",
        intent_tag="research-workbench",
        source="research-experiment",
        payload={
            "job_id": result.id,
            "title": result.title,
            "department": result.department,
            "business_state": result.business_state,
            "status": result.status.value if hasattr(result.status, "value") else str(result.status),
        },
    )
    _log_self_improving(current, result.title, "启动自动化")
    return {"item": result.model_dump()}


@router.post("/{job_id}/business-state")
async def update_job_business_state(
    job_id: str,
    payload: ExperimentJobBusinessStatePayload,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    item = await get_experiment_job(job_id)
    if not item or not _can_access(item, current):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Experiment job not found")
    next_state = str(payload.business_state or "").strip().lower()
    if next_state not in _BIZ_STATE_ALLOWED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported business state")
    actor_name = str(current.get("name") or "") or str(current.get("user_id") or "用户")
    try:
        result = await update_experiment_job_business_state(
            job_id,
            next_state,
            actor_name=actor_name,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Experiment job not found")
    event_type = {
        "active": "research_task_resumed",
        "paused": "research_task_paused",
        "closed": "research_task_closed",
    }.get(next_state, "research_task_state_changed")
    log_event(
        event_type=event_type,
        actor_user_id=_actor_user_id(current),
        session_id=str(result.followup_session_id or ""),
        summary=f"{actor_name}将任务「{result.title}」状态变更为{next_state}",
        intent_tag="research-workbench",
        source="research-experiment",
        payload={
            "job_id": result.id,
            "title": result.title,
            "department": result.department,
            "business_state": result.business_state,
            "status": result.status.value if hasattr(result.status, "value") else str(result.status),
        },
    )
    _log_self_improving(current, result.title, f"状态变更:{next_state}")
    return {"item": result.model_dump()}


@router.delete("/{job_id}")
async def delete_job(
    job_id: str,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    item = await get_experiment_job(job_id)
    if not item or not _can_access(item, current):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Experiment job not found")
    deleted = await delete_experiment_job(job_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Experiment job not found")
    actor_name = str(current.get("name") or "") or str(current.get("user_id") or "用户")
    log_event(
        event_type="research_task_deleted",
        actor_user_id=_actor_user_id(current),
        session_id=str(deleted.followup_session_id or ""),
        summary=f"{actor_name}删除任务：{deleted.title}",
        intent_tag="research-workbench",
        source="research-experiment",
        payload={
            "job_id": deleted.id,
            "title": deleted.title,
            "department": deleted.department,
            "business_state": deleted.business_state,
            "status": deleted.status.value if hasattr(deleted.status, "value") else str(deleted.status),
        },
    )
    _log_self_improving(current, deleted.title, "任务删除")
    return {"item": deleted.model_dump()}
