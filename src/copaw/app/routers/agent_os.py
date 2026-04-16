# -*- coding: utf-8 -*-
from __future__ import annotations

import uuid
import re
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from ...constant import WORKING_DIR
from ..agent_os_store import AgentOSStore
from ..room_store import RoomStore
from ..artifact_store import ArtifactStore
from ..observability import ObservabilityStore
from ..auth_db import get_user_context_by_user_id
from ..auth_db import get_active_users, get_users_by_name
from ..sandbox_manager import ensure_employee_sandbox_started
from .auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/agent-os", tags=["agent-os"])


class IAPEnvelopeBody(BaseModel):
    to_agent_id: str = Field(..., description="目标 agent id，例如 pia:12 或 so:enterprise")
    from_agent_id: str | None = Field(default=None, description="来源 agent id")
    intent: str = Field(default="collab.request")
    trace_id: str | None = Field(default=None)
    payload: dict[str, Any] = Field(default_factory=dict)
    allow_cross_user: bool = Field(default=False)


class SOQueryBody(BaseModel):
    question: str = Field(..., min_length=1)
    trace_id: str | None = Field(default=None)


class SODispatchBody(BaseModel):
    target_user_id: str = Field(..., min_length=1)
    title: str = Field(..., min_length=1)
    content: str = Field(..., min_length=1)
    trace_id: str | None = Field(default=None)


class CollabRequestBody(BaseModel):
    target_user_id: str = Field(..., min_length=1)
    topic: str = Field(..., min_length=1)
    content: str = Field(..., min_length=1)
    trace_id: str | None = Field(default=None)


class SceneLaunchBody(BaseModel):
    scene_key: str = Field(default="", description="场景标识")
    scene_label: str = Field(default="", description="场景名称")
    scene_skill: str = Field(default="", description="场景技能")
    scene_prompt: str = Field(default="", description="场景提示词")
    scene_session_id: str = Field(default="", description="场景会话 ID")
    scene_context: dict[str, Any] = Field(default_factory=dict)
    allow_cross_user: bool = Field(default=True)


class PlanCreateBody(BaseModel):
    title: str = Field(default="")
    goal: str = Field(..., min_length=1)
    room_id: str = Field(default="")
    trace_id: str | None = Field(default=None)
    session_id: str = Field(default="")
    source: str = Field(default="manual")
    status: str = Field(default="draft")
    steps: list[dict[str, Any]] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class PlanExecuteBody(BaseModel):
    status: str = Field(default="queued")
    metadata: dict[str, Any] = Field(default_factory=dict)


class RoomCreateBody(BaseModel):
    room_key: str = Field(default="")
    title: str = Field(default="")
    room_type: str = Field(default="collab")
    status: str = Field(default="active")
    trace_id: str | None = Field(default=None)
    session_id: str = Field(default="")
    metadata: dict[str, Any] = Field(default_factory=dict)


class RoomEventBody(BaseModel):
    event_type: str = Field(..., min_length=1)
    trace_id: str | None = Field(default=None)
    actor_agent_id: str | None = Field(default=None)
    summary: str = Field(default="")
    payload: dict[str, Any] = Field(default_factory=dict)


class ArtifactCreateBody(BaseModel):
    room_id: str = Field(default="")
    trace_id: str | None = Field(default=None)
    step_id: str = Field(default="")
    artifact_type: str = Field(default="note")
    title: str = Field(default="")
    uri: str = Field(default="")
    mime_type: str = Field(default="")
    metadata: dict[str, Any] = Field(default_factory=dict)


class EvalCreateBody(BaseModel):
    title: str = Field(default="")
    trace_id: str | None = Field(default=None)
    room_id: str = Field(default="")
    dataset: str = Field(default="")
    metric: str = Field(default="")
    summary: str = Field(default="")
    status: str = Field(default="queued")
    metadata: dict[str, Any] = Field(default_factory=dict)


class ReplayCreateBody(BaseModel):
    title: str = Field(default="")
    trace_id: str | None = Field(default=None)
    room_id: str = Field(default="")
    source: str = Field(default="manual")
    summary: str = Field(default="")
    status: str = Field(default="queued")
    metadata: dict[str, Any] = Field(default_factory=dict)


def _require_agent_os_store(request: Request) -> AgentOSStore:
    store = getattr(request.app.state, "agent_os_store", None)
    if store is None:
        raise HTTPException(status_code=503, detail="Agent OS store unavailable")
    return store


def _require_room_store(request: Request) -> RoomStore:
    store = getattr(request.app.state, "room_store", None)
    if store is None:
        raise HTTPException(status_code=503, detail="Room store unavailable")
    return store


def _require_artifact_store(request: Request) -> ArtifactStore:
    store = getattr(request.app.state, "artifact_store", None)
    if store is None:
        raise HTTPException(status_code=503, detail="Artifact store unavailable")
    return store


def _require_observability_store(request: Request) -> ObservabilityStore:
    store = getattr(request.app.state, "observability_store", None)
    if store is None:
        raise HTTPException(status_code=503, detail="Observability store unavailable")
    return store


def _require_eval_store(request: Request) -> EvalStore:
    store = getattr(request.app.state, "eval_store", None)
    if store is None:
        raise HTTPException(status_code=503, detail="Eval store unavailable")
    return store


def _is_admin(current: dict[str, Any]) -> bool:
    return str(current.get("role") or "") == "admin"


def _ensure_actor_pia(
    *,
    agent_os_store: AgentOSStore,
    current_user: dict[str, Any],
) -> dict[str, Any]:
    return agent_os_store.ensure_user_pia(
        user_id=str(current_user.get("user_id") or ""),
        profile_id=str(current_user.get("profile_id") or ""),
        department=str(current_user.get("department") or ""),
    )


def _normalize_agent(
    *,
    agent_os_store: AgentOSStore,
    agent_id: str,
) -> dict[str, Any]:
    if not agent_id:
        raise HTTPException(status_code=400, detail="agent_id is required")
    if agent_id == "so:enterprise":
        return agent_os_store.ensure_system_agent()
    if agent_id.startswith("pia:") or agent_id.startswith("vsa:"):
        agent_prefix, owner_user_id = agent_id.split(":", 1)
        owner_user_id = owner_user_id.strip()
        if not owner_user_id:
            raise HTTPException(status_code=400, detail=f"Invalid {agent_prefix} agent id")
        ctx = get_user_context_by_user_id(owner_user_id) or {}
        if agent_prefix == "vsa":
            return agent_os_store.ensure_user_vsa(
                user_id=owner_user_id,
                profile_id=str(ctx.get("profile_id") or ""),
                department=str(ctx.get("department") or ""),
            )
        return agent_os_store.ensure_user_pia(
            user_id=owner_user_id,
            profile_id=str(ctx.get("profile_id") or ""),
            department=str(ctx.get("department") or ""),
        )
    raise HTTPException(status_code=400, detail="Unsupported agent id")


def _split_name_list(raw: Any) -> list[str]:
    if isinstance(raw, list):
        values = [str(item or "").strip() for item in raw]
    else:
        values = re.split(r"[、，,;/|\n]+", str(raw or ""))
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        item = str(value or "").strip()
        if not item or item in seen:
            continue
        seen.add(item)
        result.append(item)
    return result


def _resolve_named_active_user(target_name: str) -> dict[str, Any] | None:
    normalized = str(target_name or "").strip()
    if not normalized:
        return None
    candidates = get_users_by_name(normalized)
    if candidates:
        row = candidates[0]
        uid = str(row.get("id") or "")
        ctx = get_user_context_by_user_id(uid) or {}
        return {
            "user_id": uid,
            "name": str(ctx.get("user_name") or row.get("name") or normalized),
            "department": str(ctx.get("department") or ""),
            "position": str(ctx.get("position") or ""),
        }
    normalized_key = re.sub(r"\s+", "", normalized)
    for row in get_active_users():
        uid = str(row["id"] or "")
        ctx = get_user_context_by_user_id(uid) or {}
        name = str(ctx.get("user_name") or row["name"] or "")
        if not name:
            continue
        name_key = re.sub(r"\s+", "", name)
        if normalized_key == name_key or normalized_key in name_key or name_key in normalized_key:
            return {
                "user_id": uid,
                "name": name,
                "department": str(ctx.get("department") or row.get("department") or ""),
                "position": str(ctx.get("position") or row.get("position") or ""),
            }
    return None


