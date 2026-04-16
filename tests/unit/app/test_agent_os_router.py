# -*- coding: utf-8 -*-
from __future__ import annotations

import threading
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Callable, TypeVar

import pytest
from fastapi import HTTPException

from copaw.app.agent_os_store import AgentOSStore
from copaw.app.message_queue_store import MessageQueueStore
from copaw.app.routers import agent_os as agent_os_module

T = TypeVar("T")


def _run_with_timeout(fn: Callable[[], T], timeout_seconds: float = 5.0) -> T:
    result: dict[str, T] = {}
    error: dict[str, BaseException] = {}

    def _target() -> None:
        try:
            result["value"] = fn()
        except BaseException as exc:  # pragma: no cover - propagated below
            error["exc"] = exc

    thread = threading.Thread(target=_target, daemon=True)
    thread.start()
    thread.join(timeout_seconds)
    if thread.is_alive():
        raise AssertionError(f"测试超时：超过 {timeout_seconds:.1f}s 仍未返回")
    if error:
        raise error["exc"]
    return result["value"]


def _build_context(tmp_path: Path, current_user: dict[str, Any] | None = None) -> tuple[Any, dict[str, Any]]:
    app = SimpleNamespace(
        state=SimpleNamespace(
            agent_os_store=AgentOSStore(
                db_path=tmp_path / "agent_os.db",
                runtime_root=tmp_path / "agent_os_runtime",
            ),
            message_store=MessageQueueStore(tmp_path / "message_queue.db"),
        ),
    )
    request = SimpleNamespace(app=app)
    user = current_user or {
        "user_id": "u1",
        "name": "测试用户A",
        "role": "employee",
        "profile_id": "p1",
        "department": "科研部",
    }
    return request, user


def test_conversation_key_for_iap_rules() -> None:
    task_key, task_session = agent_os_module._conversation_key_for_iap(
        intent="task.dispatch",
        from_agent_id="pia:u1",
        to_agent_id="pia:u2",
        payload={"task_id": "task-001"},
        msg_id="m-1",
    )
    assert task_key == "task:task-001"
    assert task_session == "console:task:task-001"

    collab_key, collab_session = agent_os_module._conversation_key_for_iap(
        intent="collab.request",
        from_agent_id="pia:u1",
        to_agent_id="pia:u2",
        payload={"topic": "氧化物"},
        msg_id="m-2",
    )
    assert collab_key.startswith("collab:pia:u1:pia:u2:")
    assert collab_session.startswith("console:collab:pia:u1:pia:u2:")

    notif_key, notif_session = agent_os_module._conversation_key_for_iap(
        intent="notify",
        from_agent_id="pia:u1",
        to_agent_id="so:enterprise",
        payload={},
        msg_id="m-3",
    )
    assert notif_key == "notif:m-3"
    assert notif_session == "console:notif:m-3"


def test_so_query_public_info_routes_reply(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(
        agent_os_module,
        "_public_memory_excerpt",
        lambda question: f"SO应答: {question}",
    )
    monkeypatch.setattr(
        agent_os_module,
        "get_user_context_by_user_id",
        lambda uid: {"profile_id": f"p_{uid}", "department": "科研部"},
    )
    request, current_user = _build_context(tmp_path)

    def _call() -> dict[str, Any]:
        body = agent_os_module.SOQueryBody(question="固态电池最新进展")
        return agent_os_module.so_query_public_info(
            body=body,
            request=request,
            current_user=current_user,
        )

    response = _run_with_timeout(_call)
    assert response["ok"] is True
    assert response["duplicate"] is False
    assert response["item"]["route_result"] == "so_replied"

    queued = request.app.state.message_store.pull_messages("u1")
    assert len(queued) == 1
    assert queued[0]["source_agent_id"] == "so:enterprise"
    assert queued[0]["target_agent_id"] == "pia:u1"
    assert queued[0]["intent_type"] == "so.reply"
    assert queued[0]["push_conversation_key"].startswith("notif:")


def test_cross_user_send_denied_by_default(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(
        agent_os_module,
        "get_user_context_by_user_id",
        lambda uid: {"profile_id": f"p_{uid}", "department": "科研部"},
    )
    request, current_user = _build_context(tmp_path)

    def _call() -> dict[str, Any]:
        body = agent_os_module.IAPEnvelopeBody(
            to_agent_id="pia:u2",
            intent="collab.request",
            payload={"topic": "实验复现"},
        )
        return agent_os_module.send_iap_envelope(
            body=body,
            request=request,
            current_user=current_user,
        )

    with pytest.raises(HTTPException) as excinfo:
        _run_with_timeout(_call)
    assert excinfo.value.status_code == 403
    assert "跨员工访问默认拒绝" in str(excinfo.value.detail)


def test_collab_request_allows_cross_user_and_queues_message(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(
        agent_os_module,
        "get_user_context_by_user_id",
        lambda uid: {"profile_id": f"p_{uid}", "department": "科研部"},
    )
    request, current_user = _build_context(tmp_path)

    def _call() -> dict[str, Any]:
        body = agent_os_module.CollabRequestBody(
            target_user_id="u2",
            topic="氧化物路线评估",
            content="请协助汇总近两年关键论文",
        )
        return agent_os_module.send_collab_request(
            body=body,
            request=request,
            current_user=current_user,
        )

    response = _run_with_timeout(_call)
    assert response["ok"] is True
    assert response["item"]["route_result"] == "routed"
    assert response["item"]["intent"] == "collab.request"

    queued = request.app.state.message_store.pull_messages("u2")
    assert len(queued) == 1
    assert queued[0]["source_agent_id"] == "pia:u1"
    assert queued[0]["target_agent_id"] == "pia:u2"
    assert queued[0]["push_conversation_key"].startswith("collab:pia:u1:pia:u2:")
    assert "协作请求" in str(queued[0]["text"])


def test_iap_duplicate_hit_and_audit_stats(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(
        agent_os_module,
        "_public_memory_excerpt",
        lambda question: f"SO应答: {question}",
    )
    monkeypatch.setattr(
        agent_os_module,
        "get_user_context_by_user_id",
        lambda uid: {"profile_id": f"p_{uid}", "department": "科研部"},
    )
    request, current_user = _build_context(tmp_path)

    payload = {
        "to_agent_id": "so:enterprise",
        "intent": "so.query_public_info",
        "trace_id": "trace-dup-1",
        "payload": {"question": "实验室制度"},
        "allow_cross_user": True,
    }

    def _call_once() -> dict[str, Any]:
        body = agent_os_module.IAPEnvelopeBody(**payload)
        return agent_os_module.send_iap_envelope(
            body=body,
            request=request,
            current_user=current_user,
        )

    first = _run_with_timeout(_call_once)
    second = _run_with_timeout(_call_once)
    assert first["duplicate"] is False
    assert second["duplicate"] is True
    assert second["item"]["route_result"] == "duplicate_hit"

    audit = request.app.state.message_store.recent_route_events(
        user_id=current_user["user_id"],
        days=30,
        limit=20,
    )
    assert any(row["route_result"] == "duplicate_hit" for row in audit)
