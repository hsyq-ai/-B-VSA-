
import logging
import json
import urllib.parse

from fastapi import Request, Body
from agentscope_runtime.engine.app import AgentApp
from agentscope.message import Msg
from typing import Any, Dict
from fastapi.responses import StreamingResponse

from .auth_db import (
    get_user_name_by_id_or_profile_id,
    get_users_by_name,
    parse_notify_command,
)
from .notification_service import (
    build_notify_target_hint,
    dispatch_notify_command,
    dispatch_reply_forward,
)
from ..agents.utils import process_file_and_media_blocks_in_message
from ..agents.skills_manager import SkillService
from .routers.chat_files import _safe_dirname, _FILES_ROOT
from ..agents.notification_llm import (
    detect_reply_forward_intent,
    rewrite_reply_message,
)
from .event_logger import log_event
from .platform_skill_evolution_service import schedule_session_evolution

logger = logging.getLogger(__name__)


def _collect_extracted_text(blocks: list[dict]) -> str:
    markers = [
        "以下是自动提取的文档正文",
        "Auto-extracted document text",
    ]
    extracted_chunks: list[str] = []
    for block in blocks:
        if not isinstance(block, dict) or block.get("type") != "text":
            continue
        text = str(block.get("text", "")).strip()
        if not text:
            continue
        for marker in markers:
            if marker in text:
                parts = text.split(marker, 1)
                tail = parts[-1]
                tail = tail.replace("（可能被截断）：", "").replace(":", "").strip()
                if tail:
                    extracted_chunks.append(tail)
                break
    return "\n\n".join(extracted_chunks).strip()


def _extract_file_id_from_url(url: str) -> str:
    try:
        parsed = urllib.parse.urlparse(url)
        parts = [p for p in parsed.path.split("/") if p]
        if "chat-files" not in parts:
            return ""
        idx = parts.index("chat-files")
        if idx + 1 < len(parts):
            return str(parts[idx + 1])
    except Exception:
        return ""
    return ""


def _extract_attachment_info(blocks: list[dict]) -> tuple[list[str], list[str]]:
    ids: list[str] = []
    types: list[str] = []
    for block in blocks:
        if not isinstance(block, dict):
            continue
        btype = block.get("type")
        if btype not in {"file", "image", "audio", "video"}:
            continue
        types.append(str(btype))
        url = ""
        if btype == "image":
            image_url = block.get("image_url")
            if isinstance(image_url, str):
                url = image_url
        source = block.get("source")
        if isinstance(source, str):
            url = source
        elif isinstance(source, dict):
            url = str(source.get("url") or source.get("path") or "")
        if url:
            file_id = _extract_file_id_from_url(url)
            if file_id:
                ids.append(file_id)
    return ids, types


def _inject_scene_instruction(
    *,
    content_blocks: list[dict] | None,
    user_message: str,
    scene_label: str,
    scene_skill: str,
    scene_prompt: str,
) -> tuple[str, bool]:
    if not scene_skill or not scene_prompt:
        return user_message, False
    if user_message.strip() != scene_prompt.strip():
        return user_message, False
    # 场景说明不再注入到可见消息里，改由 runner 在隐藏上下文中处理。
    return user_message, False


def _truncate_text(text: str, limit: int = 160) -> str:
    value = str(text or "").strip()
    if len(value) <= limit:
        return value
    return value[:limit].rstrip() + "..."


def _sse_event(event_name: str, payload: dict[str, Any]) -> str:
    return f"event: {event_name}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _extract_completed_message_text(event: Any) -> str:
    content = getattr(event, "content", None) or []
    parts: list[str] = []
    for item in content:
        item_type = getattr(item, "type", None)
        if item_type == ContentType.TEXT:
            text = getattr(item, "text", None)
            if text:
                parts.append(str(text).strip())
        elif item_type == ContentType.REFUSAL:
            refusal = getattr(item, "refusal", None)
            if refusal:
                parts.append(str(refusal).strip())
    return " ".join(part for part in parts if part).strip()


def _extract_bearer_token(raw_request: Request | None) -> str:
    if raw_request is None:
        return ""
    auth = raw_request.headers.get("Authorization") or ""
    if auth.startswith("Bearer "):
        return auth.split(" ", 1)[1].strip()
    return ""


