"""Project workspace CRUD and jailed file access endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import FileResponse

from ..models import (
    CreateProjectRequest,
    DeleteProjectResponse,
    FileContentResponse,
    Project,
    ProjectFilesResponse,
    ProjectsResponse,
    UpdateProjectRequest,
)
from ..services.auth_service import require_auth
from ..services.project_service import ProjectService
from ..utils import content_disposition_header

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("", response_model=ProjectsResponse)
async def list_projects(
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> ProjectsResponse:
    svc: ProjectService = request.app.state.project_service
    return ProjectsResponse(projects=svc.list_projects())


@router.post("", response_model=Project)
async def create_project(
    body: CreateProjectRequest,
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> Project:
    svc: ProjectService = request.app.state.project_service
    project = svc.create_project(body)
    request.app.state.file_watcher.refresh_watches()
    await request.app.state.ws_manager.broadcast(
        "project.updated",
        {"action": "created", "project": project.model_dump()},
    )
    return project


@router.patch("/{project_id}", response_model=Project)
async def update_project(
    project_id: str,
    body: UpdateProjectRequest,
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> Project:
    svc: ProjectService = request.app.state.project_service
    project = svc.update_project(project_id, body)
    request.app.state.file_watcher.refresh_watches()
    await request.app.state.ws_manager.broadcast(
        "project.updated",
        {"action": "updated", "project": project.model_dump()},
    )
    return project


@router.delete("/{project_id}", response_model=DeleteProjectResponse)
async def delete_project(
    project_id: str,
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> DeleteProjectResponse:
    svc: ProjectService = request.app.state.project_service
    svc.delete_project(project_id)
    request.app.state.file_watcher.refresh_watches()
    await request.app.state.ws_manager.broadcast(
        "project.updated",
        {"action": "deleted", "project_id": project_id},
    )
    return DeleteProjectResponse(deleted=True)


@router.get("/{project_id}/files", response_model=ProjectFilesResponse)
async def list_project_files(
    project_id: str,
    request: Request,
    path: str = Query(default=""),
    _: dict[str, Any] = Depends(require_auth),
) -> ProjectFilesResponse:
    svc: ProjectService = request.app.state.project_service
    return svc.list_files(project_id, path)


@router.get("/{project_id}/file-content", response_model=FileContentResponse)
async def get_project_file_content(
    project_id: str,
    request: Request,
    path: str = Query(...),
    _: dict[str, Any] = Depends(require_auth),
) -> FileContentResponse:
    svc: ProjectService = request.app.state.project_service
    return svc.get_file_content(project_id, path)


@router.get("/{project_id}/file-raw")
async def get_project_file_raw(
    project_id: str,
    request: Request,
    path: str = Query(...),
    download: int = Query(default=0),
    _: dict[str, Any] = Depends(require_auth),
) -> FileResponse:
    svc: ProjectService = request.app.state.project_service
    file_path, filename, mime_type = svc.resolve_file_raw(project_id, path)
    headers = content_disposition_header(filename, bool(download))
    return FileResponse(path=str(file_path), media_type=mime_type, headers=headers)
