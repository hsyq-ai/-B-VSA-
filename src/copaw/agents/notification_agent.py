
import re
import logging
import uuid
from copaw.app.auth_db import get_users_by_name
from fastapi import FastAPI

from .notification_llm import rewrite_notification_message
from copaw.app.agent_os_projection import project_agent_os_event

# This is a bit of a hack to get access to the app state from outside the app context.
# In a larger application, you might use a more robust dependency injection system.
app: FastAPI = None

def set_app_instance(app_instance: FastAPI):
    global app
    app = app_instance

logger = logging.getLogger(__name__)


async def handle_notification_task(task_content: str):
    """
    Handles a notification task by parsing the content and queuing it for the target user.
    Example task_content: "@通知Agent: 用户 @来源名 请 @目标名 消息内容"
    Uses LLM to rewrite the message in a natural, butler-style tone; falls back on failure.
    """
    if not app:
        logger.error("App instance not set. Cannot handle notification.")
        return
    message_store = getattr(app.state, "message_store", None)
    if message_store is None:
        logger.error("Message store not set. Cannot handle notification.")
        return

    logger.info(f"Handling notification task: {task_content}")
    task_id_match = re.search(r"task_id:([0-9a-fA-F-]+)", task_content)
    task_id = task_id_match.group(1) if task_id_match else str(uuid.uuid4())

    match = re.search(r"请\s*@(\w+)\s+(.*)", task_content)
    if not match:
        logger.warning(f"Could not parse notification task: {task_content}")
        message_store.record_event(
            status="parse_failed",
            detail=task_content[:300],
            task_id=task_id,
            trace_id=task_id,
            route_result="parse_failed",
        )
        return

    target_user_name = match.group(1)
    message_to_send = re.sub(r"\s*<!--\s*task_id:[^>]+-->\s*$", "", match.group(2).strip())

    users = get_users_by_name(target_user_name)
    if not users:
        logger.warning(f"User '{target_user_name}' not found in the database.")
        message_store.record_event(
            status="target_not_found",
            target_user_name=target_user_name,
            detail=message_to_send[:300],
            task_id=task_id,
            trace_id=task_id,
            route_result="target_not_found",
        )
        return

    target_user_id = str(users[0]["id"])
    logger.info(f"Found user_id '{target_user_id}' for user_name '{target_user_name}'")

    source_user_match = re.search(r"用户 @(\w+)", task_content)
    source_user_name = source_user_match.group(1) if source_user_match else "系统"

    if message_to_send.startswith("【已改写】"):
        final_message = message_to_send[5:].strip()
    else:
        final_message = await rewrite_notification_message(
            source_user_name=source_user_name,
            target_user_name=target_user_name,
            raw_message=message_to_send,
        )

    source_user_id = ""
    if source_user_match:
        source_users = get_users_by_name(source_user_name)
        if source_users:
            source_user_id = str(source_users[0]["id"])
    payload = {
        "text": final_message,
        "source_user_id": source_user_id,
        "source_user_name": source_user_name,
        "message_id": task_id,
        "trace_id": task_id,
        "intent_type": "notify.dispatch",
        "source_agent_id": f"pia:{source_user_id}" if source_user_id else "system",
        "target_agent_id": f"pia:{target_user_id}",
        "push_session_id": f"console:notif:{task_id}",
        "push_conversation_key": f"notif:{task_id}",
        "message_summary": final_message[:400],
    }
    message_store.enqueue_message(target_user_id, payload)
    message_store.record_event(
        status="queued",
        user_id=target_user_id,
        source_user_name=source_user_name,
        target_user_name=target_user_name,
        detail=final_message[:300],
        task_id=task_id,
        trace_id=task_id,
        conversation_key=f"notif:{task_id}",
        route_result="routed",
    )
    project_agent_os_event(
        app=app,
        owner_user_id=source_user_id or target_user_id,
        event_type="notify.queued",
        summary=f"通知任务已入队给 {target_user_name}",
        room_key=f"notif:{task_id}",
        room_title=f"通知协作：{target_user_name}",
        room_type="notify",
        trace_id=task_id,
        session_id=f"console:notif:{task_id}",
        actor_user_id=source_user_id,
        actor_user_name=source_user_name,
        actor_agent_id=f"pia:{source_user_id}" if source_user_id else "system",
        target_user_id=target_user_id,
        target_user_name=target_user_name,
        target_agent_id=f"pia:{target_user_id}",
        trace_status="routed",
        payload={
            "task_id": task_id,
            "text": final_message,
            "intent": "notify.dispatch",
        },
        room_metadata={
            "conversation_key": f"notif:{task_id}",
            "notification_mode": "event_consumer",
        },
    )
    logger.info(
        "Queued message for user %s (%s), task_id=%s: %s...",
        target_user_id,
        target_user_name,
        task_id or "-",
        final_message[:80],
    )