def _parse_file_search_query(text: str) -> str:
    raw = str(text or "").strip()
    if not raw:
        return ""
    if any(k in raw for k in ["找", "查找", "搜索", "查询", "打开", "查看"]):
        cleaned = raw
        for kw in ["帮我", "请", "一下", "下", "帮忙", "麻烦", "辛苦", "帮我"]:
            cleaned = cleaned.replace(kw, "")
        for kw in ["文件", "文档", "附件"]:
            cleaned = cleaned.replace(kw, "")
        cleaned = cleaned.replace("找", "").replace("查找", "").replace("搜索", "").replace("查询", "")
        cleaned = cleaned.replace("打开", "").replace("查看", "")
        cleaned = cleaned.replace("的", "").strip()
        return cleaned
    return ""


def _extract_type_filter(text: str) -> set[str]:
    raw = str(text or "").lower()
    mapping = {
        "pdf": {".pdf"},
        "word": {".doc", ".docx"},
        "doc": {".doc", ".docx"},
        "docx": {".docx"},
        "excel": {".xls", ".xlsx"},
        "xlsx": {".xlsx"},
        "xls": {".xls"},
        "ppt": {".ppt", ".pptx"},
        "pptx": {".pptx"},
        "图片": {".png", ".jpg", ".jpeg", ".gif", ".webp"},
        "image": {".png", ".jpg", ".jpeg", ".gif", ".webp"},
    }
    exts: set[str] = set()
    for key, values in mapping.items():
        if key in raw:
            exts.update(values)
    return exts


def _search_files_by_name(
    *,
    query: str,
    user_id: str,
    user_name: str,
    store,
    limit: int = 1,
) -> list[dict]:
    q = (query or "").strip().lower()
    if not q:
        return []
    results: list[dict] = []
    user_dir = _FILES_ROOT / _safe_dirname(user_name or user_id)
    manifests = []
    if (user_dir / "manifest.json").exists():
        manifests.append(user_dir / "manifest.json")
    if len(manifests) < limit and _FILES_ROOT.exists():
        for entry in _FILES_ROOT.iterdir():
            if not entry.is_dir():
                continue
            manifest_path = entry / "manifest.json"
            if manifest_path.exists() and manifest_path not in manifests:
                manifests.append(manifest_path)

    for manifest_path in manifests:
        try:
            data = json.loads(manifest_path.read_text(encoding="utf-8"))
        except Exception:
            continue
        for rec in reversed(data if isinstance(data, list) else []):
            name = str(rec.get("original_name", "")).lower()
            if q in name:
                file_id = rec.get("upload_id") or rec.get("file_id") or ""
                meta = store.get_file(str(file_id)) if file_id else None
                results.append(meta or rec)
            if len(results) >= limit:
                return results
    return results


def _get_recent_files(
    *,
    user_name: str,
    user_id: str,
    limit: int = 5,
) -> list[dict]:
    files: list[dict] = []
    user_dir = _FILES_ROOT / _safe_dirname(user_name or user_id)
    manifest_path = user_dir / "manifest.json"
    if not manifest_path.exists():
        return []
    try:
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
    except Exception:
        return []
    for rec in reversed(data if isinstance(data, list) else []):
        files.append(rec)
        if len(files) >= limit:
            break
    return files


