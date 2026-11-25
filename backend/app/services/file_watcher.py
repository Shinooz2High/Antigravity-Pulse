"""Real-time watchdog filesystem observer for Antigravity brain and project workspaces."""

from __future__ import annotations

import logging
import re
import threading
import time
from pathlib import Path
from typing import Optional

from watchdog.events import FileSystemEvent, FileSystemEventHandler
from watchdog.observers import Observer

from .project_service import ProjectService
from .settings_service import SettingsService
from .ws_manager import WebSocketManager

logger = logging.getLogger(__name__)

IGNORED_DIR_NAMES = {
    ".git",
    "node_modules",
    ".venv",
    "__pycache__",
    "dist",
    ".pytest_cache",
    "tasks",
    "steps",
}
UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


def _should_ignore_path(path_str: str, data_dir: Path) -> bool:
    p = Path(path_str)
    parts = p.parts
    for part in parts:
        if part in IGNORED_DIR_NAMES:
            return True
    if ".system_generated/tasks" in path_str.replace("\\", "/"):
        return True
    if ".system_generated/steps" in path_str.replace("\\", "/"):
        return True
    if path_str.endswith(".log") or path_str.endswith(".tmp"):
        return True
    try:
        resolved = p.resolve()
        if resolved == data_dir or resolved.is_relative_to(data_dir):
            return True
    except OSError:
        pass
    return False


class _DebouncedHandler(FileSystemEventHandler):
    """Watchdog event handler that coalesces rapid events (~300ms) and dispatches via WS."""

    def __init__(self, watcher: "FileWatcherService", kind: str, scope_root: Path, project_id: str | None = None) -> None:
        super().__init__()
        self.watcher = watcher
        self.kind = kind
        self.scope_root = scope_root
        self.project_id = project_id

    def on_any_event(self, event: FileSystemEvent) -> None:
        if event.is_directory and event.event_type == "modified":
            return
        src = str(event.src_path)
        if _should_ignore_path(src, self.watcher.data_dir):
            return
        self.watcher.schedule_emit(
            kind=self.kind,
            scope_root=self.scope_root,
            project_id=self.project_id,
            event_type=event.event_type,
            src_path=src,
        )


class FileWatcherService:
    """Manages watchdog observers over brain_dir and registered project paths."""

    def __init__(
        self,
        settings: SettingsService,
        project_service: ProjectService,
        ws_manager: WebSocketManager,
        debounce_seconds: float = 0.3,
    ) -> None:
        self.settings = settings
        self.project_service = project_service
        self.ws_manager = ws_manager
        self.data_dir = settings.data_dir.resolve()
        self.debounce_seconds = debounce_seconds

        self._lock = threading.RLock()
        self._observer: Optional[Observer] = None
        self._pending: dict[tuple[str, str], tuple[float, dict[str, str]]] = {}
        self._timers: dict[tuple[str, str], threading.Timer] = {}
        self._stopped = False

    def start(self) -> None:
        with self._lock:
            self._stopped = False
            self._restart_observer_locked()

    def refresh_watches(self) -> None:
        with self._lock:
            if self._stopped:
                return
            self._restart_observer_locked()

    def stop(self) -> None:
        with self._lock:
            self._stopped = True
            for timer in self._timers.values():
                timer.cancel()
            self._timers.clear()
            self._pending.clear()
            if self._observer is not None:
                try:
                    self._observer.stop()
                    self._observer.join(timeout=3.0)
                except Exception as exc:
                    logger.debug("Error stopping watchdog observer: %s", exc)
                self._observer = None

    def _restart_observer_locked(self) -> None:
        if self._observer is not None:
            try:
                self._observer.stop()
                self._observer.join(timeout=2.0)
            except Exception:
                pass
            self._observer = None

        observer = Observer()
        watched_paths: set[Path] = set()

        brain_dir = self.settings.get_brain_dir()
        if brain_dir.is_dir():
            try:
                observer.schedule(
                    _DebouncedHandler(self, "brain", brain_dir),
                    str(brain_dir),
                    recursive=True,
                )
                watched_paths.add(brain_dir)
            except OSError as exc:
                logger.warning("Cannot watch brain_dir %s: %s", brain_dir, exc)

        for project in self.project_service.list_projects():
            p = Path(project.path).resolve()
            if p.is_dir() and p not in watched_paths:
                try:
                    observer.schedule(
                        _DebouncedHandler(self, "workspace", p, project_id=project.id),
                        str(p),
                        recursive=True,
                    )
                    watched_paths.add(p)
                except OSError as exc:
                    logger.warning("Cannot watch project %s: %s", p, exc)

        observer.daemon = True
        observer.start()
        self._observer = observer

    def schedule_emit(
        self,
        *,
        kind: str,
        scope_root: Path,
        project_id: str | None,
        event_type: str,
        src_path: str,
    ) -> None:
        rel_str = src_path
        try:
            rel_str = Path(src_path).resolve().relative_to(scope_root.resolve()).as_posix()
        except Exception:
            rel_str = Path(src_path).name

        conv_id = ""
        if kind == "brain":
            first_part = rel_str.split("/", 1)[0] if rel_str else ""
            if not UUID_RE.match(first_part):
                return
            conv_id = first_part

        key = (kind, f"{project_id or conv_id}:{rel_str}")
        payload = {
            "kind": kind,
            "event_type": event_type,
            "path": rel_str,
            "project_id": project_id or "",
            "conv_id": conv_id,
        }

        with self._lock:
            if self._stopped:
                return
            old_timer = self._timers.pop(key, None)
            if old_timer is not None:
                old_timer.cancel()

            self._pending[key] = (time.monotonic(), payload)
            timer = threading.Timer(self.debounce_seconds, self._flush_key, args=(key,))
            timer.daemon = True
            self._timers[key] = timer
            timer.start()

    def _flush_key(self, key: tuple[str, str]) -> None:
        with self._lock:
            self._timers.pop(key, None)
            entry = self._pending.pop(key, None)
            if self._stopped or entry is None:
                return
            _, payload = entry

        kind = payload["kind"]
        rel_path = payload["path"]
        if kind == "brain":
            conv_id = payload["conv_id"]
            normalized_rel = rel_path.replace("\\", "/")
            if ".system_generated" in normalized_rel:
                if ".system_generated/logs/" in normalized_rel or normalized_rel.endswith(".jsonl"):
                    self.ws_manager.broadcast_from_thread(
                        "brain.session_updated",
                        {"conv_id": conv_id, "path": rel_path, "event_type": payload["event_type"]},
                    )
                return
            else:
                self.ws_manager.broadcast_from_thread(
                    "artifact.updated",
                    {
                        "source": "antigravity_brain",
                        "scope_id": conv_id,
                        "path": rel_path,
                        "event_type": payload["event_type"],
                    },
                )
        else:
            self.ws_manager.broadcast_from_thread(
                "workspace.changed",
                {
                    "project_id": payload["project_id"],
                    "path": rel_path,
                    "event_type": payload["event_type"],
                },
            )
