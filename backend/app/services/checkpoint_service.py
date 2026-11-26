"""Workspace snapshot checkpoints and safe restore service."""

from __future__ import annotations

import os
import secrets
import threading
import zipfile
from pathlib import Path
from typing import Any

from fastapi import HTTPException

from ..config import AppConfig
from ..utils import atomic_write_json, read_json_file, safe_jail_path, utc_now_iso
from .project_service import ProjectService

SKIP_DIRS = {
    ".git",
    "node_modules",
    ".venv",
    "venv",
    "dist",
    "build",
    "__pycache__",
    ".pytest_cache",
    ".next",
}
MAX_FILE_BYTES = 5 * 1024 * 1024  # 5 MB


def _validate_id(value: str, label: str) -> str:
    clean = (value or "").strip()
    if not clean or "/" in clean or "\\" in clean or ".." in clean or "\x00" in clean:
        raise HTTPException(status_code=400, detail=f"Invalid {label}")
    return clean


class CheckpointService:
    """Creates, lists, previews, and restores zipped workspace checkpoints."""

    def __init__(self, config: AppConfig, project_service: ProjectService) -> None:
        self.config = config
        self.project_service = project_service
        self.base_dir = config.data_dir / "checkpoints"
        self._lock = threading.RLock()

    def _require_project_root(self, project_id: str) -> Path:
        _validate_id(project_id, "project_id")
        project = self.project_service.get_project(project_id)
        root = Path(project.path).resolve()
        if not root.is_dir():
            raise HTTPException(status_code=404, detail="Project directory does not exist on disk")
        return root

    def _project_cp_dir(self, project_id: str) -> Path:
        clean_pid = _validate_id(project_id, "project_id")
        cp_dir, _ = safe_jail_path(self.base_dir, clean_pid, allow_root=False)
        return cp_dir

    def _index_path(self, project_id: str) -> Path:
        return self._project_cp_dir(project_id) / "index.json"

    def _zip_path(self, project_id: str, cp_id: str) -> Path:
        clean_cp = _validate_id(cp_id, "cp_id")
        cp_dir = self._project_cp_dir(project_id)
        zip_path, _ = safe_jail_path(cp_dir, f"{clean_cp}.zip", allow_root=False)
        return zip_path

    def _read_index(self, project_id: str) -> list[dict[str, Any]]:
        raw = read_json_file(self._index_path(project_id), default=[])
        if not isinstance(raw, list):
            return []
        return [item for item in raw if isinstance(item, dict) and item.get("id")]

    def _write_index(self, project_id: str, records: list[dict[str, Any]]) -> None:
        atomic_write_json(self._index_path(project_id), records)

    @staticmethod
    def _iter_eligible_files(root: Path) -> list[tuple[Path, str]]:
        """Collect eligible non-ignored files <= MAX_FILE_BYTES relative to root."""
        files: list[tuple[Path, str]] = []
        for dirpath, dirnames, filenames in os.walk(root, followlinks=False):
            dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS)
            current_dir = Path(dirpath)
            for filename in sorted(filenames):
                file_path = current_dir / filename
                if file_path.is_symlink():
                    continue
                try:
                    st = file_path.stat()
                except OSError:
                    continue
                if st.st_size > MAX_FILE_BYTES:
                    continue
                rel_posix = file_path.relative_to(root).as_posix()
                files.append((file_path, rel_posix))
        return files

    def create_checkpoint(
        self,
        project_id: str,
        label: str = "Manual checkpoint",
        kind: str = "manual",
    ) -> dict[str, Any]:
        root = self._require_project_root(project_id)
        cp_id = f"cp_{secrets.token_hex(6)}"
        clean_label = (label or "").strip() or "Manual checkpoint"
        clean_kind = (kind or "").strip() or "manual"

        with self._lock:
            cp_dir = self._project_cp_dir(project_id)
            cp_dir.mkdir(parents=True, exist_ok=True)
            zip_path = self._zip_path(project_id, cp_id)
            tmp_zip = zip_path.with_suffix(".zip.tmp")

            eligible = self._iter_eligible_files(root)
            file_count = 0
            total_bytes = 0

            try:
                with zipfile.ZipFile(tmp_zip, "w", compression=zipfile.ZIP_DEFLATED) as zf:
                    for file_path, rel_posix in eligible:
                        try:
                            data = file_path.read_bytes()
                        except OSError:
                            continue
                        zf.writestr(rel_posix, data)
                        file_count += 1
                        total_bytes += len(data)
                os.replace(tmp_zip, zip_path)
            except OSError as exc:
                if tmp_zip.exists():
                    try:
                        tmp_zip.unlink()
                    except OSError:
                        pass
                raise HTTPException(status_code=500, detail=f"Failed to create checkpoint: {exc}") from exc

            size_bytes = int(zip_path.stat().st_size)
            record: dict[str, Any] = {
                "id": cp_id,
                "project_id": project_id,
                "label": clean_label,
                "kind": clean_kind,
                "created_at": utc_now_iso(),
                "file_count": file_count,
                "total_bytes": total_bytes,
                "size_bytes": size_bytes,
            }

            records = self._read_index(project_id)
            records.insert(0, record)
            self._write_index(project_id, records)
            return record

    def list_checkpoints(self, project_id: str) -> list[dict[str, Any]]:
        self._require_project_root(project_id)
        with self._lock:
            records = self._read_index(project_id)
            cp_dir = self._project_cp_dir(project_id)
            available: list[dict[str, Any]] = []
            for rec in records:
                cp_id = str(rec.get("id", ""))
                if cp_id and (cp_dir / f"{cp_id}.zip").is_file():
                    available.append(rec)
            return available

    def _get_checkpoint_record(self, project_id: str, cp_id: str) -> tuple[dict[str, Any], Path]:
        _validate_id(cp_id, "cp_id")
        zip_path = self._zip_path(project_id, cp_id)
        records = self._read_index(project_id)
        for rec in records:
            if rec.get("id") == cp_id and zip_path.is_file():
                return rec, zip_path
        raise HTTPException(status_code=404, detail=f"Checkpoint '{cp_id}' not found")

    def _compute_diff(
        self,
        root: Path,
        zip_path: Path,
    ) -> tuple[list[str], list[str], list[str]]:
        modified: list[str] = []
        recreated: list[str] = []
        deleted: list[str] = []

        snapshot_rels: set[str] = set()
        with zipfile.ZipFile(zip_path, "r") as zf:
            for info in zf.infolist():
                if info.is_dir():
                    continue
                target, clean_rel = safe_jail_path(root, info.filename, allow_root=False)
                snapshot_rels.add(clean_rel)

                if not target.exists():
                    recreated.append(clean_rel)
                elif target.is_file() and not target.is_symlink():
                    try:
                        st = target.stat()
                        if st.st_size != info.file_size or target.read_bytes() != zf.read(info.filename):
                            modified.append(clean_rel)
                    except OSError:
                        modified.append(clean_rel)
                else:
                    modified.append(clean_rel)

        for _, rel_posix in self._iter_eligible_files(root):
            if rel_posix not in snapshot_rels:
                deleted.append(rel_posix)

        modified.sort()
        recreated.sort()
        deleted.sort()
        return modified, recreated, deleted

    def preview_restore(self, project_id: str, cp_id: str) -> dict[str, Any]:
        root = self._require_project_root(project_id)
        with self._lock:
            rec, zip_path = self._get_checkpoint_record(project_id, cp_id)
            modified, recreated, deleted = self._compute_diff(root, zip_path)
            return {
                "checkpoint": rec,
                "modified": modified,
                "recreated": recreated,
                "deleted": deleted,
            }

    def restore_checkpoint(self, project_id: str, cp_id: str) -> dict[str, Any]:
        root = self._require_project_root(project_id)
        with self._lock:
            _, zip_path = self._get_checkpoint_record(project_id, cp_id)
            modified, recreated, deleted = self._compute_diff(root, zip_path)

            undo_cp = self.create_checkpoint(project_id, label="Before restore", kind="undo")
            undo_id = str(undo_cp["id"])

            # Delete extra non-ignored files that did not exist in the snapshot
            for rel_posix in deleted:
                target, _ = safe_jail_path(root, rel_posix, allow_root=False)
                try:
                    if target.is_file() or target.is_symlink():
                        target.unlink()
                        parent = target.parent
                        while parent != root and parent.is_dir():
                            if any(parent.iterdir()):
                                break
                            parent.rmdir()
                            parent = parent.parent
                except OSError:
                    pass

            # Restore modified and recreated files from the snapshot zip
            to_restore = set(modified) | set(recreated)
            with zipfile.ZipFile(zip_path, "r") as zf:
                for info in zf.infolist():
                    if info.is_dir():
                        continue
                    target, clean_rel = safe_jail_path(root, info.filename, allow_root=False)
                    if clean_rel not in to_restore:
                        continue
                    target.parent.mkdir(parents=True, exist_ok=True)
                    data = zf.read(info.filename)
                    with open(target, "wb") as f:
                        f.write(data)

            return {
                "restored": True,
                "undo_checkpoint_id": undo_id,
                "modified": len(modified),
                "recreated": len(recreated),
                "deleted": len(deleted),
            }
