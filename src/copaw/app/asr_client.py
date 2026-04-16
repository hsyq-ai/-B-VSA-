# -*- coding: utf-8 -*-
from __future__ import annotations

import base64
import os
from typing import Any

import httpx


def _get_env(name: str, default: str = "") -> str:
    return str(os.getenv(name, default) or "").strip()


class ASRClient:
    """Simple ASR client wrapper (vLLM or custom HTTP endpoint)."""

    def __init__(self) -> None:
        self.base_url = _get_env("COPAW_ASR_BASE_URL", "http://127.0.0.1:8000").rstrip(
            "/"
        )
        model = _get_env("COPAW_ASR_MODEL", "")
        if not model:
            model = "Qwen3-ASR-0.6B"
            model_dir = _get_env("COPAW_ASR_MODEL_DIR", "")
            if model_dir:
                candidate = os.path.join(
                    model_dir,
                    "Qwen",
                    "Qwen3-ASR-0.6B",
                )
                if os.path.exists(candidate):
                    model = candidate
        self.model = model
        self.mode = _get_env("COPAW_ASR_MODE", "openai").lower()  # openai | json
        self.timeout = float(_get_env("COPAW_ASR_TIMEOUT", "60"))
        self._resolved_from_server = False

    async def _resolve_model_from_server(self) -> None:
        if self._resolved_from_server:
            return
        url = f"{self.base_url}/v1/models"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json() or {}
            models = data.get("data") or []
            if not models:
                return
            model_id = models[0].get("id") if isinstance(models[0], dict) else None
            if model_id:
                self.model = str(model_id)
                self._resolved_from_server = True

    async def transcribe(
        self,
        audio_bytes: bytes,
        filename: str,
        content_type: str,
        language: str | None = None,
        prompt: str | None = None,
    ) -> dict[str, Any]:
        if self.mode == "json":
            payload = {
                "model": self.model,
                "audio": base64.b64encode(audio_bytes).decode("utf-8"),
            }
            if language:
                payload["language"] = language
            if prompt:
                payload["prompt"] = prompt
            url = f"{self.base_url}/asr"
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(url, json=payload)
                resp.raise_for_status()
                return resp.json()

        # default: OpenAI-style audio transcription endpoint
        url = f"{self.base_url}/v1/audio/transcriptions"
        data = {"model": self.model}
        if language:
            data["language"] = language
        if prompt:
            data["prompt"] = prompt
        files = {"file": (filename, audio_bytes, content_type)}
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                resp = await client.post(url, data=data, files=files)
                resp.raise_for_status()
                return resp.json()
            except httpx.HTTPStatusError as exc:
                if exc.response is not None and exc.response.status_code == 404:
                    await self._resolve_model_from_server()
                    data["model"] = self.model
                    resp = await client.post(url, data=data, files=files)
                    resp.raise_for_status()
                    return resp.json()
                raise


_client: ASRClient | None = None


def get_asr_client() -> ASRClient:
    global _client
    if _client is None:
        _client = ASRClient()
    return _client
