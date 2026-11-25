"""Antigravity local brain monitor (~/.gemini/antigravity/brain/*)."""

from __future__ import annotations

import json
import re
import time
from pathlib import Path
from typing import Any
from urllib.parse import quote

from fastapi import HTTPException

from ..models import (
    AntigravitySessionDetailResponse,
    AntigravitySessionSummary,
    ArtifactItem,
    FileContentResponse,
    ToolCallEntry,
    TranscriptStep,
)
from ..utils import (
    classify_file,
    read_text_preview,
    safe_jail_path,
    timestamp_to_iso,
    utc_now_iso,
)
from .settings_service import SettingsService

UUID_DIR_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)
USER_REQUEST_BLOCK_RE = re.compile(r"<USER_REQUEST>\s*(.*?)\s*</USER_REQUEST>", re.DOTALL)
LEADING_SLASH_CMD_RE = re.compile(r"^(?:/[a-zA-Z0-9_-]+(?:\s+|$))+")
RESOLVED_BACKUP_RE = re.compile(r"\.resolved(?:\.\d+)?$", re.IGNORECASE)

IGNORED_BRAIN_SUBDIRS = {".system_generated", ".user_uploaded"}


def clean_user_title(raw_content: str) -> str:
    """Extract clean human-readable title from a USER_INPUT step."""
    text = (raw_content or "").strip()
    match = USER_REQUEST_BLOCK_RE.search(text)
    if match:
        text = match.group(1).strip()
    else:
        text = text.replace("<USER_REQUEST>", "").replace("</USER_REQUEST>", "")
        meta_idx = text.find("<ADDITIONAL_METADATA>")
        if meta_idx != -1:
            text = text[:meta_idx]

    text = LEADING_SLASH_CMD_RE.sub("", text.strip()).strip()
    single_line = " ".join(text.split())
    if not single_line:
        return "Untitled Antigravity Session"
    if len(single_line) > 96:
        return single_line[:95].rstrip() + "…"
    return single_line


def _fallback_session_title(steps: list[dict[str, Any]], conv_id: str) -> str:
    for step in steps:
        if step.get("type") == "USER_INPUT" and step.get("content"):
            return clean_user_title(str(step["content"]))
    for step in steps:
        content = str(step.get("content") or "")
        if "Your assignment" in content:
            after = content.split("Your assignment", 1)[1]
            if ":" in after:
                after = after.split(":", 1)[1]
            cleaned = " ".join(after.replace("</SYSTEM_MESSAGE>", "").split())
            if cleaned:
                return cleaned[:95].rstrip() + ("…" if len(cleaned) > 96 else "")
    return f"Session {conv_id[:8]}"


def _read_jsonl_tolerant(path: Path) -> list[dict[str, Any]]:
    """Read a JSONL transcript tolerantly, skipping partial trailing lines and retrying Windows locks."""
    if not path.is_file():
        return []

    raw_text = ""
    for attempt in range(4):
        try:
            raw_text = path.read_text(encoding="utf-8", errors="replace")
            break
        except PermissionError:
            if attempt < 3:
                time.sleep(0.03)
                continue
            return []
        except OSError:
            return []

    records: list[dict[str, Any]] = []
    for line in raw_text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        try:
            obj = json.loads(stripped)
            if isinstance(obj, dict):
                records.append(obj)
        except json.JSONDecodeError:
            # Tolerate partially written trailing lines while agent is streaming
            continue
    return records


def _parse_step(raw: dict[str, Any], force_untruncated: bool = False) -> TranscriptStep:
    tool_calls_raw = raw.get("tool_calls") or []
    tool_calls: list[ToolCallEntry] = []
    if isinstance(tool_calls_raw, list):
        for tc in tool_calls_raw:
            if isinstance(tc, dict):
                args_val = tc.get("args")
                if not isinstance(args_val, dict):
                    args_val = {"raw": args_val} if args_val is not None else None
                tool_calls.append(
                    ToolCallEntry(
                        name=str(tc.get("name", "unknown")),
                        args=args_val,
                    )
                )

    truncated = False if force_untruncated else bool(raw.get("truncated_fields"))
    content = raw.get("content")
    thinking = raw.get("thinking")
    return TranscriptStep(
        step_index=int(raw.get("step_index", 0)),
        source=str(raw.get("source", "")),
        type=str(raw.get("type", "")),
        status=str(raw.get("status", "")),
        created_at=str(raw.get("created_at", "")),
        model=str(raw["model"]) if raw.get("model") else None,
        content=str(content) if content is not None else None,
        thinking=str(thinking) if thinking is not None else None,
        tool_calls=tool_calls,
        input_tokens=int(raw.get("input_tokens") or 0),
        output_tokens=int(raw.get("output_tokens") or 0),
        truncated=truncated,
    )


