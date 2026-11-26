"""Jailed Git source-control operations for registered project workspaces."""

from __future__ import annotations

import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any

from fastapi import HTTPException

from ..utils import safe_jail_path
from .project_service import ProjectService

_AHEAD_RE = re.compile(r"ahead\s+(\d+)")
_BEHIND_RE = re.compile(r"behind\s+(\d+)")
_BRACKET_RE = re.compile(r"\s+\[([^\]]+)\]$")


def _unquote_git_path(raw: str) -> str:
    val = raw.strip()
    if len(val) >= 2 and val.startswith('"') and val.endswith('"'):
        inner = val[1:-1]
        # Handle basic C-style escapes produced by git if quoting occurs
        return inner.replace('\\"', '"').replace("\\\\", "\\")
    return val


def _extract_porcelain_path(raw: str) -> str:
    if " -> " in raw:
        _, new_part = raw.split(" -> ", 1)
        return _unquote_git_path(new_part)
    return _unquote_git_path(raw)


def _parse_branch_header(header_line: str) -> tuple[str, str | None, int, int]:
    header = header_line[3:].strip()
    if header.startswith("No commits yet on "):
        return header[len("No commits yet on "):].strip(), None, 0, 0
    if header.startswith("Initial commit on "):
        return header[len("Initial commit on "):].strip(), None, 0, 0
    if header == "HEAD (no branch)":
        return "HEAD (detached)", None, 0, 0

    ahead = 0
    behind = 0
    match = _BRACKET_RE.search(header)
    if match:
        meta = match.group(1)
        m_ahead = _AHEAD_RE.search(meta)
        m_behind = _BEHIND_RE.search(meta)
        if m_ahead:
            ahead = int(m_ahead.group(1))
        if m_behind:
            behind = int(m_behind.group(1))
        header = header[: match.start()].strip()

    if "..." in header:
        branch, tracking = header.split("...", 1)
        return branch.strip(), tracking.strip() or None, ahead, behind
    return header, None, ahead, behind


