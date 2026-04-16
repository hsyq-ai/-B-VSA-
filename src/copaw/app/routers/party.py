# -*- coding: utf-8 -*-
from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

from .agent_os import IAPEnvelopeBody, _resolve_named_active_user, send_iap_envelope
from .auth import get_current_user
from ..auth_db import get_active_users, get_user_context_by_user_id
from ..directive_news_store import init_directive_news_db
from ..party_work_store import (
    create_item,
    export_csv,
    get_item,
    init_party_work_db,
    list_items,
    update_item,
)


router = APIRouter(prefix="/party", tags=["party"])


@router.on_event("startup")
def _on_startup() -> None:
    init_party_work_db()
    init_directive_news_db()


class PartyAffairCreatePayload(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    type: str = Field(..., min_length=1, max_length=40)
    status: str = Field(..., min_length=1, max_length=40)
    assignee: Optional[str] = Field(default="", max_length=80)
    assignee_user_id: Optional[str] = Field(default="", max_length=64)
    target_department: Optional[str] = Field(default="", max_length=80)
    deadline: Optional[str] = ""
    summary: Optional[str] = Field(default="", max_length=500)
    priority: Optional[str] = Field(default="中", max_length=20)
    owner_role: Optional[str] = Field(default="党务专员", max_length=40)
    stage: Optional[str] = Field(default="待分派", max_length=40)
    receipt_status: Optional[str] = Field(default="待回执", max_length=20)
    next_action: Optional[str] = Field(default="等待秘书分派", max_length=80)
    progress_percent: Optional[int] = Field(default=10, ge=0, le=100)


class PartyAffairUpdatePayload(BaseModel):
    title: Optional[str] = None
    type: Optional[str] = None
    status: Optional[str] = None
    assignee: Optional[str] = None
    assignee_user_id: Optional[str] = None
    target_department: Optional[str] = None
    deadline: Optional[str] = None
    summary: Optional[str] = None
    priority: Optional[str] = None
    owner_role: Optional[str] = None
    stage: Optional[str] = None
    receipt_status: Optional[str] = None
    next_action: Optional[str] = None
    progress_percent: Optional[int] = Field(default=None, ge=0, le=100)
    task_id: Optional[str] = None
    biz_domain: Optional[str] = None
    module: Optional[str] = None
    conversation_key: Optional[str] = None
    session_id: Optional[str] = None
    trace_id: Optional[str] = None
    audit_summary: Optional[str] = None
    last_push_at: Optional[str] = None
    last_push_target_count: Optional[int] = Field(default=None, ge=0)
    last_push_target_names: Optional[str] = None


class ActivityCollabCreatePayload(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    activity_type: str = Field(..., min_length=1, max_length=40)
    status: str = Field(..., min_length=1, max_length=20)
    organizer: Optional[str] = Field(default="", max_length=80)
    target_branch: Optional[str] = Field(default="", max_length=80)
    location: Optional[str] = Field(default="", max_length=120)
    start_at: Optional[str] = ""
    end_at: Optional[str] = ""
    participants_planned: Optional[int] = Field(default=0, ge=0)
    participants_confirmed: Optional[int] = Field(default=0, ge=0)
    reminder_status: str = Field(..., min_length=1, max_length=20)
    receipt_status: str = Field(..., min_length=1, max_length=20)
    summary: Optional[str] = Field(default="", max_length=500)


class ActivityCollabUpdatePayload(BaseModel):
    title: Optional[str] = None
    activity_type: Optional[str] = None
    status: Optional[str] = None
    organizer: Optional[str] = None
    target_branch: Optional[str] = None
    location: Optional[str] = None
    start_at: Optional[str] = None
    end_at: Optional[str] = None
    participants_planned: Optional[int] = Field(default=None, ge=0)
    participants_confirmed: Optional[int] = Field(default=None, ge=0)
    reminder_status: Optional[str] = None
    receipt_status: Optional[str] = None
    summary: Optional[str] = None


class MemberEvaluationCreatePayload(BaseModel):
    member_name: str = Field(..., min_length=1, max_length=80)
    branch_name: str = Field(..., min_length=1, max_length=80)
    level: str = Field(..., min_length=1, max_length=20)
    score: int = Field(..., ge=0, le=100)
    reviewer: Optional[str] = ""
    remark: Optional[str] = ""


class MemberEvaluationUpdatePayload(BaseModel):
    member_name: Optional[str] = None
    branch_name: Optional[str] = None
    level: Optional[str] = None
    score: Optional[int] = Field(default=None, ge=0, le=100)
    reviewer: Optional[str] = None
    remark: Optional[str] = None


class BranchRankingCreatePayload(BaseModel):
    branch_name: str = Field(..., min_length=1, max_length=80)
    score: int = Field(..., ge=0, le=100)
    candidate_count: Optional[int] = Field(default=0, ge=0)
    recommendation: Optional[str] = ""
    status: str = Field(..., min_length=1, max_length=20)


class BranchRankingUpdatePayload(BaseModel):
    branch_name: Optional[str] = None
    score: Optional[int] = Field(default=None, ge=0, le=100)
    candidate_count: Optional[int] = Field(default=None, ge=0)
    recommendation: Optional[str] = None
    status: Optional[str] = None


class DirectiveCenterCreatePayload(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    publish_at: str = Field(..., min_length=1, max_length=64)
    sla: str = Field(..., min_length=1, max_length=20)
    status: str = Field(..., min_length=1, max_length=20)
    summary: Optional[str] = ""
    enterprise_report_title: Optional[str] = ""


class DirectiveCenterUpdatePayload(BaseModel):
    title: Optional[str] = None
    publish_at: Optional[str] = None
    sla: Optional[str] = None
    status: Optional[str] = None
    summary: Optional[str] = None
    enterprise_report_title: Optional[str] = None


class DirectiveNewsSyncPayload(BaseModel):
    channel: Optional[str] = Field(default="", max_length=32)
    force: bool = False


class OrganizationCareCreatePayload(BaseModel):
    employee_name: str = Field(..., min_length=1, max_length=80)
    department: Optional[str] = ""
    signal_level: str = Field(..., min_length=1, max_length=20)
    care_type: str = Field(..., min_length=1, max_length=80)
    owner: Optional[str] = ""
    care_note: Optional[str] = ""
    follow_up_at: Optional[str] = ""
    status: str = Field(..., min_length=1, max_length=20)


class OrganizationCareUpdatePayload(BaseModel):
    employee_name: Optional[str] = None
    department: Optional[str] = None
    signal_level: Optional[str] = None
    care_type: Optional[str] = None
    owner: Optional[str] = None
    care_note: Optional[str] = None
    follow_up_at: Optional[str] = None
    status: Optional[str] = None


class LearningCoachCreatePayload(BaseModel):
    learner_name: str = Field(..., min_length=1, max_length=80)
    topic: str = Field(..., min_length=1, max_length=120)
    mode: str = Field(..., min_length=1, max_length=30)
    status: str = Field(..., min_length=1, max_length=20)
    weakness_point: Optional[str] = ""
    micro_course_title: Optional[str] = ""
    mentor: Optional[str] = ""
    score: Optional[int] = Field(default=None, ge=0, le=100)
    due_at: Optional[str] = ""


class LearningCoachUpdatePayload(BaseModel):
    learner_name: Optional[str] = None
    topic: Optional[str] = None
    mode: Optional[str] = None
    status: Optional[str] = None
    weakness_point: Optional[str] = None
    micro_course_title: Optional[str] = None
    mentor: Optional[str] = None
    score: Optional[int] = Field(default=None, ge=0, le=100)
    due_at: Optional[str] = None


def _as_filters(request: Request) -> Dict[str, str]:
    return {str(k): str(v) for k, v in request.query_params.items()}


def _not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Party item not found")


def _get_directive_news_service(request: Request) -> Any:
    service = getattr(request.app.state, "directive_news_service", None)
    if service is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Directive news service unavailable",
        )
    return service


def _create(module_key: str, payload: BaseModel, current: Dict[str, Any]) -> Dict[str, Any]:
    return create_item(module_key, payload.model_dump(exclude_none=True), current)


def _update(module_key: str, item_id: str, payload: BaseModel, current: Dict[str, Any]) -> Dict[str, Any]:
    updated = update_item(module_key, item_id, payload.model_dump(exclude_none=True), current)
    if not updated:
        raise _not_found()
    return updated


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _normalize_match_token(value: Any) -> str:
    return re.sub(r"\s+", "", str(value or "")).lower()


def _build_activity_schedule(item: Dict[str, Any]) -> str:
    start_at = str(item.get("start_at") or "").strip()
    end_at = str(item.get("end_at") or "").strip()
    location = str(item.get("location") or "").strip()
    parts: list[str] = []
    if start_at and end_at:
        parts.append(f"时间：{start_at} ~ {end_at}")
    elif start_at:
        parts.append(f"时间：{start_at}")
    elif end_at:
        parts.append(f"截止：{end_at}")
    if location:
        parts.append(f"地点：{location}")
    return "；".join(parts)


def _resolve_activity_collab_targets(
    item: Dict[str, Any],
    current: Dict[str, Any],
    *,
    include_organizer: bool = True,
) -> list[dict[str, Any]]:
    branch = str(item.get("target_branch") or "").strip()
    branch_key = _normalize_match_token(branch)
    organizer = str(item.get("organizer") or "").strip()
    actor_user_id = str(current.get("user_id") or "").strip()
    seen: set[str] = set()
    targets: list[dict[str, Any]] = []

    if branch_key:
        for row in get_active_users():
            user_id = str(row["id"] or "").strip()
            if not user_id or user_id == actor_user_id or user_id in seen:
                continue
            ctx = get_user_context_by_user_id(user_id) or {}
            department = str(ctx.get("department") or "").strip()
            department_key = _normalize_match_token(department)
            if not department_key:
                continue
            if branch_key != department_key and branch_key not in department_key and department_key not in branch_key:
                continue
            seen.add(user_id)
            targets.append(
                {
                    "user_id": user_id,
                    "name": str(ctx.get("user_name") or row["name"] or user_id),
                    "department": department,
                    "position": str(ctx.get("position") or ""),
                }
            )

    if include_organizer and organizer:
        resolved = _resolve_named_active_user(organizer)
        if resolved:
            user_id = str(resolved.get("user_id") or "").strip()
            if user_id and user_id != actor_user_id and user_id not in seen:
                seen.add(user_id)
                targets.append(
                    {
                        "user_id": user_id,
                        "name": str(resolved.get("name") or user_id),
                        "department": str(resolved.get("department") or ""),
                        "position": str(resolved.get("position") or ""),
                    }
                )

    return targets


def _build_activity_dispatch_message(
    action_key: str,
    item: Dict[str, Any],
    current: Dict[str, Any],
) -> tuple[str, str]:
    title = str(item.get("title") or "党建活动").strip() or "党建活动"
    actor_name = str(current.get("name") or "组织负责人").strip() or "组织负责人"
    activity_type = str(item.get("activity_type") or "党建活动").strip()
    branch = str(item.get("target_branch") or "未指定支部").strip() or "未指定支部"
    status_text = str(item.get("status") or "待推进").strip() or "待推进"
    summary = str(item.get("summary") or "").strip()
    schedule = _build_activity_schedule(item)
    schedule_line = schedule or "时间地点：待补充"
    content_lines = [
        f"活动：{title}",
        f"类型：{activity_type or '党建活动'}",
        f"目标支部：{branch}",
        schedule_line,
        f"当前状态：{status_text}",
        f"发起人：{actor_name}",
    ]
    if summary:
        content_lines.append(f"补充说明：{summary[:160]}")

    if action_key == "reminder":
        message_title = f"活动提醒：{title}"
        intro = "请尽快完成报名确认、参会准备或分工同步，并在协同会话中反馈进展。"
    elif action_key == "receipt-request":
        message_title = f"回执催办：{title}"
        intro = "请尽快补充报名、签到、照片、心得或材料回执，避免活动闭环中断。"
    else:
        message_title = f"回执完成：{title}"
        intro = "该活动回执已更新为完成状态，如仍有补充材料，请继续在协同会话中沉淀。"

    content = "\n".join([intro, *content_lines])
    return message_title, content


async def _dispatch_activity_collab_action(
    *,
    request: Request,
    current: Dict[str, Any],
    item_id: str,
    action_key: str,
    intent: str,
    item_patch: Dict[str, Any],
) -> Dict[str, Any]:
    item = get_item("activity-collab", item_id, current)
    if not item:
        raise _not_found()

    targets = _resolve_activity_collab_targets(item, current, include_organizer=True)
    if not targets:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="未匹配到活动协同通知对象，请先完善目标支部或组织人",
        )

    dispatch_trace_id = f"party-activity-{action_key}-{uuid.uuid4().hex}"
    message_title, message_content = _build_activity_dispatch_message(action_key, item, current)
    dispatched: list[dict[str, Any]] = []
    failed_targets: list[dict[str, Any]] = []

    for target in targets:
        user_id = str(target.get("user_id") or "").strip()
        if not user_id:
            continue
        envelope = IAPEnvelopeBody(
            to_agent_id=f"pia:{user_id}",
            intent=intent,
            trace_id=f"{dispatch_trace_id}:{user_id}",
            payload={
                "task_id": item_id,
                "topic": message_title,
                "title": message_title,
                "content": message_content,
                "party_module": "activity-collab",
                "party_item_id": item_id,
                "party_title": str(item.get("title") or ""),
                "party_status": str(item.get("status") or ""),
                "party_reminder_status": str(item.get("reminder_status") or ""),
                "party_receipt_status": str(item.get("receipt_status") or ""),
                "party_deadline": str(item.get("end_at") or item.get("start_at") or ""),
                "target_branch": str(item.get("target_branch") or ""),
                "activity_type": str(item.get("activity_type") or ""),
                "organizer": str(item.get("organizer") or ""),
            },
            allow_cross_user=True,
        )
        try:
            routed = await send_iap_envelope(envelope, request, current)
            routed_item = routed.get("item") if isinstance(routed, dict) else {}
            dispatched.append(
                {
                    "user_id": user_id,
                    "name": str(target.get("name") or user_id),
                    "department": str(target.get("department") or ""),
                    "position": str(target.get("position") or ""),
                    "duplicate": bool(isinstance(routed, dict) and routed.get("duplicate")),
                    "route_result": str(routed_item.get("route_result") or "routed"),
                }
            )
        except HTTPException as exc:
            failed_targets.append(
                {
                    "user_id": user_id,
                    "name": str(target.get("name") or user_id),
                    "detail": str(exc.detail or "dispatch_failed"),
                }
            )
        except Exception:
            failed_targets.append(
                {
                    "user_id": user_id,
                    "name": str(target.get("name") or user_id),
                    "detail": "dispatch_failed",
                }
            )

    if not dispatched:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="活动协同消息投递失败，请稍后重试",
        )

    now = _now_iso()
    patch = {
        **item_patch,
        "last_push_trace_id": dispatch_trace_id,
        "last_push_intent": intent,
        "last_push_at": now,
        "last_push_target_count": len(dispatched),
        "last_push_target_names": "、".join(
            name for name in [str(target.get("name") or "") for target in dispatched] if name
        )[:300],
        "last_push_conversation_key": f"task:{item_id}",
        "last_push_session_id": f"console:task:{item_id}",
    }
    updated = update_item("activity-collab", item_id, patch, current)
    if not updated:
        raise _not_found()

    return {
        "ok": True,
        "item": updated,
        "dispatch": {
            "action": action_key,
            "intent": intent,
            "trace_id": dispatch_trace_id,
            "conversation_key": f"task:{item_id}",
            "session_id": f"console:task:{item_id}",
            "target_count": len(dispatched),
            "routed_count": sum(1 for target in dispatched if target.get("route_result") == "routed"),
            "duplicate_count": sum(1 for target in dispatched if target.get("duplicate")),
            "targets": dispatched,
            "failed_targets": failed_targets,
        },
    }


