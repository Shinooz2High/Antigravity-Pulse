"""Project workspace CRUD and jailed file access endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel

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


class SaveFileContentRequest(BaseModel):
    path: str
    content: str
    expected_modified_at: str | None = None
    force: bool = False


class MkdirRequest(BaseModel):
    path: str


class MkdirResponse(BaseModel):
    created: bool = True
    rel_path: str


class RenameEntryRequest(BaseModel):
    old_path: str
    new_path: str


class RenameEntryResponse(BaseModel):
    renamed: bool = True
    old_path: str
    new_path: str


class DeleteEntryResponse(BaseModel):
    deleted: bool = True
    rel_path: str


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


@router.put("/{project_id}/file-content", response_model=FileContentResponse)
async def save_project_file_content(
    project_id: str,
    body: SaveFileContentRequest,
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> FileContentResponse:
    svc: ProjectService = request.app.state.project_service
    return svc.save_file_content(
        project_id,
        body.path,
        body.content,
        expected_modified_at=body.expected_modified_at,
        force=body.force,
    )


@router.post("/{project_id}/mkdir", response_model=MkdirResponse)
async def create_project_directory(
    project_id: str,
    body: MkdirRequest,
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> MkdirResponse:
    svc: ProjectService = request.app.state.project_service
    clean_rel = svc.create_directory(project_id, body.path)
    return MkdirResponse(created=True, rel_path=clean_rel)


@router.post("/{project_id}/rename", response_model=RenameEntryResponse)
async def rename_project_entry(
    project_id: str,
    body: RenameEntryRequest,
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> RenameEntryResponse:
    svc: ProjectService = request.app.state.project_service
    old_rel, new_rel = svc.rename_entry(project_id, body.old_path, body.new_path)
    return RenameEntryResponse(renamed=True, old_path=old_rel, new_path=new_rel)


@router.delete("/{project_id}/entry", response_model=DeleteEntryResponse)
async def delete_project_entry(
    project_id: str,
    request: Request,
    path: str = Query(...),
    _: dict[str, Any] = Depends(require_auth),
) -> DeleteEntryResponse:
    svc: ProjectService = request.app.state.project_service
    clean_rel = svc.delete_entry(project_id, path)
    return DeleteEntryResponse(deleted=True, rel_path=clean_rel)


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
