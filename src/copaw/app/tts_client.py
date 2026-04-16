# -*- coding: utf-8 -*-
from __future__ import annotations

import asyncio
import base64
import io
import logging
import os
import site
import sys
import threading
from collections.abc import AsyncIterator
from typing import Any

logger = logging.getLogger(__name__)

_CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
_PROJECT_ROOT = os.path.abspath(os.path.join(_CURRENT_DIR, "../../.."))
_WORK_SYNC_ROOT = os.path.dirname(os.path.dirname(_PROJECT_ROOT))
_PYTHON_MM = f"python{sys.version_info.major}.{sys.version_info.minor}"
_WORKSPACE_USER_SITE = os.path.join(_WORK_SYNC_ROOT, ".local", "lib", _PYTHON_MM, "site-packages")
_HOME_USER_SITE = os.path.expanduser(os.path.join("~", ".local", "lib", _PYTHON_MM, "site-packages"))
DEFAULT_VOXCPM_REPO_SRC_DIR = os.path.join(_PROJECT_ROOT, "third_party", "VoxCPM", "src")
DEFAULT_VOXCPM_MODEL_DIR = "/home/featurize/work/ethan/models/VoxCPM2"
DEFAULT_VOXCPM_PROMPT_WAV = os.path.join(_PROJECT_ROOT, "assets", "voice_secretary", "warm_female_secretary_prompt.wav")
DEFAULT_VOXCPM_PROMPT_TEXT = "您好，我是您的智能语音秘书，很高兴为您服务。接下来，我会用温柔、自然、清晰的声音，为您播报和提醒重要信息。"
DEFAULT_VOXCPM_STYLE = "A young woman, gentle and sweet voice, warm and professional secretary tone, speaking fluent Mandarin Chinese with clear articulation"
DEFAULT_VOXCPM_VOICE_LABEL = "voxcpm2_secretary"
DEFAULT_EDGE_VOICE = "zh-CN-XiaoxiaoNeural"
PCM_STREAM_FORMAT = "pcm_s16le_base64"
PCM_STREAM_MIME_TYPE = "audio/pcm"
VOXCPM_PROVIDER_ALIASES = {"voxcpm", "voxcpm2", "vox-cpm", "vox_cpm", "vox_cpm2"}
EDGE_PROVIDER_ALIASES = {"edge", "edge-tts", "edge_tts"}
_STREAM_SENTINEL = object()


def _get_env(name: str, default: str = "") -> str:
    return str(os.getenv(name, default) or "").strip()


def _get_env_bool(name: str, default: bool = True) -> bool:
    raw = _get_env(name, "1" if default else "0").lower()
    return raw not in {"", "0", "false", "no", "off"}