def _derive_party_affair_stage(status_text: str, stage_text: str = "") -> str:
    if stage_text:
        return stage_text
    return {
        "待处理": "待分派",
        "审批中": "执行中",
        "已办结": "归档完成",
    }.get(status_text, "待分派")


def _derive_party_affair_progress(status_text: str, progress_value: Any = None) -> int:
    if progress_value not in (None, ""):
        try:
            return max(0, min(int(progress_value), 100))
        except (TypeError, ValueError):
            pass
    return {
        "待处理": 12,
        "审批中": 68,
        "已办结": 100,
    }.get(status_text, 20)


def _normalize_party_affair_item(item: Dict[str, Any]) -> Dict[str, Any]:
    normalized = dict(item or {})
    item_id = str(normalized.get("id") or "").strip()
    status_text = str(normalized.get("status") or "待处理").strip() or "待处理"
    stage_text = _derive_party_affair_stage(
        status_text,
        str(normalized.get("stage") or "").strip(),
    )
    progress_percent = _derive_party_affair_progress(
        status_text,
        normalized.get("progress_percent"),
    )
    task_id = str(normalized.get("task_id") or "").strip() or (
        f"party-affair-{item_id}" if item_id else ""
    )
    receipt_status = str(normalized.get("receipt_status") or "").strip() or (
        "已完成" if status_text == "已办结" else "待回执"
    )
    normalized.update(
        {
            "biz_domain": str(normalized.get("biz_domain") or "party").strip() or "party",
            "module": str(normalized.get("module") or "party-affairs").strip() or "party-affairs",
            "task_id": task_id,
            "stage": stage_text,
            "progress_percent": progress_percent,
            "priority": str(normalized.get("priority") or "中").strip() or "中",
            "owner_role": str(normalized.get("owner_role") or "党务专员").strip() or "党务专员",
            "receipt_status": receipt_status,
            "next_action": str(normalized.get("next_action") or "").strip()
            or ("查看归档材料" if status_text == "已办结" else "完成分派并催收回执"),
            "target_department": str(normalized.get("target_department") or "").strip(),
            "conversation_key": str(normalized.get("conversation_key") or "").strip(),
            "session_id": str(normalized.get("session_id") or "").strip(),
            "trace_id": str(normalized.get("trace_id") or "").strip(),
            "audit_summary": str(normalized.get("audit_summary") or "").strip()
            or ("已归档闭环" if status_text == "已办结" else "等待首次任务卡投递"),
        }
    )
    return normalized


