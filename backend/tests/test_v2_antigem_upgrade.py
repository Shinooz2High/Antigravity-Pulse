"""End-to-end verification tests for Antigravity Pulse v2.0 features."""

from __future__ import annotations

import os
import subprocess
import time
from pathlib import Path

from fastapi.testclient import TestClient

from app.config import AppConfig
from app.services.memory_service import MemoryService


def _create_project(client: TestClient, auth_headers: dict[str, str], name: str, path: Path) -> str:
    resp = client.post(
        "/api/projects",
        json={
            "name": name,
            "path": str(path),
            "description": "v2 test workspace",
            "engine_mode": "demo",
            "execution_policy": "auto_workspace",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    return str(resp.json()["id"])


def test_project_file_write_conflict_mkdir_rename_delete_and_jail(
    client: TestClient,
    auth_headers: dict[str, str],
    isolated_env: dict[str, Path],
) -> None:
    ws = isolated_env["tmp"] / "ide_files_ws"
    ws.mkdir()
    pid = _create_project(client, auth_headers, "IDE Files", ws)

    # Create directory via mkdir
    mk = client.post(
        f"/api/projects/{pid}/mkdir",
        json={"path": "src/nested"},
        headers=auth_headers,
    )
    assert mk.status_code == 200, mk.text
    assert mk.json() == {"created": True, "rel_path": "src/nested"}
    assert (ws / "src" / "nested").is_dir()

    # Create new file via PUT /file-content
    put1 = client.put(
        f"/api/projects/{pid}/file-content",
        json={"path": "src/nested/hello.py", "content": "print('v1')\n"},
        headers=auth_headers,
    )
    assert put1.status_code == 200, put1.text
    mtime1 = put1.json()["modified_at"]
    assert put1.json()["text"] == "print('v1')\n"

    # Optimistic update with matching expected_modified_at succeeds
    put2 = client.put(
        f"/api/projects/{pid}/file-content",
        json={
            "path": "src/nested/hello.py",
            "content": "print('v2')\n",
            "expected_modified_at": mtime1,
        },
        headers=auth_headers,
    )
    assert put2.status_code == 200, put2.text
    mtime2 = put2.json()["modified_at"]

    # Simulate external modification on disk with shifted mtime -> 409 Conflict
    disk_file = ws / "src" / "nested" / "hello.py"
    disk_file.write_text("print('external')\n", encoding="utf-8")
    now = time.time() + 5.0
    os.utime(disk_file, (now, now))

    conflict = client.put(
        f"/api/projects/{pid}/file-content",
        json={
            "path": "src/nested/hello.py",
            "content": "print('stale')\n",
            "expected_modified_at": mtime2,
        },
        headers=auth_headers,
    )
    assert conflict.status_code == 409, conflict.text

    # Force overwrite succeeds
    forced = client.put(
        f"/api/projects/{pid}/file-content",
        json={
            "path": "src/nested/hello.py",
            "content": "print('forced')\n",
            "expected_modified_at": mtime2,
            "force": True,
        },
        headers=auth_headers,
    )
    assert forced.status_code == 200, forced.text
    assert disk_file.read_text(encoding="utf-8") == "print('forced')\n"

    # Rename file
    ren = client.post(
        f"/api/projects/{pid}/rename",
        json={"old_path": "src/nested/hello.py", "new_path": "src/nested/main.py"},
        headers=auth_headers,
    )
    assert ren.status_code == 200, ren.text
    assert ren.json() == {
        "renamed": True,
        "old_path": "src/nested/hello.py",
        "new_path": "src/nested/main.py",
    }
    assert not disk_file.exists()
    assert (ws / "src" / "nested" / "main.py").is_file()

    # Delete file & directory
    dele = client.delete(
        f"/api/projects/{pid}/entry",
        params={"path": "src/nested/main.py"},
        headers=auth_headers,
    )
    assert dele.status_code == 200, dele.text
    assert dele.json() == {"deleted": True, "rel_path": "src/nested/main.py"}
    assert not (ws / "src" / "nested" / "main.py").exists()

    # Path traversal jail protection on all mutating endpoints
    for evil in ("../../outside.txt", "..\\..\\escape.txt", "C:\\Windows\\system.ini", "/etc/passwd"):
        r_put = client.put(
            f"/api/projects/{pid}/file-content",
            json={"path": evil, "content": "nope"},
            headers=auth_headers,
        )
        r_mk = client.post(
            f"/api/projects/{pid}/mkdir",
            json={"path": evil},
            headers=auth_headers,
        )
        r_ren = client.post(
            f"/api/projects/{pid}/rename",
            json={"old_path": "src", "new_path": evil},
            headers=auth_headers,
        )
        r_del = client.delete(
            f"/api/projects/{pid}/entry",
            params={"path": evil},
            headers=auth_headers,
        )
        for resp in (r_put, r_mk, r_ren, r_del):
            assert resp.status_code in (400, 403), f"Expected 400/403 for {evil}, got {resp.status_code}"


def test_git_endpoints_in_tmp_repo(
    client: TestClient,
    auth_headers: dict[str, str],
    isolated_env: dict[str, Path],
) -> None:
    repo = isolated_env["tmp"] / "git_repo"
    repo.mkdir()
    subprocess.run(["git", "init", "-b", "main"], cwd=repo, check=True, capture_output=True)
    subprocess.run(["git", "config", "user.name", "Test Bot"], cwd=repo, check=True, capture_output=True)
    subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=repo, check=True, capture_output=True)

    (repo / "app.py").write_text("x = 1\n", encoding="utf-8")
    subprocess.run(["git", "add", "app.py"], cwd=repo, check=True, capture_output=True)
    subprocess.run(["git", "commit", "-m", "initial commit"], cwd=repo, check=True, capture_output=True)

    pid = _create_project(client, auth_headers, "Git Repo", repo)

    # Modify tracked file + add untracked file
    (repo / "app.py").write_text("x = 2\n", encoding="utf-8")
    (repo / "notes.txt").write_text("hello git\n", encoding="utf-8")

    st1 = client.get(f"/api/ide/{pid}/git/status", headers=auth_headers)
    assert st1.status_code == 200, st1.text
    st1_json = st1.json()
    assert st1_json["is_git_repo"] is True
    assert st1_json["branch"] == "main"
    assert any(item["path"] == "app.py" for item in st1_json["unstaged"])
    assert "notes.txt" in st1_json["untracked"]

    # Unstaged diff
    diff_unstaged = client.get(
        f"/api/ide/{pid}/git/diff",
        params={"path": "app.py", "staged": "false"},
        headers=auth_headers,
    )
    assert diff_unstaged.status_code == 200, diff_unstaged.text
    assert "-x = 1" in diff_unstaged.json()["diff"]
    assert "+x = 2" in diff_unstaged.json()["diff"]

    # Stage app.py and notes.txt
    stage_res = client.post(
        f"/api/ide/{pid}/git/stage",
        json={"paths": ["app.py", "notes.txt"]},
        headers=auth_headers,
    )
    assert stage_res.status_code == 200, stage_res.text
    assert stage_res.json()["ok"] is True

    # Staged diff
    diff_staged = client.get(
        f"/api/ide/{pid}/git/diff",
        params={"path": "app.py", "staged": "true"},
        headers=auth_headers,
    )
    assert diff_staged.status_code == 200, diff_staged.text
    assert "+x = 2" in diff_staged.json()["diff"]

    # Commit staged changes
    commit_res = client.post(
        f"/api/ide/{pid}/git/commit",
        json={
            "message": "feat: update app and add notes",
            "author_name": "Pulse Verifier",
            "author_email": "verifier@example.com",
        },
        headers=auth_headers,
    )
    assert commit_res.status_code == 200, commit_res.text
    commit_json = commit_res.json()
    assert commit_json["committed"] is True
    assert len(commit_json["hash"]) >= 7

    # Log shows new commit first
    log_res = client.get(f"/api/ide/{pid}/git/log", params={"limit": 10}, headers=auth_headers)
    assert log_res.status_code == 200, log_res.text
    commits = log_res.json()["commits"]
    assert len(commits) == 2
    assert commits[0]["subject"] == "feat: update app and add notes"
    assert commits[1]["subject"] == "initial commit"

    # Status is now clean
    st2 = client.get(f"/api/ide/{pid}/git/status", headers=auth_headers)
    assert st2.status_code == 200
    assert st2.json()["staged"] == []
    assert st2.json()["unstaged"] == []
    assert st2.json()["untracked"] == []


def test_checkpoints_create_preview_restore_and_undo(
    client: TestClient,
    auth_headers: dict[str, str],
    isolated_env: dict[str, Path],
) -> None:
    ws = isolated_env["tmp"] / "cp_ws"
    ws.mkdir()
    (ws / "keep_mod.txt").write_text("original", encoding="utf-8")
    (ws / "to_delete.txt").write_text("restore me", encoding="utf-8")
    (ws / "node_modules").mkdir()
    (ws / "node_modules" / "ignored.js").write_text("ignore", encoding="utf-8")

    pid = _create_project(client, auth_headers, "Checkpoints WS", ws)

    cp_res = client.post(
        f"/api/ide/{pid}/checkpoints",
        json={"label": "Clean baseline", "kind": "manual"},
        headers=auth_headers,
    )
    assert cp_res.status_code == 200, cp_res.text
    cp_id = cp_res.json()["id"]
    assert cp_res.json()["file_count"] == 2

    # Mutate workspace: modify one, delete one, add one extra
    (ws / "keep_mod.txt").write_text("changed!", encoding="utf-8")
    (ws / "to_delete.txt").unlink()
    (ws / "extra_new.txt").write_text("should be removed", encoding="utf-8")

    # Preview restore
    prev_res = client.get(f"/api/ide/{pid}/checkpoints/{cp_id}/preview", headers=auth_headers)
    assert prev_res.status_code == 200, prev_res.text
    prev = prev_res.json()
    assert prev["modified"] == ["keep_mod.txt"]
    assert prev["recreated"] == ["to_delete.txt"]
    assert prev["deleted"] == ["extra_new.txt"]

    # Restore -> creates an undo checkpoint first
    rest_res = client.post(f"/api/ide/{pid}/checkpoints/{cp_id}/restore", headers=auth_headers)
    assert rest_res.status_code == 200, rest_res.text
    rest = rest_res.json()
    assert rest["restored"] is True
    assert rest["modified"] == 1
    assert rest["recreated"] == 1
    assert rest["deleted"] == 1
    undo_id = rest["undo_checkpoint_id"]
    assert undo_id.startswith("cp_")

    assert (ws / "keep_mod.txt").read_text(encoding="utf-8") == "original"
    assert (ws / "to_delete.txt").read_text(encoding="utf-8") == "restore me"
    assert not (ws / "extra_new.txt").exists()
    assert (ws / "node_modules" / "ignored.js").is_file()

    # Undo checkpoint exists in list and can restore back to mutated state
    cps = client.get(f"/api/ide/{pid}/checkpoints", headers=auth_headers).json()["checkpoints"]
    assert any(c["id"] == undo_id and c["kind"] == "undo" for c in cps)

    undo_rest = client.post(f"/api/ide/{pid}/checkpoints/{undo_id}/restore", headers=auth_headers)
    assert undo_rest.status_code == 200, undo_rest.text
    assert (ws / "keep_mod.txt").read_text(encoding="utf-8") == "changed!"
    assert not (ws / "to_delete.txt").exists()
    assert (ws / "extra_new.txt").read_text(encoding="utf-8") == "should be removed"


def test_terminal_sessions_and_ports_scanner(
    client: TestClient,
    auth_headers: dict[str, str],
    isolated_env: dict[str, Path],
) -> None:
    ws = isolated_env["tmp"] / "term_ws"
    ws.mkdir()
    pid = _create_project(client, auth_headers, "Term WS", ws)

    # Create terminal session
    created = client.post(
        "/api/tools/terminal/sessions",
        json={"project_id": pid, "title": "Pytest Shell"},
        headers=auth_headers,
    )
    assert created.status_code == 200, created.text
    sid = created.json()["session"]["id"]

    # List sessions includes it
    listed = client.get("/api/tools/terminal/sessions", headers=auth_headers)
    assert listed.status_code == 200
    assert any(s["id"] == sid for s in listed.json()["sessions"])

    # Exec `echo hello`
    ex = client.post(
        f"/api/tools/terminal/sessions/{sid}/exec",
        json={"command": "echo hello"},
        headers=auth_headers,
    )
    assert ex.status_code == 200, ex.text
    assert ex.json()["accepted"] is True

    # Poll buffer until finished
    buf = ""
    for _ in range(50):
        detail = client.get(f"/api/tools/terminal/sessions/{sid}", headers=auth_headers)
        assert detail.status_code == 200
        data = detail.json()
        buf = data["buffer"]
        if not data["session"]["running"] and "hello" in buf:
            break
        time.sleep(0.1)

    assert "$ echo hello" in buf
    assert "hello" in buf

    # Interrupt & delete session
    intr = client.post(f"/api/tools/terminal/sessions/{sid}/interrupt", headers=auth_headers)
    assert intr.status_code == 200
    assert intr.json() == {"interrupted": True}

    dele = client.delete(f"/api/tools/terminal/sessions/{sid}", headers=auth_headers)
    assert dele.status_code == 200
    assert dele.json() == {"deleted": True}

    missing = client.get(f"/api/tools/terminal/sessions/{sid}", headers=auth_headers)
    assert missing.status_code == 404

    # Ports scanner
    ports_res = client.get("/api/tools/ports", headers=auth_headers)
    assert ports_res.status_code == 200, ports_res.text
    assert isinstance(ports_res.json()["ports"], list)


def test_memories_notes_and_installed_agents_status(
    client: TestClient,
    auth_headers: dict[str, str],
    isolated_env: dict[str, Path],
) -> None:
    ws = isolated_env["tmp"] / "mem_ws"
    ws.mkdir()
    pid = _create_project(client, auth_headers, "Mem WS", ws)

    # Agent Memory CRUD
    m1 = client.post(
        "/api/tools/memories",
        json={
            "title": "Always Rule",
            "content": "Always respond concisely in Vietnamese.",
            "scope": "global",
            "mode": "always",
        },
        headers=auth_headers,
    )
    assert m1.status_code == 200, m1.text
    mem_always_id = m1.json()["memory"]["id"]

    m2 = client.post(
        "/api/tools/memories",
        json={
            "title": "Database Migration",
            "content": "Use alembic upgrade head for postgres schema changes.",
            "scope": "project",
            "project_id": pid,
            "mode": "passive",
        },
        headers=auth_headers,
    )
    assert m2.status_code == 200, m2.text

    mems = client.get("/api/tools/memories", params={"project_id": pid}, headers=auth_headers)
    assert mems.status_code == 200
    assert len(mems.json()["memories"]) == 2

    # Context prefix & ```memory``` block extraction
    mem_svc = MemoryService(AppConfig(_env_file=None, AGY_DATA_DIR=str(isolated_env["data_dir"])))
    prefix = mem_svc.build_context_prefix(pid, "How do I run postgres alembic migration?")
    assert "Always Rule" in prefix
    assert "Database Migration" in prefix

    extracted = mem_svc.extract_and_save_memory_blocks(
        pid,
        "Done!\n```memory\ntitle: Build Command\nmode: always\nscope: project\n---\nRun npm.cmd run build\n```\n",
    )
    assert len(extracted) == 1
    assert extracted[0]["title"] == "Build Command"
    assert extracted[0]["mode"] == "always"

    del_mem = client.delete(f"/api/tools/memories/{mem_always_id}", headers=auth_headers)
    assert del_mem.status_code == 200
    assert del_mem.json()["deleted"] is True

    # Notes & Checklists CRUD
    note_create = client.post(
        "/api/tools/notes",
        json={
            "title": "Release Checklist",
            "content": "Verify v2.0 before push",
            "pinned": True,
            "project_id": pid,
            "checklist": [{"text": "Run pytest", "done": False}],
        },
        headers=auth_headers,
    )
    assert note_create.status_code == 200, note_create.text
    note_id = note_create.json()["note"]["id"]
    chk_id = note_create.json()["note"]["checklist"][0]["id"]

    note_upd = client.put(
        f"/api/tools/notes/{note_id}",
        json={
            "pinned": False,
            "checklist": [{"id": chk_id, "text": "Run pytest", "done": True}],
        },
        headers=auth_headers,
    )
    assert note_upd.status_code == 200, note_upd.text
    assert note_upd.json()["note"]["pinned"] is False
    assert note_upd.json()["note"]["checklist"][0]["done"] is True

    notes_list = client.get("/api/tools/notes", params={"project_id": pid}, headers=auth_headers)
    assert notes_list.status_code == 200
    assert any(n["id"] == note_id for n in notes_list.json()["notes"])

    note_del = client.delete(f"/api/tools/notes/{note_id}", headers=auth_headers)
    assert note_del.status_code == 200
    assert note_del.json() == {"deleted": True, "id": note_id}

    # /api/system/status includes installed_agents
    sys_res = client.get("/api/system/status", headers=auth_headers)
    assert sys_res.status_code == 200, sys_res.text
    agents = sys_res.json().get("installed_agents")
    assert isinstance(agents, list)
    agent_ids = {a["id"] for a in agents}
    assert {"agy", "claude_code", "codex", "opencode"}.issubset(agent_ids)
