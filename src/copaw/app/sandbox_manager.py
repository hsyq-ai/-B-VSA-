# -*- coding: utf-8 -*-
from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_AUTO_START_ENV = "COPAW_AUTO_START_EMPLOYEE_SANDBOX"


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _script_path(name: str) -> Path:
    return _repo_root() / "sandbox" / "scripts" / name


def auto_start_enabled() -> bool:
    return str(os.getenv(_AUTO_START_ENV, "1")).strip().lower() in {"1", "true", "yes", "on"}


async def ensure_employee_sandbox_started(
    *,
    user_id: str,
    profile_id: str = "",
    user_name: str = "",
) -> dict[str, Any]:
    if not auto_start_enabled():
        return {"started": False, "skipped": True, "reason": "disabled"}
    uid = str(user_id or "").strip()
    if not uid:
        return {"started": False, "skipped": True, "reason": "missing_user_id"}

    script = _script_path("up_employee.sh")
    if not script.exists():
        logger.warning("Employee sandbox startup script not found: %s", script)
        return {"started": False, "skipped": True, "reason": "missing_script"}

    logger.info(
        "Starting employee sandbox for user_id=%s profile_id=%s user_name=%s",
        uid,
        profile_id or "",
        user_name or "",
    )
    proc = await asyncio.create_subprocess_exec(
        "bash",
        str(script),
        uid,
        cwd=str(_repo_root()),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=180)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.communicate()
        logger.warning("Employee sandbox startup timed out for user_id=%s", uid)
        return {"started": False, "skipped": False, "reason": "timeout"}

    out_text = (stdout or b"").decode("utf-8", errors="ignore").strip()
    err_text = (stderr or b"").decode("utf-8", errors="ignore").strip()
    if proc.returncode != 0:
        logger.error(
            "Employee sandbox startup failed for user_id=%s rc=%s stdout=%s stderr=%s",
            uid,
            proc.returncode,
            out_text,
            err_text,
        )
        return {
            "started": False,
            "skipped": False,
            "reason": "failed",
            "returncode": proc.returncode,
        }

    if out_text:
        logger.info("Employee sandbox startup output for user_id=%s: %s", uid, out_text)
    if err_text:
        logger.debug("Employee sandbox startup stderr for user_id=%s: %s", uid, err_text)
    return {"started": True, "skipped": False, "reason": "ok"}
