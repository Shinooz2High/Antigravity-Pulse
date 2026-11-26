"""Workspace tools API: Terminal sessions, live port scanner, Agent Memories, and Notes."""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field

from ..services.auth_service import require_auth

router = APIRouter(prefix="/api/tools", tags=["tools"])


# --- Request Schemas ---


class CreateTerminalSessionRequest(BaseModel):
    project_id: str | None = None
    title: str | None = None


class ExecTerminalRequest(BaseModel):
    command: str


class SaveMemoryRequest(BaseModel):
    id: str | None = None
    title: str
    content: str
    scope: Literal["global", "project"] = "project"
    project_id: str | None = None
    mode: Literal["always", "passive"] = "passive"


class ChecklistItemInput(BaseModel):
    id: str | None = None
    text: str
    done: bool = False


class CreateNoteRequest(BaseModel):
    title: str = ""
    content: str = ""
    pinned: bool = False
    checklist: list[ChecklistItemInput] = Field(default_factory=list)
    project_id: str | None = None


class UpdateNoteRequest(BaseModel):
    title: str | None = None
    content: str | None = None
    pinned: bool | None = None
    checklist: list[ChecklistItemInput] | None = None
    project_id: str | None = None


# --- Terminal Endpoints ---


@router.get("/terminal/sessions")
async def list_terminal_sessions(
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> dict[str, Any]:
    svc = request.app.state.terminal_service
    return {"sessions": svc.list_sessions()}


@router.post("/terminal/sessions")
async def create_terminal_session(
    body: CreateTerminalSessionRequest,
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> dict[str, Any]:
    svc = request.app.state.terminal_service
    return svc.create_session(project_id=body.project_id, title=body.title)


@router.get("/terminal/sessions/{session_id}")
async def get_terminal_session(
    session_id: str,
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> dict[str, Any]:
    svc = request.app.state.terminal_service
    return svc.get_session(session_id)


@router.post("/terminal/sessions/{session_id}/exec")
async def exec_terminal_command(
    session_id: str,
    body: ExecTerminalRequest,
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> dict[str, Any]:
    svc = request.app.state.terminal_service
    return await svc.exec_command(session_id, body.command)


@router.post("/terminal/sessions/{session_id}/interrupt")
async def interrupt_terminal_session(
    session_id: str,
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> dict[str, Any]:
    svc = request.app.state.terminal_service
    return await svc.interrupt(session_id)


@router.delete("/terminal/sessions/{session_id}")
async def delete_terminal_session(
    session_id: str,
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> dict[str, Any]:
    svc = request.app.state.terminal_service
    return await svc.delete_session(session_id)


# --- Live Ports Scanner ---


@router.get("/ports")
async def scan_open_ports(
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> dict[str, Any]:
    svc = request.app.state.terminal_service
    ports = await svc.scan_ports()
    return {"ports": ports}


# --- Agent Memories ---


@router.get("/memories")
async def list_memories(
    request: Request,
    project_id: str = Query(default=""),
    _: dict[str, Any] = Depends(require_auth),
) -> dict[str, Any]:
    svc = request.app.state.memory_service
    return {"memories": svc.list_memories(project_id=project_id.strip() or None)}


@router.post("/memories")
async def save_memory(
    body: SaveMemoryRequest,
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> dict[str, Any]:
    svc = request.app.state.memory_service
    memory = svc.save_memory(
        title=body.title,
        content=body.content,
        scope=body.scope,
        project_id=body.project_id,
        mode=body.mode,
        memory_id=body.id,
    )
    return {"memory": memory}


@router.delete("/memories/{memory_id}")
async def delete_memory(
    memory_id: str,
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> dict[str, Any]:
    svc = request.app.state.memory_service
    svc.delete_memory(memory_id)
    return {"deleted": True, "id": memory_id}


# --- Notes & Checklists ---


@router.get("/notes")
async def list_notes(
    request: Request,
    project_id: str = Query(default=""),
    _: dict[str, Any] = Depends(require_auth),
) -> dict[str, Any]:
    svc = request.app.state.memory_service
    return {"notes": svc.list_notes(project_id=project_id.strip() or None)}


@router.post("/notes")
async def create_note(
    body: CreateNoteRequest,
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> dict[str, Any]:
    svc = request.app.state.memory_service
    note = svc.create_note(
        title=body.title,
        content=body.content,
        pinned=body.pinned,
        checklist=[item.model_dump() for item in body.checklist],
        project_id=body.project_id,
    )
    return {"note": note}


@router.put("/notes/{note_id}")
async def update_note(
    note_id: str,
    body: UpdateNoteRequest,
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> dict[str, Any]:
    svc = request.app.state.memory_service
    note = svc.update_note(
        note_id,
        title=body.title,
        content=body.content,
        pinned=body.pinned,
        checklist=[item.model_dump() for item in body.checklist] if body.checklist is not None else None,
        project_id=body.project_id,
    )
    return {"note": note}


@router.delete("/notes/{note_id}")
async def delete_note(
    note_id: str,
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> dict[str, Any]:
    svc = request.app.state.memory_service
    svc.delete_note(note_id)
    return {"deleted": True, "id": note_id}
