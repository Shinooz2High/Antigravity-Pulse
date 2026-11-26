"""Project workspace registry, Git status inspection, and jailed file browser."""

from __future__ import annotations

import os
import secrets
import shutil
import subprocess
import threading
from pathlib import Path
from typing import Any
from urllib.parse import quote

from fastapi import HTTPException

from ..config import AppConfig
from ..models import (
    CreateProjectRequest,
    FileContentResponse,
    FileEntry,
    Project,
    ProjectFilesResponse,
    UpdateProjectRequest,
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
from .settings_service import SettingsService


class ProjectService:
    """Manages registered PC workspaces and jailed file access."""

    def __init__(self, config: AppConfig, settings: SettingsService) -> None:
        self.config = config
        self.settings = settings
        self.projects_path = config.data_dir / "projects.json"
        self._lock = threading.RLock()
        self._records: list[dict[str, Any]] = []
        self._load_or_seed()

    def _load_or_seed(self) -> None:
        with self._lock:
            raw = read_json_file(self.projects_path, default=None)
            if isinstance(raw, list) and len(raw) > 0:
                self._records = raw
                return

            default_dir = self.config.default_project_dir
            default_dir.mkdir(parents=True, exist_ok=True)
            now = utc_now_iso()
            self._records = [
                {
                    "id": "proj_default",
                    "name": default_dir.name or "Antigravity Pulse",
                    "path": str(default_dir),
                    "description": "Workspace mặc định trên PC",
                    "engine_mode": self.settings.get_default_engine_mode(),
                    "execution_policy": self.settings.get_default_execution_policy(),
                    "last_activity_at": now,
                    "created_at": now,
                }
            ]
            self._save()

    def _save(self) -> None:
        atomic_write_json(self.projects_path, self._records)

    @staticmethod
    def _inspect_git(project_dir: Path) -> tuple[str | None, bool]:
        if not project_dir.is_dir():
            return None, False
        if not (project_dir / ".git").exists():
            return None, False

        branch: str | None = None
        dirty = False
        try:
            b = subprocess.run(
                ["git", "rev-parse", "--abbrev-ref", "HEAD"],
                cwd=str(project_dir),
                capture_output=True,
                text=True,
                timeout=1.5,
                check=False,
            )
            if b.returncode == 0:
                branch = b.stdout.strip() or None

            s = subprocess.run(
                ["git", "status", "--porcelain"],
                cwd=str(project_dir),
                capture_output=True,
                text=True,
                timeout=1.5,
                check=False,
            )
            if s.returncode == 0:
                dirty = bool(s.stdout.strip())
        except (OSError, subprocess.SubprocessError):
            return None, False

        return branch, dirty

    def _to_project(self, rec: dict[str, Any]) -> Project:
        project_path = Path(str(rec["path"])).expanduser()
        exists = project_path.is_dir()
        git_branch, git_dirty = self._inspect_git(project_path) if exists else (None, False)
        return Project(
            id=str(rec["id"]),
            name=str(rec["name"]),
            path=str(project_path),
            description=str(rec.get("description", "")),
            engine_mode=rec.get("engine_mode", "antigravity_sdk"),
            execution_policy=rec.get("execution_policy", "ask_mobile"),
            git_branch=git_branch,
            git_dirty=git_dirty,
            last_activity_at=rec.get("last_activity_at"),
            created_at=str(rec.get("created_at", utc_now_iso())),
            exists=exists,
        )

    def list_projects(self) -> list[Project]:
        with self._lock:
            records = list(self._records)
        return [self._to_project(r) for r in records]

    def get_project_paths(self) -> list[Path]:
        with self._lock:
            return [Path(str(r["path"])).expanduser().resolve() for r in self._records]

    def get_project(self, project_id: str) -> Project:
        with self._lock:
            for r in self._records:
                if r["id"] == project_id:
                    return self._to_project(r)
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")

    def create_project(self, req: CreateProjectRequest) -> Project:
        name = req.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Project name is required")

        target_path = Path(req.path.strip()).expanduser().resolve()
        if not target_path.is_dir():
            raise HTTPException(status_code=400, detail=f"Directory does not exist: {target_path}")

        now = utc_now_iso()
        rec = {
            "id": f"proj_{secrets.token_hex(6)}",
            "name": name,
            "path": str(target_path),
            "description": req.description.strip(),
            "engine_mode": req.engine_mode or self.settings.get_default_engine_mode(),
            "execution_policy": req.execution_policy or self.settings.get_default_execution_policy(),
            "last_activity_at": now,
            "created_at": now,
        }
        with self._lock:
            self._records.append(rec)
            self._save()
        return self._to_project(rec)

    def update_project(self, project_id: str, req: UpdateProjectRequest) -> Project:
        with self._lock:
            for rec in self._records:
                if rec["id"] == project_id:
                    if req.name is not None:
                        clean_name = req.name.strip()
                        if not clean_name:
                            raise HTTPException(status_code=400, detail="Project name cannot be empty")
                        rec["name"] = clean_name
                    if req.path is not None:
                        new_path = Path(req.path.strip()).expanduser().resolve()
                        if not new_path.is_dir():
                            raise HTTPException(status_code=400, detail=f"Directory does not exist: {new_path}")
                        rec["path"] = str(new_path)
                    if req.description is not None:
                        rec["description"] = req.description.strip()
                    if req.engine_mode is not None:
                        rec["engine_mode"] = req.engine_mode
                    if req.execution_policy is not None:
                        rec["execution_policy"] = req.execution_policy
                    self._save()
                    return self._to_project(rec)
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")

    def delete_project(self, project_id: str) -> None:
        with self._lock:
            before = len(self._records)
            self._records = [r for r in self._records if r["id"] != project_id]
            if len(self._records) == before:
                raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")
            self._save()

    def touch_activity(self, project_id: str) -> None:
        with self._lock:
            for rec in self._records:
                if rec["id"] == project_id:
                    rec["last_activity_at"] = utc_now_iso()
                    self._save()
                    return

    def _require_project_root(self, project_id: str) -> Path:
        project = self.get_project(project_id)
        root = Path(project.path).resolve()
        if not root.is_dir():
            raise HTTPException(status_code=404, detail="Project directory does not exist on disk")
        return root

    def list_files(self, project_id: str, rel_path: str = "") -> ProjectFilesResponse:
        root = self._require_project_root(project_id)

        target_dir, clean_rel = safe_jail_path(root, rel_path, allow_root=True)
        if not target_dir.exists() or not target_dir.is_dir():
            raise HTTPException(status_code=404, detail="Requested directory not found")

        entries: list[FileEntry] = []
        try:
            with os.scandir(target_dir) as it:
                for entry in it:
                    try:
                        is_dir = entry.is_dir(follow_symlinks=False)
                        st = entry.stat(follow_symlinks=False)
                    except OSError:
                        continue

                    entry_rel = f"{clean_rel}/{entry.name}" if clean_rel else entry.name
                    if is_dir:
                        category = "other"
                        mime_type = "inode/directory"
                        size = 0
                    else:
                        category, mime_type = classify_file(entry.name)
                        size = int(st.st_size)

                    entries.append(
                        FileEntry(
                            name=entry.name,
                            rel_path=entry_rel,
                            is_dir=is_dir,
                            size=size,
                            modified_at=timestamp_to_iso(st.st_mtime),
                            category=category,
                            mime_type=mime_type,
                        )
                    )
        except PermissionError as exc:
            raise HTTPException(status_code=403, detail=f"Permission denied: {exc}") from exc

        entries.sort(key=lambda e: (not e.is_dir, e.name.lower()))
        return ProjectFilesResponse(current_path=clean_rel, entries=entries)

    def get_file_content(self, project_id: str, rel_path: str) -> FileContentResponse:
        root = self._require_project_root(project_id)

        target_file, clean_rel = safe_jail_path(root, rel_path, allow_root=False)
        if not target_file.exists():
            raise HTTPException(status_code=404, detail="File not found")
        if not target_file.is_file():
            raise HTTPException(status_code=400, detail="Path is not a file")

        st = target_file.stat()
        category, mime_type = classify_file(target_file)
        text = read_text_preview(target_file, category, mime_type)
        raw_url = f"/api/projects/{project_id}/file-raw?path={quote(clean_rel)}"
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

    def save_file_content(
        self,
        project_id: str,
        rel_path: str,
        content: str,
        *,
        expected_modified_at: str | None = None,
        force: bool = False,
    ) -> FileContentResponse:
        root = self._require_project_root(project_id)
        target_file, clean_rel = safe_jail_path(root, rel_path, allow_root=False)

        if target_file.exists():
            if target_file.is_dir():
                raise HTTPException(status_code=400, detail="Path is a directory")
            st = target_file.stat()
            current_modified_at = timestamp_to_iso(st.st_mtime)
            if not force and expected_modified_at is not None and expected_modified_at != current_modified_at:
                raise HTTPException(status_code=409, detail="File has been modified on disk")

        try:
            target_file.parent.mkdir(parents=True, exist_ok=True)
            with open(target_file, "w", encoding="utf-8", newline="") as f:
                f.write(content)
            st = target_file.stat()
        except PermissionError as exc:
            raise HTTPException(status_code=403, detail=f"Permission denied: {exc}") from exc
        except OSError as exc:
            raise HTTPException(status_code=400, detail=f"Failed to write file: {exc}") from exc

        self.touch_activity(project_id)
        category, mime_type = classify_file(target_file)
        raw_url = f"/api/projects/{project_id}/file-raw?path={quote(clean_rel)}"
        return FileContentResponse(
            rel_path=clean_rel,
            name=target_file.name,
            size=int(st.st_size),
            mime_type=mime_type,
            category=category,
            text=content,
            raw_url=raw_url,
            modified_at=timestamp_to_iso(st.st_mtime),
        )

    def create_directory(self, project_id: str, rel_path: str) -> str:
        root = self._require_project_root(project_id)
        target_dir, clean_rel = safe_jail_path(root, rel_path, allow_root=False)
        if target_dir.exists() and not target_dir.is_dir():
            raise HTTPException(status_code=400, detail="A file already exists at that path")
        try:
            target_dir.mkdir(parents=True, exist_ok=True)
        except PermissionError as exc:
            raise HTTPException(status_code=403, detail=f"Permission denied: {exc}") from exc
        except OSError as exc:
            raise HTTPException(status_code=400, detail=f"Failed to create directory: {exc}") from exc
        return clean_rel

    def rename_entry(self, project_id: str, old_path: str, new_path: str) -> tuple[str, str]:
        root = self._require_project_root(project_id)
        src, old_rel = safe_jail_path(root, old_path, allow_root=False)
        dst, new_rel = safe_jail_path(root, new_path, allow_root=False)

        if not src.exists() and not src.is_symlink():
            raise HTTPException(status_code=404, detail="Source path not found")

        if old_rel == new_rel:
            return old_rel, new_rel

        if src.is_dir() and dst.is_relative_to(src):
            raise HTTPException(status_code=400, detail="Cannot move a directory into itself")

        if dst.exists() or dst.is_symlink():
            same_case_insensitive = False
            try:
                same_case_insensitive = (
                    old_rel.lower() == new_rel.lower() and os.path.samefile(src, dst)
                )
            except OSError:
                same_case_insensitive = False
            if not same_case_insensitive:
                raise HTTPException(status_code=409, detail="Target path already exists")

        try:
            dst.parent.mkdir(parents=True, exist_ok=True)
            src.rename(dst)
        except PermissionError as exc:
            raise HTTPException(status_code=403, detail=f"Permission denied: {exc}") from exc
        except OSError as exc:
            raise HTTPException(status_code=400, detail=f"Failed to rename entry: {exc}") from exc

        self.touch_activity(project_id)
        return old_rel, new_rel

    def delete_entry(self, project_id: str, rel_path: str) -> str:
        root = self._require_project_root(project_id)
        target, clean_rel = safe_jail_path(root, rel_path, allow_root=False)
        if target == root or not clean_rel:
            raise HTTPException(status_code=403, detail="Cannot delete project root")
        if not target.exists() and not target.is_symlink():
            raise HTTPException(status_code=404, detail="Entry not found")

        try:
            if target.is_symlink() or target.is_file():
                target.unlink()
            elif target.is_dir():
                shutil.rmtree(target)
        except PermissionError as exc:
            raise HTTPException(status_code=403, detail=f"Permission denied: {exc}") from exc
        except OSError as exc:
            raise HTTPException(status_code=400, detail=f"Failed to delete entry: {exc}") from exc

        self.touch_activity(project_id)
        return clean_rel

    def resolve_file_raw(self, project_id: str, rel_path: str) -> tuple[Path, str, str]:
        root = self._require_project_root(project_id)

        target_file, _ = safe_jail_path(root, rel_path, allow_root=False)
        if not target_file.exists():
            raise HTTPException(status_code=404, detail="File not found")
        if not target_file.is_file():
            raise HTTPException(status_code=400, detail="Path is not a file")

        _, mime_type = classify_file(target_file)
        return target_file, target_file.name, mime_type
