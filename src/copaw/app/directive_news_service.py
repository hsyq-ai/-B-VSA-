# -*- coding: utf-8 -*-
from __future__ import annotations

import asyncio
import hashlib
import html
import json
import logging
import os
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin

import httpx

from .directive_news_store import (
    get_article,
    get_latest_article,
    get_sync_state,
    init_directive_news_db,
    list_articles,
    upsert_article,
    update_sync_state,
)
from .party_work_store import create_item, list_items


logger = logging.getLogger(__name__)

CN_TZ = timezone(timedelta(hours=8))
SCRIPT_RE = re.compile(r"<(script|style)[^>]*>.*?</\1>", re.IGNORECASE | re.DOTALL)
TAG_RE = re.compile(r"<[^>]+>")
ANCHOR_RE = re.compile(
    r'<a\b[^>]*href=["\'](?P<href>[^"\']+)["\'][^>]*>(?P<text>.*?)</a>',
    re.IGNORECASE | re.DOTALL,
)
DATE_RE = re.compile(r"(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})日?")
WHITESPACE_RE = re.compile(r"\s+")
TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.IGNORECASE | re.DOTALL)
P_RE = re.compile(r"<p[^>]*>(.*?)</p>", re.IGNORECASE | re.DOTALL)
LIST_JSON_RE = re.compile(r"url\s*:\s*[\"'](?P<url>[^\"']+\.json)[\"']", re.IGNORECASE)


@dataclass(frozen=True)
class DirectiveNewsSource:
    channel_key: str
    source_name: str
    source_label: str
    list_url: str
    base_url: str
    link_pattern: str
    level: str
    policy_type: str
    suggestion: str
    document_label: str
    placeholder_title: str
    placeholder_summary: str
    max_items: int = 8
    detail_fetch_limit: int = 4


DEFAULT_SOURCE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}


def _env_int(name: str, default: int) -> int:
    raw = str(os.getenv(name, "")).strip()
    if not raw:
        return default
    try:
        return max(60, int(raw))
    except ValueError:
        return default


def _build_sources() -> Dict[str, DirectiveNewsSource]:
    central_url = str(os.getenv("COPAW_DIRECTIVE_NEWS_CENTRAL_URL", "https://www.gov.cn/yaowen/liebiao/")).strip()
    policy_url = str(os.getenv("COPAW_DIRECTIVE_NEWS_POLICY_URL", "https://www.gov.cn/zhengce/zuixin/")).strip()
    local_url = str(os.getenv("COPAW_DIRECTIVE_NEWS_LOCAL_URL", "https://www.beijing.gov.cn/ywdt/yaowen/")).strip()
    local_source_name = str(os.getenv("COPAW_DIRECTIVE_NEWS_LOCAL_SOURCE_NAME", "北京市人民政府")).strip() or "北京市人民政府"
    return {
        "central": DirectiveNewsSource(
            channel_key="central",
            source_name="中国政府网",
            source_label="中国政府网 / 要闻",
            list_url=central_url,
            base_url="https://www.gov.cn",
            link_pattern=r"https://www\.gov\.cn/yaowen/.+\.(?:html?|shtml)$",
            level="国家级",
            policy_type="战略部署",
            suggestion="围绕中央最新部署提炼责任分解、阶段目标与贯彻节奏。",
            document_label="中央精神贯彻简报",
            placeholder_title="等待同步中央权威发布",
            placeholder_summary="系统正在等待首次成功同步中央要闻，请点击“同步数据”或检查网络连通性。",
        ),
        "sasac": DirectiveNewsSource(
            channel_key="sasac",
            source_name="中国政府网最新政策",
            source_label="中国政府网 / 最新政策",
            list_url=policy_url,
            base_url="https://www.gov.cn",
            link_pattern=r"https://www\.gov\.cn/zhengce/.+\.(?:html?|shtml)$",
            level="部委级",
            policy_type="监管要求",
            suggestion="围绕监管政策、执行口径和风险治理形成督办清单。",
            document_label="监管政策执行清单",
            placeholder_title="等待同步监管政策快讯",
            placeholder_summary="P0 阶段先接入中国政府网最新政策，后续可替换为国务院国资委或客户指定监管源。",
        ),
        "local": DirectiveNewsSource(
            channel_key="local",
            source_name=local_source_name,
            source_label=f"{local_source_name} / 地方要闻",
            list_url=local_url,
            base_url="https://www.beijing.gov.cn",
            link_pattern=r"https://www\.beijing\.gov\.cn/.+\.(?:html?|shtml)$",
            level="省市级",
            policy_type="地方部署",
            suggestion="结合属地部署形成基层治理、专项督办和宣贯安排。",
            document_label="地方部署督办专报",
            placeholder_title="等待同步地方部署快讯",
            placeholder_summary="当前默认使用北京要闻作为地方样例源，交付时建议按客户属地替换。",
        ),
    }