def _prepare_party_affair_create_payload(
    payload: PartyAffairCreatePayload,
    current: Dict[str, Any],
) -> Dict[str, Any]:
    data = payload.model_dump(exclude_none=True)
    status_text = str(data.get("status") or "待处理").strip() or "待处理"
    data["biz_domain"] = "party"
    data["module"] = "party-affairs"
    data["task_id"] = str(data.get("task_id") or f"party-affair-{uuid.uuid4().hex[:12]}")
    data["stage"] = _derive_party_affair_stage(
        status_text,
        str(data.get("stage") or "").strip(),
    )
    data["progress_percent"] = _derive_party_affair_progress(
        status_text,
        data.get("progress_percent"),
    )
    data["receipt_status"] = str(data.get("receipt_status") or "").strip() or (
        "已完成" if status_text == "已办结" else "待回执"
    )
    data["target_department"] = str(
        data.get("target_department") or current.get("department") or ""
    ).strip()
    data["owner_role"] = str(data.get("owner_role") or "党务专员").strip() or "党务专员"
    data["priority"] = str(data.get("priority") or "中").strip() or "中"
    data["next_action"] = str(data.get("next_action") or "").strip() or "等待秘书分派"
    data["audit_summary"] = str(data.get("audit_summary") or "").strip() or "任务卡已创建，等待首次派发"
    return data


