# -*- coding: utf-8 -*-
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI

from copaw.app import notification_service
from copaw.app.message_queue_store import MessageQueueStore
from copaw.agents import notification_agent


async def test_dispatch_notify_command_writes_event_bus(tmp_path, monkeypatch) -> None:
    event_bus = tmp_path / "event_bus.md"
    monkeypatch.setattr(notification_service, "EVENT_BUS_FILE", event_bus)
    monkeypatch.setattr(
        notification_service,
        "parse_notify_command",
        lambda _msg: ("贺柏鑫", "明天下午3点开会"),
    )
    monkeypatch.setattr(
        notification_service,
        "get_user_name_by_id_or_profile_id",
        lambda _uid: "陈文豪",
    )

    result = await notification_service.dispatch_notify_command(
        user_message="通知贺柏鑫明天下午3点开会",
        current_user_id="11",
    )

    assert result is not None
    text = event_bus.read_text(encoding="utf-8")
    assert "@通知Agent" in text
    assert "@陈文豪" in text
    assert "@贺柏鑫" in text
    assert "task_id:" in text


async def test_notification_agent_enqueue_and_events(tmp_path, monkeypatch) -> None:
    store = MessageQueueStore(Path(tmp_path) / "mq.db")
    app = FastAPI()
    app.state.message_store = store
    notification_agent.set_app_instance(app)

    def _mock_users(name: str):
        if name == "贺柏鑫":
            return [{"id": 2, "name": "贺柏鑫"}]
        if name == "陈文豪":
            return [{"id": 1, "name": "陈文豪"}]
        return []

    monkeypatch.setattr(notification_agent, "get_users_by_name", _mock_users)
    async def _rewrite(
        *,
        source_user_name: str,
        target_user_name: str,
        raw_message: str,
    ) -> str:
        _ = source_user_name
        _ = target_user_name
        return raw_message

    monkeypatch.setattr(notification_agent, "rewrite_notification_message", _rewrite)

    await notification_agent.handle_notification_task(
        "- [ ] @通知Agent: 用户 @陈文豪 请 @贺柏鑫 明天下午3点开会 <!--task_id:abc-001-->"
    )

    messages = store.pull_messages("2")
    assert len(messages) == 1
    assert messages[0]["source_user_id"] == "1"
    assert "明天下午3点开会" in messages[0]["text"]
    events = store.recent_events(user_id="2", limit=5)
    assert any(e["status"] == "queued" for e in events)


async def test_notification_agent_target_not_found_records_event(tmp_path, monkeypatch) -> None:
    store = MessageQueueStore(Path(tmp_path) / "mq.db")
    app = FastAPI()
    app.state.message_store = store
    notification_agent.set_app_instance(app)
    monkeypatch.setattr(notification_agent, "get_users_by_name", lambda _name: [])

    await notification_agent.handle_notification_task(
        "- [ ] @通知Agent: 用户 @陈文豪 请 @不存在的人 下午开会 <!--task_id:abc-404-->"
    )

    events = store.recent_events(limit=10)
    assert any(e["status"] == "target_not_found" for e in events)
