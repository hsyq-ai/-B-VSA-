# -*- coding: utf-8 -*-
"""Message processing utilities for agent communication.

This module handles:
- File and media block processing
- Message content manipulation
- Message validation
"""
import logging
import os
import subprocess
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Optional

from agentscope.message import Msg

from ...config import load_config
from ...constant import WORKING_DIR
from .file_handling import download_file_from_base64, download_file_from_url

logger = logging.getLogger(__name__)

# Only allow local paths under this dir (channels save media here).
_ALLOWED_MEDIA_ROOT = WORKING_DIR / "media"
_MAX_EXTRACT_CHARS = 20000


def _trim_extracted_text(text: str) -> str:
    normalized = (text or "").strip()
    if not normalized:
        return ""
    if len(normalized) <= _MAX_EXTRACT_CHARS:
        return normalized
    return normalized[:_MAX_EXTRACT_CHARS] + "\n...[TRUNCATED]"


def _extract_pdf_text(local_path: str) -> str:
    try:
        from pypdf import PdfReader

        reader = PdfReader(local_path)
        chunks: list[str] = []
        for page in reader.pages:
            chunks.append(page.extract_text() or "")
            if sum(len(c) for c in chunks) >= _MAX_EXTRACT_CHARS:
                break
        text = _trim_extracted_text("\n".join(chunks))
        if text:
            return text
    except Exception:
        pass
    try:
        from pdfplumber import open as open_pdf

        chunks = []
        with open_pdf(local_path) as pdf:
            for page in pdf.pages:
                chunks.append(page.extract_text() or "")
                if sum(len(c) for c in chunks) >= _MAX_EXTRACT_CHARS:
                    break
        text = _trim_extracted_text("\n".join(chunks))
        if text:
            return text
    except Exception:
        pass
    try:
        proc = subprocess.run(
            ["pdftotext", "-layout", local_path, "-"],
            capture_output=True,
            text=True,
            timeout=60,
            check=True,
        )
        text = _trim_extracted_text(proc.stdout)
        if text:
            return text
    except Exception:
        pass
    return ""


def _extract_docx_text(local_path: str) -> str:
    try:
        from docx import Document

        doc = Document(local_path)
        text = _trim_extracted_text(
            "\n".join(
                p.text for p in doc.paragraphs if isinstance(p.text, str)
            ),
        )
        if text:
            return text
    except Exception:
        pass
    try:
        proc = subprocess.run(
            ["pandoc", "-f", "docx", "-t", "plain", local_path],
            capture_output=True,
            text=True,
            timeout=60,
            check=True,
        )
        text = _trim_extracted_text(proc.stdout)
        if text:
            return text
    except Exception:
        pass
    return ""


def _extract_plain_text(local_path: str) -> str:
    suffix = Path(local_path).suffix.lower()
    if suffix not in {".txt", ".md", ".csv", ".log", ".json", ".yaml", ".yml"}:
        return ""
    try:
        with open(local_path, "r", encoding="utf-8", errors="ignore") as f:
            return _trim_extracted_text(f.read(_MAX_EXTRACT_CHARS + 1))
    except Exception:
        return ""


def _extract_document_text(local_path: str) -> str:
    suffix = Path(local_path).suffix.lower()
    if suffix == ".pdf":
        return _extract_pdf_text(local_path)
    if suffix == ".docx":
        return _extract_docx_text(local_path)
    return _extract_plain_text(local_path)


def _extract_image_text(local_path: str) -> str:
    suffix = Path(local_path).suffix.lower()
    if suffix not in {".png", ".jpg", ".jpeg", ".bmp", ".webp", ".tif", ".tiff"}:
        return ""
    try:
        from PIL import Image
        import pytesseract

        image = Image.open(local_path)
        text = pytesseract.image_to_string(image, lang="chi_sim+eng")
        return _trim_extracted_text(text)
    except Exception as e:
        logger.debug("OCR failed for %s: %s", local_path, e)
        return ""


def _build_media_guidance_text(
    *,
    lang: str,
    local_path: str,
    extracted_text: str,
    block_type: str,
) -> str:
    is_image = block_type == "image"
    if lang == "zh":
        base = (
            f"用户上传图片，已经下载到 {local_path}"
            if is_image
            else f"用户上传文件，已经下载到 {local_path}"
        )
        if extracted_text:
            label = "图片文字识别结果" if is_image else "自动提取的文档正文"
            return (
                f"{base}\n\n以下是{label}（可能被截断）：\n"
                f"{extracted_text}"
            )
        if is_image:
            return (
                f"{base}\n\n未能自动识别图片文字，请使用可用的OCR或视觉模型。"
            )
        return (
            f"{base}\n\n未能自动提取正文，请使用可用工具读取该文件内容。"
        )
    base = (
        f"User uploaded an image, downloaded to {local_path}"
        if is_image
        else f"User uploaded a file, downloaded to {local_path}"
    )
    if extracted_text:
        label = "OCR text from image" if is_image else "Auto-extracted document text"
        return (
            f"{base}\n\n{label} (may be truncated):\n"
            f"{extracted_text}"
        )
    if is_image:
        return (
            f"{base}\n\nOCR failed. Use available OCR or vision tools."
        )
    return (
        f"{base}\n\nAutomatic text extraction failed. "
        f"Use available tools to read this file."
    )