def _prepare_party_affair_update_patch(payload: PartyAffairUpdatePayload) -> Dict[str, Any]:
    patch = payload.model_dump(exclude_none=True)
    if "status" in patch:
        status_text = str(patch.get("status") or "").strip() or "待处理"
        patch.setdefault("stage", _derive_party_affair_stage(status_text))
        patch.setdefault("progress_percent", _derive_party_affair_progress(status_text))
        if status_text == "已办结":
            patch.setdefault("receipt_status", "已完成")
            patch.setdefault("next_action", "查看归档材料")
            patch.setdefault("audit_summary", "任务卡已办结并归档")
    return patch


def _resolve_party_affair_targets(
    item: Dict[str, Any],
    current: Dict[str, Any],
) -> list[dict[str, Any]]:
    actor_user_id = str(current.get("user_id") or "").strip()
    assignee_user_id = str(item.get("assignee_user_id") or "").strip()
    assignee = str(item.get("assignee") or "").strip()
    target_department = str(item.get("target_department") or "").strip()
    normalized_department = _normalize_match_token(target_department)
    seen: set[str] = set()
    targets: list[dict[str, Any]] = []

    def append_target(user_id: str, name: str, department: str = "", position: str = "") -> None:
        normalized_user_id = str(user_id or "").strip()
        if not normalized_user_id or normalized_user_id == actor_user_id or normalized_user_id in seen:
            return
        seen.add(normalized_user_id)
        targets.append(
            {
                "user_id": normalized_user_id,
                "name": str(name or normalized_user_id),
                "department": str(department or ""),
                "position": str(position or ""),
            }
        )

    if assignee_user_id:
        ctx = get_user_context_by_user_id(assignee_user_id) or {}
        append_target(
            assignee_user_id,
            str(ctx.get("user_name") or assignee or assignee_user_id),
            str(ctx.get("department") or target_department),
            str(ctx.get("position") or ""),
        )

    if assignee and not targets:
        resolved = _resolve_named_active_user(assignee)
        if resolved:
            append_target(
                str(resolved.get("user_id") or ""),
                str(resolved.get("name") or assignee),
                str(resolved.get("department") or target_department),
                str(resolved.get("position") or ""),
            )

    if normalized_department and not targets:
        for row in get_active_users():
            user_id = str(row["id"] or "").strip()
            ctx = get_user_context_by_user_id(user_id) or {}
            department = str(ctx.get("department") or "").strip()
            department_key = _normalize_match_token(department)
            if not department_key:
                continue
            if (
                normalized_department != department_key
                and normalized_department not in department_key
                and department_key not in normalized_department
            ):
                continue
            append_target(
                user_id,
                str(ctx.get("user_name") or row["name"] or user_id),
                department,
                str(ctx.get("position") or ""),
            )

    return targets