class TTSClient:
    """Service-side TTS wrapper for the voice secretary."""

    def __init__(self) -> None:
        self.enabled = _get_env_bool("COPAW_TTS_ENABLED", True)
        self.provider = _get_env("COPAW_TTS_PROVIDER", "voxcpm2").lower()
        self.voice = _get_env("COPAW_TTS_VOICE", DEFAULT_EDGE_VOICE)
        self.rate = _get_env("COPAW_TTS_RATE", "+0%")
        self.volume = _get_env("COPAW_TTS_VOLUME", "+0%")
        self.pitch = _get_env("COPAW_TTS_PITCH", "+0Hz")
        self.max_chars = max(int(_get_env("COPAW_TTS_MAX_CHARS", "260") or 260), 80)
        self.timeout_seconds = max(float(_get_env("COPAW_TTS_TIMEOUT_SECONDS", "30") or 30), 3.0)

        self.voxcpm_timeout_seconds = max(float(_get_env("COPAW_TTS_VOXCPM_TIMEOUT_SECONDS", "180") or 180), 30.0)
        self.voxcpm_repo_src_dir = _get_env("COPAW_TTS_VOXCPM_REPO_SRC_DIR", DEFAULT_VOXCPM_REPO_SRC_DIR)
        self.voxcpm_model_dir = _get_env("COPAW_TTS_VOXCPM_MODEL_DIR", DEFAULT_VOXCPM_MODEL_DIR)
        self.voxcpm_style = _get_env("COPAW_TTS_VOXCPM_STYLE", DEFAULT_VOXCPM_STYLE)
        self.voxcpm_voice_label = _get_env("COPAW_TTS_VOXCPM_VOICE_LABEL", DEFAULT_VOXCPM_VOICE_LABEL)
        self.voxcpm_cfg_value = float(_get_env("COPAW_TTS_VOXCPM_CFG_VALUE", "2.0") or 2.0)
        self.voxcpm_inference_timesteps = max(int(_get_env("COPAW_TTS_VOXCPM_INFERENCE_TIMESTEPS", "10") or 10), 1)
        self.voxcpm_max_len = max(int(_get_env("COPAW_TTS_VOXCPM_MAX_LEN", "2048") or 2048), 128)
        self.voxcpm_optimize = _get_env_bool("COPAW_TTS_VOXCPM_OPTIMIZE", False)
        self.voxcpm_load_denoiser = _get_env_bool("COPAW_TTS_VOXCPM_LOAD_DENOISER", False)
        self.voxcpm_normalize = _get_env_bool("COPAW_TTS_VOXCPM_NORMALIZE", False)
        self.voxcpm_retry_badcase = _get_env_bool("COPAW_TTS_VOXCPM_RETRY_BADCASE", True)
        self.voxcpm_device = _get_env("COPAW_TTS_VOXCPM_DEVICE", "cuda") or "cuda"
        self.voxcpm_prompt_wav = _get_env("COPAW_TTS_VOXCPM_PROMPT_WAV", DEFAULT_VOXCPM_PROMPT_WAV)
        self.voxcpm_prompt_text = _get_env("COPAW_TTS_VOXCPM_PROMPT_TEXT", DEFAULT_VOXCPM_PROMPT_TEXT)
        self.voxcpm_reference_wav = _get_env("COPAW_TTS_VOXCPM_REFERENCE_WAV", "")
        self.voxcpm_use_prompt_as_reference = _get_env_bool("COPAW_TTS_VOXCPM_USE_PROMPT_AS_REFERENCE", True)
        self.voxcpm_force_style_with_conditioning = _get_env_bool(
            "COPAW_TTS_VOXCPM_FORCE_STYLE_WITH_CONDITIONING", False
        )

        self._voxcpm_model: Any | None = None
        self._voxcpm_model_lock = threading.Lock()

    async def synthesize(self, text: str) -> dict[str, Any] | None:
        normalized = str(text or "").strip()
        if not self.enabled or not normalized:
            return None
        spoken_text = normalized[: self.max_chars]
        if self._is_voxcpm_provider():
            try:
                return await asyncio.wait_for(
                    asyncio.to_thread(self._synthesize_voxcpm_sync, spoken_text),
                    timeout=self.voxcpm_timeout_seconds,
                )
            except TimeoutError:
                logger.warning(
                    "VoxCPM synthesis timed out provider=%s timeout=%ss",
                    self.provider,
                    self.voxcpm_timeout_seconds,
                )
                return None
            except Exception:
                logger.warning("VoxCPM synthesis failed provider=%s", self.provider, exc_info=True)
                return None
        if self.provider in EDGE_PROVIDER_ALIASES:
            return await self._synthesize_edge(spoken_text)
        logger.warning("Unsupported TTS provider=%s, skipping synthesis", self.provider)
        return None

    async def stream_synthesize(self, text: str) -> AsyncIterator[dict[str, Any]]:
        normalized = str(text or "").strip()
        if not self.enabled or not normalized:
            return
        spoken_text = normalized[: self.max_chars]
        if self._is_voxcpm_provider():
            async for event in self._stream_voxcpm_async(spoken_text):
                yield event
            return
        if self.provider in EDGE_PROVIDER_ALIASES:
            audio_payload = await self._synthesize_edge(spoken_text)
            if not audio_payload:
                return
            yield {
                "event": "start",
                "provider": str(audio_payload.get("provider") or "edge-tts"),
                "mime_type": str(audio_payload.get("mime_type") or "audio/mpeg"),
                "format": "binary_base64",
                "voice": str(audio_payload.get("voice") or self.voice),
            }
            yield {
                "event": "chunk",
                "seq": 1,
                "data": str(audio_payload.get("data") or ""),
                "is_final": True,
            }
            yield {"event": "end"}
            return
        logger.warning("Unsupported TTS stream provider=%s, skipping synthesis", self.provider)

    async def _stream_voxcpm_async(self, spoken_text: str) -> AsyncIterator[dict[str, Any]]:
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue[dict[str, Any] | object] = asyncio.Queue()
        stop_event = threading.Event()

        def _publish(item: dict[str, Any] | object) -> None:
            loop.call_soon_threadsafe(queue.put_nowait, item)

        def _worker() -> None:
            try:
                model = self._get_voxcpm_runtime()
                sample_rate = self._get_voxcpm_sample_rate(model)
                _publish(
                    {
                        "event": "start",
                        "provider": "voxcpm2",
                        "voice": self.voxcpm_voice_label,
                        "mime_type": PCM_STREAM_MIME_TYPE,
                        "format": PCM_STREAM_FORMAT,
                        "sample_rate": sample_rate,
                        "channels": 1,
                    }
                )
                seq = 0
                for chunk in model.generate_streaming(**self._build_voxcpm_generate_kwargs(spoken_text)):
                    if stop_event.is_set():
                        break
                    pcm_base64 = self._waveform_to_pcm_base64(chunk)
                    if not pcm_base64:
                        continue
                    seq += 1
                    _publish(
                        {
                            "event": "chunk",
                            "seq": seq,
                            "data": pcm_base64,
                            "is_final": False,
                        }
                    )
                _publish({"event": "end"})
            except Exception as exc:
                logger.warning("VoxCPM stream synthesis failed provider=%s", self.provider, exc_info=True)
                _publish(
                    {
                        "event": "error",
                        "error": str(exc or "VoxCPM synthesis failed"),
                        "provider": "voxcpm2",
                    }
                )
            finally:
                _publish(_STREAM_SENTINEL)

        worker = threading.Thread(target=_worker, daemon=True)
        worker.start()
        try:
            while True:
                item = await queue.get()
                if item is _STREAM_SENTINEL:
                    break
                if isinstance(item, dict):
                    yield item
        except asyncio.CancelledError:
            stop_event.set()
            raise
        finally:
            stop_event.set()
            worker.join(timeout=0.5)

    async def _synthesize_edge(self, spoken_text: str) -> dict[str, Any] | None:
        try:
            import edge_tts
        except Exception:
            logger.warning("edge-tts is unavailable, fallback to client-side speech", exc_info=True)
            return None

        async def _stream_audio() -> bytes:
            communicate = edge_tts.Communicate(
                spoken_text,
                voice=self.voice,
                rate=self.rate,
                volume=self.volume,
                pitch=self.pitch,
            )
            audio_bytes = bytearray()
            async for chunk in communicate.stream():
                if chunk.get("type") == "audio" and chunk.get("data"):
                    audio_bytes.extend(chunk["data"])
            return bytes(audio_bytes)

        try:
            audio_bytes = await asyncio.wait_for(_stream_audio(), timeout=self.timeout_seconds)
        except TimeoutError:
            logger.warning(
                "TTS synthesis timed out provider=%s voice=%s timeout=%ss",
                self.provider,
                self.voice,
                self.timeout_seconds,
            )
            return None
        if not audio_bytes:
            return None
        return {
            "data": base64.b64encode(audio_bytes).decode("utf-8"),
            "mime_type": "audio/mpeg",
            "provider": "edge-tts",
            "voice": self.voice,
            "text": spoken_text,
        }

    def _synthesize_voxcpm_sync(self, spoken_text: str) -> dict[str, Any] | None:
        import numpy as np
        import soundfile as soundfile

        model = self._get_voxcpm_runtime()
        kwargs = self._build_voxcpm_generate_kwargs(spoken_text)
        logger.info("VoxCPM generate text=%s", kwargs.get("text", "")[:80])
        wav = model.generate(**kwargs)
        audio = np.asarray(wav, dtype="float32").reshape(-1)
        if audio.size == 0:
            return None
        buffer = io.BytesIO()
        sample_rate = self._get_voxcpm_sample_rate(model)
        soundfile.write(buffer, audio, sample_rate, format="WAV")
        audio_bytes = buffer.getvalue()
        if not audio_bytes:
            return None
        return {
            "data": base64.b64encode(audio_bytes).decode("utf-8"),
            "mime_type": "audio/wav",
            "provider": "voxcpm2",
            "voice": self.voxcpm_voice_label,
            "text": spoken_text,
            "sample_rate": sample_rate,
        }

    def _compose_voxcpm_text(self, text: str, *, apply_style: bool = True) -> str:
        normalized = str(text or "").strip().replace("\n", " ")
        normalized = " ".join(normalized.split())
        if not apply_style:
            return normalized
        style = str(self.voxcpm_style or "").strip()
        if not style:
            return normalized
        if normalized.startswith("("):
            return normalized
        return f"({style}){normalized}"

    def _resolve_voxcpm_existing_path(self, path_value: str, label: str) -> str | None:
        path = str(path_value or "").strip()
        if not path:
            return None
        if os.path.exists(path):
            return path
        logger.warning("Configured VoxCPM %s missing path=%s, ignoring", label, path)
        return None

    def _build_voxcpm_generate_kwargs(self, spoken_text: str) -> dict[str, Any]:
        kwargs: dict[str, Any] = {
            "cfg_value": self.voxcpm_cfg_value,
            "inference_timesteps": self.voxcpm_inference_timesteps,
        }
        # 可控语音克隆：reference_wav 锁定音色 + 英文风格描述微调语调
        # 这是最稳定的音色固定方式，比纯语音设计模式更一致不漂移
        reference_wav_path = self._resolve_voxcpm_existing_path(self.voxcpm_prompt_wav, "reference_wav")
        if reference_wav_path:
            kwargs["reference_wav_path"] = reference_wav_path
        # 风格描述始终附加，控制语气和情感
        kwargs["text"] = self._compose_voxcpm_text(spoken_text, apply_style=True)
        return kwargs

    def _is_voxcpm_provider(self, provider: str | None = None) -> bool:
        active_provider = str(provider or self.provider or "").lower()
        return active_provider in VOXCPM_PROVIDER_ALIASES

    def _iter_user_site_candidates(self) -> list[str]:
        candidates = [site.getusersitepackages(), _HOME_USER_SITE, _WORKSPACE_USER_SITE]
        resolved: list[str] = []
        for candidate in candidates:
            path = str(candidate or "").strip()
            if path and path not in resolved:
                resolved.append(path)
        return resolved

    def _prepare_voxcpm_import_path(self) -> None:
        for path in self._iter_user_site_candidates():
            if path and os.path.exists(path) and path not in sys.path:
                sys.path.append(path)
        repo_src_dir = str(self.voxcpm_repo_src_dir or "").strip()
        if repo_src_dir and os.path.exists(repo_src_dir) and repo_src_dir not in sys.path:
            sys.path.append(repo_src_dir)

    def _get_voxcpm_runtime(self):
        cached = self._voxcpm_model
        if cached is not None:
            return cached
        with self._voxcpm_model_lock:
            cached = self._voxcpm_model
            if cached is not None:
                return cached
            self._prepare_voxcpm_import_path()
            from voxcpm import VoxCPM

            logger.info(
                "Loading VoxCPM model dir=%s denoise=%s device=%s",
                self.voxcpm_model_dir,
                self.voxcpm_load_denoiser,
                self.voxcpm_device,
            )
            model = VoxCPM.from_pretrained(
                self.voxcpm_model_dir,
                load_denoiser=self.voxcpm_load_denoiser,
                optimize=self.voxcpm_optimize,
                device=self.voxcpm_device,
            )
            sample_rate = self._get_voxcpm_sample_rate(model)
            logger.info("VoxCPM model loaded OK sample_rate=%d", sample_rate)
            self._voxcpm_model = model
            return model

    def _get_voxcpm_sample_rate(self, model: Any) -> int:
        tts_model = getattr(model, "tts_model", None)
        for attr in ("sample_rate", "out_sample_rate"):
            value = getattr(tts_model, attr, None)
            if value:
                return int(value)
        return 48000

    def _waveform_to_pcm_base64(self, waveform: Any) -> str:
        if waveform is None:
            return ""
        import numpy as np

        audio = np.asarray(waveform, dtype="float32").reshape(-1)
        if audio.size == 0:
            return ""
        clipped = np.clip(audio, -1.0, 1.0)
        pcm = (clipped * 32767.0).astype("<i2", copy=False)
        return base64.b64encode(pcm.tobytes()).decode("utf-8")

    def preload(self) -> None:
        if self._is_voxcpm_provider():
            self._get_voxcpm_runtime()


_client: TTSClient | None = None


def get_tts_client() -> TTSClient:
    global _client
    if _client is None:
        _client = TTSClient()
    return _client
