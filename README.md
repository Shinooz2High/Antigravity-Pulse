# Antigravity Pulse — Mobile PWA & Real-time PC Bridge

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Mobile-first PWA (with Capacitor native support) & Real-time PC Bridge for **Google Antigravity**.  
Ứng dụng web/PWA điều khiển từ xa trên điện thoại kết nối trực tiếp với **Google Antigravity** & workspace trên PC theo thời gian thực.

> Xem ghi chú chi tiết vai trò của từng file trong dự án tại **[NOTES.md](NOTES.md)**.

---

## Tính năng chính / Key Features

1. **Chạy Prompt từ điện thoại & Duyệt Tool trực tiếp (Mobile Prompt Studio & Approvals)**
   - Gửi prompt và đính kèm ảnh/file từ điện thoại tới workspace trên PC.
   - Hỗ trợ 3 chế độ thực thi: `Antigravity SDK` (`google-antigravity`), `CLI Runner` (`agy`), và `Demo Simulator`.
   - 3 chính sách an toàn: `Hỏi duyệt trên ĐT` (`ask_mobile`), `Chỉ đọc` (`read_only`), `Tự động trong workspace` (`auto_workspace`).
   - Stream suy nghĩ (`thoughts`), token trả lời và lời gọi tool theo thời gian thực qua WebSocket.

2. **Theo dõi Phiên Antigravity trên PC (Local Brain Monitor)**
   - Đọc trực tiếp các phiên từ `~/.gemini/antigravity/brain/*` (tách tiêu đề sạch, token usage, bước suy nghĩ, tool calls, tải bước đầy đủ từ `transcript_full.jsonl`).
   - Tự động phát hiện thay đổi file trên PC bằng `watchdog` và đẩy sự kiện real-time tới tất cả thiết bị đang kết nối.

3. **Kho Kết quả & Trình duyệt Workspace (Artifacts & File Browser)**
   - Xem báo cáo Markdown (GFM, KaTeX, Mermaid, Highlight), ảnh (zoom), code, PDF/HTML và tải về trực tiếp trên điện thoại.
   - Duyệt thư mục dự án PC an toàn (chống path traversal tuyệt đối) và hiển thị trạng thái Git branch/dirty.

4. **Kết nối LAN / Tailscale / Cloudflare Tunnel + Ghép nối QR & PIN**
   - Tự động sinh mã PIN 6 số và token ghép nối QR lưu cục bộ tại `backend/data/settings.json`.
   - Hỗ trợ quét mã QR trực tiếp trên điện thoại, truy cập cùng Wi-Fi (LAN), qua Tailscale VPN, hoặc bật Cloudflare Quick Tunnel (`-Tunnel` hoặc từ trang Cài đặt).

5. **Giao diện Di động Tùy biến (Custom Theme, Live Wallpaper & Capacitor)**
   - Hỗ trợ hình nền động (Live Wallpaper), màn hình khởi động (Boot Intro Overlay), âm thanh và tùy biến theme.
   - Tích hợp sẵn cấu hình **Capacitor 8** (Haptics, StatusBar, LocalNotifications, Share) để dễ dàng đóng gói thành ứng dụng Android/iOS.

---

## Cấu trúc thư mục / Project Structure

```text
.
├── backend/                # FastAPI server, Antigravity runner, brain scanner, WebSocket & tests
│   ├── app/
│   │   ├── routers/        # auth, prompts, antigravity, projects, system, ws
│   │   └── services/       # runner, brain_scanner, file_watcher, tunnel, auth, ws_manager...
│   ├── tests/              # Bộ kiểm thử tự động pytest
│   └── requirements.txt
├── frontend/               # React 19 + TypeScript + Vite + Tailwind CSS v4 + Capacitor PWA
│   ├── public/             # PWA manifest, service worker, icons, theme-assets
│   └── src/
│       ├── components/     # Modals, MarkdownRenderer, ToolApprovalBanner, library/, theme/
│       ├── contexts/       # CustomThemeContext
│       ├── hooks/          # usePulseSocket
│       ├── lib/            # api, native (Capacitor), utils
│       └── pages/          # Dashboard, Prompt, Outputs, Projects, Settings
├── .agents/                # Agent skills đi kèm (lucian-uxui)
├── start.bat / start.ps1   # Script khởi chạy nhanh một chạm trên Windows
├── .env.example            # Mẫu biến môi trường
├── NOTES.md                # Ghi chú chi tiết toàn bộ các file trong dự án
└── LICENSE                 # Giấy phép MIT
```

---

## Khởi chạy nhanh / Quick Start (Windows)

### 1. Chạy một lần bằng script / Launch via script
Nhấp đúp `start.bat` hoặc chạy PowerShell:
```powershell
.\start.ps1
```
Bật kèm Cloudflare Quick Tunnel (truy cập ngoài mạng LAN — yêu cầu cài `cloudflared` qua `winget install Cloudflare.cloudflared`):
```powershell
.\start.ps1 -Tunnel
```
Tuỳ chọn đổi port:
```powershell
.\start.ps1 -Port 8765
```

Terminal sẽ hiển thị **LAN URL**, **PIN 6 số**, **Pairing URL** và **mã QR ASCII** để quét trực tiếp trên điện thoại.

### 2. Chạy thủ công / Manual Setup

#### Backend (Python 3.11+)
```powershell
python -m venv backend\.venv
.\backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8765
```

#### Frontend PWA (Node.js 18+)
> Lưu ý trên Windows: dùng `npm.cmd` / `npx.cmd` nếu PowerShell ExecutionPolicy chặn `.ps1`.
```powershell
cd frontend
npm.cmd install
npm.cmd run build
```

---

## Cấu hình biến môi trường / Environment Variables

Sao chép `.env.example` thành `.env` nếu muốn cố định cấu hình:
- `AGY_HOST` (mặc định `0.0.0.0`)
- `AGY_PORT` (mặc định `8765`)
- `AGY_BRIDGE_PIN` (tùy chọn cố định mã PIN 6 số)
- `GEMINI_API_KEY` (hoặc cấu hình trực tiếp trong mục **Cài đặt** trên điện thoại)
- `GOOGLE_GENAI_USE_VERTEXAI`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`
- `AGY_BRAIN_DIR` (mặc định `~/.gemini/antigravity/brain`)
- `AGY_DEFAULT_PROJECT` (thư mục workspace mặc định)

---

## Kiểm thử / Running Tests

```powershell
.\backend\.venv\Scripts\python.exe -m pytest -v backend\tests
```

Kiểm tra kiểu TypeScript ở frontend:
```powershell
cd frontend
npm.cmd run typecheck
```

---

## Giấy phép / License

Dự án được phát hành theo giấy phép **MIT License** — xem chi tiết tại file [LICENSE](LICENSE).