def _resolve_active_user_by_id(target_user_id: str) -> dict[str, Any] | None:
    uid = str(target_user_id or "").strip()
    if not uid:
        return None
    ctx = get_user_context_by_user_id(uid) or {}
    if ctx:
        return {
            "user_id": uid,
            "name": str(ctx.get("user_name") or uid),
            "department": str(ctx.get("department") or ""),
            "position": str(ctx.get("position") or ""),
        }
    for row in get_active_users():
        row_uid = str(row.get("id") or "")
        if row_uid != uid:
            continue
        return {
            "user_id": row_uid,
            "name": str(row.get("name") or row_uid),
            "department": str(row.get("department") or ""),
            "position": str(row.get("position") or ""),
        }
    return None


def _resolve_department_members(
    *,
    department: str,
    member_names: list[str],
) -> list[dict[str, Any]]:
    dept = str(department or "").strip()
    seen: set[str] = set()
    resolved: list[dict[str, Any]] = []
    normalized_names = _split_name_list(member_names)
    for name in normalized_names:
        user = _resolve_named_active_user(name)
        if not user:
            continue
        if dept:
            user_dept = str(user.get("department") or "").strip()
            if user_dept and user_dept != dept:
                continue
        uid = str(user.get("user_id") or "")
        if uid in seen:
            continue
        seen.add(uid)
        resolved.append(user)
    if resolved:
        return resolved
    if not dept:
        return []
    for row in get_active_users():
        uid = str(row["id"] or "")
        ctx = get_user_context_by_user_id(uid) or {}
        row_dept = str(ctx.get("department") or row.get("department") or "").strip()
        if row_dept != dept:
            continue
        if uid in seen:
            continue
        seen.add(uid)
        resolved.append(
            {
                "user_id": uid,
                "name": str(ctx.get("user_name") or row.get("name") or ""),
                "department": row_dept,
                "position": str(ctx.get("position") or row.get("position") or ""),
            }
        )
    return resolved


def _ensure_cross_user_allowed(
    *,
    current_user_id: str,
    current_is_admin: bool,
    from_agent: dict[str, Any],
    to_agent: dict[str, Any],
    allow_cross_user: bool,
) -> None:
    from_owner = str(from_agent.get("owner_user_id") or "")
    to_owner = str(to_agent.get("owner_user_id") or "")
    if not current_is_admin and from_owner != current_user_id:
        raise HTTPException(status_code=403, detail="来源 Agent 无权限")
    if from_owner == "system" or to_owner == "system":
        return
    if from_owner != to_owner and not allow_cross_user:
        raise HTTPException(status_code=403, detail="跨员工访问默认拒绝，请走授权协作通道")


def _conversation_key_for_iap(
    *,
    intent: str,
    from_agent_id: str,
    to_agent_id: str,
    payload: dict[str, Any],
    msg_id: str,
) -> tuple[str, str]:
    task_id = str(payload.get("task_id") or "").strip()
    if task_id:
        key = f"task:{task_id}"
        return key, f"console:{key}"
    if intent.startswith("collab"):
        topic = str(payload.get("topic") or payload.get("title") or payload.get("content") or "")
        key = AgentOSStore.build_collab_conversation_key(
            from_agent_id=from_agent_id,
            to_agent_id=to_agent_id,
            topic=topic,
        )
        return key, f"console:{key}"
    key = f"notif:{msg_id}"
    return key, f"console:{key}"


def _build_iap_push_text(intent: str, payload: dict[str, Any]) -> str:
    title = str(payload.get("title") or payload.get("topic") or "").strip()
    content = str(payload.get("content") or payload.get("message") or "").strip()
    if intent.startswith("collab"):
        if title and content:
            return f"【协作请求】{title}\n{content}"
        return f"【协作请求】{title or content or '你有一条新的协作请求'}"
    if title and content:
        return f"【任务下发】{title}\n{content}"
    if content:
        return content
    if title:
        return title
    return "你收到一条新的 Agent 消息"


def _ensure_room_access(room: dict[str, Any] | None, current_user: dict[str, Any]) -> None:
    if room is None:
        raise HTTPException(status_code=404, detail="room not found")
    if _is_admin(current_user):
        return
    owner_user_id = str(room.get("owner_user_id") or "")
    actor_user_id = str(current_user.get("user_id") or "")
    if owner_user_id and owner_user_id != actor_user_id:
        raise HTTPException(status_code=403, detail="无权访问该 room")