def _build_party_affair_dispatch_message(
    action_key: str,
    item: Dict[str, Any],
    current: Dict[str, Any],
) -> tuple[str, str]:
    title = str(item.get("title") or "党务任务").strip() or "党务任务"
    actor_name = str(current.get("name") or "秘书").strip() or "秘书"
    affair_type = str(item.get("type") or "党务事项").strip() or "党务事项"
    deadline = str(item.get("deadline") or "").strip()
    assignee = str(item.get("assignee") or "待指定").strip() or "待指定"
    target_department = str(item.get("target_department") or "未指定部门").strip() or "未指定部门"
    stage = str(item.get("stage") or "待分派").strip() or "待分派"
    priority = str(item.get("priority") or "中").strip() or "中"
    receipt_status = str(item.get("receipt_status") or "待回执").strip() or "待回执"
    summary = str(item.get("summary") or "").strip()
    lines = [
        f"任务：{title}",
        f"类型：{affair_type}",
        f"责任人：{assignee}",
        f"目标部门：{target_department}",
        f"当前阶段：{stage}",
        f"优先级：{priority}",
        f"回执状态：{receipt_status}",
        f"发起人：{actor_name}",
    ]
    if deadline:
        lines.append(f"截止时间：{deadline}")
    if summary:
        lines.append(f"任务说明：{summary[:160]}")
    if action_key == "dispatch":
        title_text = f"党建任务卡：{title}"
        intro = "请按任务卡拆解执行步骤、同步阶段进展，并在协同会话中持续回执。"
    else:
        title_text = f"任务办结：{title}"
        intro = "该党建任务卡已进入办结归档阶段，如仍有补充材料请继续在协同会话中沉淀。"
    return title_text, "\n".join([intro, *lines])