def _strip_html(fragment: str) -> str:
    cleaned = SCRIPT_RE.sub(" ", fragment or "")
    cleaned = TAG_RE.sub(" ", cleaned)
    cleaned = html.unescape(cleaned)
    cleaned = cleaned.replace("\xa0", " ")
    return WHITESPACE_RE.sub(" ", cleaned).strip()


def _truncate(text: str, limit: int) -> str:
    value = str(text or "").strip()
    if len(value) <= limit:
        return value
    return value[: max(0, limit - 1)].rstrip() + "…"


def _normalize_published_at(raw: str, fallback: str) -> str:
    value = str(raw or "").strip()
    if not value:
        return fallback
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(CN_TZ).replace(microsecond=0).isoformat()
    except ValueError:
        pass
    matched = DATE_RE.search(value)
    if matched:
        year, month, day = [int(part) for part in matched.groups()]
        return datetime(year, month, day, tzinfo=CN_TZ).replace(microsecond=0).isoformat()
    return fallback


def _extract_context_date(fragment: str, fallback: str) -> str:
    matched = DATE_RE.search(fragment or "")
    if not matched:
        return fallback
    year, month, day = [int(part) for part in matched.groups()]
    return datetime(year, month, day, tzinfo=CN_TZ).replace(microsecond=0).isoformat()


