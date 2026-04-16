# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

from ..constant import WORKING_DIR


DB_PATH = WORKING_DIR / "directive_news.db"


ARTICLE_FIELDS = [
    "id",
    "channel_key",
    "title",
    "source_name",
    "origin_url",
    "published_at",
    "fetched_at",
    "content_text",
    "summary",
    "digest",
    "description",
    "level",
    "policy_type",
    "suggestion",
    "document_label",
    "importance_score",
    "content_hash",
    "extra_meta",
    "created_at",
    "updated_at",
]


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def init_directive_news_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with _get_conn() as conn:
        conn.execute(
            """
CREATE TABLE IF NOT EXISTS directive_news_articles (
    id TEXT PRIMARY KEY,
    channel_key TEXT NOT NULL,
    title TEXT NOT NULL,
    source_name TEXT,
    origin_url TEXT NOT NULL,
    published_at TEXT,
    fetched_at TEXT NOT NULL,
    content_text TEXT,
    summary TEXT,
    digest TEXT,
    description TEXT,
    level TEXT,
    policy_type TEXT,
    suggestion TEXT,
    document_label TEXT,
    importance_score REAL DEFAULT 0,
    content_hash TEXT,
    extra_meta TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
)
"""
        )
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_directive_news_articles_origin_url ON directive_news_articles(origin_url)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_directive_news_articles_channel ON directive_news_articles(channel_key, published_at DESC, updated_at DESC)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_directive_news_articles_published ON directive_news_articles(published_at DESC)"
        )
        conn.execute(
            """
CREATE TABLE IF NOT EXISTS directive_news_sync_state (
    channel_key TEXT PRIMARY KEY,
    source_name TEXT,
    last_sync_at TEXT,
    last_success_at TEXT,
    last_status TEXT,
    last_error TEXT,
    last_article_id TEXT,
    updated_at TEXT NOT NULL
)
"""
        )


def _row_to_article(row: sqlite3.Row) -> Dict[str, Any]:
    item = {field: row[field] for field in ARTICLE_FIELDS if field in row.keys()}
    extra_meta_raw = str(item.get("extra_meta") or "{}")
    try:
        item["extra_meta"] = json.loads(extra_meta_raw)
    except json.JSONDecodeError:
        item["extra_meta"] = {}
    return item


def _row_to_sync_state(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "channel_key": str(row["channel_key"] or ""),
        "source_name": str(row["source_name"] or ""),
        "last_sync_at": str(row["last_sync_at"] or ""),
        "last_success_at": str(row["last_success_at"] or ""),
        "last_status": str(row["last_status"] or ""),
        "last_error": str(row["last_error"] or ""),
        "last_article_id": str(row["last_article_id"] or ""),
        "updated_at": str(row["updated_at"] or ""),
    }


def get_article(article_id: str) -> Optional[Dict[str, Any]]:
    if not article_id:
        return None
    with _get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM directive_news_articles WHERE id = ? LIMIT 1",
            (article_id,),
        ).fetchone()
    return _row_to_article(row) if row else None


def list_articles(channel_key: str = "", limit: int = 20) -> List[Dict[str, Any]]:
    safe_limit = max(1, min(int(limit or 20), 100))
    sql = (
        "SELECT * FROM directive_news_articles "
        "WHERE (? = '' OR channel_key = ?) "
        "ORDER BY COALESCE(NULLIF(published_at, ''), fetched_at) DESC, updated_at DESC "
        "LIMIT ?"
    )
    with _get_conn() as conn:
        rows = conn.execute(sql, (channel_key, channel_key, safe_limit)).fetchall()
    return [_row_to_article(row) for row in rows]


def get_latest_article(channel_key: str) -> Optional[Dict[str, Any]]:
    items = list_articles(channel_key=channel_key, limit=1)
    return items[0] if items else None


