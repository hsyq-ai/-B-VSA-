# -*- coding: utf-8 -*-
from __future__ import annotations

import os
import subprocess
from pathlib import Path
from time import perf_counter
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from .auth import get_current_user
from ..asr_client import get_asr_client

router = APIRouter(prefix="/asr", tags=["asr"])


def _max_audio_bytes() -> int:
    return int(os.getenv("COPAW_ASR_MAX_BYTES", "10485760"))  # 10 MB


def _needs_transcode(filename: str, content_type: str) -> bool:
    name = (filename or "").lower()
    if content_type in {"audio/webm", "video/webm", "audio/ogg"}:
        return True
    if name.endswith((".webm", ".ogg")):
        return True
    return False


def _transcode_to_wav(data: bytes) -> bytes:
    """Transcode to 16k mono wav via ffmpeg (for webm/ogg)."""
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        "pipe:0",
        "-f",
        "wav",
        "-ac",
        "1",
        "-ar",
        "16000",
        "pipe:1",
    ]
    try:
        proc = subprocess.run(
            cmd,
            input=data,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True,
        )
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=500,
            detail="ffmpeg not found (required to decode webm/ogg audio)",
        ) from exc
    except subprocess.CalledProcessError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Audio decode failed: {exc.stderr.decode('utf-8', 'ignore')[:200]}",
        ) from exc
    return proc.stdout


@router.post("/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    lang: str | None = None,
    prompt: str | None = None,
    _current=Depends(get_current_user),
) -> dict[str, Any]:
    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="Missing audio file")
    content_type = file.content_type or ""
    if not content_type.startswith("audio/") and not content_type.startswith("video/"):
        raise HTTPException(status_code=400, detail="Invalid audio type")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty audio file")
    if len(data) > _max_audio_bytes():
        raise HTTPException(status_code=413, detail="Audio file too large")

    filename = file.filename
    if _needs_transcode(file.filename, content_type):
        data = _transcode_to_wav(data)
        content_type = "audio/wav"
        filename = "speech.wav"

    client = get_asr_client()
    start = perf_counter()
    try:
        result = await client.transcribe(
            audio_bytes=data,
            filename=filename or "speech.wav",
            content_type=content_type,
            language=lang,
            prompt=prompt,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"ASR failed: {exc}") from exc

    text = (
        (result.get("text") if isinstance(result, dict) else None)
        or result.get("transcript")
        or result.get("data", {}).get("text")
        if isinstance(result, dict)
        else None
    )

    return {
        "text": text or "",
        "duration_ms": int((perf_counter() - start) * 1000),
        "model": result.get("model") if isinstance(result, dict) else None,
        "raw": result,
    }
