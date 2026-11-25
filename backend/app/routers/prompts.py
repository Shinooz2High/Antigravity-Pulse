"""Prompt execution, file uploads, queue management, mobile approvals, and run artifacts."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile
from fastapi.responses import FileResponse

from ..models import (
    ApproveToolRequest,
    ApproveToolResponse,
    CancelPromptResponse,
    FileContentResponse,
    PromptRun,
    PromptsListResponse,
    RunPromptRequest,
    UploadResponse,
)
from ..services.auth_service import require_auth
from ..utils import content_disposition_header

router = APIRouter(prefix="/api/prompts", tags=["prompts"])


@router.post("/upload", response_model=UploadResponse)
async def upload_attachments(
    request: Request,
    files: list[UploadFile] = File(...),
    project_id: str | None = Form(default=None),
    _: dict[str, Any] = Depends(require_auth),
) -> UploadResponse:
    runner = request.app.state.runner_service
    attachments = await runner.save_uploads(files, project_id=project_id)
    return UploadResponse(attachments=attachments)


@router.get("/upload-raw/{attachment_id}")
async def get_upload_raw(
    attachment_id: str,
    request: Request,
    download: int = Query(default=0),
    _: dict[str, Any] = Depends(require_auth),
) -> FileResponse:
    runner = request.app.state.runner_service
    file_path, filename, mime_type = runner.resolve_upload_raw(attachment_id)
    headers = content_disposition_header(filename, bool(download))
    return FileResponse(path=str(file_path), media_type=mime_type, headers=headers)


@router.post("/run", response_model=PromptRun)
async def run_prompt(
    body: RunPromptRequest,
    request: Request,
    auth_rec: dict[str, Any] = Depends(require_auth),
) -> PromptRun:
    runner = request.app.state.runner_service
    device_name = body.device_name or auth_rec.get("device_name")
    return await runner.enqueue_run(
        project_id=body.project_id,
        prompt=body.prompt,
        engine_mode=body.engine_mode,
        execution_policy=body.execution_policy,
        attachment_ids=body.attachment_ids,
        device_name=device_name,
    )


@router.get("", response_model=PromptsListResponse)
async def list_prompts(
    request: Request,
    project_id: str = Query(default=""),
    limit: int = Query(default=50, ge=1, le=200),
    _: dict[str, Any] = Depends(require_auth),
) -> PromptsListResponse:
    runner = request.app.state.runner_service
    runs, approvals = runner.list_runs(project_id=project_id.strip() or None, limit=limit)
    return PromptsListResponse(runs=runs, pending_approvals=approvals)


@router.get("/{run_id}", response_model=PromptRun)
async def get_prompt(
    run_id: str,
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> PromptRun:
    runner = request.app.state.runner_service
    return runner.get_run(run_id)


@router.post("/{run_id}/cancel", response_model=CancelPromptResponse)
async def cancel_prompt(
    run_id: str,
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> CancelPromptResponse:
    runner = request.app.state.runner_service
    await runner.cancel_run(run_id)
    return CancelPromptResponse(run_id=run_id, status="cancelled")


@router.post("/{run_id}/approve", response_model=ApproveToolResponse)
async def approve_tool(
    run_id: str,
    body: ApproveToolRequest,
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> ApproveToolResponse:
    runner = request.app.state.runner_service
    await runner.resolve_approval(run_id=run_id, approval_id=body.approval_id, approved=body.approved)
    return ApproveToolResponse(approval_id=body.approval_id, approved=body.approved)


@router.get("/{run_id}/artifact-content", response_model=FileContentResponse)
async def get_run_artifact_content(
    run_id: str,
    request: Request,
    path: str = Query(...),
    _: dict[str, Any] = Depends(require_auth),
) -> FileContentResponse:
    runner = request.app.state.runner_service
    return runner.get_run_artifact_content(run_id, path)


@router.get("/{run_id}/artifact-raw")
async def get_run_artifact_raw(
    run_id: str,
    request: Request,
    path: str = Query(...),
    download: int = Query(default=0),
    _: dict[str, Any] = Depends(require_auth),
) -> FileResponse:
    runner = request.app.state.runner_service
    file_path, filename, mime_type = runner.resolve_run_artifact_raw(run_id, path)
    headers = content_disposition_header(filename, bool(download))
    return FileResponse(path=str(file_path), media_type=mime_type, headers=headers)
