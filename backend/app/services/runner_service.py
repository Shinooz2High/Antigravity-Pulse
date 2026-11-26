"""Prompt execution queue, Antigravity SDK / CLI / Demo runners, uploads, and mobile approvals."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import secrets
import shutil
import sys
import threading
from pathlib import Path
from typing import Any
from urllib.parse import quote

from fastapi import HTTPException, UploadFile

from ..config import AppConfig
from ..models import (
    ArtifactItem,
    AttachmentItem,
    EngineMode,
    ExecutionPolicy,
    FileContentResponse,
    PendingApproval,
    PromptRun,
    PromptToolCall,
)
from ..utils import (
    atomic_write_json,
    classify_file,
    read_json_file,
    read_text_preview,
    safe_jail_path,
    timestamp_to_iso,
    utc_now_iso,
)
from .project_service import ProjectService
from .settings_service import SettingsService
from .ws_manager import WebSocketManager

logger = logging.getLogger(__name__)


def find_cli_binary(command: str) -> str | None:
    """Locate an agent CLI binary via PATH and standard user install directories."""
    found = shutil.which(command)
    if found:
        return found

    search_dirs: list[Path] = [
        Path.home() / ".gemini" / "bin",
        Path.home() / ".local" / "bin",
    ]
    if os.name == "nt":
        appdata = os.environ.get("APPDATA")
        if appdata:
            search_dirs.append(Path(appdata) / "npm")
        search_dirs.extend(
            [
                Path.home() / "AppData" / "Roaming" / "npm",
                Path.home() / ".bun" / "bin",
                Path.home() / "scoop" / "shims",
            ]
        )
        names = [f"{command}.exe", f"{command}.cmd", f"{command}.bat", command]
    else:
        names = [command]

    for directory in search_dirs:
        if not directory.is_dir():
            continue
        for fname in names:
            candidate = directory / fname
            if candidate.is_file():
                return str(candidate)
    return None


def _wrap_cli_argv(bin_path: str, args: list[str]) -> list[str]:
    """Wrap Windows .cmd/.bat shims via cmd.exe /c while flattening newlines safely."""
    if os.name == "nt" and bin_path.lower().endswith((".cmd", ".bat")):
        safe_args = [re.sub(r"[\r\n]+", " ", a) for a in args]
        return ["cmd.exe", "/c", bin_path, *safe_args]
    return [bin_path, *args]


SAFE_READONLY_CLI_PREFIXES = (
    "git status",
    "git log",
    "git diff",
    "git branch",
    "git show",
    "dir",
    "ls",
    "pwd",
    "whoami",
    "python --version",
    "node --version",
)


class RunnerService:
    """Orchestrates per-project FIFO prompt runs across Antigravity SDK, CLI, and Demo engines."""

    def __init__(
        self,
        config: AppConfig,
        settings: SettingsService,
        project_service: ProjectService,
        ws_manager: WebSocketManager,
        google_auth_service: Any = None,
        memory_service: Any = None,
        checkpoint_service: Any = None,
    ) -> None:
        self.config = config
        self.settings = settings
        self.project_service = project_service
        self.ws_manager = ws_manager
        self.google_auth = google_auth_service
        self.memory_service = memory_service
        self.checkpoint_service = checkpoint_service

        self.runs_dir = config.data_dir / "runs"
        self.uploads_dir = config.data_dir / "uploads"
        self.runs_index_path = config.data_dir / "runs_index.json"
        self.uploads_index_path = config.data_dir / "uploads_index.json"

        self._lock = threading.RLock()
        self._runs: dict[str, PromptRun] = {}
        self._run_order: list[str] = []
        self._uploads: dict[str, dict[str, Any]] = {}

        self._queues: dict[str, asyncio.Queue[str]] = {}
        self._workers: dict[str, asyncio.Task[None]] = {}
        self._active_tasks: dict[str, asyncio.Task[None]] = {}
        self._active_chat_responses: dict[str, Any] = {}
        self._active_procs: dict[str, asyncio.subprocess.Process] = {}
        self._cancelled_runs: set[str] = set()

        self._approvals: dict[str, tuple[PendingApproval, asyncio.Future[bool]]] = {}
        self._started = False

        self._load_persisted()

    def _load_persisted(self) -> None:
        self.runs_dir.mkdir(parents=True, exist_ok=True)
        self.uploads_dir.mkdir(parents=True, exist_ok=True)

        raw_uploads = read_json_file(self.uploads_index_path, default={})
        if isinstance(raw_uploads, dict):
            self._uploads = raw_uploads

        raw_runs = read_json_file(self.runs_index_path, default=[])
        if isinstance(raw_runs, list):
            for item in raw_runs:
                if not isinstance(item, dict) or "id" not in item:
                    continue
                try:
                    run = PromptRun.model_validate(item)
                    if run.status in {"queued", "running", "awaiting_approval"}:
                        run.status = "failed"
                        run.error = run.error or "Server restarted while run was in progress."
                        run.finished_at = run.finished_at or utc_now_iso()
                    self._runs[run.id] = run
                    self._run_order.append(run.id)
                except Exception:
                    continue

    def _save_runs(self) -> None:
        with self._lock:
            payload = [self._runs[rid].model_dump() for rid in self._run_order if rid in self._runs]
            # Keep newest 200 persisted runs
            if len(payload) > 200:
                payload = payload[-200:]
        atomic_write_json(self.runs_index_path, payload)

    def _save_uploads(self) -> None:
        with self._lock:
            payload = dict(self._uploads)
        atomic_write_json(self.uploads_index_path, payload)

    def start(self) -> None:
        self._started = True

    async def stop(self) -> None:
        self._started = False
        for approval_id, (_, fut) in list(self._approvals.items()):
            if not fut.done():
                fut.cancel()
        self._approvals.clear()

        for run_id, task in list(self._active_tasks.items()):
            self._cancelled_runs.add(run_id)
            task.cancel()

        for proc in list(self._active_procs.values()):
            if proc.returncode is None:
                try:
                    proc.terminate()
                except Exception:
                    pass

        for worker in list(self._workers.values()):
            worker.cancel()

        if self._workers:
            await asyncio.gather(*self._workers.values(), return_exceptions=True)
        self._workers.clear()
        self._queues.clear()

    # --- Uploads ---

    async def save_uploads(
        self,
        files: list[UploadFile],
        project_id: str | None = None,
    ) -> list[AttachmentItem]:
        del project_id
        results: list[AttachmentItem] = []
        for f in files:
            att_id = f"att_{secrets.token_hex(6)}"
            orig_name = Path(f.filename or "upload.bin").name or "upload.bin"
            safe_name = orig_name.replace("\x00", "_")
            dest_dir = (self.uploads_dir / att_id).resolve()
            dest_dir.mkdir(parents=True, exist_ok=True)
            dest_path = (dest_dir / safe_name).resolve()
            if not dest_path.is_relative_to(dest_dir):
                raise HTTPException(status_code=400, detail="Invalid uploaded filename")

            data = await f.read()
            dest_path.write_bytes(data)

            _, detected_mime = classify_file(dest_path)
            mime_type = f.content_type or detected_mime
            rel_path = f"{att_id}/{safe_name}"
            raw_url = f"/api/prompts/upload-raw/{att_id}"

            item = AttachmentItem(
                id=att_id,
                name=safe_name,
                rel_path=rel_path,
                mime_type=mime_type,
                size=len(data),
                raw_url=raw_url,
            )
            with self._lock:
                self._uploads[att_id] = {
                    **item.model_dump(),
                    "disk_path": str(dest_path),
                }
            results.append(item)

        self._save_uploads()
        return results

    def resolve_upload_raw(self, attachment_id: str) -> tuple[Path, str, str]:
        with self._lock:
            rec = self._uploads.get(attachment_id)
        if not rec:
            raise HTTPException(status_code=404, detail=f"Attachment '{attachment_id}' not found")
        disk_path = Path(str(rec["disk_path"])).resolve()
        if not disk_path.is_file() or not disk_path.is_relative_to(self.uploads_dir.resolve()):
            raise HTTPException(status_code=404, detail="Uploaded file missing on disk")
        return disk_path, str(rec["name"]), str(rec["mime_type"])

    def _get_attachments(self, attachment_ids: list[str]) -> list[tuple[AttachmentItem, Path]]:
        items: list[tuple[AttachmentItem, Path]] = []
        with self._lock:
            for att_id in attachment_ids:
                rec = self._uploads.get(att_id)
                if not rec:
                    raise HTTPException(status_code=400, detail=f"Unknown attachment_id: {att_id}")
                disk_path = Path(str(rec["disk_path"])).resolve()
                item = AttachmentItem(
                    id=str(rec["id"]),
                    name=str(rec["name"]),
                    rel_path=str(rec["rel_path"]),
                    mime_type=str(rec["mime_type"]),
                    size=int(rec["size"]),
                    raw_url=str(rec["raw_url"]),
                )
                items.append((item, disk_path))
        return items

    # --- Queue & Run Queries ---

    async def enqueue_run(
        self,
        *,
        project_id: str,
        prompt: str,
        engine_mode: EngineMode | None = None,
        execution_policy: ExecutionPolicy | None = None,
        attachment_ids: list[str] | None = None,
        device_name: str | None = None,
    ) -> PromptRun:
        clean_prompt = (prompt or "").strip()
        if not clean_prompt:
            raise HTTPException(status_code=400, detail="Prompt must not be empty")

        project = self.project_service.get_project(project_id)
        if not project.exists:
            raise HTTPException(status_code=400, detail=f"Project folder does not exist: {project.path}")

        attachments_with_paths = self._get_attachments(attachment_ids or [])
        attachments = [item for item, _ in attachments_with_paths]

        effective_engine: EngineMode = engine_mode or project.engine_mode or self.settings.get_default_engine_mode()
        effective_policy: ExecutionPolicy = (
            execution_policy or project.execution_policy or self.settings.get_default_execution_policy()
        )

        run_id = f"run_{secrets.token_hex(6)}"
        run = PromptRun(
            id=run_id,
            project_id=project.id,
            project_name=project.name,
            prompt=clean_prompt,
            engine_mode=effective_engine,
            execution_policy=effective_policy,
            status="queued",
            attachments=attachments,
            created_at=utc_now_iso(),
            device_name=device_name,
        )

        with self._lock:
            self._runs[run_id] = run
            self._run_order.append(run_id)
        self._save_runs()
        self.project_service.touch_activity(project.id)

        await self.ws_manager.broadcast("prompt.created", {"run": run.model_dump()})

        if project.id not in self._queues:
            self._queues[project.id] = asyncio.Queue()
        await self._queues[project.id].put(run_id)

        worker = self._workers.get(project.id)
        if worker is None or worker.done():
            self._workers[project.id] = asyncio.create_task(self._project_worker(project.id))

        return run

    def list_runs(
        self,
        *,
        project_id: str | None = None,
        limit: int = 50,
    ) -> tuple[list[PromptRun], list[PendingApproval]]:
        with self._lock:
            ordered = [self._runs[rid] for rid in reversed(self._run_order) if rid in self._runs]
            if project_id:
                ordered = [r for r in ordered if r.project_id == project_id]
            runs = [r.model_copy(deep=True) for r in ordered[:limit]]
            approvals = [
                pending.model_copy(deep=True)
                for pending, _ in self._approvals.values()
                if not project_id or self._runs.get(pending.run_id, None) and self._runs[pending.run_id].project_id == project_id
            ]
        return runs, approvals

    def get_run(self, run_id: str) -> PromptRun:
        with self._lock:
            run = self._runs.get(run_id)
            if not run:
                raise HTTPException(status_code=404, detail=f"Prompt run '{run_id}' not found")
            return run.model_copy(deep=True)

    async def cancel_run(self, run_id: str) -> None:
        run = self.get_run(run_id)
        if run.status in {"completed", "failed", "cancelled"}:
            return

        self._cancelled_runs.add(run_id)

        # Resolve any waiting approvals for this run
        for approval_id, (pending, fut) in list(self._approvals.items()):
            if pending.run_id == run_id:
                self._approvals.pop(approval_id, None)
                if not fut.done():
                    fut.set_result(False)
                await self.ws_manager.broadcast(
                    "prompt.approval_resolved",
                    {"approval_id": approval_id, "run_id": run_id, "approved": False},
                )

        # Cancel active SDK chat response or subprocess
        chat_resp = self._active_chat_responses.get(run_id)
        if chat_resp is not None:
            try:
                await chat_resp.cancel()
            except Exception:
                pass

        proc = self._active_procs.get(run_id)
        if proc is not None and proc.returncode is None:
            try:
                proc.terminate()
            except Exception:
                pass

        task = self._active_tasks.get(run_id)
        if task is not None and not task.done():
            task.cancel()

        if run.status == "queued":
            await self._finalize_run(run_id, "cancelled", error=None)

    async def resolve_approval(self, *, run_id: str, approval_id: str, approved: bool) -> None:
        entry = self._approvals.get(approval_id)
        if not entry:
            raise HTTPException(status_code=404, detail=f"Pending approval '{approval_id}' not found")
        pending, fut = entry
        if pending.run_id != run_id:
            raise HTTPException(status_code=400, detail="Approval does not belong to this run")

        self._approvals.pop(approval_id, None)
        if not fut.done():
            fut.set_result(bool(approved))

        await self.ws_manager.broadcast(
            "prompt.approval_resolved",
            {"approval_id": approval_id, "run_id": run_id, "approved": bool(approved)},
        )

    async def _request_mobile_approval(
        self,
        *,
        run_id: str,
        project_name: str,
        tool_name: str,
        description: str,
        args: dict[str, Any],
    ) -> bool:
        if run_id in self._cancelled_runs:
            return False

        approval_id = f"apr_{secrets.token_hex(6)}"
        pending = PendingApproval(
            approval_id=approval_id,
            run_id=run_id,
            project_name=project_name,
            tool_name=tool_name,
            description=description,
            args=args,
            created_at=utc_now_iso(),
        )
        loop = asyncio.get_running_loop()
        fut: asyncio.Future[bool] = loop.create_future()
        self._approvals[approval_id] = (pending, fut)

        with self._lock:
            run = self._runs[run_id]
            run.status = "awaiting_approval"
        self._save_runs()

        await self.ws_manager.broadcast(
            "prompt.status",
            {"run_id": run_id, "status": "awaiting_approval"},
        )
        await self.ws_manager.broadcast(
            "prompt.approval_required",
            {"approval": pending.model_dump()},
        )

        try:
            approved = await fut
        except asyncio.CancelledError:
            self._approvals.pop(approval_id, None)
            raise
        finally:
            self._approvals.pop(approval_id, None)

        if run_id not in self._cancelled_runs:
            with self._lock:
                run = self._runs[run_id]
                if run.status == "awaiting_approval":
                    run.status = "running"
            await self.ws_manager.broadcast(
                "prompt.status",
                {"run_id": run_id, "status": "running"},
            )
        return bool(approved)

    # --- Worker Loop & Streaming Helpers ---

    async def _project_worker(self, project_id: str) -> None:
        queue = self._queues[project_id]
        try:
            while True:
                run_id = await queue.get()
                try:
                    if run_id in self._cancelled_runs:
                        continue
                    task = asyncio.create_task(self._execute_run(run_id))
                    self._active_tasks[run_id] = task
                    try:
                        await task
                    except asyncio.CancelledError:
                        await self._finalize_run(run_id, "cancelled", error=None)
                    finally:
                        self._active_tasks.pop(run_id, None)
                        self._active_chat_responses.pop(run_id, None)
                        self._active_procs.pop(run_id, None)
                finally:
                    queue.task_done()
        except asyncio.CancelledError:
            return

    async def _append_thought(self, run_id: str, delta: str) -> None:
        if not delta:
            return
        with self._lock:
            run = self._runs[run_id]
            run.thoughts += delta
        await self.ws_manager.broadcast(
            "prompt.thought_delta",
            {"run_id": run_id, "delta": delta},
        )

    async def _append_token(self, run_id: str, delta: str) -> None:
        if not delta:
            return
        with self._lock:
            run = self._runs[run_id]
            run.response_text += delta
        try:
            sys.stdout.write(delta)
            sys.stdout.flush()
        except Exception:
            pass
        await self.ws_manager.broadcast(
            "prompt.token_delta",
            {"run_id": run_id, "delta": delta},
        )

    async def _emit_tool_call(self, run_id: str, tc: PromptToolCall) -> None:
        with self._lock:
            run = self._runs[run_id]
            replaced = False
            for idx, existing in enumerate(run.tool_calls):
                if existing.id == tc.id:
                    run.tool_calls[idx] = tc
                    replaced = True
                    break
            if not replaced:
                run.tool_calls.append(tc)
        try:
            if tc.status == "running":
                print(f"\n🔧 [TOOL]: {tc.name} {tc.args or ''}", flush=True)
            elif tc.status in ("completed", "error"):
                print(f" -> [{tc.status.upper()}]", flush=True)
        except Exception:
            pass
        await self.ws_manager.broadcast(
            "prompt.tool_call",
            {"run_id": run_id, "tool_call": tc.model_dump()},
        )

    async def _execute_run(self, run_id: str) -> None:
        run = self.get_run(run_id)
        project = self.project_service.get_project(run.project_id)
        project_path = Path(project.path).resolve()
        run_dir = (self.runs_dir / run_id).resolve()
        run_dir.mkdir(parents=True, exist_ok=True)

        with self._lock:
            cur = self._runs[run_id]
            cur.status = "running"
            cur.started_at = utc_now_iso()
        self._save_runs()

        await self.ws_manager.broadcast(
            "prompt.status",
            {"run_id": run_id, "status": "running", "started_at": self._runs[run_id].started_at},
        )
        print(f"\n" + "=" * 56, flush=True)
        print(f"⚡ [PROMPT TỪ {run.device_name or 'MOBILE'}]: \"{run.prompt}\"", flush=True)
        print(f"   Dự án: {project.name} | Engine: {run.engine_mode} | Quyền: {run.execution_policy}", flush=True)
        print("=" * 56, flush=True)

        if (
            self.checkpoint_service is not None
            and run.execution_policy != "read_only"
            and run.engine_mode != "demo"
        ):
            try:
                await asyncio.to_thread(
                    self.checkpoint_service.create_checkpoint,
                    run.project_id,
                    f"Auto: {run.prompt[:40]}",
                    "auto",
                )
            except Exception as exc:
                logger.debug("Best-effort auto checkpoint failed for %s: %s", run_id, exc)

        try:
            if run.engine_mode == "antigravity_sdk":
                await self._run_antigravity_sdk(run_id, project_path, run_dir)
            elif run.engine_mode == "cli":
                await self._run_cli(run_id, project_path, run_dir)
            elif run.engine_mode == "claude_code":
                await self._run_claude_code(run_id, project_path, run_dir)
            elif run.engine_mode == "codex":
                await self._run_codex(run_id, project_path, run_dir)
            elif run.engine_mode == "opencode":
                await self._run_opencode(run_id, project_path, run_dir)
            else:
                await self._run_demo(run_id, project_path, run_dir)

            if run_id in self._cancelled_runs:
                await self._finalize_run(run_id, "cancelled", error=None)
            else:
                await self._finalize_run(run_id, "completed", error=None)
        except asyncio.CancelledError:
            await self._finalize_run(run_id, "cancelled", error=None)
            raise
        except Exception as exc:
            logger.exception("Prompt run %s failed: %s", run_id, exc)
            exc_str = str(exc)
            if "429" in exc_str or "quota" in exc_str.lower() or "resource_exhausted" in exc_str.lower():
                current_model = self.settings.get_model()
                delay = 12600
                m_delay = re.search(r"retryDelay:?\s*(\d+)s", exc_str)
                if m_delay:
                    try:
                        delay = int(m_delay.group(1))
                    except ValueError:
                        pass
                from .models_service import ModelsService
                ModelsService(self.config, self.settings).record_exhaustion(current_model, delay)
            await self._finalize_run(run_id, "failed", error=str(exc))

    def _write_run_report(self, run: PromptRun, run_dir: Path) -> None:
        lines = [
            f"# Antigravity Pulse Report — {run.project_name}",
            "",
            f"- **Run ID**: `{run.id}`",
            f"- **Engine**: `{run.engine_mode}`",
            f"- **Policy**: `{run.execution_policy}`",
            f"- **Status**: `{run.status}`",
            f"- **Created**: {run.created_at}",
            f"- **Finished**: {run.finished_at or utc_now_iso()}",
            "",
            "## Prompt",
            "",
            run.prompt,
            "",
        ]
        if run.thoughts.strip():
            lines.extend(["## Thoughts", "", run.thoughts.strip(), ""])
        if run.tool_calls:
            lines.extend(["## Tool Calls", ""])
            for tc in run.tool_calls:
                lines.append(f"- `{tc.name}` (`{tc.status}`) — `{tc.args or {}}`")
            lines.append("")
        lines.extend(["## Response", "", run.response_text.strip() or "_No response text._", ""])
        if run.error:
            lines.extend(["## Error", "", f"```\n{run.error}\n```", ""])

        report_path = run_dir / "report.md"
        report_path.write_text("\n".join(lines), encoding="utf-8")

    def _index_run_artifacts(self, run: PromptRun, run_dir: Path) -> list[ArtifactItem]:
        if not run_dir.is_dir():
            return []
        items: list[ArtifactItem] = []
        scope_title = f"{run.project_name}: {run.prompt[:42]}"
        for p in run_dir.rglob("*"):
            if not p.is_file():
                continue
            rel = p.relative_to(run_dir).as_posix()
            # Skip internal SDK storage directory inside run_dir
            if rel == "sdk_state" or rel.startswith("sdk_state/"):
                continue
            try:
                st = p.stat()
            except OSError:
                continue
            category, mime_type = classify_file(p.name)
            encoded = quote(rel)
            items.append(
                ArtifactItem(
                    id=f"run:{run.id}:{rel}",
                    source="prompt_run",
                    scope_id=run.id,
                    scope_title=scope_title,
                    name=p.name,
                    rel_path=rel,
                    category=category,
                    mime_type=mime_type,
                    size=int(st.st_size),
                    modified_at=timestamp_to_iso(st.st_mtime),
                    raw_url=f"/api/prompts/{run.id}/artifact-raw?path={encoded}",
                    preview_url=f"/api/prompts/{run.id}/artifact-content?path={encoded}",
                )
            )
        items.sort(key=lambda a: (a.name != "report.md", a.modified_at), reverse=False)
        return items

    async def _finalize_run(self, run_id: str, status: str, *, error: str | None) -> None:
        run_dir = (self.runs_dir / run_id).resolve()
        run_dir.mkdir(parents=True, exist_ok=True)
        finished_at = utc_now_iso()

        with self._lock:
            run = self._runs[run_id]
            run.status = status  # type: ignore[assignment]
            run.finished_at = finished_at
            if error:
                run.error = error

        if status == "completed":
            completed_run = self.get_run(run_id)
            if self.memory_service is not None and completed_run.engine_mode != "demo" and completed_run.response_text:
                try:
                    saved_mems = self.memory_service.extract_and_save_memory_blocks(
                        completed_run.project_id,
                        completed_run.response_text,
                    )
                    if saved_mems:
                        await self.ws_manager.broadcast(
                            "memory.updated",
                            {"project_id": completed_run.project_id, "count": len(saved_mems)},
                        )
                except Exception as exc:
                    logger.debug("Memory block extraction skipped: %s", exc)
            self._write_run_report(completed_run, run_dir)
            artifacts = self._index_run_artifacts(completed_run, run_dir)
            with self._lock:
                self._runs[run_id].output_artifacts = artifacts

        self._save_runs()
        self.project_service.touch_activity(self._runs[run_id].project_id)

        await self.ws_manager.broadcast(
            "prompt.status",
            {
                "run_id": run_id,
                "status": status,
                "finished_at": finished_at,
                "error": error,
            },
        )
        print(f"\n✨ [HOÀN TẤT TÁC VỤ {run_id}] Trạng thái: {status.upper()}", flush=True)
        await self.ws_manager.broadcast(
            "prompt.completed",
            {
                "run_id": run_id,
                "status": status,
                "finished_at": finished_at,
                "error": error,
            },
        )
        if status == "completed":
            await self.ws_manager.broadcast(
                "artifact.updated",
                {"source": "prompt_run", "scope_id": run_id, "path": "report.md"},
            )

    # --- Engine Implementations ---

    def _build_prompt_with_memory(self, run: PromptRun) -> str:
        base_prompt = run.prompt.strip()
        if self.memory_service is None or run.engine_mode == "demo":
            return base_prompt
        try:
            prefix = self.memory_service.build_context_prefix(run.project_id, base_prompt)
        except Exception as exc:
            logger.debug("Memory prefix build failed: %s", exc)
            return base_prompt
        if prefix:
            return f"{prefix}\n\n{base_prompt}"
        return base_prompt

    def _format_prompt_with_attachments(self, run: PromptRun) -> str:
        prompt_body = self._build_prompt_with_memory(run)
        if run.attachments:
            att_lines: list[str] = []
            for att in run.attachments:
                try:
                    att_path, _, mime = self.resolve_upload_raw(att.id)
                    att_lines.append(f"- `{att.name}` ({mime}): `{att_path}`")
                except Exception:
                    continue
            if att_lines:
                prompt_body = (
                    f"{prompt_body}\n\n"
                    "Attached files uploaded from mobile (you can read/inspect these paths directly):\n"
                    + "\n".join(att_lines)
                )
        return prompt_body

    async def _run_agy_stream_json(self, run_id: str, project_path: Path, run_dir: Path) -> None:
        """Execute prompt using the official Antigravity CLI (`agy -p --output-format stream-json`),
        leveraging the user's unified Google Antigravity account token in the OS secure keyring.
        """
        del run_dir
        from .google_auth_service import find_agy_binary

        agy_bin = find_agy_binary()
        if not agy_bin:
            raise RuntimeError(
                "Không tìm thấy `agy` CLI trên máy tính PC. "
                "Vui lòng cài Antigravity hoặc chuyển sang Đăng nhập Google OAuth / Gemini API Key trong Cài đặt."
            )

        if self.google_auth:
            await self.google_auth.probe_agy_session(force=False)
            resolved_model = self.google_auth.resolve_agy_model_id(self.settings.get_model())
        else:
            resolved_model = self.settings.get_model()

        run = self.get_run(run_id)
        prompt_body = self._format_prompt_with_attachments(run)

        argv: list[str] = [
            agy_bin,
            "-p",
            prompt_body,
            "--output-format",
            "stream-json",
            "--model",
            resolved_model,
        ]
        if run.execution_policy == "read_only":
            argv.extend(["--mode", "plan", "--sandbox"])
        elif run.execution_policy == "ask_mobile":
            argv.extend(["--mode", "auto", "--sandbox"])
        else:
            argv.append("--dangerously-skip-permissions")

        await self._append_thought(
            run_id,
            f"🔐 Đang thực thi bằng **Token Tài khoản Antigravity (AGY)** — Model: `{resolved_model}` | Quyền: `{run.execution_policy}`\n",
        )

        proc = await asyncio.create_subprocess_exec(
            *argv,
            cwd=str(project_path),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            limit=8 * 1024 * 1024,
        )
        self._active_procs[run_id] = proc

        streamed_any_text = False
        final_result_error: str | None = None
        tool_by_step: dict[int, PromptToolCall] = {}

        assert proc.stdout is not None
        while True:
            if run_id in self._cancelled_runs:
                proc.terminate()
                break
            line = await proc.stdout.readline()
            if not line:
                break
            raw_line = line.decode("utf-8", errors="replace").strip()
            if not raw_line:
                continue
            try:
                evt = json.loads(raw_line)
            except Exception:
                await self._append_token(run_id, raw_line + "\n")
                streamed_any_text = True
                continue

            if not isinstance(evt, dict):
                continue

            evt_type = evt.get("event")
            if evt_type == "init":
                conv_id = evt.get("conversation_id")
                if conv_id:
                    await self._append_thought(run_id, f"📎 Phiên AGY: `{conv_id}`\n")
            elif evt_type == "step_update":
                su = evt.get("step_update") or {}
                if not isinstance(su, dict):
                    continue
                step_type = su.get("step_type")
                state = su.get("state")
                step_idx = int(su.get("step_index") or 0)

                if step_type in ("thought", "thinking"):
                    tdelta = su.get("text_delta") or su.get("thought") or ""
                    if tdelta:
                        await self._append_thought(run_id, str(tdelta))
                elif step_type == "tool":
                    t_name = str(su.get("tool_name") or (su.get("tool_info") or {}).get("name") or "tool")
                    t_info = su.get("tool_info") if isinstance(su.get("tool_info"), dict) else {}
                    t_args = t_info.get("parameters") if isinstance(t_info.get("parameters"), dict) else None
                    tc_id = f"agy_step_{step_idx}"
                    if state == "ACTIVE":
                        ptc = PromptToolCall(
                            id=tc_id,
                            name=t_name,
                            args=t_args,
                            status="running",
                            timestamp=utc_now_iso(),
                        )
                        tool_by_step[step_idx] = ptc
                        await self._emit_tool_call(run_id, ptc)
                    elif state in ("DONE", "ERROR", "FAILED"):
                        prev = tool_by_step.get(step_idx)
                        has_err = state in ("ERROR", "FAILED") or bool(t_info.get("error"))
                        ptc = PromptToolCall(
                            id=tc_id,
                            name=t_name,
                            args=t_args or (prev.args if prev else None),
                            status="error" if has_err else "completed",
                            timestamp=utc_now_iso(),
                        )
                        await self._emit_tool_call(run_id, ptc)
                elif step_type == "agent_response":
                    if su.get("thought_delta"):
                        await self._append_thought(run_id, str(su["thought_delta"]))
                    tdelta = su.get("text_delta")
                    if tdelta:
                        await self._append_token(run_id, str(tdelta))
                        streamed_any_text = True
            elif evt_type == "result":
                res_obj = evt.get("result") or {}
                if isinstance(res_obj, dict):
                    res_status = str(res_obj.get("status") or "").upper()
                    if res_status and res_status != "SUCCESS":
                        final_result_error = str(res_obj.get("error") or f"AGY trả về trạng thái {res_status}")
                    resp_full = res_obj.get("response")
                    if resp_full and not streamed_any_text:
                        await self._append_token(run_id, str(resp_full))
                        streamed_any_text = True

        stderr_bytes = b""
        if proc.stderr is not None:
            stderr_bytes = await proc.stderr.read()
        rc = await proc.wait()

        if run_id in self._cancelled_runs:
            return
        if final_result_error:
            raise RuntimeError(final_result_error)
        if rc != 0:
            err_msg = stderr_bytes.decode("utf-8", errors="replace").strip()
            raise RuntimeError(err_msg or f"AGY CLI kết thúc với mã lỗi {rc}")

    async def _run_antigravity_sdk(self, run_id: str, project_path: Path, run_dir: Path) -> None:
        if self.google_auth is not None and self.settings.get_auth_source() in ("auto", "agy_account"):
            await self.google_auth.probe_agy_session(force=False)

        effective_auth = (
            self.google_auth.resolve_effective_auth_mode()
            if self.google_auth is not None
            else "api_key"
        )

        # Priority 1: Official Antigravity (AGY) Account Session
        if effective_auth == "agy_account":
            await self._run_agy_stream_json(run_id, project_path, run_dir)
            return

        try:
            from google.antigravity import Agent, BuiltinTools, CapabilitiesConfig, LocalAgentConfig
            from google.antigravity import types as ga_types
            from google.antigravity.hooks import policy
        except Exception as exc:
            raise RuntimeError(f"Không thể nạp google-antigravity SDK: {exc}") from exc

        api_key = self.settings.get_effective_api_key()
        vertex_enabled, vertex_project, vertex_location = self.settings.get_effective_vertex()

        oauth_token: str | None = None
        oauth_quota_project: str | None = None
        if effective_auth == "google_oauth" and self.google_auth is not None:
            oauth_token, oauth_quota_project = await asyncio.to_thread(
                self.google_auth.get_valid_access_token
            )

        if not oauth_token and not api_key and not (vertex_enabled and vertex_project):
            raise RuntimeError(
                "Chưa cấu hình Token AGY, Tài khoản Google OAuth hoặc GEMINI_API_KEY. "
                "Vui lòng vào Cài đặt (Settings) -> 'Đăng nhập Tài khoản Google & Token AGY' để kết nối."
            )

        run = self.get_run(run_id)
        project_name = run.project_name

        read_only_names = [t.value for t in BuiltinTools.read_only()] + [
            t.value for t in BuiltinTools.deprecated()
        ]

        if run.execution_policy == "read_only":
            capabilities = CapabilitiesConfig(
                disabled_tools=[
                    BuiltinTools.CREATE_FILE,
                    BuiltinTools.EDIT_FILE,
                    BuiltinTools.RUN_COMMAND,
                    BuiltinTools.INVOKE_SUBAGENT,
                    BuiltinTools.RUN_WORKFLOW,
                    BuiltinTools.GENERATE_IMAGE,
                    BuiltinTools.SCHEDULE,
                    BuiltinTools.ASK_QUESTION,
                ]
            )
            policies_list = [
                policy.deny_all(),
                *[policy.allow(n) for n in read_only_names],
                policy.allow(BuiltinTools.SEARCH_WEB.value),
            ]
        elif run.execution_policy == "ask_mobile":
            capabilities = CapabilitiesConfig(
                disabled_tools=[BuiltinTools.ASK_QUESTION]
            )

            async def _mobile_ask_handler(tc: ga_types.ToolCall, reason: str = "") -> bool:
                tool_name = tc.name.value if hasattr(tc.name, "value") else str(tc.name)
                desc = reason.strip() if reason else f"Agent muốn thực thi tool '{tool_name}' trong {project_name}"
                return await self._request_mobile_approval(
                    run_id=run_id,
                    project_name=project_name,
                    tool_name=tool_name,
                    description=desc,
                    args=dict(tc.args or {}),
                )

            policies_list = [
                *[policy.allow(n) for n in read_only_names],
                policy.allow(BuiltinTools.SEARCH_WEB.value),
                policy.ask_user("*", handler=_mobile_ask_handler),
            ]
        else:
            # auto_workspace
            capabilities = CapabilitiesConfig(
                disabled_tools=[BuiltinTools.ASK_QUESTION]
            )
            policies_list = [
                *policy.workspace_only([str(project_path)]),
                policy.allow_all(),
            ]

        sdk_state_dir = run_dir / "sdk_state"
        sdk_app_data = self.config.data_dir / "antigravity_sdk"
        sdk_state_dir.mkdir(parents=True, exist_ok=True)
        sdk_app_data.mkdir(parents=True, exist_ok=True)

        selected_model = self.settings.get_model()
        cfg_kwargs: dict[str, Any] = {
            "workspaces": [str(project_path)],
            "capabilities": capabilities,
            "policies": policies_list,
            "save_dir": str(sdk_state_dir),
            "app_data_dir": str(sdk_app_data),
        }
        if oauth_token:
            headers: dict[str, str] = {"Authorization": f"Bearer {oauth_token}"}
            effective_proj = vertex_project or oauth_quota_project
            if effective_proj:
                headers["x-goog-user-project"] = effective_proj
            if vertex_enabled and effective_proj:
                endpoint: Any = ga_types.VertexEndpoint(
                    project=effective_proj,
                    location=vertex_location,
                    http_headers=headers,
                )
            else:
                endpoint = ga_types.GeminiAPIEndpoint(
                    base_url="https://generativelanguage.googleapis.com",
                    http_headers=headers,
                )
            cfg_kwargs["models"] = [
                ga_types.ModelTarget(
                    name=selected_model,
                    types=[ga_types.ModelType.TEXT],
                    endpoint=endpoint,
                )
            ]
            await self._append_thought(
                run_id,
                f"🔐 Đang thực thi bằng **Google OAuth 2.0 Token** — Model: `{selected_model}`\n",
            )
        elif vertex_enabled and vertex_project:
            cfg_kwargs["model"] = selected_model
            cfg_kwargs["vertex"] = True
            cfg_kwargs["project"] = vertex_project
            cfg_kwargs["location"] = vertex_location
        else:
            cfg_kwargs["model"] = selected_model
            cfg_kwargs["api_key"] = api_key
            cfg_kwargs["vertex"] = False

        agent_config = LocalAgentConfig(**cfg_kwargs)

        # Build multimodal input with memory context & uploaded attachments
        effective_prompt = self._build_prompt_with_memory(run)
        prompt_parts: list[Any] = [effective_prompt]
        extra_notes: list[str] = []
        for att in run.attachments:
            try:
                att_path, _, mime = self.resolve_upload_raw(att.id)
                if mime in ga_types.SUPPORTED_IMAGE_MIMES:
                    prompt_parts.append(ga_types.Image.from_file(att_path, description=att.name))
                elif mime in ga_types.SUPPORTED_DOCUMENT_MIMES:
                    prompt_parts.append(ga_types.Document.from_file(att_path, description=att.name))
                else:
                    extra_notes.append(f"- Attachment `{att.name}` ({mime}) saved at `{att_path}`")
            except Exception:
                continue

        if extra_notes:
            prompt_parts[0] = f"{effective_prompt}\n\nAttached files:\n" + "\n".join(extra_notes)

        chat_input: Any = prompt_parts if len(prompt_parts) > 1 else prompt_parts[0]

        tool_call_index: dict[str, PromptToolCall] = {}
        async with Agent(agent_config) as agent:
            chat_resp = await agent.chat(chat_input)
            self._active_chat_responses[run_id] = chat_resp
            async for chunk in chat_resp.chunks:
                if run_id in self._cancelled_runs:
                    await chat_resp.cancel()
                    break
                if isinstance(chunk, ga_types.Thought):
                    await self._append_thought(run_id, chunk.text)
                elif isinstance(chunk, ga_types.Text):
                    await self._append_token(run_id, chunk.text)
                elif isinstance(chunk, ga_types.ToolCall):
                    tc_id = chunk.id or f"tc_{secrets.token_hex(4)}"
                    t_name = chunk.name.value if hasattr(chunk.name, "value") else str(chunk.name)
                    ptc = PromptToolCall(
                        id=tc_id,
                        name=t_name,
                        args=dict(chunk.args or {}),
                        status="running",
                        timestamp=utc_now_iso(),
                    )
                    tool_call_index[tc_id] = ptc
                    await self._emit_tool_call(run_id, ptc)
                elif isinstance(chunk, ga_types.ToolResult):
                    tc_id = chunk.id or ""
                    t_name = chunk.name.value if hasattr(chunk.name, "value") else str(chunk.name)
                    status = "error" if chunk.error else "completed"
                    existing = tool_call_index.get(tc_id)
                    ptc = PromptToolCall(
                        id=tc_id or f"tc_{secrets.token_hex(4)}",
                        name=t_name,
                        args=existing.args if existing else None,
                        status=status,
                        timestamp=utc_now_iso(),
                    )
                    await self._emit_tool_call(run_id, ptc)

    async def _run_cli(self, run_id: str, project_path: Path, run_dir: Path) -> None:
        del run_dir
        run = self.get_run(run_id)
        agy_bin = shutil.which("agy")
        if not agy_bin:
            default_agy = Path.home() / ".gemini" / "bin" / ("agy.exe" if os.name == "nt" else "agy")
            if default_agy.exists():
                agy_bin = str(default_agy)
        prompt_text = run.prompt.strip()

        await self._append_thought(
            run_id,
            f"Chuẩn bị chạy CLI runner tại `{project_path}` (chính sách: `{run.execution_policy}`).\n",
        )

        lowered_prompt = prompt_text.lower()
        first_word = lowered_prompt.split()[0] if lowered_prompt.split() else ""
        looks_like_shell_cmd = (
            prompt_text.startswith("$ ")
            or any(lowered_prompt == p or lowered_prompt.startswith(p + " ") for p in SAFE_READONLY_CLI_PREFIXES)
            or first_word
            in {
                "remove-item",
                "get-childitem",
                "set-location",
                "rm",
                "del",
                "echo",
                "cat",
                "type",
                "npm",
                "npx",
                "pip",
                "pytest",
                "uvicorn",
                "curl",
            }
        )
        use_agy = agy_bin is not None and not looks_like_shell_cmd
        if use_agy and agy_bin:
            await self._run_agy_stream_json(run_id, project_path, Path(self.runs_dir / run_id))
            return
        else:
            raw_cmd = prompt_text[2:].strip() if prompt_text.startswith("$ ") else prompt_text
            cmd_display = raw_cmd
            if os.name == "nt":
                argv = ["powershell", "-NoProfile", "-Command", raw_cmd]
            else:
                argv = ["sh", "-lc", raw_cmd]

            if run.execution_policy == "read_only":
                lowered = raw_cmd.lower().strip()
                if not any(lowered == p or lowered.startswith(p + " ") for p in SAFE_READONLY_CLI_PREFIXES):
                    raise RuntimeError(
                        f"Chính sách Chỉ đọc (read_only) chặn lệnh '{raw_cmd}'. "
                        "Hãy chuyển sang 'Hỏi duyệt trên ĐT' hoặc dùng lệnh đọc (git status, dir, ls...)."
                    )

        if run.execution_policy == "ask_mobile":
            approved = await self._request_mobile_approval(
                run_id=run_id,
                project_name=run.project_name,
                tool_name="run_command",
                description=f"Thực thi lệnh CLI trong {run.project_name}",
                args={"command": cmd_display, "cwd": str(project_path)},
            )
            if not approved:
                await self._append_token(run_id, f"Đã từ chối thực thi lệnh: `{cmd_display}`.\n")
                return

        tc_id = f"tc_{secrets.token_hex(4)}"
        await self._emit_tool_call(
            run_id,
            PromptToolCall(
                id=tc_id,
                name="run_command",
                args={"command": cmd_display, "cwd": str(project_path)},
                status="running",
                timestamp=utc_now_iso(),
            ),
        )

        proc = await asyncio.create_subprocess_exec(
            *argv,
            cwd=str(project_path),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        self._active_procs[run_id] = proc

        await self._append_token(run_id, f"```text\n$ {cmd_display}\n")
        assert proc.stdout is not None
        while True:
            if run_id in self._cancelled_runs:
                proc.terminate()
                break
            line = await proc.stdout.readline()
            if not line:
                break
            await self._append_token(run_id, line.decode("utf-8", errors="replace"))

        rc = await proc.wait()
        await self._append_token(run_id, f"\n```\n\nExit code: `{rc}`\n")
        await self._emit_tool_call(
            run_id,
            PromptToolCall(
                id=tc_id,
                name="run_command",
                args={"command": cmd_display, "exit_code": rc},
                status="completed" if rc == 0 else "error",
                timestamp=utc_now_iso(),
            ),
        )
        if rc != 0 and run_id not in self._cancelled_runs:
            raise RuntimeError(f"CLI command exited with code {rc}")

    async def _run_external_agent_jsonl(
        self,
        *,
        run_id: str,
        project_path: Path,
        argv: list[str],
        label: str,
        handler: Any,
    ) -> None:
        proc = await asyncio.create_subprocess_exec(
            *argv,
            cwd=str(project_path),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            limit=8 * 1024 * 1024,
        )
        self._active_procs[run_id] = proc

        assert proc.stdout is not None
        while True:
            if run_id in self._cancelled_runs:
                proc.terminate()
                break
            line = await proc.stdout.readline()
            if not line:
                break
            raw_line = line.decode("utf-8", errors="replace").strip()
            if not raw_line:
                continue
            try:
                evt = json.loads(raw_line)
            except Exception:
                await self._append_token(run_id, raw_line + "\n")
                continue
            if isinstance(evt, dict):
                await handler(evt)

        stderr_bytes = b""
        if proc.stderr is not None:
            stderr_bytes = await proc.stderr.read()
        rc = await proc.wait()

        if run_id in self._cancelled_runs:
            return
        if rc != 0:
            err_msg = stderr_bytes.decode("utf-8", errors="replace").strip()
            raise RuntimeError(err_msg or f"{label} kết thúc với mã lỗi {rc}")

    async def _run_claude_code(self, run_id: str, project_path: Path, run_dir: Path) -> None:
        del run_dir
        claude_bin = find_cli_binary("claude")
        if not claude_bin:
            raise RuntimeError(
                "Chưa cài đặt Claude Code CLI (`claude`) trên máy tính PC. "
                "Cài đặt bằng: `npm install -g @anthropic-ai/claude-code` rồi chạy `claude` để đăng nhập."
            )

        run = self.get_run(run_id)
        prompt_body = self._format_prompt_with_attachments(run)
        cli_args = ["-p", prompt_body, "--output-format", "stream-json", "--verbose"]
        if run.execution_policy == "read_only":
            cli_args.extend(["--permission-mode", "plan"])
        elif run.execution_policy == "auto_workspace":
            cli_args.append("--dangerously-skip-permissions")

        await self._append_thought(
            run_id,
            f"🤖 Đang thực thi bằng **Claude Code CLI** tại `{project_path}` (Quyền: `{run.execution_policy}`)\n",
        )

        streamed_any = False
        tool_index: dict[str, PromptToolCall] = {}

        async def _handle_event(evt: dict[str, Any]) -> None:
            nonlocal streamed_any
            etype = str(evt.get("type") or "")
            if etype == "assistant":
                msg = evt.get("message") or {}
                contents = msg.get("content") if isinstance(msg, dict) else None
                if isinstance(contents, list):
                    for block in contents:
                        if not isinstance(block, dict):
                            continue
                        btype = block.get("type")
                        if btype == "thinking" and block.get("thinking"):
                            await self._append_thought(run_id, str(block["thinking"]) + "\n")
                        elif btype == "text" and block.get("text"):
                            await self._append_token(run_id, str(block["text"]))
                            streamed_any = True
                        elif btype == "tool_use":
                            tc_id = str(block.get("id") or f"claude_{secrets.token_hex(4)}")
                            t_name = str(block.get("name") or "tool")
                            t_args = block.get("input") if isinstance(block.get("input"), dict) else None
                            ptc = PromptToolCall(
                                id=tc_id,
                                name=t_name,
                                args=t_args,
                                status="running",
                                timestamp=utc_now_iso(),
                            )
                            tool_index[tc_id] = ptc
                            await self._emit_tool_call(run_id, ptc)
            elif etype == "user":
                msg = evt.get("message") or {}
                contents = msg.get("content") if isinstance(msg, dict) else None
                if isinstance(contents, list):
                    for block in contents:
                        if isinstance(block, dict) and block.get("type") == "tool_result":
                            tc_id = str(block.get("tool_use_id") or "")
                            prev = tool_index.get(tc_id)
                            if prev:
                                await self._emit_tool_call(
                                    run_id,
                                    PromptToolCall(
                                        id=tc_id,
                                        name=prev.name,
                                        args=prev.args,
                                        status="error" if block.get("is_error") else "completed",
                                        timestamp=utc_now_iso(),
                                    ),
                                )
            elif etype == "content_block_delta":
                delta = evt.get("delta") or {}
                if isinstance(delta, dict):
                    if delta.get("type") == "thinking_delta" and delta.get("thinking"):
                        await self._append_thought(run_id, str(delta["thinking"]))
                    elif delta.get("type") == "text_delta" and delta.get("text"):
                        await self._append_token(run_id, str(delta["text"]))
                        streamed_any = True
            elif etype == "result":
                if evt.get("is_error") and evt.get("result"):
                    raise RuntimeError(str(evt["result"]))
                if evt.get("result") and not streamed_any:
                    await self._append_token(run_id, str(evt["result"]))
                    streamed_any = True

        await self._run_external_agent_jsonl(
            run_id=run_id,
            project_path=project_path,
            argv=_wrap_cli_argv(claude_bin, cli_args),
            label="Claude Code CLI",
            handler=_handle_event,
        )

    async def _run_codex(self, run_id: str, project_path: Path, run_dir: Path) -> None:
        del run_dir
        codex_bin = find_cli_binary("codex")
        if not codex_bin:
            raise RuntimeError(
                "Chưa cài đặt OpenAI Codex CLI (`codex`) trên máy tính PC. "
                "Cài đặt bằng: `npm install -g @openai/codex` rồi chạy `codex` để đăng nhập."
            )

        run = self.get_run(run_id)
        prompt_body = self._format_prompt_with_attachments(run)
        cli_args = ["exec", "--json"]
        if run.execution_policy == "read_only":
            cli_args.extend(["--sandbox", "read-only"])
        elif run.execution_policy == "auto_workspace":
            cli_args.append("--full-auto")
        else:
            cli_args.extend(["--sandbox", "workspace-write"])
        cli_args.append(prompt_body)

        await self._append_thought(
            run_id,
            f"⚡ Đang thực thi bằng **OpenAI Codex CLI** tại `{project_path}` (Quyền: `{run.execution_policy}`)\n",
        )

        async def _handle_event(evt: dict[str, Any]) -> None:
            etype = str(evt.get("type") or "")
            item = evt.get("item") if isinstance(evt.get("item"), dict) else None
            if etype in {"item.started", "item.updated", "item.completed"} and item is not None:
                itype = str(item.get("type") or "")
                item_id = str(item.get("id") or f"codex_{secrets.token_hex(4)}")
                if itype == "reasoning" and item.get("text"):
                    await self._append_thought(run_id, str(item["text"]) + "\n")
                elif itype == "agent_message" and item.get("text"):
                    if etype == "item.completed":
                        await self._append_token(run_id, str(item["text"]))
                elif itype in {"command_execution", "file_change", "mcp_tool_call"}:
                    status = "running" if etype != "item.completed" else (
                        "error" if item.get("exit_code") not in (None, 0) or item.get("status") == "failed" else "completed"
                    )
                    args_dict = {k: v for k, v in item.items() if k in {"command", "changes", "tool", "arguments", "exit_code"}}
                    await self._emit_tool_call(
                        run_id,
                        PromptToolCall(
                            id=item_id,
                            name=itype,
                            args=args_dict or None,
                            status=status,
                            timestamp=utc_now_iso(),
                        ),
                    )
            elif etype in {"error", "turn.failed"}:
                err = evt.get("message") or (evt.get("error") or {}).get("message")
                if err:
                    raise RuntimeError(str(err))

        await self._run_external_agent_jsonl(
            run_id=run_id,
            project_path=project_path,
            argv=_wrap_cli_argv(codex_bin, cli_args),
            label="OpenAI Codex CLI",
            handler=_handle_event,
        )

    async def _run_opencode(self, run_id: str, project_path: Path, run_dir: Path) -> None:
        del run_dir
        opencode_bin = find_cli_binary("opencode")
        if not opencode_bin:
            raise RuntimeError(
                "Chưa cài đặt OpenCode CLI (`opencode`) trên máy tính PC. "
                "Cài đặt bằng: `npm install -g opencode-ai` (hoặc `curl -fsSL https://opencode.ai/install | bash`)."
            )

        run = self.get_run(run_id)
        prompt_body = self._format_prompt_with_attachments(run)
        cli_args = ["run", "--format", "json", prompt_body]

        await self._append_thought(
            run_id,
            f"🧩 Đang thực thi bằng **OpenCode CLI** tại `{project_path}` (Quyền: `{run.execution_policy}`)\n",
        )

        async def _handle_event(evt: dict[str, Any]) -> None:
            etype = str(evt.get("type") or "")
            part = evt.get("part") if isinstance(evt.get("part"), dict) else {}
            if etype == "reasoning":
                txt = part.get("text") or evt.get("text")
                if txt:
                    await self._append_thought(run_id, str(txt) + "\n")
            elif etype == "text":
                txt = part.get("text") or evt.get("text") or evt.get("delta")
                if txt:
                    await self._append_token(run_id, str(txt))
            elif etype in {"tool_use", "tool"}:
                tc_id = str(part.get("callID") or part.get("id") or f"oc_{secrets.token_hex(4)}")
                t_name = str(part.get("tool") or evt.get("tool") or "tool")
                state = part.get("state") if isinstance(part.get("state"), dict) else {}
                raw_status = str(state.get("status") or "completed").lower()
                mapped_status = "running" if raw_status in {"pending", "running"} else (
                    "error" if raw_status in {"error", "failed"} else "completed"
                )
                t_args = state.get("input") if isinstance(state.get("input"), dict) else None
                await self._emit_tool_call(
                    run_id,
                    PromptToolCall(
                        id=tc_id,
                        name=t_name,
                        args=t_args,
                        status=mapped_status,
                        timestamp=utc_now_iso(),
                    ),
                )
            elif etype == "error":
                err = evt.get("error") or evt.get("message")
                if err:
                    raise RuntimeError(str(err))

        await self._run_external_agent_jsonl(
            run_id=run_id,
            project_path=project_path,
            argv=_wrap_cli_argv(opencode_bin, cli_args),
            label="OpenCode CLI",
            handler=_handle_event,
        )

    async def _run_demo(self, run_id: str, project_path: Path, run_dir: Path) -> None:
        del run_dir
        run = self.get_run(run_id)

        thought_steps = [
            f"1. Đọc ngữ cảnh workspace `{project_path}` theo chính sách `{run.execution_policy}`...\n",
            f"2. Phân tích yêu cầu từ thiết bị `{run.device_name or 'Mobile'}`: \"{run.prompt[:120]}\"...\n",
            "3. Tổng hợp cấu trúc tệp và chuẩn bị báo cáo Markdown...\n",
        ]
        for chunk in thought_steps:
            await self._append_thought(run_id, chunk)
            await asyncio.sleep(0.06)

        list_tc_id = f"tc_{secrets.token_hex(4)}"
        await self._emit_tool_call(
            run_id,
            PromptToolCall(
                id=list_tc_id,
                name="list_directory",
                args={"path": str(project_path)},
                status="running",
                timestamp=utc_now_iso(),
            ),
        )
        entries: list[str] = []
        if project_path.is_dir():
            entries = sorted(p.name for p in project_path.iterdir())[:12]
        await asyncio.sleep(0.05)
        await self._emit_tool_call(
            run_id,
            PromptToolCall(
                id=list_tc_id,
                name="list_directory",
                args={"path": str(project_path), "count": len(entries)},
                status="completed",
                timestamp=utc_now_iso(),
            ),
        )

        approval_note = ""
        if run.execution_policy == "ask_mobile":
            write_tc_id = f"tc_{secrets.token_hex(4)}"
            proposed_args = {
                "path": "report.md",
                "workspace": str(project_path),
                "summary": "Xuất báo cáo phân tích Markdown cho phiên làm việc",
            }
            await self._emit_tool_call(
                run_id,
                PromptToolCall(
                    id=write_tc_id,
                    name="create_file",
                    args=proposed_args,
                    status="awaiting_approval",
                    timestamp=utc_now_iso(),
                ),
            )
            approved = await self._request_mobile_approval(
                run_id=run_id,
                project_name=run.project_name,
                tool_name="create_file",
                description=f"Cho phép tạo báo cáo kết quả cho `{run.project_name}`?",
                args=proposed_args,
            )
            await self._emit_tool_call(
                run_id,
                PromptToolCall(
                    id=write_tc_id,
                    name="create_file",
                    args=proposed_args,
                    status="completed" if approved else "denied",
                    timestamp=utc_now_iso(),
                ),
            )
            approval_note = (
                "- **Phê duyệt di động**: Người dùng đã **Cho phép** thao tác tạo báo cáo.\n"
                if approved
                else "- **Phê duyệt di động**: Người dùng đã **Từ chối** ghi file; chỉ trả về tóm tắt chỉ đọc.\n"
            )

        att_section = ""
        if run.attachments:
            att_lines = "\n".join(f"  - `{a.name}` ({a.mime_type}, {a.size} bytes)" for a in run.attachments)
            att_section = f"\n### Tệp đính kèm đã nhận\n{att_lines}\n"

        files_preview = "\n".join(f"- `{name}`" for name in entries) if entries else "- _(Thư mục trống)_"
        markdown_response = (
            f"### Kết quả phân tích (Demo Simulator)\n\n"
            f"- **Dự án**: `{run.project_name}` (`{project_path}`)\n"
            f"- **Chính sách**: `{run.execution_policy}`\n"
            f"{approval_note}"
            f"- **Prompt**: {run.prompt}\n"
            f"{att_section}\n"
            f"### Thành phần hiện có trong workspace\n"
            f"{files_preview}\n\n"
            f"> Báo cáo chi tiết đã được tự động lưu tại `report.md` và đồng bộ tới Kho Kết quả.\n"
        )

        # Stream response in small token chunks
        chunk_size = 36
        for i in range(0, len(markdown_response), chunk_size):
            if run_id in self._cancelled_runs:
                break
            await self._append_token(run_id, markdown_response[i : i + chunk_size])
            await asyncio.sleep(0.02)

    # --- Run Artifacts ---

    def list_all_output_artifacts(self) -> list[ArtifactItem]:
        items: list[ArtifactItem] = []
        with self._lock:
            runs = list(self._runs.values())
        for run in runs:
            if run.output_artifacts:
                items.extend(run.output_artifacts)
            else:
                run_dir = (self.runs_dir / run.id).resolve()
                if run_dir.is_dir():
                    items.extend(self._index_run_artifacts(run, run_dir))
        items.sort(key=lambda a: a.modified_at, reverse=True)
        return items

    def get_run_artifact_content(self, run_id: str, rel_path: str) -> FileContentResponse:
        self.get_run(run_id)
        run_dir = (self.runs_dir / run_id).resolve()
        target_file, clean_rel = safe_jail_path(run_dir, rel_path, allow_root=False)
        if not target_file.exists() or not target_file.is_file():
            raise HTTPException(status_code=404, detail="Run artifact not found")
        st = target_file.stat()
        category, mime_type = classify_file(target_file)
        text = read_text_preview(target_file, category, mime_type)
        return FileContentResponse(
            rel_path=clean_rel,
            name=target_file.name,
            size=int(st.st_size),
            mime_type=mime_type,
            category=category,
            text=text,
            raw_url=f"/api/prompts/{run_id}/artifact-raw?path={quote(clean_rel)}",
            modified_at=timestamp_to_iso(st.st_mtime),
        )

    def resolve_run_artifact_raw(self, run_id: str, rel_path: str) -> tuple[Path, str, str]:
        self.get_run(run_id)
        run_dir = (self.runs_dir / run_id).resolve()
        target_file, _ = safe_jail_path(run_dir, rel_path, allow_root=False)
        if not target_file.exists() or not target_file.is_file():
            raise HTTPException(status_code=404, detail="Run artifact not found")
        _, mime_type = classify_file(target_file)
        return target_file, target_file.name, mime_type
