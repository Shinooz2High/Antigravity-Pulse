"""Shared filesystem, MIME classification, networking, and QR utilities."""

from __future__ import annotations

import base64
import io
import json
import mimetypes
import os
import socket
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote

import qrcode
import qrcode.image.svg
from fastapi import HTTPException

from .models import ArtifactCategory


# Ensure common modern extensions resolve reliably on Windows
mimetypes.add_type("text/markdown", ".md")
mimetypes.add_type("text/markdown", ".mdx")
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("application/javascript", ".mjs")
mimetypes.add_type("text/typescript", ".ts")
mimetypes.add_type("text/typescript", ".tsx")
mimetypes.add_type("application/json", ".json")
mimetypes.add_type("text/yaml", ".yaml")
mimetypes.add_type("text/yaml", ".yml")
mimetypes.add_type("application/manifest+json", ".webmanifest")
mimetypes.add_type("image/webp", ".webp")
mimetypes.add_type("image/svg+xml", ".svg")


MARKDOWN_EXTS = {".md", ".markdown", ".mdx"}
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico"}
PDF_EXTS = {".pdf"}
HTML_EXTS = {".html", ".htm"}
CODE_EXTS = {
    ".py",
    ".pyi",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".json",
    ".jsonc",
    ".jsonl",
    ".yaml",
    ".yml",
    ".toml",
    ".ini",
    ".cfg",
    ".env",
    ".css",
    ".scss",
    ".less",
    ".sql",
    ".sh",
    ".bash",
    ".ps1",
    ".bat",
    ".cmd",
    ".rs",
    ".go",
    ".java",
    ".kt",
    ".c",
    ".cpp",
    ".cc",
    ".h",
    ".hpp",
    ".cs",
    ".rb",
    ".php",
    ".swift",
    ".xml",
    ".vue",
    ".svelte",
}
DOCUMENT_EXTS = {".txt", ".csv", ".tsv", ".log", ".rtf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx"}
TEXT_READABLE_CATEGORIES = {"markdown", "code", "html"}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def utc_now_iso() -> str:
    return utc_now().isoformat().replace("+00:00", "Z")


def timestamp_to_iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def classify_file(path: Path | str) -> tuple[ArtifactCategory, str]:
    p = Path(path)
    ext = p.suffix.lower()
    name_lower = p.name.lower()

    if ext in MARKDOWN_EXTS:
        return "markdown", "text/markdown; charset=utf-8"
    if ext in IMAGE_EXTS:
        mime, _ = mimetypes.guess_type(str(p))
        return "image", mime or "image/png"
    if ext in PDF_EXTS:
        return "pdf", "application/pdf"
    if ext in HTML_EXTS:
        return "html", "text/html; charset=utf-8"
    if ext in CODE_EXTS or name_lower in {
        "dockerfile",
        "makefile",
        ".gitignore",
        ".env",
        ".env.example",
        ".eslintrc",
        ".prettierrc",
    }:
        mime, _ = mimetypes.guess_type(str(p))
        return "code", mime or "text/plain; charset=utf-8"
    if ext in DOCUMENT_EXTS:
        mime, _ = mimetypes.guess_type(str(p))
        return "document", mime or "application/octet-stream"

    mime, _ = mimetypes.guess_type(str(p))
    if mime and mime.startswith("text/"):
        return "document", mime
    return "other", mime or "application/octet-stream"


def read_text_preview(path: Path, category: ArtifactCategory, mime_type: str, max_bytes: int = 2_097_152) -> str | None:
    """Read UTF-8 text if file is text-like and within max_bytes; else return None."""
    if category in {"image", "pdf"}:
        return None
    if category == "other" and not mime_type.startswith("text/"):
        return None
    if category == "document" and path.suffix.lower() not in {".txt", ".csv", ".tsv", ".log", ".rtf"}:
        return None

    try:
        size = path.stat().st_size
    except OSError:
        return None
    if size > max_bytes:
        return None

    for attempt in range(3):
        try:
            raw = path.read_bytes()
            if b"\x00" in raw[:8192]:
                return None
            return raw.decode("utf-8", errors="replace")
        except PermissionError:
            if attempt < 2:
                time.sleep(0.04)
                continue
            return None
        except OSError:
            return None
    return None