class BrainScanner:
    """Scans `~/.gemini/antigravity/brain/*` for sessions, transcripts, and artifacts."""

    def __init__(self, settings: SettingsService) -> None:
        self.settings = settings

    @property
    def brain_dir(self) -> Path:
        return self.settings.get_brain_dir()

    def _validate_conv_id(self, conv_id: str) -> Path:
        if not UUID_DIR_RE.match(conv_id or ""):
            raise HTTPException(status_code=400, detail="Invalid Antigravity session ID")
        conv_dir = (self.brain_dir / conv_id).resolve()
        if not conv_dir.is_relative_to(self.brain_dir.resolve()) or not conv_dir.is_dir():
            raise HTTPException(status_code=404, detail=f"Session '{conv_id}' not found")
        return conv_dir

    def _collect_session_artifacts(self, conv_dir: Path, conv_id: str, scope_title: str) -> list[ArtifactItem]:
        artifacts: list[ArtifactItem] = []

        def _scan_dir(folder: Path) -> None:
            if not folder.is_dir():
                return
            for entry in folder.iterdir():
                if entry.name in IGNORED_BRAIN_SUBDIRS:
                    continue
                if entry.is_dir():
                    if folder == conv_dir and entry.name == "scratch":
                        _scan_dir(entry)
                    elif folder != conv_dir:
                        _scan_dir(entry)
                    continue
                if not entry.is_file():
                    continue
                if entry.name.endswith(".metadata.json") or RESOLVED_BACKUP_RE.search(entry.name):
                    continue

                try:
                    st = entry.stat()
                except OSError:
                    continue

                rel_path = entry.relative_to(conv_dir).as_posix()
                category, mime_type = classify_file(entry.name)
                encoded_path = quote(rel_path)
                artifacts.append(
                    ArtifactItem(
                        id=f"brain:{conv_id}:{rel_path}",
                        source="antigravity_brain",
                        scope_id=conv_id,
                        scope_title=scope_title,
                        name=entry.name,
                        rel_path=rel_path,
                        category=category,
                        mime_type=mime_type,
                        size=int(st.st_size),
                        modified_at=timestamp_to_iso(st.st_mtime),
                        raw_url=f"/api/antigravity/artifact-raw?conv_id={quote(conv_id)}&path={encoded_path}",
                        preview_url=f"/api/antigravity/artifact-content?conv_id={quote(conv_id)}&path={encoded_path}",
                    )
                )

        _scan_dir(conv_dir)
        artifacts.sort(key=lambda a: a.modified_at, reverse=True)
        return artifacts

    def _build_session_summary(self, conv_dir: Path) -> tuple[AntigravitySessionSummary, list[dict[str, Any]], list[ArtifactItem]]:
        conv_id = conv_dir.name
        transcript_path = conv_dir / ".system_generated" / "logs" / "transcript.jsonl"
        raw_steps = _read_jsonl_tolerant(transcript_path)

        title = _fallback_session_title(raw_steps, conv_id)
        artifacts = self._collect_session_artifacts(conv_dir, conv_id, title)

        try:
            dir_stat = conv_dir.stat()
            fallback_time = timestamp_to_iso(dir_stat.st_mtime)
        except OSError:
            fallback_time = utc_now_iso()

        created_at = fallback_time
        updated_at = fallback_time
        if raw_steps:
            first_ts = raw_steps[0].get("created_at")
            last_ts = raw_steps[-1].get("created_at")
            if first_ts:
                created_at = str(first_ts)
            if last_ts:
                updated_at = str(last_ts)
        elif transcript_path.is_file():
            try:
                updated_at = timestamp_to_iso(transcript_path.stat().st_mtime)
            except OSError:
                pass

        model: str | None = None
        total_in = 0
        total_out = 0
        preview = ""
        for step in raw_steps:
            if step.get("model"):
                model = str(step["model"])
            total_in += int(step.get("input_tokens") or 0)
            total_out += int(step.get("output_tokens") or 0)
            if step.get("type") == "PLANNER_RESPONSE" and step.get("content"):
                text = " ".join(str(step["content"]).split())
                if text:
                    preview = text[:180] + ("…" if len(text) > 180 else "")

        if not preview and raw_steps:
            for step in reversed(raw_steps):
                if step.get("content"):
                    text = " ".join(str(step["content"]).split())
                    if text:
                        preview = text[:180] + ("…" if len(text) > 180 else "")
                        break

        latest_status: str = "idle"
        if raw_steps:
            last_raw_status = str(raw_steps[-1].get("status", "")).upper()
            if last_raw_status in {"ERROR", "FAILED"}:
                latest_status = "error"
            elif last_raw_status in {"IN_PROGRESS", "RUNNING", "PENDING", "STREAMING"}:
                latest_status = "active"
            elif last_raw_status == "DONE":
                latest_status = "done"

        summary = AntigravitySessionSummary(
            id=conv_id,
            title=title,
            updated_at=updated_at,
            created_at=created_at,
            step_count=len(raw_steps),
            artifact_count=len(artifacts),
            latest_status=latest_status,  # type: ignore[arg-type]
            model=model,
            total_input_tokens=total_in,
            total_output_tokens=total_out,
            preview=preview,
        )
        return summary, raw_steps, artifacts

    def list_sessions(self) -> list[AntigravitySessionSummary]:
        root = self.brain_dir
        if not root.is_dir():
            return []

        summaries: list[AntigravitySessionSummary] = []
        for entry in root.iterdir():
            if not entry.is_dir() or not UUID_DIR_RE.match(entry.name):
                continue
            summary, _, _ = self._build_session_summary(entry)
            summaries.append(summary)

        summaries.sort(key=lambda s: s.updated_at, reverse=True)
        return summaries

    def get_session_detail(self, conv_id: str) -> AntigravitySessionDetailResponse:
        conv_dir = self._validate_conv_id(conv_id)
        summary, raw_steps, artifacts = self._build_session_summary(conv_dir)
        steps = [_parse_step(raw) for raw in raw_steps]
        return AntigravitySessionDetailResponse(summary=summary, steps=steps, artifacts=artifacts)

    def get_full_step(self, conv_id: str, step_index: int) -> TranscriptStep:
        conv_dir = self._validate_conv_id(conv_id)
        full_path = conv_dir / ".system_generated" / "logs" / "transcript_full.jsonl"
        compact_path = conv_dir / ".system_generated" / "logs" / "transcript.jsonl"
        source_path = full_path if full_path.is_file() else compact_path

        for raw in _read_jsonl_tolerant(source_path):
            if int(raw.get("step_index", -1)) == step_index:
                return _parse_step(raw, force_untruncated=True)

        if source_path != compact_path and compact_path.is_file():
            for raw in _read_jsonl_tolerant(compact_path):
                if int(raw.get("step_index", -1)) == step_index:
                    return _parse_step(raw, force_untruncated=True)

        raise HTTPException(status_code=404, detail=f"Step {step_index} not found in session '{conv_id}'")

    def list_all_brain_artifacts(self) -> list[ArtifactItem]:
        root = self.brain_dir
        if not root.is_dir():
            return []

        items: list[ArtifactItem] = []
        for entry in root.iterdir():
            if not entry.is_dir() or not UUID_DIR_RE.match(entry.name):
                continue
            transcript_path = entry / ".system_generated" / "logs" / "transcript.jsonl"
            raw_steps = _read_jsonl_tolerant(transcript_path)
            title = _fallback_session_title(raw_steps, entry.name)
            items.extend(self._collect_session_artifacts(entry, entry.name, title))

        items.sort(key=lambda a: a.modified_at, reverse=True)
        return items

    def get_artifact_content(self, conv_id: str, rel_path: str) -> FileContentResponse:
        conv_dir = self._validate_conv_id(conv_id)
        target_file, clean_rel = safe_jail_path(conv_dir, rel_path, allow_root=False)
        if not target_file.exists():
            raise HTTPException(status_code=404, detail="Artifact not found")
        if not target_file.is_file():
            raise HTTPException(status_code=400, detail="Path is not a file")

        st = target_file.stat()
        category, mime_type = classify_file(target_file)
        text = read_text_preview(target_file, category, mime_type)
        raw_url = f"/api/antigravity/artifact-raw?conv_id={quote(conv_id)}&path={quote(clean_rel)}"
        return FileContentResponse(
            rel_path=clean_rel,
            name=target_file.name,
            size=int(st.st_size),
            mime_type=mime_type,
            category=category,
            text=text,
            raw_url=raw_url,
            modified_at=timestamp_to_iso(st.st_mtime),
        )

    def resolve_artifact_raw(self, conv_id: str, rel_path: str) -> tuple[Path, str, str]:
        conv_dir = self._validate_conv_id(conv_id)
        target_file, _ = safe_jail_path(conv_dir, rel_path, allow_root=False)
        if not target_file.exists():
            raise HTTPException(status_code=404, detail="Artifact not found")
        if not target_file.is_file():
            raise HTTPException(status_code=400, detail="Path is not a file")

        _, mime_type = classify_file(target_file)
        return target_file, target_file.name, mime_type
