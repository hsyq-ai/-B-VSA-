# -*- coding: utf-8 -*-
from __future__ import annotations

import jwt

from copaw.app.runner import api as runner_api


def test_auth_claims_returns_user_and_profile(tmp_path, monkeypatch) -> None:
    secret_path = tmp_path / "jwt_secret"
    secret = "unit-test-secret-key-length-over-32"
    secret_path.write_text(secret, encoding="utf-8")
    monkeypatch.setattr(runner_api, "_JWT_SECRET_PATH", secret_path)
    token = jwt.encode(
        {"user_id": 11, "profile_id": 101, "status": "active"},
        secret,
        algorithm="HS256",
    )
    claims = runner_api._auth_claims(f"Bearer {token}")
    assert claims["user_id"] == "11"
    assert claims["profile_id"] == "101"


def test_owns_chat_accepts_legacy_profile_owner() -> None:
    claims = {"user_id": "11", "profile_id": "101"}
    assert runner_api._owns_chat("11", claims) is True
    assert runner_api._owns_chat("101", claims) is True
    assert runner_api._owns_chat("999", claims) is False
