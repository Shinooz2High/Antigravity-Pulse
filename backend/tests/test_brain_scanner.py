"""Tests for Antigravity local brain scanner and transcript parser."""

from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient


def _seed_brain(brain_dir: Path) -> str:
    # Non-UUID folder must be skipped
    ignored = brain_dir / "tempmediaStorage"
    ignored.mkdir(parents=True, exist_ok=True)
    (ignored / "temp.docx").write_bytes(b"fake")

    conv_id = "11111111-2222-3333-4444-555555555555"
    conv_dir = brain_dir / conv_id
    logs_dir = conv_dir / ".system_generated" / "logs"
    logs_dir.mkdir(parents=True, exist_ok=True)
    (conv_dir / ".user_uploaded").mkdir(parents=True, exist_ok=True)
    (conv_dir / ".user_uploaded" / "upload.png").write_bytes(b"png")
    (conv_dir / "scratch").mkdir(parents=True, exist_ok=True)

    # Artifacts
    (conv_dir / "plan.md").write_text("# Implementation Plan\nDetails here.", encoding="utf-8")
    (conv_dir / "plan.md.metadata.json").write_text('{"summary": "Plan"}', encoding="utf-8")
    (conv_dir / "scratch" / "helper.py").write_text("print('hi')\n", encoding="utf-8")

    steps_compact = [
        {
            "step_index": 0,
            "source": "USER_EXPLICIT",
            "type": "USER_INPUT",
            "status": "DONE",
            "created_at": "2026-11-22T10:00:00Z",
            "content": "<USER_REQUEST>\n/swarm /boost Inspect the backend architecture\n</USER_REQUEST>\n<ADDITIONAL_METADATA>secret</ADDITIONAL_METADATA>",
        },
        {
            "step_index": 1,
            "source": "MODEL",
            "type": "PLANNER_RESPONSE",
            "status": "DONE",
            "created_at": "2026-11-22T10:00:05Z",
            "model": "gemini-4-hydrogen-xhigh",
            "input_tokens": 1200,
            "output_tokens": 350,
            "thinking": "Checking files first.",
            "tool_calls": [{"name": "read_file", "args": {"Path": "main.py"}}],
            "content": "Short truncated preview...",
            "truncated_fields": ["content"],
        },
    ]
    compact_lines = [json.dumps(s) for s in steps_compact]
    # Add partial corrupted trailing line to test tolerance
    compact_lines.append('{"step_index": 2, "source": "MODEL", "incomplete')
    (logs_dir / "transcript.jsonl").write_text("\n".join(compact_lines), encoding="utf-8")

    steps_full = [
        steps_compact[0],
        {
            **steps_compact[1],
            "content": "Full untruncated response text with lots of detail.",
            "truncated_fields": [],
        },
    ]
    (logs_dir / "transcript_full.jsonl").write_text(
        "\n".join(json.dumps(s) for s in steps_full),
        encoding="utf-8",
    )
    return conv_id


def test_brain_sessions_and_artifacts(
    client: TestClient,
    auth_headers: dict[str, str],
    isolated_env: dict[str, Path],
) -> None:
    conv_id = _seed_brain(isolated_env["brain_dir"])

    res = client.get("/api/antigravity/sessions", headers=auth_headers)
    assert res.status_code == 200
    payload = res.json()
    assert len(payload["sessions"]) == 1
    sess = payload["sessions"][0]
    assert sess["id"] == conv_id
    assert sess["title"] == "Inspect the backend architecture"
    assert sess["step_count"] == 2
    assert sess["artifact_count"] == 2
    assert sess["total_input_tokens"] == 1200
    assert sess["total_output_tokens"] == 350
    assert sess["model"] == "gemini-4-hydrogen-xhigh"
    assert sess["latest_status"] == "done"

    detail = client.get(f"/api/antigravity/sessions/{conv_id}", headers=auth_headers)
    assert detail.status_code == 200
    detail_json = detail.json()
    assert len(detail_json["steps"]) == 2
    assert detail_json["steps"][1]["truncated"] is True
    assert detail_json["steps"][1]["thinking"] == "Checking files first."
    artifact_names = {a["name"] for a in detail_json["artifacts"]}
    assert artifact_names == {"plan.md", "helper.py"}

    full_step = client.get(f"/api/antigravity/sessions/{conv_id}/steps/1/full", headers=auth_headers)
    assert full_step.status_code == 200
    assert full_step.json()["truncated"] is False
    assert "Full untruncated response text" in full_step.json()["content"]

    artifacts_res = client.get("/api/antigravity/artifacts?category=markdown&q=plan", headers=auth_headers)
    assert artifacts_res.status_code == 200
    assert len(artifacts_res.json()["artifacts"]) == 1

    content_res = client.get(
        f"/api/antigravity/artifact-content?conv_id={conv_id}&path=scratch/helper.py",
        headers=auth_headers,
    )
    assert content_res.status_code == 200
    assert "print('hi')" in content_res.json()["text"]

    raw_res = client.get(
        f"/api/antigravity/artifact-raw?conv_id={conv_id}&path=plan.md&download=1",
        headers=auth_headers,
    )
    assert raw_res.status_code == 200
    assert "attachment" in raw_res.headers.get("content-disposition", "")

    # Traversal check
    traversal = client.get(
        f"/api/antigravity/artifact-raw?conv_id={conv_id}&path=../../Windows/win.ini",
        headers=auth_headers,
    )
    assert traversal.status_code in (400, 403)
