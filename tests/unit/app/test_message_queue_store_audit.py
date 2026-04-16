# -*- coding: utf-8 -*-
from __future__ import annotations

import sqlite3

from copaw.app.message_queue_store import MessageQueueStore


def test_message_queue_store_route_audit_fields(tmp_path) -> None:
    db_path = tmp_path / "push_messages.db"
    store = MessageQueueStore(db_path)

    store.enqueue_message("u1", {"text": "hello"})
    messages = store.pull_messages("u1")
    assert len(messages) == 1
    assert messages[0]["text"] == "hello"

    store.record_event(
        status="iap_route",
        user_id="u1",
        source_user_name="张三",
        target_user_name="李四",
        detail="route test",
        task_id="m1",
        trace_id="trace-1",
        conversation_key="collab:pia:1:pia:2:abcdef123456",
        route_result="duplicate_hit",
    )
    latest = store.recent_events(user_id="u1", limit=1)
    assert latest
    assert latest[0]["trace_id"] == "trace-1"
    assert latest[0]["route_result"] == "duplicate_hit"

    stats = store.duplicate_hit_stats(user_id="u1", days=30)
    assert stats["duplicate_hit_count"] >= 1


def test_message_queue_store_cleanup_old_route_events(tmp_path) -> None:
    db_path = tmp_path / "push_messages.db"
    store = MessageQueueStore(db_path)
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            """
INSERT INTO push_events (
    user_id, source_user_name, target_user_name, status, detail, task_id,
    trace_id, conversation_key, route_result, created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-40 days'))
""",
            (
                "u1",
                "系统",
                "u1",
                "iap_route",
                "old",
                "old-task",
                "old-trace",
                "notif:old",
                "routed",
            ),
        )
    deleted = store.cleanup_old_route_events(keep_days=30)
    assert deleted >= 1


def test_message_queue_store_legacy_event_payload_compatible(tmp_path) -> None:
    db_path = tmp_path / "push_messages.db"
    store = MessageQueueStore(db_path)

    # Legacy callers may still omit new audit fields.
    store.record_event(
        status="queued",
        user_id="u1",
        source_user_name="张三",
        target_user_name="李四",
        detail="legacy payload",
        task_id="legacy-1",
    )
    latest = store.recent_events(user_id="u1", limit=1)
    assert latest
    assert latest[0]["trace_id"] == ""
    assert latest[0]["conversation_key"] == ""
    assert latest[0]["route_result"] == ""
