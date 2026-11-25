"""Antigravity local brain monitor and unified artifact gallery endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import FileResponse

from ..models import (
    AntigravitySessionDetailResponse,
    AntigravitySessionsResponse,
    ArtifactItem,
    ArtifactsListResponse,
    FileContentResponse,
    TranscriptStep,
)
from ..services.auth_service import require_auth
from ..services.brain_scanner import BrainScanner
from ..utils import content_disposition_header

router = APIRouter(prefix="/api/antigravity", tags=["antigravity"])


@router.get("/sessions", response_model=AntigravitySessionsResponse)
async def list_sessions(
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> AntigravitySessionsResponse:
    scanner: BrainScanner = request.app.state.brain_scanner
    return AntigravitySessionsResponse(
        sessions=scanner.list_sessions(),
        brain_dir=str(scanner.brain_dir),
    )


@router.get("/sessions/{conv_id}", response_model=AntigravitySessionDetailResponse)
async def get_session(
    conv_id: str,
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> AntigravitySessionDetailResponse:
    scanner: BrainScanner = request.app.state.brain_scanner
    return scanner.get_session_detail(conv_id)


@router.get("/sessions/{conv_id}/steps/{step_index}/full", response_model=TranscriptStep)
async def get_full_step(
    conv_id: str,
    step_index: int,
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> TranscriptStep:
    scanner: BrainScanner = request.app.state.brain_scanner
    return scanner.get_full_step(conv_id, step_index)


@router.get("/artifacts", response_model=ArtifactsListResponse)
async def list_artifacts(
    request: Request,
    category: str = Query(default=""),
    q: str = Query(default=""),
    limit: int = Query(default=120, ge=1, le=500),
    _: dict[str, Any] = Depends(require_auth),
) -> ArtifactsListResponse:
    scanner: BrainScanner = request.app.state.brain_scanner
    runner = request.app.state.runner_service

    combined: list[ArtifactItem] = []
    combined.extend(scanner.list_all_brain_artifacts())
    combined.extend(runner.list_all_output_artifacts())

    cat_filter = category.strip().lower()
    query_filter = q.strip().lower()

    if cat_filter and cat_filter != "all":
        combined = [a for a in combined if a.category.lower() == cat_filter]

    if query_filter:
        combined = [
            a
            for a in combined
            if query_filter in a.name.lower()
            or query_filter in a.scope_title.lower()
            or query_filter in a.rel_path.lower()
        ]

    combined.sort(key=lambda a: a.modified_at, reverse=True)
    return ArtifactsListResponse(artifacts=combined[:limit])


@router.get("/artifact-content", response_model=FileContentResponse)
async def get_artifact_content(
    request: Request,
    conv_id: str = Query(...),
    path: str = Query(...),
    _: dict[str, Any] = Depends(require_auth),
) -> FileContentResponse:
    scanner: BrainScanner = request.app.state.brain_scanner
    return scanner.get_artifact_content(conv_id, path)


@router.get("/artifact-raw")
async def get_artifact_raw(
    request: Request,
    conv_id: str = Query(...),
    path: str = Query(...),
    download: int = Query(default=0),
    _: dict[str, Any] = Depends(require_auth),
) -> FileResponse:
    scanner: BrainScanner = request.app.state.brain_scanner
    file_path, filename, mime_type = scanner.resolve_artifact_raw(conv_id, path)
    headers = content_disposition_header(filename, bool(download))
    return FileResponse(path=str(file_path), media_type=mime_type, headers=headers)