def upsert_article(payload: Dict[str, Any]) -> Dict[str, Any]:
    init_directive_news_db()
    now = _now_iso()
    article_id = str(payload.get("id") or f"directive-news-{uuid4().hex}")
    origin_url = str(payload.get("origin_url") or "").strip()
    if not origin_url:
        raise ValueError("origin_url is required")

    clean_payload = {
        "channel_key": str(payload.get("channel_key") or "").strip(),
        "title": str(payload.get("title") or "").strip(),
        "source_name": str(payload.get("source_name") or "").strip(),
        "origin_url": origin_url,
        "published_at": str(payload.get("published_at") or "").strip(),
        "fetched_at": str(payload.get("fetched_at") or now).strip() or now,
        "content_text": str(payload.get("content_text") or "").strip(),
        "summary": str(payload.get("summary") or "").strip(),
        "digest": str(payload.get("digest") or "").strip(),
        "description": str(payload.get("description") or "").strip(),
        "level": str(payload.get("level") or "").strip(),
        "policy_type": str(payload.get("policy_type") or "").strip(),
        "suggestion": str(payload.get("suggestion") or "").strip(),
        "document_label": str(payload.get("document_label") or "").strip(),
        "importance_score": float(payload.get("importance_score") or 0),
        "content_hash": str(payload.get("content_hash") or "").strip(),
        "extra_meta": payload.get("extra_meta") if isinstance(payload.get("extra_meta"), dict) else {},
    }
    if not clean_payload["channel_key"]:
        raise ValueError("channel_key is required")
    if not clean_payload["title"]:
        raise ValueError("title is required")

    with _get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM directive_news_articles WHERE origin_url = ? LIMIT 1",
            (origin_url,),
        ).fetchone()
        created_at = now
        if row is not None:
            existing = _row_to_article(row)
            article_id = str(existing.get("id") or article_id)
            created_at = str(existing.get("created_at") or now)
        merged = {
            **(existing if row is not None else {}),
            **clean_payload,
            "id": article_id,
            "created_at": created_at,
            "updated_at": now,
        }
        extra_meta_json = json.dumps(merged.get("extra_meta") or {}, ensure_ascii=False)
        if row is None:
            conn.execute(
                """
INSERT INTO directive_news_articles (
    id, channel_key, title, source_name, origin_url, published_at, fetched_at,
    content_text, summary, digest, description, level, policy_type,
    suggestion, document_label, importance_score, content_hash, extra_meta,
    created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
""",
                (
                    article_id,
                    merged["channel_key"],
                    merged["title"],
                    merged["source_name"],
                    merged["origin_url"],
                    merged["published_at"],
                    merged["fetched_at"],
                    merged["content_text"],
                    merged["summary"],
                    merged["digest"],
                    merged["description"],
                    merged["level"],
                    merged["policy_type"],
                    merged["suggestion"],
                    merged["document_label"],
                    merged["importance_score"],
                    merged["content_hash"],
                    extra_meta_json,
                    created_at,
                    now,
                ),
            )
        else:
            conn.execute(
                """
UPDATE directive_news_articles
SET channel_key = ?, title = ?, source_name = ?, origin_url = ?, published_at = ?,
    fetched_at = ?, content_text = ?, summary = ?, digest = ?, description = ?,
    level = ?, policy_type = ?, suggestion = ?, document_label = ?,
    importance_score = ?, content_hash = ?, extra_meta = ?, updated_at = ?
WHERE id = ?
""",
                (
                    merged["channel_key"],
                    merged["title"],
                    merged["source_name"],
                    merged["origin_url"],
                    merged["published_at"],
                    merged["fetched_at"],
                    merged["content_text"],
                    merged["summary"],
                    merged["digest"],
                    merged["description"],
                    merged["level"],
                    merged["policy_type"],
                    merged["suggestion"],
                    merged["document_label"],
                    merged["importance_score"],
                    merged["content_hash"],
                    extra_meta_json,
                    now,
                    article_id,
                ),
            )
    merged["extra_meta"] = merged.get("extra_meta") or {}
    return merged


def update_sync_state(
    channel_key: str,
    *,
    source_name: str = "",
    last_sync_at: str = "",
    last_success_at: str = "",
    last_status: str = "",
    last_error: str = "",
    last_article_id: str = "",
) -> Dict[str, Any]:
    init_directive_news_db()
    now = _now_iso()
    key = str(channel_key or "").strip()
    if not key:
        raise ValueError("channel_key is required")
    with _get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM directive_news_sync_state WHERE channel_key = ? LIMIT 1",
            (key,),
        ).fetchone()
        existing = _row_to_sync_state(row) if row else {}
        merged = {
            "channel_key": key,
            "source_name": source_name or str(existing.get("source_name") or ""),
            "last_sync_at": last_sync_at or str(existing.get("last_sync_at") or ""),
            "last_success_at": last_success_at or str(existing.get("last_success_at") or ""),
            "last_status": last_status or str(existing.get("last_status") or ""),
            "last_error": last_error if last_error or row is not None else "",
            "last_article_id": last_article_id or str(existing.get("last_article_id") or ""),
            "updated_at": now,
        }
        if row is None:
            conn.execute(
                """
INSERT INTO directive_news_sync_state (
    channel_key, source_name, last_sync_at, last_success_at,
    last_status, last_error, last_article_id, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
""",
                (
                    merged["channel_key"],
                    merged["source_name"],
                    merged["last_sync_at"],
                    merged["last_success_at"],
                    merged["last_status"],
                    merged["last_error"],
                    merged["last_article_id"],
                    merged["updated_at"],
                ),
            )
        else:
            conn.execute(
                """
UPDATE directive_news_sync_state
SET source_name = ?, last_sync_at = ?, last_success_at = ?,
    last_status = ?, last_error = ?, last_article_id = ?, updated_at = ?
WHERE channel_key = ?
""",
                (
                    merged["source_name"],
                    merged["last_sync_at"],
                    merged["last_success_at"],
                    merged["last_status"],
                    merged["last_error"],
                    merged["last_article_id"],
                    merged["updated_at"],
                    merged["channel_key"],
                ),
            )
    return merged


def get_sync_state(channel_key: str) -> Dict[str, Any]:
    if not channel_key:
        return {}
    with _get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM directive_news_sync_state WHERE channel_key = ? LIMIT 1",
            (channel_key,),
        ).fetchone()
    return _row_to_sync_state(row) if row else {}


def list_sync_states() -> List[Dict[str, Any]]:
    with _get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM directive_news_sync_state ORDER BY updated_at DESC"
        ).fetchall()
    return [_row_to_sync_state(row) for row in rows]
