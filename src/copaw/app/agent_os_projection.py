# -*- coding: utf-8 -*-
from __future__ import annotations

import uuid
from typing import Any



def _to_text(value: Any) -> str:
    return str(value or "").strip()



def _merge_metadata(*parts: dict[str, Any] | None) -> dict[str, Any]:
    merged: dict[str, Any] = {}
    for part in parts:
        if isinstance(part, dict):
            merged.update(part)
    return merged



def project_agent_os_event(
    *,
    app=None,
    room_store=None,
    observability_store=None,
    owner_user_id: str,
    event_type: str,
    summary: str,
    room_key: str = "",
    room_title: str = "",
    room_type: str = "collab",
    room_status: str = "active",
    trace_id: str = "",
    session_id: str = "",
    actor_user_id: str = "",
    actor_user_name: str = "",
    actor_agent_id: str = "",
    target_user_id: str = "",
    target_user_name: str = "",
    target_agent_id: str = "",
    payload: dict[str, Any] | None = None,
    room_metadata: dict[str, Any] | None = None,
    trace_status: str = "recorded",
) -> dict[str, Any]:
    room_store = room_store or getattr(getattr(app, "state", None), "room_store", None)
    observability_store = observability_store or getattr(getattr(app, "state", None), "observability_store", None)
    if room_store is None and observability_store is None:
        return {}

    payload_dict = payload if isinstance(payload, dict) else {}
    final_trace_id = _to_text(trace_id) or str(uuid.uuid4())
    final_room_key = _to_text(room_key)
    if not final_room_key:
        if session_id:
            final_room_key = f"session:{_to_text(session_id)}"
        elif final_trace_id:
            final_room_key = f"trace:{final_trace_id}"
        else:
            final_room_key = f"room:{uuid.uuid4()}"

    final_title = (
        _to_text(room_title)
        or _to_text(payload_dict.get("title"))
        or _to_text(payload_dict.get("topic"))
        or _to_text(summary)
        or final_room_key
    )
    metadata = _merge_metadata(
        {
            "conversation_key": final_room_key,
            "session_id": _to_text(session_id),
            "trace_id": final_trace_id,
        },
        room_metadata,
    )

    room = None
    room_id = ""
    final_owner_user_id = _to_text(owner_user_id)
    if room_store is not None:
        room = room_store.ensure_room(
            room_key=final_room_key,
            title=final_title,
            room_type=_to_text(room_type) or "collab",
            status=_to_text(room_status) or "active",
            owner_user_id=final_owner_user_id,
            source_agent_id=_to_text(actor_agent_id),
            target_agent_id=_to_text(target_agent_id),
            trace_id=final_trace_id,
            session_id=_to_text(session_id),
            metadata=metadata,
        )
        room_id = _to_text((room or {}).get("room_id"))
        final_owner_user_id = _to_text((room or {}).get("owner_user_id")) or final_owner_user_id

        if actor_user_id:
            room_store.upsert_member(
                room_id=room_id,
                member_id=_to_text(actor_user_id),
                member_type="user",
                role="owner" if _to_text(actor_user_id) == final_owner_user_id else "actor",
                display_name=_to_text(actor_user_name) or _to_text(actor_user_id),
            )
        if target_user_id:
            room_store.upsert_member(
                room_id=room_id,
                member_id=_to_text(target_user_id),
                member_type="user",
                role="target",
                display_name=_to_text(target_user_name) or _to_text(target_user_id),
            )
        if actor_agent_id:
            room_store.upsert_member(
                room_id=room_id,
                member_id=_to_text(actor_agent_id),
                member_type="agent",
                role="source",
                display_name=_to_text(actor_agent_id),
            )
        if target_agent_id:
            room_store.upsert_member(
                room_id=room_id,
                member_id=_to_text(target_agent_id),
                member_type="agent",
                role="target",
                display_name=_to_text(target_agent_id),
            )

        room_event = room_store.append_event(
            room_id=room_id,
            event_type=_to_text(event_type) or "room.event",
            actor_user_id=_to_text(actor_user_id),
            actor_agent_id=_to_text(actor_agent_id),
            trace_id=final_trace_id,
            summary=_to_text(summary) or _to_text(event_type),
            payload=payload_dict,
        )
    else:
        room_event = None

    trace_event = None
    if observability_store is not None:
        trace_event = observability_store.record_event(
            trace_id=final_trace_id,
            room_id=room_id,
            owner_user_id=final_owner_user_id,
            event_type=_to_text(event_type) or "trace.event",
            actor_user_id=_to_text(actor_user_id),
            actor_agent_id=_to_text(actor_agent_id),
            status=_to_text(trace_status),
            summary=_to_text(summary) or _to_text(event_type),
            payload=payload_dict,
        )

    return {
        "room": room,
        "room_id": room_id,
        "trace_id": final_trace_id,
        "room_event": room_event,
        "trace_event": trace_event,
    }