def _build_file_guidance_text(
    *,
    lang: str,
    local_path: str,
    extracted_text: str,
) -> str:
    if lang == "zh":
        base = f"用户上传文件，已经下载到 {local_path}"
        if extracted_text:
            return (
                f"{base}\n\n以下是自动提取的文档正文（可能被截断）：\n"
                f"{extracted_text}"
            )
        return (
            f"{base}\n\n未能自动提取正文，请使用可用工具读取该文件内容。"
        )
    base = f"User uploaded a file, downloaded to {local_path}"
    if extracted_text:
        return (
            f"{base}\n\nAuto-extracted document text (may be truncated):\n"
            f"{extracted_text}"
        )
    return (
        f"{base}\n\nAutomatic text extraction failed. "
        f"Use available tools to read this file."
    )


def _is_allowed_media_path(path: str) -> bool:
    """True if path is a file under _ALLOWED_MEDIA_ROOT."""
    try:
        resolved = Path(path).expanduser().resolve()
        root = _ALLOWED_MEDIA_ROOT.resolve()
        return resolved.is_file() and str(resolved).startswith(str(root))
    except Exception:
        return False


async def _process_single_file_block(
    source: dict,
    filename: Optional[str],
) -> Optional[str]:
    """
    Process a single file block and download the file.

    Args:
        source: The source dict containing file information.
        filename: The filename to save.

    Returns:
        The local file path if successful, None otherwise.
    """
    if isinstance(source, dict) and source.get("type") == "base64":
        if "data" in source:
            base64_data = source.get("data", "")
            local_path = await download_file_from_base64(
                base64_data,
                filename,
            )
            logger.debug(
                "Processed base64 file block: %s -> %s",
                filename or "unnamed",
                local_path,
            )
            return local_path

    elif isinstance(source, dict) and source.get("type") == "url":
        url = source.get("url", "")
        if url:
            parsed = urllib.parse.urlparse(url)
            if parsed.scheme == "file":
                try:
                    local_path = urllib.request.url2pathname(parsed.path)
                    if not _is_allowed_media_path(local_path):
                        logger.warning(
                            "Rejected file:// URL outside allowed media dir",
                        )
                        return None
                except Exception:
                    return None
            local_path = await download_file_from_url(
                url,
                filename,
            )
            logger.debug(
                "Processed URL file block: %s -> %s",
                url,
                local_path,
            )
            return local_path

    return None


def _extract_source_and_filename(block: dict, block_type: str):
    """Extract source and filename from a block."""
    if block_type == "file":
        source = block.get("source", {})
        if isinstance(source, str) and source.strip():
            return {"type": "url", "url": source.strip()}, block.get(
                "filename",
            )
        return source, block.get("filename")

    source = block.get("source", {})
    if not isinstance(source, dict):
        image_url = block.get("image_url")
        if isinstance(image_url, str) and image_url.strip():
            return {"type": "url", "url": image_url.strip()}, None
        return None, None

    filename = None
    if source.get("type") == "url":
        url = source.get("url", "")
        if url:
            parsed = urllib.parse.urlparse(url)
            filename = os.path.basename(parsed.path) or None

    return source, filename


def _media_type_from_path(path: str) -> str:
    """Infer audio media_type from file path suffix."""
    ext = (os.path.splitext(path)[1] or "").lower()
    return {
        ".amr": "audio/amr",
        ".wav": "audio/wav",
        ".mp3": "audio/mp3",
        ".opus": "audio/opus",
    }.get(ext, "audio/octet-stream")


def _update_block_with_local_path(
    block: dict,
    block_type: str,
    local_path: str,
) -> dict:
    """Update block with downloaded local path."""
    if block_type == "file":
        block["source"] = local_path
        if not block.get("filename"):
            block["filename"] = os.path.basename(local_path)
    else:
        if block_type == "audio":
            block["source"] = {
                "type": "url",
                "url": Path(local_path).as_uri(),
                "media_type": _media_type_from_path(local_path),
            }
        else:
            block["source"] = {
                "type": "url",
                "url": str(Path(local_path).resolve()),
            }
    return block