async def _dispatch_party_affair_action(
    *,
    request: Request,
    current: Dict[str, Any],
    item_id: str,
    action_key: str,
    intent: str,
    item_patch: Dict[str, Any],
) -> Dict[str, Any]:
    raw_item = get_item("affairs", item_id, current)
    if not raw_item:
        raise _not_found()
    item = _normalize_party_affair_item(raw_item)
    targets = _resolve_party_affair_targets(item, current)
    if not targets:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="未匹配到任务卡接收人，请先选择责任人或目标部门",
        )

    task_id = str(item.get("task_id") or item_id).strip() or item_id
    dispatch_trace_id = f"party-affair-{action_key}-{uuid.uuid4().hex}"
    message_title, message_content = _build_party_affair_dispatch_message(action_key, item, current)
    dispatched: list[dict[str, Any]] = []
    failed_targets: list[dict[str, Any]] = []

    for target in targets:
        user_id = str(target.get("user_id") or "").strip()
        if not user_id:
            continue
        envelope = IAPEnvelopeBody(
            to_agent_id=f"pia:{user_id}",
            intent=intent,
            trace_id=f"{dispatch_trace_id}:{user_id}",
            payload={
                "task_id": task_id,
                "biz_domain": "party",
                "module": "party-affairs",
                "status": str(item_patch.get("status") or item.get("status") or ""),
                "topic": message_title,
                "title": message_title,
                "content": message_content,
                "party_module": "party-affairs",
                "party_item_id": item_id,
                "party_title": str(item.get("title") or ""),
                "party_status": str(item_patch.get("status") or item.get("status") or ""),
                "party_stage": str(item_patch.get("stage") or item.get("stage") or ""),
                "party_priority": str(item.get("priority") or ""),
                "party_receipt_status": str(item_patch.get("receipt_status") or item.get("receipt_status") or ""),
                "party_deadline": str(item.get("deadline") or ""),
                "assignee": str(item.get("assignee") or ""),
                "target_department": str(item.get("target_department") or ""),
            },
            allow_cross_user=True,
        )
        try:
            routed = await send_iap_envelope(envelope, request, current)
            routed_item = routed.get("item") if isinstance(routed, dict) else {}
            dispatched.append(
                {
                    "user_id": user_id,
                    "name": str(target.get("name") or user_id),
                    "department": str(target.get("department") or ""),
                    "position": str(target.get("position") or ""),
                    "duplicate": bool(isinstance(routed, dict) and routed.get("duplicate")),
                    "route_result": str(routed_item.get("route_result") or "routed"),
                }
            )
        except HTTPException as exc:
            failed_targets.append(
                {
                    "user_id": user_id,
                    "name": str(target.get("name") or user_id),
                    "detail": str(exc.detail or "dispatch_failed"),
                }
            )
        except Exception:
            failed_targets.append(
                {
                    "user_id": user_id,
                    "name": str(target.get("name") or user_id),
                    "detail": "dispatch_failed",
                }
            )

    if not dispatched:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="党建任务卡投递失败，请稍后重试",
        )

    now = _now_iso()
    target_names = "、".join(
        name for name in [str(target.get("name") or "") for target in dispatched] if name
    )[:300]
    patch = _normalize_party_affair_item(
        {
            **item,
            **item_patch,
            "trace_id": dispatch_trace_id,
            "conversation_key": f"task:{task_id}",
            "session_id": f"console:task:{task_id}",
            "last_push_at": now,
            "last_push_target_count": len(dispatched),
            "last_push_target_names": target_names,
            "audit_summary": (
                f"{message_title} · 已触达 {len(dispatched)} 人"
                if action_key == "dispatch"
                else f"{message_title} · 已完成归档通知"
            ),
        }
    )
    updated = update_item("affairs", item_id, patch, current)
    if not updated:
        raise _not_found()
    normalized_updated = _normalize_party_affair_item(updated)
    return {
        "ok": True,
        "item": normalized_updated,
        "dispatch": {
            "action": action_key,
            "intent": intent,
            "trace_id": dispatch_trace_id,
            "conversation_key": f"task:{task_id}",
            "session_id": f"console:task:{task_id}",
            "target_count": len(dispatched),
            "routed_count": sum(1 for target in dispatched if target.get("route_result") == "routed"),
            "duplicate_count": sum(1 for target in dispatched if target.get("duplicate")),
            "targets": dispatched,
            "failed_targets": failed_targets,
        },
    }


