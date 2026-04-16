# -*- coding: utf-8 -*-
"""
统计 Agent：执行统计类任务并将结果推送给目标用户。
任务格式：- [ ] @统计Agent: 请 @用户名 统计当前公司有多少员工
"""
import re
import logging
from copaw.app.auth_db import get_users_by_name, get_employee_count
from fastapi import FastAPI

app: FastAPI = None


def set_app_instance(app_instance: FastAPI):
    global app
    app = app_instance


logger = logging.getLogger(__name__)


async def handle_stats_task(task_content: str):
    """
    执行统计任务并将结果推送给目标用户。
    支持：统计当前公司有多少员工
    """
    if not app or not hasattr(app.state, "message_store"):
        logger.error("App instance or message store not set.")
        return

    logger.info(f"Handling stats task: {task_content}")

    # 解析目标用户：请 @用户名 统计...
    match = re.search(r"请\s*@(\w+)\s+(.*)", task_content)
    if not match:
        logger.warning(f"Could not parse stats task: {task_content}")
        return

    target_user_name = match.group(1)
    task_desc = match.group(2).strip()

    users = get_users_by_name(target_user_name)
    if not users:
        logger.warning(f"User '{target_user_name}' not found.")
        return

    target_user_id = str(users[0]["id"])

    # 执行统计
    result_msg: str
    if "员工" in task_desc or "人数" in task_desc or "多少人" in task_desc:
        count = get_employee_count()
        result_msg = f"【统计结果】当前公司共有 {count} 名员工（已激活状态）。"
    else:
        result_msg = f"【统计结果】暂不支持该统计任务：{task_desc}"

    try:
        app.state.message_store.enqueue_message(target_user_id, {"text": result_msg})
        logger.info(
            f"Queued stats result for user {target_user_id} ({target_user_name}): {result_msg}"
        )
    except Exception as e:
        logger.error(
            "Failed to enqueue stats result for user %s: %s",
            target_user_id,
            e,
        )