class GitService:
    """Executes jailed Git commands inside a registered project directory."""

    def __init__(self, project_service: ProjectService) -> None:
        self.project_service = project_service

    def _require_project_root(self, project_id: str) -> Path:
        project = self.project_service.get_project(project_id)
        root = Path(project.path).resolve()
        if not root.is_dir():
            raise HTTPException(status_code=404, detail="Project directory does not exist on disk")
        return root

    @staticmethod
    def _is_git_repo(root: Path) -> bool:
        return (root / ".git").exists()

    @staticmethod
    def _run_git(
        root: Path,
        args: list[str],
        *,
        timeout: float = 20.0,
    ) -> subprocess.CompletedProcess[str]:
        env = os.environ.copy()
        env["GIT_TERMINAL_PROMPT"] = "0"
        try:
            return subprocess.run(
                ["git", "-c", "core.quotepath=false", *args],
                cwd=str(root),
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=timeout,
                env=env,
                check=False,
            )
        except FileNotFoundError as exc:
            raise HTTPException(status_code=500, detail="Git CLI is not installed on this host") from exc
        except subprocess.TimeoutExpired as exc:
            raise HTTPException(status_code=504, detail="Git command timed out") from exc
        except OSError as exc:
            raise HTTPException(status_code=500, detail=f"Git execution failed: {exc}") from exc

    def _require_git_repo(self, project_id: str) -> Path:
        root = self._require_project_root(project_id)
        if not self._is_git_repo(root):
            raise HTTPException(status_code=400, detail="Project is not a Git repository")
        return root

    def _jail_paths(self, root: Path, paths: list[str] | None) -> list[str]:
        if not paths:
            return []
        cleaned: list[str] = []
        for raw in paths:
            _, clean_rel = safe_jail_path(root, raw, allow_root=False)
            cleaned.append(clean_rel)
        return cleaned

    def _has_head(self, root: Path) -> bool:
        proc = self._run_git(root, ["rev-parse", "--verify", "HEAD"])
        return proc.returncode == 0

    @staticmethod
    def _combined_output(proc: subprocess.CompletedProcess[str]) -> str:
        parts = [p.strip() for p in (proc.stdout, proc.stderr) if p and p.strip()]
        return "\n".join(parts)

    def get_status(self, project_id: str) -> dict[str, Any]:
        root = self._require_project_root(project_id)
        if not self._is_git_repo(root):
            return {
                "is_git_repo": False,
                "branch": "",
                "tracking": None,
                "ahead": 0,
                "behind": 0,
                "staged": [],
                "unstaged": [],
                "untracked": [],
            }

        proc = self._run_git(root, ["status", "--porcelain=v1", "-b", "-uall"])
        if proc.returncode != 0:
            raise HTTPException(
                status_code=400,
                detail=self._combined_output(proc) or "Failed to read Git status",
            )

        branch = ""
        tracking: str | None = None
        ahead = 0
        behind = 0
        staged: list[dict[str, str]] = []
        unstaged: list[dict[str, str]] = []
        untracked: list[str] = []

        for line in proc.stdout.splitlines():
            if line.startswith("## "):
                branch, tracking, ahead, behind = _parse_branch_header(line)
                continue
            if len(line) < 4:
                continue

            x_code = line[0]
            y_code = line[1]
            rel_path = _extract_porcelain_path(line[3:])

            if x_code == "?" and y_code == "?":
                untracked.append(rel_path)
                continue

            if x_code not in (" ", "?"):
                staged.append({"path": rel_path, "status": x_code})
            if y_code not in (" ", "?"):
                unstaged.append({"path": rel_path, "status": y_code})

        return {
            "is_git_repo": True,
            "branch": branch,
            "tracking": tracking,
            "ahead": ahead,
            "behind": behind,
            "staged": staged,
            "unstaged": unstaged,
            "untracked": untracked,
        }

    def get_diff(
        self,
        project_id: str,
        rel_path: str | None = None,
        staged: bool = False,
    ) -> dict[str, Any]:
        root = self._require_project_root(project_id)
        clean_rel: str | None = None
        if rel_path and rel_path.strip():
            _, clean_rel = safe_jail_path(root, rel_path, allow_root=False)

        if not self._is_git_repo(root):
            return {"diff": "", "path": clean_rel, "staged": staged}

        args = ["diff"]
        if staged:
            args.append("--cached")
        if clean_rel:
            args.extend(["--", clean_rel])

        proc = self._run_git(root, args)
        if proc.returncode not in (0, 1):
            raise HTTPException(
                status_code=400,
                detail=self._combined_output(proc) or "Failed to compute Git diff",
            )

        return {"diff": proc.stdout, "path": clean_rel, "staged": staged}

    def get_log(self, project_id: str, limit: int = 25) -> dict[str, Any]:
        root = self._require_project_root(project_id)
        if not self._is_git_repo(root):
            return {"commits": []}

        safe_limit = max(1, min(int(limit), 200))
        proc = self._run_git(
            root,
            [
                "log",
                f"-n{safe_limit}",
                "--format=%H%x1f%h%x1f%s%x1f%an%x1f%aI%x1e",
            ],
        )
        if proc.returncode != 0:
            err = (proc.stderr or "").lower()
            if "does not have any commits yet" in err or "bad default revision" in err:
                return {"commits": []}
            raise HTTPException(
                status_code=400,
                detail=self._combined_output(proc) or "Failed to read Git log",
            )

        commits: list[dict[str, str]] = []
        for record in proc.stdout.split("\x1e"):
            rec = record.strip("\r\n")
            if not rec:
                continue
            fields = rec.split("\x1f")
            if len(fields) < 5:
                continue
            commits.append(
                {
                    "hash": fields[0],
                    "short_hash": fields[1],
                    "subject": fields[2],
                    "author": fields[3],
                    "date": fields[4],
                }
            )
        return {"commits": commits}

    def stage(
        self,
        project_id: str,
        paths: list[str] | None = None,
        all_files: bool = False,
    ) -> dict[str, Any]:
        root = self._require_git_repo(project_id)
        clean_paths = self._jail_paths(root, paths)
        if not all_files and not clean_paths:
            raise HTTPException(status_code=400, detail="Provide paths or set all=true")

        args = ["add", "-A"]
        if not all_files:
            args.extend(["--", *clean_paths])

        proc = self._run_git(root, args)
        if proc.returncode != 0:
            raise HTTPException(
                status_code=400,
                detail=self._combined_output(proc) or "Failed to stage files",
            )
        return {"ok": True, "output": self._combined_output(proc)}

    def unstage(
        self,
        project_id: str,
        paths: list[str] | None = None,
        all_files: bool = False,
    ) -> dict[str, Any]:
        root = self._require_git_repo(project_id)
        clean_paths = self._jail_paths(root, paths)
        if not all_files and not clean_paths:
            raise HTTPException(status_code=400, detail="Provide paths or set all=true")

        if self._has_head(root):
            args = ["reset", "HEAD"]
            if not all_files:
                args.extend(["--", *clean_paths])
        else:
            args = ["rm", "-r", "--cached", "--ignore-unmatch"]
            args.append("." if all_files else "--")
            if not all_files:
                args.extend(clean_paths)

        proc = self._run_git(root, args)
        if proc.returncode != 0:
            raise HTTPException(
                status_code=400,
                detail=self._combined_output(proc) or "Failed to unstage files",
            )
        return {"ok": True, "output": self._combined_output(proc)}

    def discard(
        self,
        project_id: str,
        paths: list[str] | None = None,
        all_files: bool = False,
    ) -> dict[str, Any]:
        root = self._require_git_repo(project_id)
        clean_paths = self._jail_paths(root, paths)
        if not all_files and not clean_paths:
            raise HTTPException(status_code=400, detail="Provide paths or set all=true")

        outputs: list[str] = []
        if all_files:
            if self._has_head(root):
                proc_checkout = self._run_git(root, ["checkout", "--", "."])
                if proc_checkout.returncode != 0:
                    raise HTTPException(
                        status_code=400,
                        detail=self._combined_output(proc_checkout) or "Failed to discard tracked changes",
                    )
                if out := self._combined_output(proc_checkout):
                    outputs.append(out)
            proc_clean = self._run_git(root, ["clean", "-fd"])
            if proc_clean.returncode != 0:
                raise HTTPException(
                    status_code=400,
                    detail=self._combined_output(proc_clean) or "Failed to clean untracked files",
                )
            if out := self._combined_output(proc_clean):
                outputs.append(out)
            return {"ok": True, "output": "\n".join(outputs)}

        tracked: list[str] = []
        untracked: list[str] = []
        for rel in clean_paths:
            chk = self._run_git(root, ["ls-files", "--error-unmatch", "--", rel])
            if chk.returncode == 0:
                tracked.append(rel)
            else:
                untracked.append(rel)

        if tracked:
            proc_checkout = self._run_git(root, ["checkout", "--", *tracked])
            if proc_checkout.returncode != 0:
                raise HTTPException(
                    status_code=400,
                    detail=self._combined_output(proc_checkout) or "Failed to discard tracked files",
                )
            if out := self._combined_output(proc_checkout):
                outputs.append(out)

        for rel in untracked:
            target, _ = safe_jail_path(root, rel, allow_root=False)
            if target.is_symlink() or target.is_file():
                target.unlink()
            elif target.is_dir():
                shutil.rmtree(target)

        return {"ok": True, "output": "\n".join(outputs)}

    def commit(
        self,
        project_id: str,
        message: str,
        author_name: str | None = None,
        author_email: str | None = None,
    ) -> dict[str, Any]:
        root = self._require_git_repo(project_id)
        clean_msg = (message or "").strip()
        if not clean_msg:
            raise HTTPException(status_code=400, detail="Commit message is required")

        args: list[str] = []
        if author_name and author_name.strip():
            args.extend(["-c", f"user.name={author_name.strip()}"])
        if author_email and author_email.strip():
            args.extend(["-c", f"user.email={author_email.strip()}"])
        args.extend(["commit", "-m", clean_msg])

        proc = self._run_git(root, args)
        if proc.returncode != 0:
            raise HTTPException(
                status_code=400,
                detail=self._combined_output(proc) or "Git commit failed",
            )

        rev = self._run_git(root, ["rev-parse", "HEAD"])
        commit_hash = rev.stdout.strip() if rev.returncode == 0 else ""
        summary = clean_msg.splitlines()[0]
        return {"committed": True, "hash": commit_hash, "summary": summary}

    def pull(self, project_id: str) -> dict[str, Any]:
        root = self._require_git_repo(project_id)
        proc = self._run_git(root, ["pull"], timeout=60.0)
        return {"ok": proc.returncode == 0, "output": self._combined_output(proc)}

    def push(self, project_id: str) -> dict[str, Any]:
        root = self._require_git_repo(project_id)
        proc = self._run_git(root, ["push"], timeout=60.0)
        return {"ok": proc.returncode == 0, "output": self._combined_output(proc)}

    def checkout(
        self,
        project_id: str,
        branch: str,
        create: bool = False,
    ) -> dict[str, Any]:
        root = self._require_git_repo(project_id)
        clean_branch = (branch or "").strip()
        if not clean_branch or clean_branch.startswith("-") or any(c.isspace() for c in clean_branch):
            raise HTTPException(status_code=400, detail="Invalid branch name")

        args = ["checkout", "-b", clean_branch] if create else ["checkout", clean_branch]
        proc = self._run_git(root, args)
        output = self._combined_output(proc)

        current_branch = clean_branch
        if proc.returncode == 0:
            rev = self._run_git(root, ["rev-parse", "--abbrev-ref", "HEAD"])
            if rev.returncode == 0 and rev.stdout.strip():
                current_branch = rev.stdout.strip()

        return {"ok": proc.returncode == 0, "branch": current_branch, "output": output}