@router.get("/affairs")
def list_party_affairs(
    request: Request,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    items = [
        _normalize_party_affair_item(item)
        for item in list_items("affairs", current, _as_filters(request))
    ]
    return {"items": items}


@router.post("/affairs")
def create_party_affair(
    payload: PartyAffairCreatePayload,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    prepared = _prepare_party_affair_create_payload(payload, current)
    created = create_item("affairs", prepared, current)
    return _normalize_party_affair_item(created)


@router.get("/affairs/{item_id}")
def get_party_affair(
    item_id: str,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    item = get_item("affairs", item_id, current)
    if not item:
        raise _not_found()
    return _normalize_party_affair_item(item)


@router.put("/affairs/{item_id}")
def update_party_affair(
    item_id: str,
    payload: PartyAffairUpdatePayload,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    updated = update_item("affairs", item_id, _prepare_party_affair_update_patch(payload), current)
    if not updated:
        raise _not_found()
    return _normalize_party_affair_item(updated)


@router.post("/affairs/{item_id}/dispatch-task-card")
async def dispatch_party_affair_task_card(
    item_id: str,
    request: Request,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    item = get_item("affairs", item_id, current)
    if not item:
        raise _not_found()
    normalized = _normalize_party_affair_item(item)
    next_status = "审批中" if str(normalized.get("status") or "") != "已办结" else "已办结"
    next_stage = "执行中" if next_status != "已办结" else "归档完成"
    next_progress = 42 if next_status != "已办结" else 100
    return await _dispatch_party_affair_action(
        request=request,
        current=current,
        item_id=item_id,
        action_key="dispatch",
        intent="party.affair.task.dispatch",
        item_patch={
            "status": next_status,
            "stage": next_stage,
            "progress_percent": next_progress,
            "receipt_status": "回执中" if next_status != "已办结" else "已完成",
            "next_action": "等待责任人提交回执" if next_status != "已办结" else "查看归档材料",
        },
    )


@router.post("/affairs/{item_id}/complete-task-card")
async def complete_party_affair_task_card(
    item_id: str,
    request: Request,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    return await _dispatch_party_affair_action(
        request=request,
        current=current,
        item_id=item_id,
        action_key="complete",
        intent="party.affair.task.completed",
        item_patch={
            "status": "已办结",
            "stage": "归档完成",
            "progress_percent": 100,
            "receipt_status": "已完成",
            "next_action": "查看归档材料",
        },
    )


@router.get("/affairs/export/file", response_class=PlainTextResponse)
def export_party_affairs(
    request: Request,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> str:
    return export_csv("affairs", current, _as_filters(request))


@router.get("/activity-collab")
def list_activity_collabs(
    request: Request,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    items = list_items("activity-collab", current, _as_filters(request))
    return {"items": items}


@router.post("/activity-collab")
def create_activity_collab(
    payload: ActivityCollabCreatePayload,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    return _create("activity-collab", payload, current)


@router.get("/activity-collab/{item_id}")
def get_activity_collab(
    item_id: str,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    item = get_item("activity-collab", item_id, current)
    if not item:
        raise _not_found()
    return item


@router.put("/activity-collab/{item_id}")
def update_activity_collab(
    item_id: str,
    payload: ActivityCollabUpdatePayload,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    return _update("activity-collab", item_id, payload, current)


@router.post("/activity-collab/{item_id}/send-reminder")
async def send_activity_collab_reminder(
    item_id: str,
    request: Request,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    item = get_item("activity-collab", item_id, current)
    if not item:
        raise _not_found()
    next_status = "已提醒" if str(item.get("reminder_status") or "") == "未提醒" else "持续催办"
    return await _dispatch_activity_collab_action(
        request=request,
        current=current,
        item_id=item_id,
        action_key="reminder",
        intent="party.activity.reminder",
        item_patch={
            "reminder_status": next_status,
            "last_reminder_at": _now_iso(),
        },
    )


@router.post("/activity-collab/{item_id}/send-receipt-request")
async def send_activity_collab_receipt_request(
    item_id: str,
    request: Request,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    return await _dispatch_activity_collab_action(
        request=request,
        current=current,
        item_id=item_id,
        action_key="receipt-request",
        intent="party.activity.receipt.request",
        item_patch={
            "receipt_status": "回执中",
            "last_receipt_request_at": _now_iso(),
        },
    )


@router.post("/activity-collab/{item_id}/complete-receipt")
async def complete_activity_collab_receipt(
    item_id: str,
    request: Request,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    return await _dispatch_activity_collab_action(
        request=request,
        current=current,
        item_id=item_id,
        action_key="receipt-complete",
        intent="party.activity.receipt.completed",
        item_patch={
            "receipt_status": "已完成",
            "last_receipt_completed_at": _now_iso(),
        },
    )


@router.get("/activity-collab/export/file", response_class=PlainTextResponse)
def export_activity_collabs(
    request: Request,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> str:
    return export_csv("activity-collab", current, _as_filters(request))


@router.get("/member-evaluation")
def list_member_evaluations(
    request: Request,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    items = list_items("member-evaluation", current, _as_filters(request))
    return {"items": items}


@router.post("/member-evaluation")
def create_member_evaluation(
    payload: MemberEvaluationCreatePayload,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    return _create("member-evaluation", payload, current)


@router.get("/member-evaluation/{item_id}")
def get_member_evaluation(
    item_id: str,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    item = get_item("member-evaluation", item_id, current)
    if not item:
        raise _not_found()
    return item


@router.put("/member-evaluation/{item_id}")
def update_member_evaluation(
    item_id: str,
    payload: MemberEvaluationUpdatePayload,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    return _update("member-evaluation", item_id, payload, current)


@router.get("/member-evaluation/export/file", response_class=PlainTextResponse)
def export_member_evaluations(
    request: Request,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> str:
    return export_csv("member-evaluation", current, _as_filters(request))


@router.get("/branch-ranking")
def list_branch_rankings(
    request: Request,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    items = list_items("branch-ranking", current, _as_filters(request))
    return {"items": items}


@router.post("/branch-ranking")
def create_branch_ranking(
    payload: BranchRankingCreatePayload,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    return _create("branch-ranking", payload, current)


@router.get("/branch-ranking/{item_id}")
def get_branch_ranking(
    item_id: str,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    item = get_item("branch-ranking", item_id, current)
    if not item:
        raise _not_found()
    return item


@router.put("/branch-ranking/{item_id}")
def update_branch_ranking(
    item_id: str,
    payload: BranchRankingUpdatePayload,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    return _update("branch-ranking", item_id, payload, current)


@router.get("/branch-ranking/export/file", response_class=PlainTextResponse)
def export_branch_rankings(
    request: Request,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> str:
    return export_csv("branch-ranking", current, _as_filters(request))


@router.get("/directive-center")
def list_directive_centers(
    request: Request,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    items = list_items("directive-center", current, _as_filters(request))
    return {"items": items}


@router.post("/directive-center")
def create_directive_center(
    payload: DirectiveCenterCreatePayload,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    return _create("directive-center", payload, current)


@router.get("/directive-center/{item_id}")
def get_directive_center(
    item_id: str,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    item = get_item("directive-center", item_id, current)
    if not item:
        raise _not_found()
    return item


@router.put("/directive-center/{item_id}")
def update_directive_center(
    item_id: str,
    payload: DirectiveCenterUpdatePayload,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    return _update("directive-center", item_id, payload, current)


@router.get("/directive-center/export/file", response_class=PlainTextResponse)
def export_directive_centers(
    request: Request,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> str:
    return export_csv("directive-center", current, _as_filters(request))


@router.get("/directive-news/windows")
def list_directive_news_windows(
    request: Request,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    _ = current
    service = _get_directive_news_service(request)
    windows = service.list_windows()
    synced_at = max([str(item.get("synced_at") or "") for item in windows] or [""], default="")
    return {"windows": windows, "synced_at": synced_at}


@router.get("/directive-news/articles")
def list_directive_news_articles(
    request: Request,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    _ = current
    service = _get_directive_news_service(request)
    channel = str(request.query_params.get("channel") or "").strip()
    limit_text = str(request.query_params.get("limit") or "10").strip()
    try:
        limit = max(1, min(int(limit_text or "10"), 30))
    except ValueError:
        limit = 10
    return {
        "items": service.list_channel_articles(channel_key=channel, limit=limit),
        "channel": channel,
    }


@router.post("/directive-news/sync")
async def sync_directive_news(
    payload: DirectiveNewsSyncPayload,
    request: Request,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    _ = current
    service = _get_directive_news_service(request)
    return await service.sync(
        force=bool(payload.force),
        channel_key=str(payload.channel or "").strip(),
    )


@router.post("/directive-news/articles/{article_id}/promote")
def promote_directive_news_article(
    article_id: str,
    request: Request,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    service = _get_directive_news_service(request)
    try:
        return service.promote_article(article_id, current)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.get("/organization-care")
def list_organization_cares(
    request: Request,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    items = list_items("organization-care", current, _as_filters(request))
    return {"items": items}


@router.post("/organization-care")
def create_organization_care(
    payload: OrganizationCareCreatePayload,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    return _create("organization-care", payload, current)


@router.get("/organization-care/{item_id}")
def get_organization_care(
    item_id: str,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    item = get_item("organization-care", item_id, current)
    if not item:
        raise _not_found()
    return item


@router.put("/organization-care/{item_id}")
def update_organization_care(
    item_id: str,
    payload: OrganizationCareUpdatePayload,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    return _update("organization-care", item_id, payload, current)


@router.get("/organization-care/export/file", response_class=PlainTextResponse)
def export_organization_cares(
    request: Request,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> str:
    return export_csv("organization-care", current, _as_filters(request))


@router.get("/learning-coach")
def list_learning_coaches(
    request: Request,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    items = list_items("learning-coach", current, _as_filters(request))
    return {"items": items}


@router.post("/learning-coach")
def create_learning_coach(
    payload: LearningCoachCreatePayload,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    return _create("learning-coach", payload, current)


@router.get("/learning-coach/{item_id}")
def get_learning_coach(
    item_id: str,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    item = get_item("learning-coach", item_id, current)
    if not item:
        raise _not_found()
    return item


@router.put("/learning-coach/{item_id}")
def update_learning_coach(
    item_id: str,
    payload: LearningCoachUpdatePayload,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> Dict[str, Any]:
    return _update("learning-coach", item_id, payload, current)


@router.get("/learning-coach/export/file", response_class=PlainTextResponse)
def export_learning_coaches(
    request: Request,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> str:
    return export_csv("learning-coach", current, _as_filters(request))