def _handle_download_failure(block_type: str) -> Optional[dict]:
    """Handle download failure based on block type."""
    if block_type == "file":
        return {
            "type": "text",
            "text": "[Error: Unknown file source type or empty data]",
        }
    logger.debug("Failed to download %s block, keeping original", block_type)
    return None


async def _process_single_block(
    message_content: list,
    index: int,
    block: dict,
) -> Optional[str]:
    """
    Process a single file or media block.

    Returns:
        Optional[str]: The local path if download was successful,
        None otherwise.
    """
    block_type = block.get("type")
    if not isinstance(block_type, str):
        return None

    source, filename = _extract_source_and_filename(block, block_type)
    if source is None:
        return None

    # Normalize: when source is "base64" but data is a local path (e.g.
    # DingTalk voice returns path), treat as url only if under allowed dir.
    if (
        block_type == "audio"
        and isinstance(source, dict)
        and source.get("type") == "base64"
    ):
        data = source.get("data")
        if (
            isinstance(data, str)
            and os.path.isfile(data)
            and _is_allowed_media_path(data)
        ):
            block["source"] = {
                "type": "url",
                "url": Path(data).as_uri(),
                "media_type": _media_type_from_path(data),
            }
            source = block["source"]

    try:
        local_path = await _process_single_file_block(source, filename)

        if local_path:
            message_content[index] = _update_block_with_local_path(
                block,
                block_type,
                local_path,
            )
            logger.debug(
                "Updated %s block with local path: %s",
                block_type,
                local_path,
            )
            return local_path
        else:
            error_block = _handle_download_failure(block_type)
            if error_block:
                message_content[index] = error_block
            return None

    except Exception as e:
        logger.error("Failed to process %s block: %s", block_type, e)
        if block_type == "file":
            message_content[index] = {
                "type": "text",
                "text": f"[Error: Failed to download file - {e}]",
            }
        return None


async def process_file_and_media_blocks_in_message(msg) -> None:
    """
    Process file and media blocks (file, image, audio, video) in messages.
    Downloads to local and updates paths/URLs.

    Args:
        msg: The message object (Msg or list[Msg]) to process.
    """
    messages = (
        [msg] if isinstance(msg, Msg) else msg if isinstance(msg, list) else []
    )

    for message in messages:
        if not isinstance(message, Msg):
            continue

        if not isinstance(message.content, list):
            continue

        downloaded_files: list[tuple[int, str, str]] = []

        for i, block in enumerate(message.content):
            if not isinstance(block, dict):
                continue

            block_type = block.get("type")
            if block_type not in ["file", "image", "audio", "video"]:
                continue

            local_path = await _process_single_block(message.content, i, block)
            if local_path:
                downloaded_files.append((i, str(block_type), local_path))

        if downloaded_files:
            lang = load_config().agents.language
            for i, block_type, local_path in reversed(downloaded_files):
                if block_type == "file":
                    extracted_text = _extract_document_text(local_path)
                elif block_type == "image":
                    extracted_text = _extract_image_text(local_path)
                else:
                    extracted_text = ""
                text = _build_media_guidance_text(
                    lang=lang,
                    local_path=local_path,
                    extracted_text=extracted_text,
                    block_type=block_type,
                )
                text_block = {"type": "text", "text": text}
                message.content.insert(i + 1, text_block)


def is_first_user_interaction(messages: list) -> bool:
    """Check if this is the first user interaction.

    Args:
        messages: List of Msg objects from memory.

    Returns:
        bool: True if this is the first user message with no assistant
              responses.
    """
    system_prompt_count = sum(1 for msg in messages if msg.role == "system")
    non_system_messages = messages[system_prompt_count:]

    user_msg_count = sum(
        1 for msg in non_system_messages if msg.role == "user"
    )
    assistant_msg_count = sum(
        1 for msg in non_system_messages if msg.role == "assistant"
    )

    return user_msg_count == 1 and assistant_msg_count == 0


def prepend_to_message_content(msg, guidance: str) -> None:
    """Prepend guidance text to message content.

    Args:
        msg: Msg object to modify.
        guidance: Text to prepend to the message content.
    """
    if isinstance(msg.content, str):
        msg.content = guidance + "\n\n" + msg.content
        return

    if not isinstance(msg.content, list):
        return

    for block in msg.content:
        if isinstance(block, dict) and block.get("type") == "text":
            block["text"] = guidance + "\n\n" + block.get("text", "")
            return

    msg.content.insert(0, {"type": "text", "text": guidance})
