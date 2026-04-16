# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import os
import threading
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional
from uuid import uuid4

from ..constant import WORKING_DIR
from .auth_db import get_user_name_by_id_or_profile_id, get_user_context_by_user_id

_LOCK = threading.Lock()

_EVENTS_DIR = WORKING_DIR / "events"
_EVENT_STREAM = WORKING_DIR / "event_stream.jsonl"
_MEMORY_DIR = WORKING_DIR / "memory"
_EMPLOYEE_DIR = _MEMORY_DIR / "employees"
_ORG_DIR = _MEMORY_DIR / "org"
_DEPT_DIR = _ORG_DIR / "departments"


def _safe_segment(name: str) -> str:
    base = (name or "").strip() or "unknown"
    cleaned = "".join(ch for ch in base if ch not in "\\/:*?\"<>|\n\r\t")
    cleaned = cleaned.replace(" ", "_")
    return cleaned[:100] or "unknown"


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_header(path: Path, title: str) -> None:
    if path.exists():
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"# {title}\n\n", encoding="utf-8")


def _append_line(path: Path, line: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(line)


def _format_summary(
    event_type: str,
    payload: dict[str, Any],
    fallback: str = "",
) -> str:
    if event_type == "chat_user_message":
        text = str(payload.get("text") or "").strip()
        if text:
            return f"发起对话：{text[:120]}"
        attachments = payload.get("attachment_ids") or []
        if attachments:
            return f"发送附件消息（{len(attachments)} 个附件）"
        return "发送对话消息"
    if event_type == "file_upload":
        name = str(payload.get("original_name") or payload.get("name") or "")
        if name:
            return f"上传文件：{name}"
        return "上传文件"
    if event_type == "notification":
        text = str(payload.get("text") or "").strip()
        return f"发送通知：{text[:120]}" if text else "发送通知"
    return fallback or event_type


def log_event(
    *,
    event_type: str,
    actor_user_id: str,
    session_id: str = "",
    payload: Optional[dict[str, Any]] = None,
    summary: Optional[str] = None,
    intent_tag: str = "",
    source: str = "",
    reasoning: str = "",
) -> None:
    if not event_type:
        return
    actor_user_id = str(actor_user_id or "")
    ts = _now_utc()
    ts_iso = ts.isoformat()
    event_id = str(uuid4())
    actor_name = (
        get_user_name_by_id_or_profile_id(actor_user_id)
        if actor_user_id
        else ""
    )
    actor_context = get_user_context_by_user_id(actor_user_id) if actor_user_id else None
    department = str(actor_context.get("department") or "") if actor_context else ""
    position = str(actor_context.get("position") or "") if actor_context else ""
    payload = payload or {}
    final_summary = summary or _format_summary(event_type, payload, event_type)

    record = {
        "event_version": "1.0",
        "event_id": event_id,
        "ts_utc": ts_iso,
        "actor_user_id": actor_user_id,
        "actor_user_name": actor_name,
        "department": department,
        "position": position,
        "session_id": str(session_id or ""),
        "event_type": event_type,
        "summary": final_summary,
        "intent_tag": str(intent_tag or ""),
        "source": str(source or ""),
        "reasoning": str(reasoning or ""),
        "payload": payload,
    }

    date_str = ts.date().isoformat()
    time_str = ts.strftime("%H:%M:%S")

    events_path = _EVENTS_DIR / f"{date_str}.jsonl"
    employee_daily = (
        _EMPLOYEE_DIR / actor_user_id / "daily" / f"{date_str}.md"
        if actor_user_id
        else None
    )
    org_daily = _ORG_DIR / "daily" / f"{date_str}.md"
    org_index = _ORG_DIR / "index.json"
    dept_name = department or "未分配"
    dept_slug = _safe_segment(dept_name)
    dept_daily = _DEPT_DIR / dept_slug / "daily" / f"{date_str}.md"
    org_summary = _ORG_DIR / "daily" / f"{date_str}.summary.md"
    dept_summary = _DEPT_DIR / dept_slug / "daily" / f"{date_str}.summary.md"

    with _LOCK:
        try:
            _EVENT_STREAM.parent.mkdir(parents=True, exist_ok=True)
            record["event_hash"] = _compute_hash(record)
            with _EVENT_STREAM.open("a", encoding="utf-8") as f:
                f.write(json.dumps(record, ensure_ascii=False) + "\n")
            _EVENTS_DIR.mkdir(parents=True, exist_ok=True)
            with events_path.open("a", encoding="utf-8") as f:
                f.write(json.dumps(record, ensure_ascii=False) + "\n")

            if os.getenv("COPAW_MEMORY_FROM_STREAM", "").strip() != "1":
                _project_event_to_memory(
                    record=record,
                    date_str=date_str,
                    time_str=time_str,
                    events_path=events_path,
                    org_summary=org_summary,
                    dept_summary=dept_summary,
                    dept_name=dept_name,
                    org_daily=org_daily,
                    dept_daily=dept_daily,
                    employee_daily=employee_daily,
                    org_index=org_index,
                )
        except OSError:
            # In restricted environments (e.g. read-only mount), event persistence
            # should not interrupt primary business logic.
            return


def _read_events(events_path: Path) -> list[dict[str, Any]]:
    if not events_path.exists():
        return []
    events: list[dict[str, Any]] = []
    for line in events_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            events.append(json.loads(line))
        except Exception:
            continue
    return events


def _compute_hash(record: dict[str, Any]) -> str:
    data = dict(record)
    data.pop("event_hash", None)
    serialized = json.dumps(data, ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def _parse_event_ts(ts_str: str) -> datetime:
    if not ts_str:
        return _now_utc()
    try:
        ts = datetime.fromisoformat(ts_str)
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        return ts
    except Exception:
        return _now_utc()


def project_event_to_memory(record: dict[str, Any]) -> None:
    """Project a stored event into memory files and org index."""
    if not record:
        return
    ts = _parse_event_ts(str(record.get("ts_utc") or ""))
    date_str = ts.date().isoformat()
    time_str = ts.strftime("%H:%M:%S")
    events_path = _EVENTS_DIR / f"{date_str}.jsonl"
    org_summary = _ORG_DIR / "daily" / f"{date_str}.summary.md"
    dept_name = str(record.get("department") or "未分配")
    dept_slug = _safe_segment(dept_name)
    dept_summary = _DEPT_DIR / dept_slug / "daily" / f"{date_str}.summary.md"
    org_daily = _ORG_DIR / "daily" / f"{date_str}.md"
    dept_daily = _DEPT_DIR / dept_slug / "daily" / f"{date_str}.md"
    actor_user_id = str(record.get("actor_user_id") or "")
    employee_daily = (
        _EMPLOYEE_DIR / actor_user_id / "daily" / f"{date_str}.md"
        if actor_user_id
        else None
    )
    org_index = _ORG_DIR / "index.json"
    with _LOCK:
        _project_event_to_memory(
            record=record,
            date_str=date_str,
            time_str=time_str,
            events_path=events_path,
            org_summary=org_summary,
            dept_summary=dept_summary,
            dept_name=dept_name,
            org_daily=org_daily,
            dept_daily=dept_daily,
            employee_daily=employee_daily,
            org_index=org_index,
        )


def _project_event_to_memory(
    *,
    record: dict[str, Any],
    date_str: str,
    time_str: str,
    events_path: Path,
    org_summary: Path,
    dept_summary: Path,
    dept_name: str,
    org_daily: Path,
    dept_daily: Path,
    employee_daily: Optional[Path],
    org_index: Path,
) -> None:
    summary = str(record.get("summary") or record.get("event_type") or "")
    session_id = str(record.get("session_id") or "")
    actor_name = str(record.get("actor_user_name") or "")
    actor_user_id = str(record.get("actor_user_id") or "")
    actor_label = actor_name or actor_user_id or "未知员工"

    if employee_daily:
        _ensure_header(employee_daily, f"{date_str} 员工记忆")
        _append_line(
            employee_daily,
            f"- {time_str} {summary} "
            f"(session={session_id or '-'})\n",
        )

    _ensure_header(org_daily, f"{date_str} 组织记忆")
    _append_line(
        org_daily,
        f"- {time_str} [{actor_label}] {summary} "
        f"(session={session_id or '-'})\n",
    )

    if dept_name:
        _ensure_header(dept_daily, f"{date_str} {dept_name} 记忆")
        _append_line(
            dept_daily,
            f"- {time_str} [{actor_label}] {summary} "
            f"(session={session_id or '-'})\n",
        )

    try:
        org_index.parent.mkdir(parents=True, exist_ok=True)
        if org_index.exists():
            data = json.loads(org_index.read_text(encoding="utf-8"))
        else:
            data = {}
    except Exception:
        data = {}
    data["last_event_ts"] = str(record.get("ts_utc") or "")
    data["last_event_id"] = str(record.get("event_id") or "")
    data["last_event_summary"] = summary
    data["total_events"] = int(data.get("total_events") or 0) + 1
    dept_stats = data.get("departments") if isinstance(data.get("departments"), dict) else {}
    dept_entry = dept_stats.get(dept_name, {})
    dept_entry["last_event_ts"] = str(record.get("ts_utc") or "")
    dept_entry["total_events"] = int(dept_entry.get("total_events") or 0) + 1
    dept_stats[dept_name] = dept_entry
    data["departments"] = dept_stats
    org_index.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    _refresh_daily_summaries(
        date_str=date_str,
        events_path=events_path,
        org_summary=org_summary,
        dept_summary=dept_summary,
        dept_name=dept_name,
    )


def _refresh_daily_summaries(
    *,
    date_str: str,
    events_path: Path,
    org_summary: Path,
    dept_summary: Path,
    dept_name: str,
) -> None:
    events = _read_events(events_path)
    if not events:
        return

    total = len(events)
    type_counts: dict[str, int] = {}
    dept_counts: dict[str, int] = {}
    actor_counts: dict[str, int] = {}
    for ev in events:
        etype = str(ev.get("event_type") or "")
        type_counts[etype] = type_counts.get(etype, 0) + 1
        dept = str(ev.get("department") or "未分配")
        dept_counts[dept] = dept_counts.get(dept, 0) + 1
        actor = str(ev.get("actor_user_name") or ev.get("actor_user_id") or "")
        if actor:
            actor_counts[actor] = actor_counts.get(actor, 0) + 1

    recent = events[-10:]
    lines = [
        f"# {date_str} 组织日报摘要\n\n",
        f"- 总事件数：{total}\n",
        f"- 活跃员工数：{len(actor_counts)}\n",
        f"- 活跃部门数：{len(dept_counts)}\n\n",
        "## 按事件类型统计\n",
    ]
    for etype, count in sorted(type_counts.items(), key=lambda x: (-x[1], x[0])):
        lines.append(f"- {etype}: {count}\n")
    lines.append("\n## 按部门统计\n")
    for dname, count in sorted(dept_counts.items(), key=lambda x: (-x[1], x[0])):
        lines.append(f"- {dname}: {count}\n")
    lines.append("\n## 最近事件\n")
    for ev in recent:
        ts = str(ev.get("ts_utc") or "")
        time_short = ts.split("T")[-1].split(".")[0] if "T" in ts else ts
        actor = str(ev.get("actor_user_name") or ev.get("actor_user_id") or "未知员工")
        summary = str(ev.get("summary") or ev.get("event_type") or "")
        lines.append(f"- {time_short} [{actor}] {summary}\n")
    org_summary.parent.mkdir(parents=True, exist_ok=True)
    org_summary.write_text("".join(lines), encoding="utf-8")

    dept_events = [ev for ev in events if str(ev.get("department") or "未分配") == dept_name]
    if not dept_events:
        return
    dept_total = len(dept_events)
    dept_type_counts: dict[str, int] = {}
    dept_actor_counts: dict[str, int] = {}
    for ev in dept_events:
        etype = str(ev.get("event_type") or "")
        dept_type_counts[etype] = dept_type_counts.get(etype, 0) + 1
        actor = str(ev.get("actor_user_name") or ev.get("actor_user_id") or "")
        if actor:
            dept_actor_counts[actor] = dept_actor_counts.get(actor, 0) + 1
    dept_recent = dept_events[-10:]
    dept_lines = [
        f"# {date_str} {dept_name} 部门摘要\n\n",
        f"- 总事件数：{dept_total}\n",
        f"- 活跃员工数：{len(dept_actor_counts)}\n\n",
        "## 按事件类型统计\n",
    ]
    for etype, count in sorted(dept_type_counts.items(), key=lambda x: (-x[1], x[0])):
        dept_lines.append(f"- {etype}: {count}\n")
    dept_lines.append("\n## 最近事件\n")
    for ev in dept_recent:
        ts = str(ev.get("ts_utc") or "")
        time_short = ts.split("T")[-1].split(".")[0] if "T" in ts else ts
        actor = str(ev.get("actor_user_name") or ev.get("actor_user_id") or "未知员工")
        summary = str(ev.get("summary") or ev.get("event_type") or "")
        dept_lines.append(f"- {time_short} [{actor}] {summary}\n")
    dept_summary.parent.mkdir(parents=True, exist_ok=True)
    dept_summary.write_text("".join(dept_lines), encoding="utf-8")
