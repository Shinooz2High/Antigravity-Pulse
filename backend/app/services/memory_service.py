"""Persistent Agent Memories and Workspace Notes/Checklists service."""

from __future__ import annotations

import re
import secrets
import threading
from typing import Any

from fastapi import HTTPException

from ..config import AppConfig
from ..utils import atomic_write_json, read_json_file, utc_now_iso

MEMORY_BLOCK_RE = re.compile(r"```memory\s*\r?\n(.*?)```", re.DOTALL | re.IGNORECASE)
TOKEN_RE = re.compile(r"[0-9A-Za-zÀ-ỹ_]{2,}", re.UNICODE)

MEMORY_INSTRUCTION_HINT = (
    "Để ghi nhớ quy tắc/kiến thức lâu dài cho các phiên sau, có thể xuất block:\n"
    "```memory\ntitle: <tiêu đề ngắn>\nmode: passive\nscope: project\n---\n<nội dung ghi nhớ>\n```"
)


class MemoryService:
    """Thread-safe JSON persistence for Agent Memories and Notes/Checklists."""

    def __init__(self, config: AppConfig) -> None:
        self.config = config
        self.memories_path = config.data_dir / "memories.json"
        self.notes_path = config.data_dir / "notes.json"
        self._lock = threading.RLock()
        self._memories: list[dict[str, Any]] = []
        self._notes: list[dict[str, Any]] = []
        self._load()

    def _load(self) -> None:
        with self._lock:
            self.config.data_dir.mkdir(parents=True, exist_ok=True)
            raw_mems = read_json_file(self.memories_path, default=[])
            self._memories = [m for m in raw_mems if isinstance(m, dict)] if isinstance(raw_mems, list) else []
            raw_notes = read_json_file(self.notes_path, default=[])
            self._notes = [n for n in raw_notes if isinstance(n, dict)] if isinstance(raw_notes, list) else []

    def _save_memories(self) -> None:
        atomic_write_json(self.memories_path, self._memories)

    def _save_notes(self) -> None:
        atomic_write_json(self.notes_path, self._notes)

    # --- Agent Memories ---

    def list_memories(self, project_id: str | None = None) -> list[dict[str, Any]]:
        clean_pid = (project_id or "").strip() or None
        with self._lock:
            items = []
            for m in self._memories:
                if clean_pid is None:
                    items.append(dict(m))
                elif m.get("scope") == "global" or m.get("project_id") == clean_pid:
                    items.append(dict(m))
        items.sort(key=lambda m: (m.get("mode") != "always", m.get("updated_at", "")), reverse=False)
        items.sort(key=lambda m: m.get("updated_at", ""), reverse=True)
        items.sort(key=lambda m: m.get("mode") != "always")
        return items

    def save_memory(
        self,
        *,
        title: str,
        content: str,
        scope: str = "project",
        project_id: str | None = None,
        mode: str = "passive",
        memory_id: str | None = None,
    ) -> dict[str, Any]:
        clean_title = (title or "").strip()
        clean_content = (content or "").strip()
        if not clean_title:
            raise HTTPException(status_code=400, detail="Tiêu đề bộ nhớ không được để trống")
        if not clean_content:
            raise HTTPException(status_code=400, detail="Nội dung bộ nhớ không được để trống")

        norm_scope = "global" if scope == "global" else "project"
        norm_mode = "always" if mode == "always" else "passive"
        effective_pid = None if norm_scope == "global" else ((project_id or "").strip() or None)
        if norm_scope == "project" and not effective_pid:
            norm_scope = "global"

        now = utc_now_iso()
        with self._lock:
            target: dict[str, Any] | None = None
            if memory_id:
                for m in self._memories:
                    if m.get("id") == memory_id:
                        target = m
                        break
            if target is None:
                title_key = clean_title.lower()
                for m in self._memories:
                    if (
                        str(m.get("title", "")).strip().lower() == title_key
                        and m.get("scope") == norm_scope
                        and m.get("project_id") == effective_pid
                    ):
                        target = m
                        break

            if target is not None:
                target["title"] = clean_title
                target["content"] = clean_content
                target["scope"] = norm_scope
                target["project_id"] = effective_pid
                target["mode"] = norm_mode
                target["updated_at"] = now
                saved = dict(target)
            else:
                saved = {
                    "id": f"mem_{secrets.token_hex(6)}",
                    "title": clean_title,
                    "content": clean_content,
                    "scope": norm_scope,
                    "project_id": effective_pid,
                    "mode": norm_mode,
                    "updated_at": now,
                }
                self._memories.append(saved)

            self._save_memories()
            return dict(saved)

    def delete_memory(self, memory_id: str) -> None:
        with self._lock:
            before = len(self._memories)
            self._memories = [m for m in self._memories if m.get("id") != memory_id]
            if len(self._memories) == before:
                raise HTTPException(status_code=404, detail=f"Memory '{memory_id}' not found")
            self._save_memories()

    def build_context_prefix(self, project_id: str, prompt: str) -> str:
        relevant = self.list_memories(project_id)
        if not relevant:
            return ""

        always_items = [m for m in relevant if m.get("mode") == "always"]
        passive_items = [m for m in relevant if m.get("mode") != "always"]

        prompt_tokens = {t.lower() for t in TOKEN_RE.findall(prompt or "")}
        scored_passive: list[tuple[int, dict[str, Any]]] = []
        if prompt_tokens:
            for m in passive_items:
                haystack = f"{m.get('title', '')} {m.get('content', '')}"
                mem_tokens = {t.lower() for t in TOKEN_RE.findall(haystack)}
                score = len(prompt_tokens & mem_tokens)
                if score > 0:
                    scored_passive.append((score, m))
            scored_passive.sort(key=lambda pair: (pair[0], pair[1].get("updated_at", "")), reverse=True)

        selected = list(always_items) + [item for _, item in scored_passive[:5]]
        lines: list[str] = []
        if selected:
            lines.append("[Bộ nhớ Agent - Ngữ cảnh đã lưu]")
            for m in selected:
                scope_label = m.get("scope", "project")
                mode_label = m.get("mode", "passive")
                lines.append(f"- ({scope_label}/{mode_label}) **{m.get('title', '')}**: {m.get('content', '')}")
            lines.append("")

        lines.append(MEMORY_INSTRUCTION_HINT)
        return "\n".join(lines).strip()

    def extract_and_save_memory_blocks(self, project_id: str, text: str) -> list[dict[str, Any]]:
        if not text:
            return []
        saved_items: list[dict[str, Any]] = []
        for match in MEMORY_BLOCK_RE.finditer(text):
            raw_block = match.group(1).strip()
            if not raw_block:
                continue

            meta: dict[str, str] = {}
            body = ""
            if "---" in raw_block:
                header_part, body_part = raw_block.split("---", 1)
                body = body_part.strip()
                for line in header_part.splitlines():
                    if ":" in line:
                        k, v = line.split(":", 1)
                        meta[k.strip().lower()] = v.strip()
            else:
                body_lines: list[str] = []
                in_header = True
                for line in raw_block.splitlines():
                    stripped = line.strip()
                    if in_header and ":" in stripped:
                        k, v = stripped.split(":", 1)
                        k_low = k.strip().lower()
                        if k_low in {"title", "mode", "scope"}:
                            meta[k_low] = v.strip()
                            continue
                    in_header = False
                    body_lines.append(line)
                body = "\n".join(body_lines).strip()

            if not body:
                continue

            title = meta.get("title", "").strip()
            if not title:
                first_line = body.splitlines()[0].strip()
                title = first_line[:60] if first_line else "Agent Memory"

            mode = meta.get("mode", "passive").strip().lower()
            if mode not in {"always", "passive"}:
                mode = "passive"

            scope = meta.get("scope", "project").strip().lower()
            if scope not in {"global", "project"}:
                scope = "project"

            saved = self.save_memory(
                title=title,
                content=body,
                scope=scope,
                project_id=project_id if scope == "project" else None,
                mode=mode,
            )
            saved_items.append(saved)
        return saved_items

    # --- Notes & Checklists ---

    @staticmethod
    def _normalize_checklist(items: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
        normalized: list[dict[str, Any]] = []
        for idx, item in enumerate(items or []):
            if not isinstance(item, dict):
                continue
            text = str(item.get("text", "")).strip()
            if not text:
                continue
            item_id = str(item.get("id") or f"chk_{idx}_{secrets.token_hex(3)}")
            normalized.append(
                {
                    "id": item_id,
                    "text": text,
                    "done": bool(item.get("done", False)),
                }
            )
        return normalized

    def list_notes(self, project_id: str | None = None) -> list[dict[str, Any]]:
        clean_pid = (project_id or "").strip() or None
        with self._lock:
            notes = [
                dict(n)
                for n in self._notes
                if clean_pid is None or n.get("project_id") in (None, clean_pid)
            ]
        notes.sort(key=lambda n: n.get("updated_at", ""), reverse=True)
        notes.sort(key=lambda n: not bool(n.get("pinned", False)))
        return notes

    def create_note(
        self,
        *,
        title: str = "",
        content: str = "",
        pinned: bool = False,
        checklist: list[dict[str, Any]] | None = None,
        project_id: str | None = None,
    ) -> dict[str, Any]:
        clean_title = (title or "").strip() or "Ghi chú mới"
        note = {
            "id": f"note_{secrets.token_hex(6)}",
            "title": clean_title,
            "content": content or "",
            "pinned": bool(pinned),
            "checklist": self._normalize_checklist(checklist),
            "project_id": (project_id or "").strip() or None,
            "updated_at": utc_now_iso(),
        }
        with self._lock:
            self._notes.append(note)
            self._save_notes()
        return dict(note)

    def update_note(
        self,
        note_id: str,
        *,
        title: str | None = None,
        content: str | None = None,
        pinned: bool | None = None,
        checklist: list[dict[str, Any]] | None = None,
        project_id: str | None = None,
    ) -> dict[str, Any]:
        with self._lock:
            for note in self._notes:
                if note.get("id") == note_id:
                    if title is not None:
                        note["title"] = title.strip() or "Ghi chú"
                    if content is not None:
                        note["content"] = content
                    if pinned is not None:
                        note["pinned"] = bool(pinned)
                    if checklist is not None:
                        note["checklist"] = self._normalize_checklist(checklist)
                    if project_id is not None:
                        note["project_id"] = project_id.strip() or None
                    note["updated_at"] = utc_now_iso()
                    self._save_notes()
                    return dict(note)
        raise HTTPException(status_code=404, detail=f"Note '{note_id}' not found")

    def delete_note(self, note_id: str) -> None:
        with self._lock:
            before = len(self._notes)
            self._notes = [n for n in self._notes if n.get("id") != note_id]
            if len(self._notes) == before:
                raise HTTPException(status_code=404, detail=f"Note '{note_id}' not found")
            self._save_notes()
