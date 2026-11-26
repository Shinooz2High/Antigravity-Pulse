# Antigravity Pulse — Mobile PWA & Real-time PC Bridge

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Web Portal](https://img.shields.io/badge/Web%20Portal-agypulse.dpdns.org-06b6d4)](https://agypulse.dpdns.org)
[![Android APK](https://img.shields.io/badge/Android-Download%20APK-3ddc84)](https://github.com/Shinooz2High/App-Antigravity-on-moblie-/releases/latest)

Điều khiển **Google Antigravity** & workspace trên PC từ **điện thoại (Android / iOS)** hoặc **bất kỳ máy Mac / Windows / Linux nào khác** theo thời gian thực — hỗ trợ **kết nối 1 chạm bằng link gọn**, **mã 6 ký tự**, **gửi trực tiếp qua Zalo / Messenger**, và **đăng nhập Continue with Google**.

- 🌐 **Cổng Web cố định (dùng trên mọi thiết bị):** **[https://agypulse.dpdns.org](https://agypulse.dpdns.org)**
- 🪟 **Cài 1 chạm trên Windows PC:** **[Tải `cai-antigravity-pulse.bat`](https://agypulse.dpdns.org/cai-antigravity-pulse.bat)**
- 🍏 **Cài 1 chạm trên macOS (Apple Silicon & Intel):** **[Tải `cai-antigravity-pulse.command`](https://agypulse.dpdns.org/cai-antigravity-pulse.command)**
- 📱 **Tải App Android (.apk) & iOS (.ipa / Xcode):** **[GitHub Releases (Latest)](https://github.com/Shinooz2High/App-Antigravity-on-moblie-/releases/latest)**
- 📦 **Hướng dẫn cài đặt chi tiết (Windows / macOS / Android / iOS / Linux):** **[install/README.md](install/README.md)**
- 📄 **Ghi chú cấu trúc toàn bộ file:** **[NOTES.md](NOTES.md)**

---

## 1. Cài đặt siêu nhanh trên PC & Mac (1 chạm)

### Windows 10 / 11
1. **Cách A — Bấm đúp file (Không cần gõ lệnh):** Tải **[`cai-antigravity-pulse.bat`](https://agypulse.dpdns.org/cai-antigravity-pulse.bat)** về máy và **bấm đúp**. Bộ cài tự kiểm tra/cài Python, Node.js, Git, `cloudflared` qua `winget`, tải mã nguồn về `%USERPROFILE%\AntigravityPulse`, tạo **icon `Antigravity Pulse` ngoài Desktop** và khởi chạy ngay.
2. **Cách B — Dán 1 dòng vào PowerShell:**
   ```powershell
   irm https://agypulse.dpdns.org/install.ps1 | iex
   ```

### macOS (Apple Silicon M1–M4 & Intel) & Linux
1. **Cách A — Bấm đúp file (macOS):** Tải **[`cai-antigravity-pulse.command`](https://agypulse.dpdns.org/cai-antigravity-pulse.command)** và mở chạy (nếu macOS Gatekeeper hỏi lần đầu: chuột phải → **Mở / Open**).
2. **Cách B — Dán 1 dòng vào Terminal (`zsh` / `bash`):**
   ```bash
   curl -fsSL https://agypulse.dpdns.org/install.sh | bash
   ```
   > Bộ cài tự động cài `python3`, `node`, `git`, `cloudflared` (qua Homebrew trên macOS hoặc `apt`/`dnf`/`pacman` trên Linux), đồng bộ mã nguồn vào `~/AntigravityPulse`, tạo ứng dụng **`~/Applications/Antigravity Pulse.app`** + lối tắt **`~/Desktop/Antigravity Pulse.command`** (trên macOS) và khởi chạy server qua `./start.sh`.

> Lần sau chỉ cần bấm đúp icon **`Antigravity Pulse`** ngoài Desktop (Windows) hoặc **`Antigravity Pulse.app` / `Antigravity Pulse.command`** (macOS) để khởi động. Server sẽ tự mở Cloudflare Tunnel và hiện **Mã 6 ký tự** cùng **Link gọn 1 chạm**.

---

## 2. Kết nối từ điện thoại hoặc PC khác (3 giây)

Không cần nhớ IP, không cần chung Wi-Fi, không cần cấu hình mạng:

1. **Cách nhanh nhất — Link gọn 1 chạm qua Zalo / Messenger:**
   - Trong trang **Cài đặt** trên PC, bấm **💬 Gửi qua Zalo** hoặc **💙 Gửi qua Messenger** (hoặc **Sao chép link**).
   - Link có dạng siêu gọn: `https://agypulse.dpdns.org/?c=XXX-XXX`
   - Máy kia **bấm vào link là tự động đăng nhập thẳng vào PC luôn**, không cần nhập PIN hay IP!
2. **Cách nhập Mã 6 ký tự (khi gõ tay trên máy khác):**
   - Mở **[https://agypulse.dpdns.org](https://agypulse.dpdns.org)** (hoặc mở App Android/iOS).
   - Nhập **Mã 6 ký tự** (ví dụ `SDP-RF9`) hiển thị trên PC → tự động tìm đúng đường hầm Cloudflare và đăng nhập.
3. **Các cách đăng nhập khác:**
   - **Continue with Google**: đăng nhập trực tiếp bằng tài khoản Google / Antigravity (`agy`).
   - **Quét mã QR** hoặc **Nhập PIN 6 số** (khi dùng LAN hoặc link trực tiếp).

---

## 3. Cài đặt App trên 4 Nền tảng (Android · iOS · macOS · Windows)

- **Android (Native `.apk` + Chrome PWA):** Tải trực tiếp **[`Antigravity-Pulse-Android.apk`](https://github.com/Shinooz2High/App-Antigravity-on-moblie-/releases/latest/download/Antigravity-Pulse-Android.apk)** từ GitHub Releases và cài lên máy, hoặc mở **[https://agypulse.dpdns.org](https://agypulse.dpdns.org)** bằng **Chrome** → **Cài đặt ứng dụng**.
- **iOS — iPhone / iPad (Safari PWA & `.ipa` / Xcode):**
  - *Cách nhanh nhất (không cần máy Mac):* Mở **[https://agypulse.dpdns.org](https://agypulse.dpdns.org)** bằng **Safari** → bấm **Chia sẻ (`□↑`)** → chọn **Thêm vào Màn hình chính** (*Add to Home Screen*) để chạy toàn màn hình như app gốc.
  - *Sideload Native `.ipa` / Xcode:* Tải gói `Antigravity-Pulse-iOS.ipa` (unsigned cho AltStore / SideStore / Sideloadly) hoặc `Antigravity-Pulse-iOS-Project.zip` từ **[GitHub Releases](https://github.com/Shinooz2High/App-Antigravity-on-moblie-/releases/latest)**.
- **macOS (App `.command` + `.app` & Terminal):** Chạy `curl -fsSL https://agypulse.dpdns.org/install.sh | bash` hoặc tải **`cai-antigravity-pulse.command`** để tự cài môi trường, tạo **`Antigravity Pulse.app`** và cài Desktop PWA trên Chrome/Safari.
- **Windows (10/11):** Chạy `irm https://agypulse.dpdns.org/install.ps1 | iex`, bấm đúp **`cai-antigravity-pulse.bat`**, hoặc bấm icon **Install App** trên Chrome/Edge để dùng như Desktop App.

Xem hướng dẫn chi tiết từng nền tảng tại **[install/README.md](install/README.md)**.

---

## Tính năng chính / Key Features

1. **Kết nối từ xa 1 chạm & Chia sẻ Zalo / Messenger**
   - Tự động mở **Cloudflare Quick Tunnel** ngay khi khởi chạy PC Bridge.
   - Mã kết nối nhanh 6 ký tự mã hóa đầu cuối + link gọn `https://agypulse.dpdns.org/?c=...` tự động giải mã địa chỉ PC và đăng nhập 1 chạm.
2. **Đăng nhập Google & Antigravity CLI (`agy`)**
   - Hỗ trợ nút **Continue with Google** ở màn hình đăng nhập, Google OAuth 2.0, ADC và đồng bộ phiên `agy` cục bộ.
3. **AI Chat Studio v2 & Multi-Agent Orchestration (Mobile Prompt Studio)**
   - Gửi prompt, đính kèm ảnh/file tới workspace PC; chọn model AI & xem trạng thái quota.
   - **6 chế độ Agent/Engine**: `Antigravity SDK`, `Antigravity CLI (agy)`, `Claude Code CLI`, `OpenAI Codex CLI`, `OpenCode CLI`, và `Demo Simulator` (tự động phát hiện CLI đã cài qua `/api/system/status`).
   - **Slash Commands (`/`) & Custom Commands**: Gõ `/` để mở bảng lệnh nhanh (`/review`, `/diff`, `/fix`, `/test`, `/explain`, `/architecture`, `/remember`) và tự tạo lệnh `/` riêng.
   - **Hàng đợi tin nhắn (Queued Next-Turn)**, **Nhập liệu giọng nói & Đọc to TTS (SpeechRecognition / SpeechSynthesis)**, **Bộ nhớ AI dài hạn (`memories.json`)**, và **Xuất hội thoại** ra `.md` / `.html`.
   - 3 chính sách an toàn: `Hỏi duyệt trên ĐT (ask_mobile)`, `Chỉ đọc (read_only)`, `Tự động trong workspace (auto_workspace)`.
   - Stream suy nghĩ (`thoughts`), nội dung trả lời và lời gọi tool real-time qua WebSocket.
4. **Pocket IDE v2 (Code Editor, Git Source Control, Checkpoints, Terminal & Live Ports)**
   - **Trình soạn thảo Code di động**: Tạo file/thư mục, đổi tên, xóa, tìm trong file (`Ctrl+F`), lưu `Ctrl+S` kèm phát hiện xung đột `409 Conflict`, xem ảnh/file nhị phân và **Gửi ngữ cảnh sang AI Chat**.
   - **Git Source Control**: Xem nhánh hiện tại (`ahead`/`behind`), Staged/Unstaged/Untracked, Unified Diff tô màu, Stage/Unstage/Discard, Commit, Pull/Push và lịch sử Commit.
   - **Workspace Checkpoints & Safe Restore**: Tự động chụp snapshot (`auto`) trước mỗi tác vụ sửa code, chụp thủ công (`manual`), xem trước thay đổi (`modified`/`recreated`/`deleted`) và khôi phục an toàn (tự tạo checkpoint `undo` trước khi restore).
   - **Terminal đa phiên & Live Dev Ports**: Chạy lệnh shell PowerShell/Bash từ xa theo từng dự án với bàn phím ảo di động (`Ctrl+C`, `Clear`, `git status`, `pytest`...), quét cổng dev server đang chạy (`3000`, `5173`, `8000`, `8765`...) và xem trước iframe Mobile/Desktop.
   - **Ghi chú & Checklist công việc (Notes)**: Tạo ghi chú ghim và danh sách việc cần làm theo từng dự án.
5. **Theo dõi Phiên Antigravity trên PC (Local Brain Monitor)**
   - Đọc trực tiếp `~/.gemini/antigravity/brain/*` (tiêu đề, token usage, suy nghĩ, tool calls, transcript đầy đủ) và tự đẩy cập nhật real-time qua `watchdog`.
6. **Kho Kết quả & Trình duyệt Workspace (Artifacts & File Browser)**
   - Xem báo cáo Markdown (GFM, KaTeX, Mermaid, code highlight), phóng to ảnh, xem PDF/HTML và tải về trực tiếp.
   - Duyệt thư mục dự án PC an toàn (chống path traversal) kèm trạng thái Git branch/dirty.
7. **Giao diện Responsive PC & Mobile + Capacitor Native (Android / iOS)**
   - **Mobile-first Navigation**: Thanh điều hướng 5 tab cố định dưới đáy màn hình (`Chat AI`, `Pocket IDE`, `Tổng quan`, `Kết quả`, `Cài đặt`), tự động đóng sidebar khi thu hẹp cửa sổ và tự thu gọn cây thư mục IDE khi mở tệp trên điện thoại.
   - **Desktop Workspace & Unified 4-Platform Install Center**: Thanh menu PC đầy đủ, chuyển Dark/Light Mode đồng bộ với Live Wallpaper, nút mở nhanh hộp thoại cài đặt **Android · iOS · macOS · Windows** ngay từ màn hình đăng nhập, sidebar hoặc mục Cài đặt.
   - **Tích hợp Native**: Live Wallpaper, Boot Intro Overlay, Custom Theme, Haptics, StatusBar, LocalNotifications và Share sheet native.

---

## Cấu trúc thư mục / Project Structure

```text
.
├── backend/                     # FastAPI server, Antigravity runner, brain scanner, Pocket IDE & tests
│   ├── app/
│   │   ├── routers/             # auth, google_auth, prompts, antigravity, projects, ide, workspace_tools, system, ws
│   │   └── services/            # runner, git_service, checkpoint_service, terminal_service, memory_service, tunnel...
│   ├── tests/                   # Bộ kiểm thử tự động pytest
│   └── requirements.txt
├── frontend/                    # React 19 + TypeScript + Vite + Tailwind CSS v4 + Capacitor 8
│   ├── public/                  # PWA manifest, sw.js, icons, install.ps1, cai-antigravity-pulse.bat, _redirects
│   └── src/
│       ├── components/          # AuthScreen, GoogleAgyAuthSection, MarkdownRenderer, ide/, library/, theme/
│       ├── contexts/            # CustomThemeContext
│       ├── hooks/               # usePulseSocket
│       ├── lib/                 # api, ideApi, quickConnect, native (Capacitor), utils
│       └── pages/               # Dashboard, Prompt, Outputs, Projects (Pocket IDE), Settings
├── install/                     # Bộ cài đặt offline PC & hướng dẫn cài đặt Android / iOS
├── .github/workflows/           # GitHub Actions tự động build Android .apk, iOS .ipa/Xcode & .bat/.command
├── start.bat / start.ps1        # Script khởi chạy nhanh trên Windows
├── start.sh                     # Script khởi chạy nhanh trên macOS / Linux
├── build-mobile.ps1             # Script build gói di động Capacitor Android/iOS
├── wrangler.jsonc               # Cấu hình deploy static SPA lên Cloudflare Workers Assets
├── .env.example                 # Mẫu biến môi trường
├── NOTES.md                     # Ghi chú chi tiết toàn bộ các file trong dự án
└── LICENSE                      # Giấy phép MIT
```

---

## Chạy thủ công cho lập trình viên / Manual Setup

### Chạy bằng script có sẵn (Windows & macOS / Linux)
```powershell
.\start.ps1                # Tự tạo venv, build frontend (nếu chưa có) & khởi chạy server
.\start.ps1 -Tunnel        # Ép bật Cloudflare Quick Tunnel từ dòng lệnh
.\start.ps1 -Port 8765     # Đổi cổng lắng nghe
```
```bash
chmod +x start.sh && ./start.sh   # macOS / Linux: tự tạo venv, build frontend & chạy server
```

### Backend (Python 3.10+)
```powershell
python -m venv backend\.venv
.\backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8765
```

### Frontend PWA (Node.js 18+)
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
- `GEMINI_API_KEY` (hoặc cấu hình trực tiếp trong mục **Cài đặt** / đăng nhập **Continue with Google**)
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

## Gỡ cài đặt / Uninstall

- **Windows PC (1 chạm):** Tải **[`go-antigravity-pulse.bat`](https://agypulse.dpdns.org/go-antigravity-pulse.bat)** hoặc chạy trong PowerShell:
  ```powershell
  irm https://agypulse.dpdns.org/uninstall.ps1 | iex
  ```
  *(Hoặc chạy [`install/uninstall-pc.bat`](install/uninstall-pc.bat) nếu bạn clone repo thủ công.)*
- **Android / iOS:** Nhấn giữ biểu tượng **Antigravity Pulse** trên màn hình chính → chọn **Gỡ cài đặt / Xóa ứng dụng** (hoặc chạy `.\install\uninstall-android.ps1` qua ADB).
- **Thu hồi quyền Google (tùy chọn):** [myaccount.google.com/permissions](https://myaccount.google.com/permissions)

---

## Giấy phép & Pháp lý / License & Legal

- **Giấy phép / License:** [MIT License](LICENSE)
- **Điều Khoản Dịch Vụ / Terms of Service:** [TERMS_OF_SERVICE.md](TERMS_OF_SERVICE.md) • Web: [agypulse.dpdns.org/terms.html](https://agypulse.dpdns.org/terms.html)
- **Chính Sách Bảo Mật / Privacy Policy:** [PRIVACY_POLICY.md](PRIVACY_POLICY.md) • Web: [agypulse.dpdns.org/privacy.html](https://agypulse.dpdns.org/privacy.html)