def _ensure_room_context(
    request: Request,
    *,
    room_key: str,
    title: str,
    room_type: str,
    owner_user_id: str,
    trace_id: str,
    session_id: str,
    source_agent_id: str,
    target_agent_id: str,
    actor_user_id: str,
    actor_user_name: str,
    target_user_id: str = "",
    target_user_name: str = "",
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    room_store = getattr(request.app.state, "room_store", None)
    if room_store is None:
        return None
    room = room_store.ensure_room(
        room_key=room_key,
        title=title,
        room_type=room_type,
        owner_user_id=owner_user_id,
        trace_id=trace_id,
        session_id=session_id,
        source_agent_id=source_agent_id,
        target_agent_id=target_agent_id,
        metadata=metadata or {},
    )
    room_id = str(room.get("room_id") or "")
    if room_id:
        if actor_user_id:
            room_store.upsert_member(
                room_id=room_id,
                member_id=actor_user_id,
                member_type="user",
                role="owner",
                display_name=actor_user_name or actor_user_id,
            )
        if target_user_id and target_user_id != actor_user_id:
            room_store.upsert_member(
                room_id=room_id,
                member_id=target_user_id,
                member_type="user",
                role="target",
                display_name=target_user_name or target_user_id,
            )
        if source_agent_id:
            room_store.upsert_member(
                room_id=room_id,
                member_id=source_agent_id,
                member_type="agent",
                role="source",
                display_name=source_agent_id,
            )
        if target_agent_id:
            room_store.upsert_member(
                room_id=room_id,
                member_id=target_agent_id,
                member_type="agent",
                role="target",
                display_name=target_agent_id,
            )
    return room


def _record_trace_event(
    request: Request,
    *,
    trace_id: str,
    owner_user_id: str,
    event_type: str,
    summary: str,
    status: str = "",
    room_id: str = "",
    actor_user_id: str = "",
    actor_agent_id: str = "",
    payload: dict[str, Any] | None = None,
) -> None:
    observability_store = getattr(request.app.state, "observability_store", None)
    if observability_store is None:
        return
    observability_store.record_event(
        trace_id=trace_id,
        room_id=room_id,
        owner_user_id=owner_user_id,
        event_type=event_type,
        actor_user_id=actor_user_id,
        actor_agent_id=actor_agent_id,
        status=status,
        summary=summary,
        payload=payload or {},
    )


def _append_room_event(
    request: Request,
    *,
    room_id: str,
    event_type: str,
    summary: str,
    trace_id: str = "",
    actor_user_id: str = "",
    actor_agent_id: str = "",
    payload: dict[str, Any] | None = None,
) -> None:
    room_store = getattr(request.app.state, "room_store", None)
    if room_store is None or not room_id:
        return
    room_store.append_event(
        room_id=room_id,
        event_type=event_type,
        actor_user_id=actor_user_id,
        actor_agent_id=actor_agent_id,
        trace_id=trace_id,
        summary=summary,
        payload=payload or {},
    )


def _public_memory_excerpt(question: str) -> str:
    memory_file = WORKING_DIR / "memory" / "public" / "MEMORY.md"
    if not memory_file.exists():
        return "系统 Agent 未找到公共档案。"
    try:
        content = memory_file.read_text(encoding="utf-8")
    except Exception:
        return "系统 Agent 读取公共档案失败。"
    lines = [line.strip() for line in content.splitlines() if line.strip()]
    if not lines:
        return "公共档案为空。"
    query = str(question or "").strip().lower()
    if query:
        hits = [line for line in lines if query in line.lower()]
        if hits:
            selected = hits[:5]
            return "系统 Agent 已检索到以下相关公共信息：\n" + "\n".join(f"- {x}" for x in selected)
    selected = lines[:8]
    return "系统 Agent 返回公共档案摘要：\n" + "\n".join(f"- {x}" for x in selected)


def _extract_push_business_meta(extra_payload: dict[str, Any] | None) -> dict[str, str]:
    payload = extra_payload if isinstance(extra_payload, dict) else {}
    keys = [
        "biz_domain",
        "module",
        "task_id",
        "status",
        "party_module",
        "party_item_id",
        "party_title",
        "party_status",
        "party_stage",
        "party_priority",
        "party_reminder_status",
        "party_receipt_status",
        "party_deadline",
    ]
    meta = {
        key: str(payload.get(key) or "").strip()
        for key in keys
        if str(payload.get(key) or "").strip()
    }
    if meta.get("party_module") and not meta.get("biz_domain"):
        meta["biz_domain"] = "party"
    if meta.get("party_module") and not meta.get("module"):
        meta["module"] = meta["party_module"]
    if meta.get("party_status") and not meta.get("status"):
        meta["status"] = meta["party_status"]
    return meta


async def _notify_target_user(
    *,
    request: Request,
    target_user_id: str,
    source_user_id: str,
    source_user_name: str,
    from_agent_id: str,
    to_agent_id: str,
    msg_id: str,
    trace_id: str,
    intent: str,
    text: str,
    conversation_key: str,
    session_id: str,
    extra_payload: dict[str, Any] | None = None,
) -> None:
    message_store = getattr(request.app.state, "message_store", None)
    agent_os_store = getattr(request.app.state, "agent_os_store", None)
    from_agent_id = from_agent_id or "so:enterprise"
    to_agent_id = to_agent_id or f"pia:{target_user_id}"
    business_meta = _extract_push_business_meta(extra_payload)
    business_task_id = str(business_meta.get("task_id") or msg_id)
    if to_agent_id.startswith("pia:"):
        target_ctx = get_user_context_by_user_id(str(target_user_id or "")) or {}
        try:
            await ensure_employee_sandbox_started(
                user_id=str(target_user_id or ""),
                profile_id=str(target_ctx.get("profile_id") or ""),
                user_name=str(target_ctx.get("user_name") or ""),
            )
        except Exception:
            logger.exception("Failed to wake employee sandbox for %s", target_user_id)
    if agent_os_store is not None:
        try:
            common_entry = {
                "source_user_id": str(source_user_id or ""),
                "source_user_name": str(source_user_name or "系统Agent"),
                "task_id": business_task_id,
                "trace_id": trace_id,
                "conversation_key": conversation_key,
                "summary": text[:400],
                "text": text,
                **business_meta,
            }
            agent_os_store.append_agent_outbox_entry(
                from_agent_id,
                {
                    "mailbox_id": msg_id,
                    "title": f"系统派发给 {target_user_id}",
                    "intent": intent,
                    "status": "sent",
                    "from_agent_id": from_agent_id,
                    "to_agent_id": to_agent_id,
                    **common_entry,
                },
            )
            agent_os_store.append_agent_inbox_entry(
                to_agent_id,
                {
                    "mailbox_id": msg_id,
                    "title": f"来自系统Agent的任务",
                    "intent": intent,
                    "status": "pending",
                    "from_agent_id": from_agent_id,
                    "to_agent_id": to_agent_id,
                    **common_entry,
                },
            )
        except Exception:
            pass
    if message_store is None:
        return
    payload = {
        "text": text,
        "source_user_id": str(source_user_id or ""),
        "source_user_name": str(source_user_name or "系统Agent"),
        "message_id": msg_id,
        "trace_id": trace_id,
        "intent_type": intent,
        "source_agent_id": from_agent_id,
        "target_agent_id": to_agent_id,
        "push_conversation_key": conversation_key,
        "push_session_id": session_id,
        "message_summary": text[:400],
        **business_meta,
    }
    message_store.enqueue_message(str(target_user_id), payload)
    message_store.record_event(
        status="iap_dispatch",
        user_id=str(target_user_id),
        source_user_name=str(source_user_name or "系统Agent"),
        target_user_name="",
        detail=text[:300],
        task_id=business_task_id,
        trace_id=trace_id,
        conversation_key=conversation_key,
        route_result="routed",
    )


def _scene_conversation_key(
    *,
    scene_key: str,
    scene_label: str,
    actor_agent_id: str,
    target_key: str,
) -> str:
    seed = "::".join(
        [
            str(scene_key or "").strip(),
            str(scene_label or "").strip(),
            str(actor_agent_id or "").strip(),
            str(target_key or "").strip(),
        ]
    )
    digest = uuid.uuid5(uuid.NAMESPACE_URL, seed).hex[:12]
    return f"scene:{scene_key or 'link'}:{digest}"


@router.get("/registry")
def list_registry(
    request: Request,
    owner_user_id: str = Query(default=""),
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    store = _require_agent_os_store(request)
    actor_user_id = str(current_user.get("user_id") or "")
    target_owner = str(owner_user_id or "")
    if not _is_admin(current_user):
        target_owner = actor_user_id
    items = store.list_agents(owner_user_id=target_owner, limit=500)
    return {"items": items, "total": len(items)}


@router.get("/registry/me")
def get_my_registry(request: Request, current_user: dict = Depends(get_current_user)) -> dict[str, Any]:
    store = _require_agent_os_store(request)
    pia = _ensure_actor_pia(agent_os_store=store, current_user=current_user)
    so = store.ensure_system_agent()
    return {"pia": pia, "so": so}


@router.get("/mailbox/overview")
def list_mailbox_overview(
    request: Request,
    owner_user_id: str = Query(default=""),
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    store = _require_agent_os_store(request)
    actor_user_id = str(current_user.get("user_id") or "")
    if _is_admin(current_user):
        target_owner = str(owner_user_id or "")
        agents = store.list_agents(owner_user_id=target_owner, limit=500)
    else:
        target_owner = actor_user_id
        agents = store.list_agents(owner_user_id=target_owner, limit=500)

    items: list[dict[str, Any]] = []
    for agent in agents:
        agent_id = str(agent.get("agent_id") or "")
        inbox = store.list_agent_mailbox_entries(agent_id=agent_id, direction="inbox", limit=20)
        outbox = store.list_agent_mailbox_entries(agent_id=agent_id, direction="outbox", limit=20)
        mailbox = store.ensure_agent_mailbox(agent_id) or {}
        items.append(
            {
                "agent_id": agent_id,
                "agent_type": str(agent.get("agent_type") or ""),
                "owner_user_id": str(agent.get("owner_user_id") or ""),
                "status": str(agent.get("status") or ""),
                "sandbox_ref": str(agent.get("sandbox_ref") or ""),
                "memory_root": str(agent.get("memory_root") or ""),
                "mailbox_root": str(mailbox.get("mailbox_root") or ""),
                "inbox_total": len(inbox),
                "outbox_total": len(outbox),
                "recent_inbox": inbox[:5],
                "recent_outbox": outbox[:5],
            }
        )
    return {"items": items, "total": len(items)}


@router.get("/mailbox/messages")
def list_mailbox_messages(
    request: Request,
    agent_id: str = Query(default=""),
    direction: str = Query(default="inbox"),
    limit: int = Query(default=50, ge=1, le=200),
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    store = _require_agent_os_store(request)
    actor_user_id = str(current_user.get("user_id") or "")
    target_agent_id = str(agent_id or "").strip()
    if not target_agent_id:
        raise HTTPException(status_code=400, detail="agent_id is required")
    agent = store.get_agent(target_agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="agent not found")
    if not _is_admin(current_user) and str(agent.get("owner_user_id") or "") != actor_user_id:
        raise HTTPException(status_code=403, detail="无权查看该 agent 邮箱")
    items = store.list_agent_mailbox_entries(agent_id=target_agent_id, direction=direction, limit=limit)
    return {"items": items, "total": len(items)}


@router.post("/scenes/launch")
async def launch_scene_link(
    body: SceneLaunchBody,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    store = _require_agent_os_store(request)
    actor_user_id = str(current_user.get("user_id") or "")
    actor_user_name = str(current_user.get("name") or "员工")
    actor_pia = _ensure_actor_pia(agent_os_store=store, current_user=current_user)
    actor_agent_id = str(actor_pia.get("agent_id") or f"pia:{actor_user_id}")

    scene_context = body.scene_context if isinstance(body.scene_context, dict) else {}
    scene_key = str(body.scene_key or "").strip()
    scene_label = str(body.scene_label or "").strip()
    scene_skill = str(body.scene_skill or "").strip()
    scene_prompt = str(body.scene_prompt or "").strip()
    scene_session_id = str(body.scene_session_id or "").strip()
    target_type = str(scene_context.get("target_type") or "").strip().lower()
    target_department = str(
        scene_context.get("department")
        or scene_context.get("target_department")
        or ""
    ).strip()
    target_name = str(
        scene_context.get("target_name")
        or scene_context.get("target_user_name")
        or scene_context.get("employee")
        or scene_context.get("target_employee")
        or ""
    ).strip()
    target_user_id = str(
        scene_context.get("scene_target_user_id")
        or scene_context.get("target_user_id")
        or ""
    ).strip()
    expert_key = str(
        scene_context.get("expert_trigger_key")
        or scene_context.get("expert_id")
        or scene_context.get("target_expert_id")
        or ""
    ).strip()
    member_names = _split_name_list(scene_context.get("peers") or scene_context.get("members") or [])
    is_department = target_type == "department" or scene_skill == "department_agent_link"
    is_expert = target_type == "expert" or scene_skill == "expert_agent_link"
    if not scene_skill:
        if is_department:
            scene_skill = "department_agent_link"
        elif is_expert:
            scene_skill = "expert_agent_link"
        else:
            scene_skill = "employee_agent_link"

    target_users: list[dict[str, Any]] = []
    if is_department:
        target_users = _resolve_department_members(
            department=target_department,
            member_names=member_names,
        )
    elif not is_expert:
        resolved = _resolve_active_user_by_id(target_user_id) if target_user_id else None
        if not resolved:
            resolved = _resolve_named_active_user(target_name)
        if resolved:
            target_users = [resolved]

    if not target_users and not is_expert:
        raise HTTPException(status_code=404, detail="No agent targets resolved for scene")

    scene_key_target = target_department if is_department else (expert_key if is_expert else (target_user_id or target_name))
    conversation_key = _scene_conversation_key(
        scene_key=scene_key or scene_skill,
        scene_label=scene_label or scene_skill,
        actor_agent_id=actor_agent_id,
        target_key=scene_key_target or str(target_users[0].get("user_id") or ""),
    )
    session_id = scene_session_id or f"console:scene:{conversation_key}"
    trace_id = str(uuid.uuid4())
    room = _ensure_room_context(
        request,
        room_key=conversation_key,
        title=scene_label or scene_skill or scene_key or "场景联动",
        room_type="scene",
        owner_user_id=actor_user_id,
        trace_id=trace_id,
        session_id=session_id,
        source_agent_id=actor_agent_id,
        target_agent_id="scene:targets",
        actor_user_id=actor_user_id,
        actor_user_name=actor_user_name,
        metadata={
            "scene_key": scene_key,
            "scene_label": scene_label,
            "scene_skill": scene_skill,
            "target_type": target_type,
        },
    )
    room_id = str(room.get("room_id") or "") if room else ""
    _append_room_event(
        request,
        room_id=room_id,
        event_type="scene.created",
        summary=f"创建场景联动：{scene_label or scene_skill or scene_key or '未命名场景'}",
        trace_id=trace_id,
        actor_user_id=actor_user_id,
        actor_agent_id=actor_agent_id,
        payload=scene_context,
    )
    _record_trace_event(
        request,
        trace_id=trace_id,
        owner_user_id=actor_user_id,
        room_id=room_id,
        event_type="scene.created",
        actor_user_id=actor_user_id,
        actor_agent_id=actor_agent_id,
        status="created",
        summary=f"创建场景联动：{scene_label or scene_skill or scene_key or '未命名场景'}",
        payload=scene_context,
    )
    route_items: list[dict[str, Any]] = []
    routed_targets: list[dict[str, Any]] = []

    for index, target in enumerate(target_users):
        target_user_id = str(target.get("user_id") or "").strip()
        if not target_user_id:
            continue
        to_agent_id = f"pia:{target_user_id}"
        if to_agent_id == actor_agent_id:
            continue
        target_user_name = str(target.get("name") or target_user_id)
        if is_department:
            intent = "scene.department_agent_link"
        elif is_expert:
            intent = "scene.expert_agent_link"
        else:
            intent = "scene.employee_agent_link"
        msg_id = str(uuid.uuid4())
        payload = {
            "scene_key": scene_key,
            "scene_label": scene_label,
            "scene_skill": scene_skill,
            "scene_session_id": session_id,
            "scene_prompt": scene_prompt,
            "scene_context": scene_context,
            "scene_actor_user_id": actor_user_id,
            "scene_actor_user_name": actor_user_name,
            "target_user_id": target_user_id,
            "target_user_name": target_user_name,
            "target_department": target_department,
            "target_type": "department" if is_department else ("expert" if is_expert else "employee"),
            "target_index": index,
        }
        item = store.create_iap_message(
            from_agent_id=actor_agent_id,
            to_agent_id=to_agent_id,
            owner_user_id=actor_user_id,
            intent=intent,
            payload=payload,
            trace_id=trace_id,
            route_result="queued",
        )
        msg_id = str(item.get("msg_id") or msg_id)
        if is_department:
            text = (
                f"【部门联动】{scene_label or target_department or '部门态势'}\n"
                f"发起人：{actor_user_name}\n"
                f"请先汇报当前状态、待办和阻塞，再等待部门汇总。"
            )
        else:
            text = (
                f"【员工联动】{scene_label or target_user_name}\n"
                f"发起人：{actor_user_name}\n"
                f"请基于你的数字分身、档案与当前上下文直接回应。"
            )
        await _notify_target_user(
            request=request,
            target_user_id=target_user_id,
            source_user_id=actor_user_id,
            source_user_name=actor_user_name,
            from_agent_id=actor_agent_id,
            to_agent_id=to_agent_id,
            msg_id=msg_id,
            trace_id=trace_id,
            intent=intent,
            text=text,
            conversation_key=conversation_key,
            session_id=session_id,
            extra_payload=payload,
        )
        route_items.append(item)
        if room_id:
            target_display_name = target_user_name or target_user_id
            room_store = getattr(request.app.state, "room_store", None)
            if room_store is not None and target_user_id:
                room_store.upsert_member(
                    room_id=room_id,
                    member_id=target_user_id,
                    member_type="user",
                    role="target",
                    display_name=target_display_name,
                    metadata={
                        "department": str(target.get("department") or ""),
                        "position": str(target.get("position") or ""),
                    },
                )
                room_store.upsert_member(
                    room_id=room_id,
                    member_id=to_agent_id,
                    member_type="agent",
                    role="target",
                    display_name=to_agent_id,
                )
            _append_room_event(
                request,
                room_id=room_id,
                event_type="scene.target_routed",
                summary=f"场景已路由到 {target_display_name}",
                trace_id=trace_id,
                actor_user_id=actor_user_id,
                actor_agent_id=actor_agent_id,
                payload={
                    "target_user_id": target_user_id,
                    "target_user_name": target_display_name,
                    "target_agent_id": to_agent_id,
                    "msg_id": msg_id,
                },
            )
        routed_targets.append(
            {
                "user_id": target_user_id,
                "name": target_user_name,
                "department": str(target.get("department") or ""),
                "position": str(target.get("position") or ""),
                "agent_id": to_agent_id,
                "message_id": msg_id,
                "actor_user_id": actor_user_id,
                "actor_user_name": actor_user_name,
            }
        )

    message_store = getattr(request.app.state, "message_store", None)
    if message_store is not None:
        if is_expert:
            actor_summary = f"已创建数字专家场景：{scene_label or expert_key or scene_key or '数字专家'}"
        else:
            actor_summary = (
                f"已向 {len(routed_targets)} 位{'部门成员' if is_department else '成员'}发起 agent 联动："
                + "、".join(item["name"] for item in routed_targets[:6])
            )
        message_store.enqueue_message(
            actor_user_id,
            {
                "text": actor_summary,
                "source_user_id": "",
                "source_user_name": "系统Agent",
                "message_id": trace_id,
                "trace_id": trace_id,
                "intent_type": "scene.agent_link.summary",
                "source_agent_id": "so:enterprise",
                "target_agent_id": actor_agent_id,
                "push_conversation_key": conversation_key,
                "push_session_id": session_id,
                "message_summary": actor_summary,
            },
        )
        message_store.record_event(
            status="scene_launch",
            user_id=actor_user_id,
            source_user_name=actor_user_name,
            target_user_name=scene_label or target_department or target_name or expert_key,
            detail=actor_summary,
            task_id=str(route_items[0].get("msg_id") if route_items else ""),
            trace_id=trace_id,
            conversation_key=conversation_key,
            route_result="routed",
        )
    _append_room_event(
        request,
        room_id=room_id,
        event_type="scene.launched",
        summary=f"场景联动完成路由，目标数：{len(routed_targets)}",
        trace_id=trace_id,
        actor_user_id=actor_user_id,
        actor_agent_id=actor_agent_id,
        payload={
            "scene_key": scene_key,
            "scene_label": scene_label,
            "scene_skill": scene_skill,
            "target_count": len(routed_targets),
        },
    )
    _record_trace_event(
        request,
        trace_id=trace_id,
        owner_user_id=actor_user_id,
        room_id=room_id,
        event_type="scene.launched",
        actor_user_id=actor_user_id,
        actor_agent_id=actor_agent_id,
        status="routed",
        summary=f"场景联动完成路由，目标数：{len(routed_targets)}",
        payload={
            "scene_key": scene_key,
            "scene_label": scene_label,
            "scene_skill": scene_skill,
            "target_count": len(routed_targets),
        },
    )
    return {
        "ok": True,
        "scene_key": scene_key,
        "scene_label": scene_label,
        "scene_skill": scene_skill,
        "session_id": session_id,
        "conversation_key": conversation_key,
        "trace_id": trace_id,
        "room_id": room_id,
        "target_count": len(routed_targets),
        "targets": routed_targets,
        "items": route_items,
    }


@router.post("/registry/activate")
def activate_my_pia(request: Request, current_user: dict = Depends(get_current_user)) -> dict[str, Any]:
    store = _require_agent_os_store(request)
    pia = _ensure_actor_pia(agent_os_store=store, current_user=current_user)
    return {"item": pia}


@router.get("/active-users")
def list_active_users_for_collab(
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    _ = current_user
    items: list[dict[str, Any]] = []
    for row in get_active_users():
        uid = str(row["id"] or "")
        ctx = get_user_context_by_user_id(uid) or {}
        items.append(
            {
                "user_id": uid,
                "name": str(ctx.get("user_name") or row["name"] or ""),
                "department": str(ctx.get("department") or ""),
                "position": str(ctx.get("position") or ""),
            }
        )
    return {"items": items, "total": len(items)}


@router.post("/iap/send")
async def send_iap_envelope(
    body: IAPEnvelopeBody,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    store = _require_agent_os_store(request)
    actor_user_id = str(current_user.get("user_id") or "")
    actor_user_name = str(current_user.get("name") or "员工")
    actor_pia = _ensure_actor_pia(agent_os_store=store, current_user=current_user)
    from_agent_id = str(body.from_agent_id or actor_pia.get("agent_id") or "")
    to_agent_id = str(body.to_agent_id or "").strip()
    if not to_agent_id:
        raise HTTPException(status_code=400, detail="to_agent_id is required")

    from_agent = _normalize_agent(agent_os_store=store, agent_id=from_agent_id)
    to_agent = _normalize_agent(agent_os_store=store, agent_id=to_agent_id)
    _ensure_cross_user_allowed(
        current_user_id=actor_user_id,
        current_is_admin=_is_admin(current_user),
        from_agent=from_agent,
        to_agent=to_agent,
        allow_cross_user=bool(body.allow_cross_user),
    )

    trace_id = str(body.trace_id or uuid.uuid4())
    duplicate = store.find_recent_duplicate(
        trace_id=trace_id,
        from_agent_id=from_agent_id,
        to_agent_id=to_agent_id,
        intent=str(body.intent or "collab.request"),
        owner_user_id=actor_user_id,
    )
    if duplicate:
        msg = store.create_iap_message(
            from_agent_id=from_agent_id,
            to_agent_id=to_agent_id,
            owner_user_id=actor_user_id,
            intent=str(body.intent or "collab.request"),
            payload=body.payload,
            trace_id=trace_id,
            route_result="duplicate_hit",
        )
        _record_trace_event(
            request,
            trace_id=trace_id,
            owner_user_id=actor_user_id,
            event_type="iap.duplicate",
            actor_user_id=actor_user_id,
            actor_agent_id=from_agent_id,
            status="duplicate_hit",
            summary=f"IAP 请求命中去重：{body.intent or 'collab.request'}",
            payload=body.payload,
        )
        message_store = getattr(request.app.state, "message_store", None)
        if message_store is not None:
            message_store.record_event(
                status="iap_duplicate",
                user_id=actor_user_id,
                source_user_name=actor_user_name,
                target_user_name="",
                detail=str(body.intent or ""),
                task_id=str(msg.get("msg_id") or ""),
                trace_id=trace_id,
                conversation_key="",
                route_result="duplicate_hit",
            )
        return {"ok": True, "duplicate": True, "item": msg}

    item = store.create_iap_message(
        from_agent_id=from_agent_id,
        to_agent_id=to_agent_id,
        owner_user_id=actor_user_id,
        intent=str(body.intent or "collab.request"),
        payload=body.payload,
        trace_id=trace_id,
        route_result="queued",
    )
    msg_id = str(item.get("msg_id") or "")
    conversation_key, session_id = _conversation_key_for_iap(
        intent=str(body.intent or ""),
        from_agent_id=from_agent_id,
        to_agent_id=to_agent_id,
        payload=body.payload,
        msg_id=msg_id,
    )
    room_title = str(body.payload.get("title") or body.payload.get("topic") or body.intent or conversation_key)
    room_type = "collab" if str(body.intent or "").startswith("collab") else "iap"
    to_owner = str(to_agent.get("owner_user_id") or "")
    room = _ensure_room_context(
        request,
        room_key=conversation_key,
        title=room_title,
        room_type=room_type,
        owner_user_id=actor_user_id,
        trace_id=trace_id,
        session_id=session_id,
        source_agent_id=from_agent_id,
        target_agent_id=to_agent_id,
        actor_user_id=actor_user_id,
        actor_user_name=actor_user_name,
        target_user_id=to_owner,
        target_user_name=str(body.payload.get("target_user_name") or to_owner),
        metadata={
            "intent": str(body.intent or ""),
            "conversation_key": conversation_key,
        },
    )
    room_id = str(room.get("room_id") or "") if room else ""
    _append_room_event(
        request,
        room_id=room_id,
        event_type="iap.created",
        summary=f"创建 IAP 请求：{body.intent or 'collab.request'}",
        trace_id=trace_id,
        actor_user_id=actor_user_id,
        actor_agent_id=from_agent_id,
        payload={
            "intent": str(body.intent or ""),
            "to_agent_id": to_agent_id,
            "msg_id": msg_id,
            "conversation_key": conversation_key,
            "payload": body.payload,
        },
    )
    _record_trace_event(
        request,
        trace_id=trace_id,
        owner_user_id=actor_user_id,
        room_id=room_id,
        event_type="iap.created",
        actor_user_id=actor_user_id,
        actor_agent_id=from_agent_id,
        status="created",
        summary=f"创建 IAP 请求：{body.intent or 'collab.request'}",
        payload={
            "to_agent_id": to_agent_id,
            "msg_id": msg_id,
            "conversation_key": conversation_key,
        },
    )

    route_result = "routed"
    response_payload: dict[str, Any] = {}
    if to_agent_id == "so:enterprise":
        reply = _public_memory_excerpt(str(body.payload.get("question") or body.payload.get("content") or ""))
        response_payload = {"reply": reply}
        route_result = "so_replied"
        await _notify_target_user(
            request=request,
            target_user_id=actor_user_id,
            source_user_id="",
            source_user_name="系统Agent",
            from_agent_id="so:enterprise",
            to_agent_id=from_agent_id,
            msg_id=msg_id,
            trace_id=trace_id,
            intent="so.reply",
            text=reply,
            conversation_key=conversation_key,
            session_id=session_id,
            extra_payload=body.payload,
        )
    elif to_owner:
        # ---- 自沟通拦截：VSA 转给自己的PIA 时，跳过通知推送 ----
        if to_owner == actor_user_id and str(body.intent or "").startswith("vsa."):
            route_result = "routed_to_self_pia"
            response_payload = {"note": "VSA self-target, notify skipped"}
            logger.info(
                "IAP self-target (VSA): actor=%s → pia:%s, skipping notify, trace=%s",
                actor_user_id,
                actor_user_id,
                trace_id,
            )
        else:
            text = _build_iap_push_text(str(body.intent or ""), body.payload)
            await _notify_target_user(
                request=request,
                target_user_id=to_owner,
                source_user_id=actor_user_id,
                source_user_name=actor_user_name,
                from_agent_id=from_agent_id,
                to_agent_id=to_agent_id,
                msg_id=msg_id,
                trace_id=trace_id,
                intent=str(body.intent or ""),
                text=text,
                conversation_key=conversation_key,
                session_id=session_id,
            )
    else:
        route_result = "target_offline"
        response_payload = {"error": "target_offline"}

    updated = store.update_iap_result(
        msg_id=msg_id,
        route_result=route_result,
        response_payload=response_payload,
    )
    message_store = getattr(request.app.state, "message_store", None)
    if message_store is not None:
        message_store.record_event(
            status="iap_route",
            user_id=actor_user_id,
            source_user_name=actor_user_name,
            target_user_name="",
            detail=str(body.intent or ""),
            task_id=msg_id,
            trace_id=trace_id,
            conversation_key=conversation_key,
            route_result=route_result,
        )
    _append_room_event(
        request,
        room_id=room_id,
        event_type="iap.routed",
        summary=f"IAP 路由结果：{route_result}",
        trace_id=trace_id,
        actor_user_id=actor_user_id,
        actor_agent_id=from_agent_id,
        payload={
            "intent": str(body.intent or ""),
            "msg_id": msg_id,
            "route_result": route_result,
            "response_payload": response_payload,
        },
    )
    _record_trace_event(
        request,
        trace_id=trace_id,
        owner_user_id=actor_user_id,
        room_id=room_id,
        event_type="iap.routed",
        actor_user_id=actor_user_id,
        actor_agent_id=from_agent_id,
        status=route_result,
        summary=f"IAP 路由结果：{route_result}",
        payload={
            "intent": str(body.intent or ""),
            "msg_id": msg_id,
            "response_payload": response_payload,
        },
    )
    return {"ok": True, "duplicate": False, "item": updated or item}


@router.post("/collab/request")
def send_collab_request(
    body: CollabRequestBody,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    target_user_id = str(body.target_user_id or "").strip()
    if not target_user_id:
        raise HTTPException(status_code=400, detail="target_user_id is required")
    envelope = IAPEnvelopeBody(
        to_agent_id=f"pia:{target_user_id}",
        intent="collab.request",
        trace_id=body.trace_id,
        payload={
            "topic": str(body.topic or "").strip(),
            "title": str(body.topic or "").strip(),
            "content": str(body.content or "").strip(),
        },
        allow_cross_user=True,
    )
    return send_iap_envelope(envelope, request, current_user)


@router.get("/iap/messages")
def list_iap_messages(
    request: Request,
    owner_user_id: str = Query(default=""),
    limit: int = Query(default=100, ge=1, le=500),
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    store = _require_agent_os_store(request)
    actor_user_id = str(current_user.get("user_id") or "")
    if _is_admin(current_user):
        owner = str(owner_user_id or "")
    else:
        owner = actor_user_id
    items = store.list_iap_messages(owner_user_id=owner, limit=limit)
    return {"items": items, "total": len(items)}


@router.get("/iap/summary")
def get_iap_summary(
    request: Request,
    owner_user_id: str = Query(default=""),
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    store = _require_agent_os_store(request)
    actor_user_id = str(current_user.get("user_id") or "")
    owner = str(owner_user_id or "") if _is_admin(current_user) else actor_user_id
    summary = store.summarize_iap(owner_user_id=owner)
    return {"summary": summary}


@router.get("/plans")
def list_plans(
    request: Request,
    owner_user_id: str = Query(default=""),
    room_id: str = Query(default=""),
    trace_id: str = Query(default=""),
    session_id: str = Query(default=""),
    status: str = Query(default=""),
    limit: int = Query(default=100, ge=1, le=500),
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    store = _require_agent_os_store(request)
    actor_user_id = str(current_user.get("user_id") or "")
    owner = str(owner_user_id or "") if _is_admin(current_user) else actor_user_id
    items = store.list_plans(
        owner_user_id=owner,
        room_id=str(room_id or ""),
        trace_id=str(trace_id or ""),
        session_id=str(session_id or ""),
        status=str(status or ""),
        limit=limit,
    )
    return {"items": items, "total": len(items)}


@router.post("/plans")
def create_plan(
    body: PlanCreateBody,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    store = _require_agent_os_store(request)
    room_store = _require_room_store(request)
    actor_user_id = str(current_user.get("user_id") or "")
    actor_user_name = str(current_user.get("name") or actor_user_id or "员工")
    trace_id = str(body.trace_id or uuid.uuid4())
    room_id = str(body.room_id or "").strip()
    room = room_store.get_room(room_id) if room_id else None
    if room is not None:
        _ensure_room_access(room, current_user)
    if room is None:
        room = _ensure_room_context(
            request,
            room_key=f"plan:{body.session_id or trace_id}",
            title=str(body.title or body.goal or "执行计划"),
            room_type="plan",
            owner_user_id=actor_user_id,
            trace_id=trace_id,
            session_id=str(body.session_id or ""),
            source_agent_id=f"pia:{actor_user_id}",
            target_agent_id="so:enterprise",
            actor_user_id=actor_user_id,
            actor_user_name=actor_user_name,
            metadata={"source": str(body.source or "manual")},
        )
    room_id = str((room or {}).get("room_id") or "")
    plan = store.create_plan(
        owner_user_id=actor_user_id,
        title=str(body.title or body.goal or "执行计划"),
        goal=str(body.goal or ""),
        room_id=room_id,
        trace_id=trace_id,
        session_id=str(body.session_id or (room or {}).get("session_id") or ""),
        status=str(body.status or "draft"),
        source=str(body.source or "manual"),
        steps=body.steps,
        metadata=body.metadata,
    )
    _append_room_event(
        request,
        room_id=room_id,
        event_type="plan.created",
        summary=f"新增计划：{plan.get('title') or plan.get('plan_id')}",
        trace_id=trace_id,
        actor_user_id=actor_user_id,
        actor_agent_id=f"pia:{actor_user_id}",
        payload=plan,
    )
    _record_trace_event(
        request,
        trace_id=trace_id,
        owner_user_id=actor_user_id,
        room_id=room_id,
        event_type="plan.created",
        actor_user_id=actor_user_id,
        actor_agent_id=f"pia:{actor_user_id}",
        status=str(plan.get("status") or "draft"),
        summary=f"新增计划：{plan.get('title') or plan.get('plan_id')}",
        payload=plan,
    )
    return {"item": plan, "room": room}


@router.get("/plans/{plan_id}")
def get_plan_detail(
    plan_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    store = _require_agent_os_store(request)
    plan = store.get_plan(plan_id)
    if plan is None:
        raise HTTPException(status_code=404, detail="plan not found")
    if not _is_admin(current_user) and str(plan.get("owner_user_id") or "") != str(current_user.get("user_id") or ""):
        raise HTTPException(status_code=403, detail="无权访问该计划")
    room = None
    room_id = str(plan.get("room_id") or "")
    if room_id:
        room = _require_room_store(request).get_room(room_id)
    return {"item": plan, "room": room}


@router.post("/plans/{plan_id}/execute")
def execute_plan(
    plan_id: str,
    body: PlanExecuteBody,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    store = _require_agent_os_store(request)
    plan = store.get_plan(plan_id)
    if plan is None:
        raise HTTPException(status_code=404, detail="plan not found")
    actor_user_id = str(current_user.get("user_id") or "")
    if not _is_admin(current_user) and str(plan.get("owner_user_id") or "") != actor_user_id:
        raise HTTPException(status_code=403, detail="无权执行该计划")
    next_status = str(body.status or "queued")
    updated = store.update_plan_status(
        plan_id=plan_id,
        status=next_status,
        metadata={
            **(body.metadata if isinstance(body.metadata, dict) else {}),
            "last_execute_user_id": actor_user_id,
        },
    )
    trace_id = str((updated or {}).get("trace_id") or plan.get("trace_id") or uuid.uuid4())
    room_id = str((updated or {}).get("room_id") or plan.get("room_id") or "")
    _append_room_event(
        request,
        room_id=room_id,
        event_type="plan.execution_requested",
        summary=f"计划已进入执行队列：{(updated or plan).get('title') or plan_id}",
        trace_id=trace_id,
        actor_user_id=actor_user_id,
        actor_agent_id=f"pia:{actor_user_id}",
        payload=updated or plan,
    )
    _record_trace_event(
        request,
        trace_id=trace_id,
        owner_user_id=str((updated or plan).get("owner_user_id") or actor_user_id),
        room_id=room_id,
        event_type="plan.execution_requested",
        actor_user_id=actor_user_id,
        actor_agent_id=f"pia:{actor_user_id}",
        status=next_status,
        summary=f"计划已进入执行队列：{(updated or plan).get('title') or plan_id}",
        payload=updated or plan,
    )
    return {"ok": True, "item": updated or plan}


@router.get("/rooms")
def list_rooms(
    request: Request,
    owner_user_id: str = Query(default=""),
    status: str = Query(default=""),
    room_type: str = Query(default=""),
    limit: int = Query(default=100, ge=1, le=500),
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    room_store = _require_room_store(request)
    actor_user_id = str(current_user.get("user_id") or "")
    owner = str(owner_user_id or "") if _is_admin(current_user) else actor_user_id
    items = room_store.list_rooms(owner_user_id=owner, status=status, room_type=room_type, limit=limit)
    return {"items": items, "total": len(items)}


@router.post("/rooms")
def create_room(
    body: RoomCreateBody,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    room_store = _require_room_store(request)
    actor_user_id = str(current_user.get("user_id") or "")
    actor_user_name = str(current_user.get("name") or actor_user_id or "员工")
    trace_id = str(body.trace_id or uuid.uuid4())
    room = room_store.ensure_room(
        room_key=str(body.room_key or f"room:{trace_id}"),
        title=str(body.title or "协作任务"),
        room_type=str(body.room_type or "collab"),
        status=str(body.status or "active"),
        owner_user_id=actor_user_id,
        trace_id=trace_id,
        session_id=str(body.session_id or ""),
        metadata=body.metadata,
    )
    room_id = str(room.get("room_id") or "")
    room_store.upsert_member(
        room_id=room_id,
        member_id=actor_user_id,
        member_type="user",
        role="owner",
        display_name=actor_user_name,
    )
    _append_room_event(
        request,
        room_id=room_id,
        event_type="room.created",
        summary=f"创建协作 room：{room.get('title') or room.get('room_key') or room_id}",
        trace_id=trace_id,
        actor_user_id=actor_user_id,
        payload=body.metadata,
    )
    _record_trace_event(
        request,
        trace_id=trace_id,
        owner_user_id=actor_user_id,
        room_id=room_id,
        event_type="room.created",
        actor_user_id=actor_user_id,
        status="created",
        summary=f"创建协作 room：{room.get('title') or room.get('room_key') or room_id}",
        payload=body.metadata,
    )
    return {"item": room, "members": room_store.list_members(room_id)}


@router.get("/rooms/{room_id}")
def get_room_detail(
    room_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    room_store = _require_room_store(request)
    room = room_store.get_room(room_id)
    _ensure_room_access(room, current_user)
    return {
        "item": room,
        "members": room_store.list_members(room_id),
    }


@router.get("/rooms/{room_id}/events")
def list_room_events(
    room_id: str,
    request: Request,
    limit: int = Query(default=200, ge=1, le=1000),
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    room_store = _require_room_store(request)
    room = room_store.get_room(room_id)
    _ensure_room_access(room, current_user)
    items = room_store.list_events(room_id, limit=limit)
    return {"items": items, "total": len(items), "room": room}


@router.post("/rooms/{room_id}/events")
def create_room_event(
    room_id: str,
    body: RoomEventBody,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    room_store = _require_room_store(request)
    room = room_store.get_room(room_id)
    _ensure_room_access(room, current_user)
    actor_user_id = str(current_user.get("user_id") or "")
    trace_id = str(body.trace_id or room.get("trace_id") or uuid.uuid4())
    item = room_store.append_event(
        room_id=room_id,
        event_type=str(body.event_type or "room.event"),
        actor_user_id=actor_user_id,
        actor_agent_id=str(body.actor_agent_id or ""),
        trace_id=trace_id,
        summary=str(body.summary or body.event_type),
        payload=body.payload,
    )
    _record_trace_event(
        request,
        trace_id=trace_id,
        owner_user_id=str(room.get("owner_user_id") or actor_user_id),
        room_id=room_id,
        event_type=str(body.event_type or "room.event"),
        actor_user_id=actor_user_id,
        actor_agent_id=str(body.actor_agent_id or ""),
        status="recorded",
        summary=str(body.summary or body.event_type),
        payload=body.payload,
    )
    return {"item": item}


@router.get("/artifacts")
def list_artifacts(
    request: Request,
    room_id: str = Query(default=""),
    trace_id: str = Query(default=""),
    limit: int = Query(default=100, ge=1, le=500),
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    artifact_store = _require_artifact_store(request)
    actor_user_id = str(current_user.get("user_id") or "")
    owner_user_id = "" if _is_admin(current_user) else actor_user_id
    items = artifact_store.list_artifacts(
        owner_user_id=owner_user_id,
        room_id=room_id,
        trace_id=trace_id,
        limit=limit,
    )
    return {"items": items, "total": len(items)}


@router.post("/artifacts")
def create_artifact(
    body: ArtifactCreateBody,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    artifact_store = _require_artifact_store(request)
    actor_user_id = str(current_user.get("user_id") or "")
    trace_id = str(body.trace_id or uuid.uuid4())
    item = artifact_store.create_artifact(
        room_id=str(body.room_id or ""),
        trace_id=trace_id,
        owner_user_id=actor_user_id,
        step_id=str(body.step_id or ""),
        artifact_type=str(body.artifact_type or "note"),
        title=str(body.title or "未命名产物"),
        uri=str(body.uri or ""),
        mime_type=str(body.mime_type or ""),
        metadata=body.metadata,
    )
    if body.room_id:
        _append_room_event(
            request,
            room_id=str(body.room_id),
            event_type="artifact.created",
            summary=f"新增产物：{item.get('title') or item.get('artifact_id')}",
            trace_id=trace_id,
            actor_user_id=actor_user_id,
            payload=item,
        )
    _record_trace_event(
        request,
        trace_id=trace_id,
        owner_user_id=actor_user_id,
        room_id=str(body.room_id or ""),
        event_type="artifact.created",
        actor_user_id=actor_user_id,
        status="created",
        summary=f"新增产物：{item.get('title') or item.get('artifact_id')}",
        payload=item,
    )
    return {"item": item}


@router.get("/traces")
def list_traces(
    request: Request,
    owner_user_id: str = Query(default=""),
    room_id: str = Query(default=""),
    status: str = Query(default=""),
    limit: int = Query(default=100, ge=1, le=500),
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    observability_store = _require_observability_store(request)
    actor_user_id = str(current_user.get("user_id") or "")
    owner = str(owner_user_id or "") if _is_admin(current_user) else actor_user_id
    items = observability_store.list_traces(
        owner_user_id=owner,
        room_id=str(room_id or ""),
        status=str(status or ""),
        limit=limit,
    )
    return {"items": items, "total": len(items)}


@router.get("/evals")
def list_evals(
    request: Request,
    owner_user_id: str = Query(default=""),
    trace_id: str = Query(default=""),
    status: str = Query(default=""),
    limit: int = Query(default=100, ge=1, le=500),
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    eval_store = _require_eval_store(request)
    actor_user_id = str(current_user.get("user_id") or "")
    owner = str(owner_user_id or "") if _is_admin(current_user) else actor_user_id
    items = eval_store.list_evals(
        owner_user_id=owner,
        trace_id=str(trace_id or ""),
        status=str(status or ""),
        limit=limit,
    )
    return {"items": items, "total": len(items)}


@router.post("/evals")
def create_eval(
    body: EvalCreateBody,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    eval_store = _require_eval_store(request)
    actor_user_id = str(current_user.get("user_id") or "")
    trace_id = str(body.trace_id or uuid.uuid4())
    room_id = str(body.room_id or "")
    item = eval_store.create_eval(
        trace_id=trace_id,
        room_id=room_id,
        owner_user_id=actor_user_id,
        title=str(body.title or "链路评测"),
        status=str(body.status or "queued"),
        dataset=str(body.dataset or ""),
        metric=str(body.metric or ""),
        summary=str(body.summary or ""),
        metadata=body.metadata,
    )
    if room_id:
        _append_room_event(
            request,
            room_id=room_id,
            event_type="eval.created",
            summary=f"新增评测：{item.get('title') or item.get('eval_id')}",
            trace_id=trace_id,
            actor_user_id=actor_user_id,
            actor_agent_id=f"pia:{actor_user_id}",
            payload=item,
        )
    _record_trace_event(
        request,
        trace_id=trace_id,
        owner_user_id=actor_user_id,
        room_id=room_id,
        event_type="eval.created",
        actor_user_id=actor_user_id,
        actor_agent_id=f"pia:{actor_user_id}",
        status=str(item.get("status") or "queued"),
        summary=f"新增评测：{item.get('title') or item.get('eval_id')}",
        payload=item,
    )
    return {"item": item}


@router.get("/replays")
def list_replays(
    request: Request,
    owner_user_id: str = Query(default=""),
    trace_id: str = Query(default=""),
    status: str = Query(default=""),
    limit: int = Query(default=100, ge=1, le=500),
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    eval_store = _require_eval_store(request)
    actor_user_id = str(current_user.get("user_id") or "")
    owner = str(owner_user_id or "") if _is_admin(current_user) else actor_user_id
    items = eval_store.list_replays(
        owner_user_id=owner,
        trace_id=str(trace_id or ""),
        status=str(status or ""),
        limit=limit,
    )
    return {"items": items, "total": len(items)}


@router.post("/replays")
def create_replay(
    body: ReplayCreateBody,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    eval_store = _require_eval_store(request)
    actor_user_id = str(current_user.get("user_id") or "")
    trace_id = str(body.trace_id or uuid.uuid4())
    room_id = str(body.room_id or "")
    item = eval_store.create_replay(
        trace_id=trace_id,
        room_id=room_id,
        owner_user_id=actor_user_id,
        title=str(body.title or "链路回放"),
        status=str(body.status or "queued"),
        source=str(body.source or "manual"),
        summary=str(body.summary or ""),
        metadata=body.metadata,
    )
    if room_id:
        _append_room_event(
            request,
            room_id=room_id,
            event_type="replay.created",
            summary=f"新增回放：{item.get('title') or item.get('replay_id')}",
            trace_id=trace_id,
            actor_user_id=actor_user_id,
            actor_agent_id=f"pia:{actor_user_id}",
            payload=item,
        )
    _record_trace_event(
        request,
        trace_id=trace_id,
        owner_user_id=actor_user_id,
        room_id=room_id,
        event_type="replay.created",
        actor_user_id=actor_user_id,
        actor_agent_id=f"pia:{actor_user_id}",
        status=str(item.get("status") or "queued"),
        summary=f"新增回放：{item.get('title') or item.get('replay_id')}",
        payload=item,
    )
    return {"item": item}


@router.get("/traces/{trace_id}")
def get_trace_detail(
    trace_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    observability_store = _require_observability_store(request)
    actor_user_id = str(current_user.get("user_id") or "")
    owner_user_id = "" if _is_admin(current_user) else actor_user_id
    return observability_store.get_trace_summary(trace_id=trace_id, owner_user_id=owner_user_id)


@router.post("/so/query-public-info")
def so_query_public_info(
    body: SOQueryBody,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    payload = IAPEnvelopeBody(
        to_agent_id="so:enterprise",
        intent="so.query_public_info",
        trace_id=body.trace_id,
        payload={"question": body.question},
        allow_cross_user=True,
    )
    return send_iap_envelope(payload, request, current_user)


@router.post("/so/dispatch")
def so_dispatch_task(
    body: SODispatchBody,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Only admin can dispatch SO tasks")
    payload = IAPEnvelopeBody(
        to_agent_id=f"pia:{body.target_user_id}",
        from_agent_id="so:enterprise",
        intent="so.dispatch_task",
        trace_id=body.trace_id,
        payload={
            "title": body.title,
            "content": body.content,
            "topic": body.title,
        },
        allow_cross_user=True,
    )
    return send_iap_envelope(payload, request, current_user)


@router.get("/audit/routes")
def audit_route_events(
    request: Request,
    days: int = Query(default=30, ge=1, le=365),
    limit: int = Query(default=200, ge=1, le=1000),
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    store = getattr(request.app.state, "message_store", None)
    if store is None:
        return {"items": [], "total": 0}
    actor_user_id = str(current_user.get("user_id") or "")
    items = store.recent_route_events(
        user_id="" if _is_admin(current_user) else actor_user_id,
        days=days,
        limit=limit,
    )
    return {"items": items, "total": len(items), "days": days}


@router.get("/audit/duplicate-hits")
def audit_duplicate_hits(
    request: Request,
    days: int = Query(default=30, ge=1, le=365),
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    store = getattr(request.app.state, "message_store", None)
    if store is None:
        return {"duplicate_hit_count": 0, "days": days}
    actor_user_id = str(current_user.get("user_id") or "")
    stats = store.duplicate_hit_stats(
        user_id="" if _is_admin(current_user) else actor_user_id,
        days=days,
    )
    return {**stats, "days": days}


@router.post("/audit/routes/cleanup")
def cleanup_route_events(
    request: Request,
    keep_days: int = Query(default=30, ge=1, le=365),
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Only admin can cleanup route logs")
    store = getattr(request.app.state, "message_store", None)
    if store is None:
        return {"deleted": 0, "keep_days": keep_days}
    deleted = store.cleanup_old_route_events(keep_days=keep_days)
    return {"deleted": int(deleted), "keep_days": keep_days}
