# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import logging
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request

from .auth import _require_admin, get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sandbox", tags=["sandbox"])

_ENV_ROOT = Path("/home/featurize/work/aifscie/env")


def _run_docker(args: list[str], timeout: int = 15) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["docker", *args],
        check=False,
        text=True,
        capture_output=True,
        timeout=timeout,
    )


def _parse_time(value: str | None) -> str:
    if not value:
        return ""
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return dt.astimezone(timezone.utc).isoformat()
    except Exception:
        return value


def _read_marker(host_working_dir: str | None) -> dict[str, Any]:
    if not host_working_dir:
        return {"path": "", "timestamp": 0, "text": ""}
    marker = Path(host_working_dir) / "logs" / "last_active_at.txt"
    if not marker.exists():
        return {"path": str(marker), "timestamp": 0, "text": ""}
    try:
        ts = int(marker.stat().st_mtime)
        text = marker.read_text(encoding="utf-8", errors="ignore").strip()
    except Exception:
        ts = 0
        text = ""
    return {"path": str(marker), "timestamp": ts, "text": text}


def _inspect_container(cid: str) -> dict[str, Any] | None:
    proc = _run_docker(["inspect", cid], timeout=10)
    if proc.returncode != 0 or not proc.stdout.strip():
        return None
    try:
        data = json.loads(proc.stdout)[0]
    except Exception:
        return None

    labels = data.get("Config", {}).get("Labels", {}) or {}
    mounts = data.get("Mounts", []) or []
    host_working_dir = ""
    host_logs_dir = ""
    for mount in mounts:
        destination = str(mount.get("Destination") or "")
        source = str(mount.get("Source") or "")
        if destination == "/app/working":
            host_working_dir = source
        if destination == "/app/logs":
            host_logs_dir = source
    marker = _read_marker(host_working_dir or host_logs_dir)

    ports: list[str] = []
    port_map = data.get("NetworkSettings", {}).get("Ports", {}) or {}
    for container_port, bindings in port_map.items():
        if not bindings:
            ports.append(str(container_port))
            continue
        for bind in bindings:
            host_ip = str(bind.get("HostIp") or "")
            host_port = str(bind.get("HostPort") or "")
            if host_ip:
                ports.append(f"{host_ip}:{host_port}->{container_port}")
            else:
                ports.append(f"{host_port}->{container_port}")

    logs_proc = _run_docker(["logs", "--tail", "40", cid], timeout=12)
    logs_text = logs_proc.stdout.strip() if logs_proc.returncode == 0 else logs_proc.stderr.strip()

    state = data.get("State", {}) or {}
    started_at = _parse_time(state.get("StartedAt"))
    finished_at = _parse_time(state.get("FinishedAt"))

    return {
        "container_id": str(data.get("Id") or cid),
        "name": str(data.get("Name") or "").lstrip("/"),
        "image": str(data.get("Config", {}).get("Image") or ""),
        "role": str(labels.get("aifscie.sandbox.role") or ""),
        "user_id": str(labels.get("aifscie.sandbox.user_id") or ""),
        "managed": str(labels.get("aifscie.sandbox.managed") or "") == "true",
        "status": str(state.get("Status") or ""),
        "running": bool(state.get("Running")),
        "restarting": bool(state.get("Restarting")),
        "exit_code": int(state.get("ExitCode") or 0),
        "started_at": started_at,
        "finished_at": finished_at,
        "health": str(state.get("Health", {}).get("Status") or ""),
        "ports": ports,
        "last_active": marker,
        "logs_tail": logs_text,
        "working_dir": host_working_dir or host_logs_dir,
    }


@router.get("/overview")
def get_sandbox_overview(
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> dict[str, Any]:
    _require_admin(current)
    proc = _run_docker(
        ["ps", "-a", "--filter", "label=aifscie.sandbox.managed=true", "--format", "{{.ID}}"],
        timeout=10,
    )
    if proc.returncode != 0:
        raise HTTPException(status_code=503, detail="Docker unavailable")

    items: list[dict[str, Any]] = []
    for cid in [line.strip() for line in proc.stdout.splitlines() if line.strip()]:
        item = _inspect_container(cid)
        if item is not None:
            items.append(item)

    items.sort(key=lambda x: (0 if x.get("role") == "so" else 1, str(x.get("user_id") or ""), str(x.get("name") or "")))
    return {"items": items, "total": len(items)}
