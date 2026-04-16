# -*- coding: utf-8 -*-
from __future__ import annotations

from copaw.app.agent_os_store import AgentOSStore


def test_collab_conversation_key_stable() -> None:
    key1 = AgentOSStore.build_collab_conversation_key(
        from_agent_id="pia:1",
        to_agent_id="pia:2",
        topic="固态电池 氧化物 研究",
    )
    key2 = AgentOSStore.build_collab_conversation_key(
        from_agent_id="pia:1",
        to_agent_id="pia:2",
        topic="固态电池 氧化物 研究",
    )
    assert key1 == key2
    assert key1.startswith("collab:pia:1:pia:2:")


def test_agent_registry_and_iap_duplicate(tmp_path) -> None:
    store = AgentOSStore(
        db_path=tmp_path / "agent_os.db",
        runtime_root=tmp_path / "runtime",
    )
    pia = store.ensure_user_pia(
        user_id="101",
        profile_id="201",
        department="科研部",
    )
    assert pia["agent_id"] == "pia:101"
    assert pia["owner_user_id"] == "101"
    assert "memory" in str(pia["memory_root"])
    assert "sandbox" in str(pia["sandbox_ref"])

    so = store.ensure_system_agent()
    assert so["agent_id"] == "so:enterprise"

    msg = store.create_iap_message(
        from_agent_id="pia:101",
        to_agent_id="so:enterprise",
        owner_user_id="101",
        intent="so.query_public_info",
        payload={"question": "制度"},
        trace_id="trace-abc",
        route_result="queued",
    )
    assert msg["trace_id"] == "trace-abc"
    assert msg["route_result"] == "queued"

    dup = store.find_recent_duplicate(
        trace_id="trace-abc",
        from_agent_id="pia:101",
        to_agent_id="so:enterprise",
        intent="so.query_public_info",
        owner_user_id="101",
    )
    assert dup is not None
    assert dup["trace_id"] == "trace-abc"

    updated = store.update_iap_result(
        msg_id=str(msg["msg_id"]),
        route_result="so_replied",
        response_payload={"reply": "ok"},
    )
    assert updated is not None
    assert updated["route_result"] == "so_replied"
