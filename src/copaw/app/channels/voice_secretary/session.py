# -*- coding: utf-8 -*-
from __future__ import annotations

import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any


@dataclass
class VoiceSecretarySession:
    session_id: str
    user_id: str
    agent_id: str
    status: str = "idle"
    processing: bool = False
    last_user_text: str = ""
    last_spoken: str = ""
    last_candidate_text: str = ""
    last_committed_text: str = ""
    stagnant_turn_count: int = 0
    idle_streak: int = 0
    current_tts_request_id: str = ""
    last_turn_state: dict[str, Any] = field(default_factory=dict)
    last_screen: dict[str, Any] = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    def touch(self) -> None:
        self.updated_at = time.time()


class VoiceSecretarySessionManager:
    def __init__(self) -> None:
        self._sessions: dict[str, VoiceSecretarySession] = {}
        self._lock = threading.Lock()

    def create_session(self, *, user_id: str, agent_id: str) -> VoiceSecretarySession:
        session = VoiceSecretarySession(
            session_id=f"vsa-ws-{uuid.uuid4().hex[:12]}",
            user_id=str(user_id or ""),
            agent_id=str(agent_id or ""),
        )
        with self._lock:
            self._sessions[session.session_id] = session
        return session

    def get_session(self, session_id: str) -> VoiceSecretarySession | None:
        with self._lock:
            return self._sessions.get(str(session_id))

    def update_session(
        self,
        session_id: str,
        *,
        status: str | None = None,
        processing: bool | None = None,
        last_user_text: str | None = None,
        last_candidate_text: str | None = None,
        last_committed_text: str | None = None,
        stagnant_turn_count: int | None = None,
        idle_streak: int | None = None,
        current_tts_request_id: str | None = None,
        last_turn_state: dict[str, Any] | None = None,
        last_screen: dict[str, Any] | None = None,
        last_spoken: str | None = None,
    ) -> VoiceSecretarySession | None:
        with self._lock:
            session = self._sessions.get(str(session_id))
            if session is None:
                return None
            if status is not None:
                session.status = str(status or session.status)
            if processing is not None:
                session.processing = bool(processing)
            if last_user_text is not None:
                session.last_user_text = str(last_user_text or "")
            if last_candidate_text is not None:
                session.last_candidate_text = str(last_candidate_text or "")
            if last_committed_text is not None:
                session.last_committed_text = str(last_committed_text or "")
            if stagnant_turn_count is not None:
                session.stagnant_turn_count = max(int(stagnant_turn_count), 0)
            if idle_streak is not None:
                session.idle_streak = max(int(idle_streak), 0)
            if current_tts_request_id is not None:
                session.current_tts_request_id = str(current_tts_request_id or "")
            if last_turn_state is not None:
                session.last_turn_state = dict(last_turn_state or {})
            if last_screen is not None:
                session.last_screen = dict(last_screen or {})
            if last_spoken is not None:
                session.last_spoken = str(last_spoken or "")
            session.touch()
            return session

    def end_session(self, session_id: str) -> VoiceSecretarySession | None:
        with self._lock:
            return self._sessions.pop(str(session_id), None)