class CustomAgentApp(AgentApp):
    def _build_embed_progress_response(self, request: Dict[str, Any]) -> StreamingResponse:
        async def generator():
            if not self._runner:
                yield _sse_event(
                    "error",
                    {"message": "Runner is not initialized."},
                )
                yield _sse_event("done", {"ok": False, "error": "Runner is not initialized."})
                return

            pending_updates: list[dict[str, Any]] = []
            message_count = 0
            latest_summary = ""
            final_error = ""

            async def progress_callback(payload: dict[str, Any]) -> None:
                pending_updates.append(dict(payload or {}))

            def flush_updates() -> list[str]:
                chunks: list[str] = []
                while pending_updates:
                    chunks.append(_sse_event("phase", pending_updates.pop(0)))
                return chunks

            yield _sse_event(
                "phase",
                {
                    "stage": "accepted",
                    "summary": "后端已接受嵌入式会话请求",
                    "detail": "正在启动秘书/任务专用的流式阶段反馈。",
                    "percent": 16,
                    "status": "active",
                },
            )

            try:
                async for event in self._runner.stream_query(
                    request,
                    progress_callback=progress_callback,
                ):
                    for chunk in flush_updates():
                        yield chunk
                    event_object = getattr(event, "object", None)
                    event_status = getattr(event, "status", None)
                    if event_object == "message" and event_status == RunStatus.Completed:
                        message_count += 1
                        latest_summary = _truncate_text(
                            _extract_completed_message_text(event),
                            180,
                        )
                        if latest_summary:
                            yield _sse_event(
                                "message",
                                {
                                    "index": message_count,
                                    "summary": latest_summary,
                                },
                            )
                    elif event_object == "response":
                        err = getattr(event, "error", None)
                        if err:
                            final_error = getattr(err, "message", None) or str(err)
            except Exception as exc:
                final_error = str(exc)

            for chunk in flush_updates():
                yield chunk

            if final_error:
                yield _sse_event(
                    "error",
                    {"message": final_error or "流式执行失败"},
                )
                yield _sse_event(
                    "done",
                    {
                        "ok": False,
                        "error": final_error or "流式执行失败",
                        "message_count": message_count,
                        "summary": latest_summary,
                    },
                )
                return

            yield _sse_event(
                "phase",
                {
                    "stage": "completed",
                    "summary": "后端流式阶段已结束，正在交还前端刷新会话",
                    "detail": latest_summary or "会话结果已写入，可刷新查看完整回复。",
                    "percent": 100,
                    "status": "success",
                },
            )
            yield _sse_event(
                "done",
                {
                    "ok": True,
                    "message_count": message_count,
                    "summary": latest_summary,
                },
            )

        return StreamingResponse(
            generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            },
        )

    # Override the 'chat' method directly for robustness
    async def chat(self, request: Dict[str, Any] = Body(...), raw_request: Request = None):
        logger.info("!!!!!!!!!! CUSTOM CHAT METHOD CALLED !!!!!!!!!!")

        # Support both "messages" and "input" (agent process format)
        msgs = request.get("messages") or request.get("input") or []
        last_msg = msgs[-1] if msgs else {}
        user_message = last_msg.get("content", "")
        if isinstance(user_message, list):
            user_message = next(
                (m.get("text", "") for m in user_message if m.get("type") == "text"),
                "",
            )
        if isinstance(user_message, str):
            user_message = user_message.strip()
        else:
            user_message = str(user_message or "").strip()
        content_blocks = last_msg.get("content") if isinstance(last_msg, dict) else None
        session_meta = request.get("session_meta") or {}
        has_attachment = False
        has_text = False
        if isinstance(content_blocks, list):
            has_attachment = any(
                isinstance(b, dict) and b.get("type") in {"file", "image", "audio", "video"}
                for b in content_blocks
            )
            has_text = any(
                isinstance(b, dict)
                and b.get("type") == "text"
                and str(b.get("text", "")).strip()
                for b in content_blocks
            )

        logger.info(f"Received user message in custom chat: {user_message}")

        # If user only uploads attachments without text, inject a default prompt.
        if not user_message and isinstance(last_msg, dict):
            if isinstance(content_blocks, list):
                if has_attachment and not has_text:
                    default_prompt = "请分析我刚上传的附件，给出要点、结论与下一步建议。"
                    content_blocks.append({"type": "text", "text": default_prompt})
                    user_message = default_prompt
                    logger.info("Injected default prompt for attachment-only message.")

        scene_skill = str(session_meta.get("scene_skill") or "").strip()
        scene_label = str(session_meta.get("scene_label") or "").strip()
        scene_prompt = str(session_meta.get("scene_prompt") or "").strip()
        if scene_skill:
            try:
                SkillService.enable_skill(scene_skill, force=False)
            except Exception as exc:
                logger.warning("Failed to enable scene skill %s: %s", scene_skill, exc)
            if scene_skill not in {"employee_agent_link", "department_agent_link", "department_board"}:
                user_message, injected = _inject_scene_instruction(
                    content_blocks=content_blocks,
                    user_message=user_message,
                    scene_label=scene_label,
                    scene_skill=scene_skill,
                    scene_prompt=scene_prompt,
                )
                if injected:
                    logger.info("Injected scene instruction for skill: %s", scene_skill)

        user_id = (
            request.get("user_id")
            or request.get("memory_scope", {}).get("profile_id")
            or ""
        )
        session_id = str(request.get("session_id") or "")
        attachment_ids: list[str] = []
        attachment_types: list[str] = []
        if isinstance(content_blocks, list):
            attachment_ids, attachment_types = _extract_attachment_info(content_blocks)
        summary_text = (user_message or "").strip()
        if not summary_text and attachment_ids:
            summary_text = f"附件消息（{len(attachment_ids)} 个附件）"
        log_event(
            event_type="chat_user_message",
            actor_user_id=str(user_id),
            session_id=session_id,
            payload={
                "text": summary_text,
                "has_attachment": bool(attachment_ids),
                "attachment_ids": attachment_ids,
                "attachment_types": attachment_types,
            },
            summary=summary_text[:120] if summary_text else None,
            intent_tag="chat.send",
            source="console:chat",
        )

        # --- 回复转发：LLM 意图识别 ---
        push_source = {}
        if session_meta.get("push_source_user_id"):
            push_source = {
                "source_user_id": str(session_meta.get("push_source_user_id", "")),
                "source_user_name": str(session_meta.get("push_source_user_name", "")),
            }
        if not has_attachment:
            reply_intent = await detect_reply_forward_intent(user_message, push_source)
        else:
            reply_intent = None
        if reply_intent:
            target_user_name = reply_intent.get("target_user_name", "").strip()
            reply_content = reply_intent.get("reply_content", "").strip()
            if target_user_name and reply_content:
                users = get_users_by_name(target_user_name)
                if users:
                    user_id = (
                        request.get("user_id")
                        or request.get("memory_scope", {}).get("profile_id")
                        or ""
                    )
                    current_user_name = get_user_name_by_id_or_profile_id(str(user_id))
                    rewritten = await rewrite_reply_message(
                        source_user_name=current_user_name,
                        target_user_name=target_user_name,
                        reply_content=reply_content,
                    )
                    store = getattr(raw_request.app.state, "message_store", None) if raw_request else None
                    agent_os_store = getattr(raw_request.app.state, "agent_os_store", None) if raw_request else None
                    room_store = getattr(raw_request.app.state, "room_store", None) if raw_request else None
                    observability_store = getattr(raw_request.app.state, "observability_store", None) if raw_request else None
                    chat_manager = getattr(raw_request.app.state, "chat_manager", None) if raw_request else None
                    dispatch = await dispatch_reply_forward(
                        current_user_id=str(user_id),
                        current_user_name=current_user_name,
                        target_user_name=target_user_name,
                        rewritten_message=rewritten,
                        message_store=store,
                        agent_os_store=agent_os_store,
                        room_store=room_store,
                        observability_store=observability_store,
                        chat_manager=chat_manager,
                    )
                    logger.info(
                        "Reply forward task written: task_id=%s target=%s",
                        dispatch["task_id"],
                        target_user_name,
                    )
                    async def confirmation_generator():
                        yield json.dumps(
                            {"text": dispatch["confirmation"]},
                            ensure_ascii=False,
                        )
                    return StreamingResponse(
                        confirmation_generator(),
                        media_type="text/event-stream",
                    )
                else:
                    logger.warning(f"Target user '{target_user_name}' not found for reply forward")
            else:
                logger.warning("Reply intent missing target_user_name or reply_content")

        dispatch_result = None
        is_scene = bool(scene_skill or scene_prompt)
        if has_attachment and isinstance(content_blocks, list):
            if parse_notify_command(str(user_message).strip() or ""):
                try:
                    tmp_msg = Msg(
                        name="user",
                        role="user",
                        content=content_blocks,
                    )
                    await process_file_and_media_blocks_in_message(tmp_msg)
                    extracted_text = _collect_extracted_text(content_blocks)
                    augmented = str(user_message).strip()
                    if extracted_text:
                        augmented = f"{augmented}\n\n【附件内容（自动解析）】\n{extracted_text}"
                    store = getattr(raw_request.app.state, "message_store", None) if raw_request else None
                    agent_os_store = getattr(raw_request.app.state, "agent_os_store", None) if raw_request else None
                    room_store = getattr(raw_request.app.state, "room_store", None) if raw_request else None
                    observability_store = getattr(raw_request.app.state, "observability_store", None) if raw_request else None
                    chat_manager = getattr(raw_request.app.state, "chat_manager", None) if raw_request else None
                    dispatch_result = await dispatch_notify_command(
                        user_message=augmented,
                        current_user_id=str(
                            request.get("user_id")
                            or request.get("memory_scope", {}).get("profile_id")
                            or ""
                        ),
                        message_store=store,
                        agent_os_store=agent_os_store,
                        room_store=room_store,
                        observability_store=observability_store,
                        chat_manager=chat_manager,
                    )
                except Exception:
                    logger.exception("Failed to parse attachments for notify command")
        if dispatch_result is None and not has_attachment and not is_scene:
            store = getattr(raw_request.app.state, "message_store", None) if raw_request else None
            agent_os_store = getattr(raw_request.app.state, "agent_os_store", None) if raw_request else None
            room_store = getattr(raw_request.app.state, "room_store", None) if raw_request else None
            observability_store = getattr(raw_request.app.state, "observability_store", None) if raw_request else None
            chat_manager = getattr(raw_request.app.state, "chat_manager", None) if raw_request else None
            dispatch_result = await dispatch_notify_command(
                user_message=str(user_message).strip(),
                current_user_id=str(
                    request.get("user_id")
                    or request.get("memory_scope", {}).get("profile_id")
                    or ""
                ),
                message_store=store,
                agent_os_store=agent_os_store,
                room_store=room_store,
                observability_store=observability_store,
                chat_manager=chat_manager,
            )

        if dispatch_result is None and isinstance(last_msg, dict):
            search_query = _parse_file_search_query(user_message)
            if search_query:
                store = getattr(raw_request.app.state, "chat_file_store", None) if raw_request else None
                if store is not None and isinstance(content_blocks, list):
                    user_id = str(
                        request.get("user_id")
                        or request.get("memory_scope", {}).get("profile_id")
                        or ""
                    )
                    user_name = get_user_name_by_id_or_profile_id(user_id)
                    type_filter = _extract_type_filter(user_message)
                    matches = _search_files_by_name(
                        query=search_query,
                        user_id=user_id,
                        user_name=user_name,
                        store=store,
                        limit=10,
                    )
                    if type_filter:
                        matches = [
                            m
                            for m in matches
                            if str(m.get("original_name", "")).lower().endswith(tuple(type_filter))
                        ]
                    if matches:
                        token = _extract_bearer_token(raw_request)
                        # Pick latest match (by timestamp if present).
                        def _ts(m):
                            return int(m.get("timestamp_ms") or 0)

                        matches = sorted(matches, key=_ts, reverse=True)
                        chosen = matches[0]
                        file_id = str(chosen.get("file_id") or chosen.get("upload_id") or "")
                        original_name = str(chosen.get("original_name") or "file")
                        url = f"/api/chat-files/{file_id}/download"
                        if token:
                            url = f"{url}?access_token={token}"
                        content_blocks.append(
                            {
                                "type": "file",
                                "source": {"type": "url", "url": url},
                                "name": original_name,
                            }
                        )
                        content_blocks.append(
                            {
                                "type": "text",
                                "text": f"已找到并附上文件《{original_name}》。请结合附件回答我的问题。",
                            }
                        )
                        if len(matches) > 1:
                            candidates = [
                                str(m.get("original_name") or "未命名") for m in matches[1:4]
                            ]
                            if candidates:
                                content_blocks.append(
                                    {
                                        "type": "text",
                                        "text": f"我还找到其他匹配文件：{', '.join(candidates)}。如果需要改用它们，请告诉我具体文件名。",
                                    }
                                )
                        logger.info("Attached file from search query '%s'", search_query)
                    else:
                        suggestions = _get_recent_files(
                            user_name=user_name,
                            user_id=user_id,
                            limit=5,
                        )
                        if suggestions:
                            names = ", ".join(
                                str(s.get("original_name") or "未命名") for s in suggestions
                            )
                            content_blocks.append(
                                {
                                    "type": "text",
                                    "text": f"没找到包含“{search_query}”的文件。最近上传的文件有：{names}。请告诉我具体要查哪一个。",
                                }
                            )
        if dispatch_result:
            logger.info(
                "COMMAND DETECTED: task_id=%s target=%s msg=%s",
                dispatch_result.get("task_id", ""),
                dispatch_result.get("target_user", ""),
                str(dispatch_result.get("message_content", ""))[:50],
            )
            async def confirmation_generator():
                yield json.dumps(
                    {"text": dispatch_result.get("confirmation", "")},
                    ensure_ascii=False,
                )
            return StreamingResponse(confirmation_generator(), media_type="text/event-stream")
        elif not is_scene and str(user_message).strip().startswith(("让", "通知", "告诉", "转告", "告知")):
            hint_text = build_notify_target_hint()
            async def hint_generator():
                yield json.dumps({"text": hint_text}, ensure_ascii=False)
            return StreamingResponse(hint_generator(), media_type="text/event-stream")

        # If it's not a command, proceed with the original chat logic
        logger.info("NO COMMAND DETECTED: Proceeding with parent's chat method.")
        if raw_request is not None and session_id and user_id:
            try:
                await schedule_session_evolution(
                    app=raw_request.app,
                    session_id=session_id,
                    user_id=str(user_id),
                    channel=str(request.get("channel") or "console"),
                    delay_seconds=120,
                )
            except Exception:
                logger.exception("Failed to schedule platform skill evolution")
        if bool(request.get("copaw_embed_progress")):
            return self._build_embed_progress_response(request)
        return await super().chat(request, raw_request)
