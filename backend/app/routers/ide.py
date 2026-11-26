"""Pocket IDE Git source control and checkpoint restore endpoints."""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field

from ..services.auth_service import require_auth
from ..services.checkpoint_service import CheckpointService
from ..services.git_service import GitService

router = APIRouter(prefix="/api/ide", tags=["ide"])


def _get_git_service(request: Request) -> GitService:
    svc = getattr(request.app.state, "git_service", None)
    if svc is None:
        svc = GitService(request.app.state.project_service)
        request.app.state.git_service = svc
    return svc


def _get_checkpoint_service(request: Request) -> CheckpointService:
    svc = getattr(request.app.state, "checkpoint_service", None)
    if svc is None:
        svc = CheckpointService(request.app.state.config, request.app.state.project_service)
        request.app.state.checkpoint_service = svc
    return svc


# --- Pydantic Schemas ---


class GitFileChange(BaseModel):
    path: str
    status: str


class GitStatusResponse(BaseModel):
    is_git_repo: bool
    branch: str
    tracking: str | None = None
    ahead: int = 0
    behind: int = 0
    staged: list[GitFileChange] = Field(default_factory=list)
    unstaged: list[GitFileChange] = Field(default_factory=list)
    untracked: list[str] = Field(default_factory=list)


class GitDiffResponse(BaseModel):
    diff: str
    path: str | None = None
    staged: bool = False


class GitCommitEntry(BaseModel):
    hash: str
    short_hash: str
    subject: str
    author: str
    date: str


class GitLogResponse(BaseModel):
    commits: list[GitCommitEntry] = Field(default_factory=list)


class GitPathsRequest(BaseModel):
    paths: list[str] | None = None
    all: bool = False


class GitCommitRequest(BaseModel):
    message: str
    author_name: str | None = None
    author_email: str | None = None


class GitCommitResponse(BaseModel):
    committed: bool = True
    hash: str
    summary: str


class GitActionOutputResponse(BaseModel):
    ok: bool
    output: str = ""


class GitCheckoutRequest(BaseModel):
    branch: str
    create: bool = False


class GitCheckoutResponse(BaseModel):
    ok: bool
    branch: str
    output: str = ""


class CreateCheckpointRequest(BaseModel):
    label: str = "Manual checkpoint"
    kind: str = "manual"


class CheckpointItem(BaseModel):
    id: str
    project_id: str | None = None
    label: str
    kind: str
    created_at: str
    file_count: int = 0
    total_bytes: int = 0
    size_bytes: int = 0


class CheckpointsListResponse(BaseModel):
    checkpoints: list[CheckpointItem] = Field(default_factory=list)


class CheckpointPreviewResponse(BaseModel):
    checkpoint: CheckpointItem
    modified: list[str] = Field(default_factory=list)
    recreated: list[str] = Field(default_factory=list)
    deleted: list[str] = Field(default_factory=list)


class CheckpointRestoreResponse(BaseModel):
    restored: bool = True
    undo_checkpoint_id: str
    modified: int
    recreated: int
    deleted: int


# --- Git Routes ---


@router.get("/{project_id}/git/status", response_model=GitStatusResponse)
async def git_status(
    project_id: str,
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> dict[str, Any]:
    svc = _get_git_service(request)
    return await asyncio.to_thread(svc.get_status, project_id)


@router.get("/{project_id}/git/diff", response_model=GitDiffResponse)
async def git_diff(
    project_id: str,
    request: Request,
    path: str | None = Query(default=None),
    staged: bool = Query(default=False),
    _: dict[str, Any] = Depends(require_auth),
) -> dict[str, Any]:
    svc = _get_git_service(request)
    return await asyncio.to_thread(svc.get_diff, project_id, path, staged)


@router.get("/{project_id}/git/log", response_model=GitLogResponse)
async def git_log(
    project_id: str,
    request: Request,
    limit: int = Query(default=25, ge=1, le=200),
    _: dict[str, Any] = Depends(require_auth),
) -> dict[str, Any]:
    svc = _get_git_service(request)
    return await asyncio.to_thread(svc.get_log, project_id, limit)


@router.post("/{project_id}/git/stage", response_model=GitActionOutputResponse)
async def git_stage(
    project_id: str,
    body: GitPathsRequest,
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> dict[str, Any]:
    svc = _get_git_service(request)
    return await asyncio.to_thread(svc.stage, project_id, body.paths, body.all)


@router.post("/{project_id}/git/unstage", response_model=GitActionOutputResponse)
async def git_unstage(
    project_id: str,
    body: GitPathsRequest,
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> dict[str, Any]:
    svc = _get_git_service(request)
    return await asyncio.to_thread(svc.unstage, project_id, body.paths, body.all)


@router.post("/{project_id}/git/discard", response_model=GitActionOutputResponse)
async def git_discard(
    project_id: str,
    body: GitPathsRequest,
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> dict[str, Any]:
    svc = _get_git_service(request)
    return await asyncio.to_thread(svc.discard, project_id, body.paths, body.all)


@router.post("/{project_id}/git/commit", response_model=GitCommitResponse)
async def git_commit(
    project_id: str,
    body: GitCommitRequest,
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> dict[str, Any]:
    svc = _get_git_service(request)
    return await asyncio.to_thread(
        svc.commit,
        project_id,
        body.message,
        body.author_name,
        body.author_email,
    )


@router.post("/{project_id}/git/pull", response_model=GitActionOutputResponse)
async def git_pull(
    project_id: str,
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> dict[str, Any]:
    svc = _get_git_service(request)
    return await asyncio.to_thread(svc.pull, project_id)


@router.post("/{project_id}/git/push", response_model=GitActionOutputResponse)
async def git_push(
    project_id: str,
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> dict[str, Any]:
    svc = _get_git_service(request)
    return await asyncio.to_thread(svc.push, project_id)


@router.post("/{project_id}/git/checkout", response_model=GitCheckoutResponse)
async def git_checkout(
    project_id: str,
    body: GitCheckoutRequest,
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> dict[str, Any]:
    svc = _get_git_service(request)
    return await asyncio.to_thread(svc.checkout, project_id, body.branch, body.create)


# --- Checkpoint Routes ---


@router.get("/{project_id}/checkpoints", response_model=CheckpointsListResponse)
async def list_checkpoints(
    project_id: str,
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> dict[str, Any]:
    svc = _get_checkpoint_service(request)
    items = await asyncio.to_thread(svc.list_checkpoints, project_id)
    return {"checkpoints": items}


@router.post("/{project_id}/checkpoints", response_model=CheckpointItem)
async def create_checkpoint(
    project_id: str,
    body: CreateCheckpointRequest,
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> dict[str, Any]:
    svc = _get_checkpoint_service(request)
    return await asyncio.to_thread(svc.create_checkpoint, project_id, body.label, body.kind)


@router.get("/{project_id}/checkpoints/{cp_id}/preview", response_model=CheckpointPreviewResponse)
async def preview_checkpoint_restore(
    project_id: str,
    cp_id: str,
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> dict[str, Any]:
    svc = _get_checkpoint_service(request)
    return await asyncio.to_thread(svc.preview_restore, project_id, cp_id)


@router.post("/{project_id}/checkpoints/{cp_id}/restore", response_model=CheckpointRestoreResponse)
async def restore_checkpoint(
    project_id: str,
    cp_id: str,
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> dict[str, Any]:
    svc = _get_checkpoint_service(request)
    return await asyncio.to_thread(svc.restore_checkpoint, project_id, cp_id)