class DirectiveNewsSyncService:
    def __init__(self, *, sync_interval_seconds: int | None = None) -> None:
        init_directive_news_db()
        self.sources = _build_sources()
        self.sync_interval_seconds = sync_interval_seconds or _env_int(
            "COPAW_DIRECTIVE_NEWS_SYNC_INTERVAL_SECONDS", 600
        )
        self._loop_task: asyncio.Task | None = None
        self._startup_task: asyncio.Task | None = None
        self._lock = asyncio.Lock()
        self._stopping = False

    async def start(self) -> None:
        if self._loop_task and not self._loop_task.done():
            return
        self._stopping = False
        self._loop_task = asyncio.create_task(self._run_loop())
        self._startup_task = asyncio.create_task(self.sync(force=False))

    async def stop(self) -> None:
        self._stopping = True
        for task in [self._startup_task, self._loop_task]:
            if task is None:
                continue
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
            except Exception:
                logger.exception("Failed to stop directive news task")

    async def _run_loop(self) -> None:
        while not self._stopping:
            try:
                await asyncio.sleep(self.sync_interval_seconds)
                if self._stopping:
                    break
                await self.sync(force=False)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Directive news background sync failed")

    def list_windows(self) -> List[Dict[str, Any]]:
        windows: List[Dict[str, Any]] = []
        for channel_key in ["central", "sasac", "local"]:
            source = self.sources[channel_key]
            article = get_latest_article(channel_key)
            sync_state = get_sync_state(channel_key)
            if article:
                windows.append(
                    {
                        "channel_key": channel_key,
                        "article_id": str(article.get("id") or ""),
                        "title": str(article.get("title") or source.placeholder_title),
                        "source": str(article.get("source_name") or source.source_label),
                        "origin_url": str(article.get("origin_url") or ""),
                        "published_at": str(article.get("published_at") or ""),
                        "summary": str(article.get("description") or article.get("summary") or source.placeholder_summary),
                        "digest": str(article.get("digest") or article.get("summary") or source.placeholder_summary),
                        "level": str(article.get("level") or source.level),
                        "policy_type": str(article.get("policy_type") or source.policy_type),
                        "suggestion": str(article.get("suggestion") or source.suggestion),
                        "document_label": str(article.get("document_label") or source.document_label),
                        "sync_status": str(sync_state.get("last_status") or "success"),
                        "synced_at": str(sync_state.get("last_success_at") or sync_state.get("last_sync_at") or ""),
                        "sync_error": str(sync_state.get("last_error") or ""),
                    }
                )
                continue
            windows.append(
                {
                    "channel_key": channel_key,
                    "article_id": "",
                    "title": source.placeholder_title,
                    "source": source.source_label,
                    "origin_url": "",
                    "published_at": "",
                    "summary": source.placeholder_summary,
                    "digest": source.placeholder_summary,
                    "level": source.level,
                    "policy_type": source.policy_type,
                    "suggestion": source.suggestion,
                    "document_label": source.document_label,
                    "sync_status": str(sync_state.get("last_status") or "idle"),
                    "synced_at": str(sync_state.get("last_success_at") or sync_state.get("last_sync_at") or ""),
                    "sync_error": str(sync_state.get("last_error") or ""),
                }
            )
        return windows

    def list_channel_articles(self, *, channel_key: str = "", limit: int = 10) -> List[Dict[str, Any]]:
        items = list_articles(channel_key=channel_key, limit=limit)
        return [self._decorate_article(item) for item in items]

    async def sync(self, *, force: bool = False, channel_key: str = "") -> Dict[str, Any]:
        async with self._lock:
            targets = [self.sources[channel_key]] if channel_key and channel_key in self.sources else list(self.sources.values())
            results: List[Dict[str, Any]] = []
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(12.0, connect=6.0),
                follow_redirects=True,
                headers=DEFAULT_SOURCE_HEADERS,
            ) as client:
                for source in targets:
                    try:
                        result = await self._sync_source(client, source=source, force=force)
                        results.append(result)
                    except Exception as exc:
                        logger.exception("Directive news sync failed for %s", source.channel_key)
                        now = datetime.now(CN_TZ).replace(microsecond=0).isoformat()
                        update_sync_state(
                            source.channel_key,
                            source_name=source.source_name,
                            last_sync_at=now,
                            last_status="failed",
                            last_error=_truncate(str(exc), 240),
                        )
                        results.append(
                            {
                                "channel_key": source.channel_key,
                                "ok": False,
                                "inserted": 0,
                                "message": str(exc),
                            }
                        )
            synced_at = max(
                [str(item.get("synced_at") or "") for item in self.list_windows()] or [""],
                default="",
            )
            return {"ok": True, "results": results, "windows": self.list_windows(), "synced_at": synced_at}

    def promote_article(self, article_id: str, current: Dict[str, Any]) -> Dict[str, Any]:
        article = get_article(article_id)
        if not article:
            raise ValueError("article_not_found")
        article_title = str(article.get("title") or "").strip()
        for existing in list_items("directive-center", current, {"q": article_title}):
            if str(existing.get("title") or "").strip() == article_title:
                return {"item": existing, "duplicate": True}
        channel_key = str(article.get("channel_key") or "").strip()
        document_label = str(article.get("document_label") or "贯彻简报").strip() or "贯彻简报"
        summary = _truncate(
            str(article.get("summary") or article.get("digest") or article_title),
            480,
        )
        created = create_item(
            "directive-center",
            {
                "title": article_title,
                "publish_at": str(article.get("published_at") or datetime.now(CN_TZ).replace(microsecond=0).isoformat()),
                "sla": "T+1" if channel_key == "central" else "T+3",
                "status": "待响应",
                "summary": summary,
                "enterprise_report_title": document_label,
            },
            current,
        )
        return {"item": created, "duplicate": False}

    async def _sync_source(
        self,
        client: httpx.AsyncClient,
        *,
        source: DirectiveNewsSource,
        force: bool,
    ) -> Dict[str, Any]:
        sync_state = get_sync_state(source.channel_key)
        if not force and self._should_skip(sync_state):
            return {
                "channel_key": source.channel_key,
                "ok": True,
                "inserted": 0,
                "message": "skip_recent_sync",
            }
        now = datetime.now(CN_TZ).replace(microsecond=0).isoformat()
        html_text = await self._fetch_text(client, source.list_url)
        candidates = await self._extract_candidates(
            client,
            html_text,
            source=source,
            fetched_at=now,
        )
        if not candidates:
            raise ValueError(f"no_article_candidates:{source.channel_key}")
        picked = candidates[: max(1, source.max_items)]
        detail_tasks = [
            asyncio.create_task(self._build_article(client, source=source, candidate=candidate, rank=index))
            for index, candidate in enumerate(picked[: source.detail_fetch_limit])
        ]
        articles: List[Dict[str, Any]] = []
        if detail_tasks:
            detail_results = await asyncio.gather(*detail_tasks, return_exceptions=True)
            for index, result in enumerate(detail_results):
                if isinstance(result, Exception):
                    logger.warning(
                        "Directive news detail fetch failed for %s #%s: %s",
                        source.channel_key,
                        index,
                        result,
                    )
                    articles.append(self._build_fallback_article(source=source, candidate=picked[index], rank=index))
                else:
                    articles.append(result)
        if not articles:
            raise ValueError(f"no_articles_built:{source.channel_key}")
        saved_articles = [upsert_article(article) for article in articles]
        latest_article_id = str(saved_articles[0].get("id") or "") if saved_articles else ""
        update_sync_state(
            source.channel_key,
            source_name=source.source_name,
            last_sync_at=now,
            last_success_at=now,
            last_status="success",
            last_error="",
            last_article_id=latest_article_id,
        )
        return {
            "channel_key": source.channel_key,
            "ok": True,
            "inserted": len(saved_articles),
            "article_id": latest_article_id,
            "message": "synced",
        }

    def _should_skip(self, sync_state: Dict[str, Any]) -> bool:
        last_success_at = str(sync_state.get("last_success_at") or "").strip()
        if not last_success_at:
            return False
        try:
            last_dt = datetime.fromisoformat(last_success_at.replace("Z", "+00:00"))
        except ValueError:
            return False
        return (datetime.now(last_dt.tzinfo or timezone.utc) - last_dt).total_seconds() < self.sync_interval_seconds

    async def _build_article(
        self,
        client: httpx.AsyncClient,
        *,
        source: DirectiveNewsSource,
        candidate: Dict[str, Any],
        rank: int,
    ) -> Dict[str, Any]:
        detail_html = await self._fetch_text(client, str(candidate.get("origin_url") or ""))
        content_text = self._extract_detail_text(detail_html)
        summary = _truncate(content_text or str(candidate.get("title") or ""), 120)
        digest = _truncate(content_text or summary, 220)
        title = str(candidate.get("title") or "").strip() or self._extract_detail_title(detail_html)
        if not title:
            title = str(candidate.get("title") or "未命名资讯").strip() or "未命名资讯"
        content_hash = hashlib.md5(
            f"{title}|{candidate.get('origin_url')}|{summary}".encode("utf-8")
        ).hexdigest()
        return {
            "channel_key": source.channel_key,
            "title": title,
            "source_name": source.source_label,
            "origin_url": str(candidate.get("origin_url") or ""),
            "published_at": str(candidate.get("published_at") or ""),
            "fetched_at": str(candidate.get("fetched_at") or datetime.now(CN_TZ).replace(microsecond=0).isoformat()),
            "content_text": _truncate(content_text, 4000),
            "summary": summary,
            "digest": digest,
            "description": summary,
            "level": source.level,
            "policy_type": source.policy_type,
            "suggestion": source.suggestion,
            "document_label": source.document_label,
            "importance_score": max(1, 100 - rank * 8),
            "content_hash": content_hash,
            "extra_meta": {
                "source_name": source.source_name,
                "list_url": source.list_url,
            },
        }

    def _build_fallback_article(
        self,
        *,
        source: DirectiveNewsSource,
        candidate: Dict[str, Any],
        rank: int,
    ) -> Dict[str, Any]:
        title = str(candidate.get("title") or source.placeholder_title)
        summary = _truncate(title, 120)
        return {
            "channel_key": source.channel_key,
            "title": title,
            "source_name": source.source_label,
            "origin_url": str(candidate.get("origin_url") or ""),
            "published_at": str(candidate.get("published_at") or ""),
            "fetched_at": str(candidate.get("fetched_at") or datetime.now(CN_TZ).replace(microsecond=0).isoformat()),
            "content_text": "",
            "summary": summary,
            "digest": summary,
            "description": summary,
            "level": source.level,
            "policy_type": source.policy_type,
            "suggestion": source.suggestion,
            "document_label": source.document_label,
            "importance_score": max(1, 100 - rank * 8),
            "content_hash": hashlib.md5(
                f"fallback|{title}|{candidate.get('origin_url')}".encode("utf-8")
            ).hexdigest(),
            "extra_meta": {
                "source_name": source.source_name,
                "list_url": source.list_url,
                "fallback": True,
            },
        }

    async def _fetch_text(self, client: httpx.AsyncClient, url: str) -> str:
        response = await client.get(url)
        response.raise_for_status()
        response.encoding = response.encoding or "utf-8"
        return response.text

    async def _extract_candidates(
        self,
        client: httpx.AsyncClient,
        html_text: str,
        *,
        source: DirectiveNewsSource,
        fetched_at: str,
    ) -> List[Dict[str, Any]]:
        raw_html = html_text or ""
        cleaned_html = SCRIPT_RE.sub(" ", raw_html)
        json_match = LIST_JSON_RE.search(raw_html) or LIST_JSON_RE.search(cleaned_html)
        if json_match:
            json_url = urljoin(source.list_url, str(json_match.group("url") or "").strip())
            try:
                json_text = await self._fetch_text(client, json_url)
                raw_items = json.loads(json_text)
                if isinstance(raw_items, list):
                    items: List[Dict[str, Any]] = []
                    seen_urls: set[str] = set()
                    for entry in raw_items:
                        if not isinstance(entry, dict):
                            continue
                        title = _strip_html(str(entry.get("TITLE") or entry.get("title") or ""))
                        href = str(entry.get("URL") or entry.get("url") or "").strip()
                        if len(title) < 8 or len(title) > 120 or not href:
                            continue
                        origin_url = urljoin(source.list_url, href)
                        if not re.search(source.link_pattern, origin_url) or origin_url in seen_urls:
                            continue
                        items.append(
                            {
                                "title": title,
                                "origin_url": origin_url,
                                "published_at": _normalize_published_at(
                                    str(entry.get("DOCRELPUBTIME") or entry.get("publishTime") or ""),
                                    fetched_at,
                                ),
                                "fetched_at": fetched_at,
                            }
                        )
                        seen_urls.add(origin_url)
                    if items:
                        return items
            except Exception:
                logger.warning("Failed to parse directive news json feed for %s", source.channel_key, exc_info=True)
        items = []
        seen_urls: set[str] = set()
        for match in ANCHOR_RE.finditer(cleaned_html):
            href = html.unescape(str(match.group("href") or "").strip())
            if not href or href.startswith("#") or href.lower().startswith("javascript:"):
                continue
            origin_url = urljoin(source.list_url, href)
            if not re.search(source.link_pattern, origin_url):
                continue
            if origin_url in seen_urls:
                continue
            title = _strip_html(str(match.group("text") or ""))
            if len(title) < 8 or len(title) > 120:
                continue
            if any(token in title for token in ["更多", "上一页", "下一页", "返回"]):
                continue
            context = cleaned_html[max(0, match.start() - 240) : min(len(cleaned_html), match.end() + 240)]
            published_at = _extract_context_date(context, fetched_at)
            items.append(
                {
                    "title": title,
                    "origin_url": origin_url,
                    "published_at": published_at,
                    "fetched_at": fetched_at,
                }
            )
            seen_urls.add(origin_url)
        return items

    def _extract_detail_title(self, html_text: str) -> str:
        matched = TITLE_RE.search(html_text or "")
        if not matched:
            return ""
        return _strip_html(str(matched.group(1) or ""))

    def _extract_detail_text(self, html_text: str) -> str:
        body = SCRIPT_RE.sub(" ", html_text or "")
        paragraphs = [_strip_html(item) for item in P_RE.findall(body)]
        merged = "\n".join(part for part in paragraphs if len(part) >= 8)
        if merged.strip():
            return _truncate(merged, 6000)
        return _truncate(_strip_html(body), 6000)

    def _decorate_article(self, item: Dict[str, Any]) -> Dict[str, Any]:
        sync_state = get_sync_state(str(item.get("channel_key") or ""))
        return {
            "id": str(item.get("id") or ""),
            "channel_key": str(item.get("channel_key") or ""),
            "title": str(item.get("title") or ""),
            "source": str(item.get("source_name") or ""),
            "origin_url": str(item.get("origin_url") or ""),
            "published_at": str(item.get("published_at") or ""),
            "fetched_at": str(item.get("fetched_at") or ""),
            "summary": str(item.get("summary") or ""),
            "digest": str(item.get("digest") or ""),
            "description": str(item.get("description") or ""),
            "content_text": str(item.get("content_text") or ""),
            "level": str(item.get("level") or ""),
            "policy_type": str(item.get("policy_type") or ""),
            "suggestion": str(item.get("suggestion") or ""),
            "document_label": str(item.get("document_label") or ""),
            "sync_status": str(sync_state.get("last_status") or ""),
            "synced_at": str(sync_state.get("last_success_at") or sync_state.get("last_sync_at") or ""),
        }