def safe_jail_path(root: Path, rel_path: str, *, allow_root: bool = False) -> tuple[Path, str]:
    """Validate and resolve a relative path strictly within `root`.

    Rejects traversal (`..`), absolute paths, drive prefixes, null bytes,
    and symlinks resolving outside `root`.
    Returns `(resolved_path, normalized_posix_rel_path)`.
    """
    raw = (rel_path or "").strip()
    if "\x00" in raw:
        raise HTTPException(status_code=400, detail="Invalid path: null byte")

    normalized_slashes = raw.replace("\\", "/")
    if normalized_slashes in {"", "."}:
        if not allow_root:
            raise HTTPException(status_code=400, detail="File path is required")
        return root.resolve(), ""

    if normalized_slashes.startswith("/") or (len(normalized_slashes) >= 2 and normalized_slashes[1] == ":"):
        raise HTTPException(status_code=403, detail="Absolute paths are forbidden")

    parts = [p for p in normalized_slashes.split("/") if p and p != "."]
    if any(part == ".." for part in parts):
        raise HTTPException(status_code=403, detail="Path traversal is forbidden")

    root_resolved = root.resolve()
    candidate = (root_resolved / Path(*parts)).resolve()

    if candidate != root_resolved and not candidate.is_relative_to(root_resolved):
        raise HTTPException(status_code=403, detail="Path escapes allowed directory")

    if candidate == root_resolved and not allow_root:
        raise HTTPException(status_code=400, detail="Path must reference a file")

    clean_rel = candidate.relative_to(root_resolved).as_posix()
    if clean_rel == ".":
        clean_rel = ""
    return candidate, clean_rel


def atomic_write_json(path: Path, data: Any) -> None:
    """Atomically write JSON with brief retry for Windows file locks."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(f"{path.suffix}.tmp.{os.getpid()}")
    payload = json.dumps(data, indent=2, ensure_ascii=False)
    tmp_path.write_text(payload, encoding="utf-8")
    for attempt in range(5):
        try:
            os.replace(tmp_path, path)
            return
        except PermissionError:
            if attempt < 4:
                time.sleep(0.05)
                continue
            raise


def read_json_file(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    for attempt in range(4):
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except PermissionError:
            if attempt < 3:
                time.sleep(0.04)
                continue
            return default
        except (OSError, json.JSONDecodeError):
            return default
    return default


def _is_rfc1918_lan_ip(ip: str) -> int:
    """Return preference rank for RFC 1918 LAN IPv4 addresses (higher is better), or 0 if not LAN."""
    parts = ip.split(".")
    if len(parts) != 4:
        return 0
    try:
        a, b = int(parts[0]), int(parts[1])
    except ValueError:
        return 0
    if a == 192 and b == 168:
        return 3
    if a == 172 and 16 <= b <= 31:
        return 2
    if a == 10:
        return 1
    return 0


def get_lan_ip() -> str:
    """Detect the primary LAN IPv4 address for this machine, preferring Wi-Fi/Ethernet LAN over VPN TUN."""
    udp_ip: str | None = None
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            candidate = s.getsockname()[0]
            if candidate and not candidate.startswith("127.") and not candidate.startswith("169.254."):
                udp_ip = candidate
                if _is_rfc1918_lan_ip(udp_ip) > 0:
                    return udp_ip
    except OSError:
        pass

    local_candidates: list[str] = []
    try:
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            ip = info[4][0]
            if ip and not ip.startswith("127.") and not ip.startswith("169.254.") and ip not in local_candidates:
                local_candidates.append(ip)
    except OSError:
        pass

    lan_candidates = [ip for ip in local_candidates if _is_rfc1918_lan_ip(ip) > 0]
    if lan_candidates:
        lan_candidates.sort(key=_is_rfc1918_lan_ip, reverse=True)
        return lan_candidates[0]

    if udp_ip:
        return udp_ip
    if local_candidates:
        return local_candidates[0]

    return "127.0.0.1"


def get_tailscale_ip() -> str | None:
    """Detect Tailscale IPv4 address via Tailscale CLI if installed and active."""
    try:
        proc = subprocess.run(
            ["tailscale", "ip", "-4"],
            capture_output=True,
            text=True,
            timeout=1.5,
            check=False,
        )
        if proc.returncode == 0:
            for line in proc.stdout.splitlines():
                candidate = line.strip()
                if candidate.startswith("100."):
                    return candidate
    except (OSError, subprocess.SubprocessError):
        pass
    return None


def generate_qr_svg_data_url(text: str) -> str:
    """Generate an inline SVG data URL QR code."""
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=8,
        border=2,
    )
    qr.add_data(text)
    qr.make(fit=True)
    img = qr.make_image(image_factory=qrcode.image.svg.SvgPathImage)
    buf = io.BytesIO()
    img.save(buf)
    svg_bytes = buf.getvalue()
    encoded = base64.b64encode(svg_bytes).decode("ascii")
    return f"data:image/svg+xml;base64,{encoded}"


def content_disposition_header(filename: str, download: bool) -> dict[str, str]:
    """Build an RFC 5987 safe Content-Disposition header for Unicode filenames."""
    disp = "attachment" if download else "inline"
    ascii_name = filename.encode("ascii", errors="ignore").decode("ascii").replace('"', "_") or "file"
    utf8_name = quote(filename)
    return {"Content-Disposition": f"{disp}; filename=\"{ascii_name}\"; filename*=UTF-8''{utf8_name}"}
