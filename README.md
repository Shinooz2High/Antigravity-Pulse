# Antigravity Pulse — Mobile PWA & Real-time PC Bridge

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Web Portal](https://img.shields.io/badge/Web%20Portal-agypulse.dpdns.org-06b6d4)](https://agypulse.dpdns.org)
[![Android APK](https://img.shields.io/badge/Android-Download%20APK-3ddc84)](https://github.com/Shinooz2High/App-Antigravity-on-moblie-/releases/latest)

Điều khiển **Google Antigravity** & workspace trên PC từ **điện thoại (Android / iOS)** hoặc **bất kỳ PC nào khác** theo thời gian thực — hỗ trợ **kết nối 1 chạm bằng link gọn**, **mã 6 ký tự**, **gửi trực tiếp qua Zalo / Messenger**, và **đăng nhập Continue with Google**.

- 🌐 **Cổng Web cố định (dùng trên mọi thiết bị):** **[https://agypulse.dpdns.org](https://agypulse.dpdns.org)**
- 🪟 **Cài 1 chạm trên Windows PC:** **[Tải `cai-antigravity-pulse.bat`](https://agypulse.dpdns.org/cai-antigravity-pulse.bat)**
- 📱 **Tải App Android (APK):** **[GitHub Releases (Latest)](https://github.com/Shinooz2High/App-Antigravity-on-moblie-/releases/latest)**
- 📦 **Hướng dẫn cài đặt chi tiết (PC / Android / iOS):** **[install/README.md](install/README.md)**
- 📄 **Ghi chú cấu trúc toàn bộ file:** **[NOTES.md](NOTES.md)**

---

## 1. Cài đặt siêu nhanh trên PC (1 chạm)

### Cách A — Bấm đúp file (Không cần gõ lệnh)
1. Tải file **[cai-antigravity-pulse.bat](https://agypulse.dpdns.org/cai-antigravity-pulse.bat)** về máy tính Windows.
2. **Bấm đúp** vào file vừa tải.
3. Bộ cài tự động kiểm tra/cài Python, Node.js, Git, `cloudflared`, tải code về `%USERPROFILE%\AntigravityPulse`, tạo **icon `Antigravity Pulse` ngoài Desktop** và khởi chạy ngay lập tức.

### Cách B — Dán đúng 1 dòng vào PowerShell
```powershell
irm https://agypulse.dpdns.org/install.ps1 | iex
```

> Lần sau chỉ cần **bấm đúp icon `Antigravity Pulse` ngoài Desktop** (hoặc `start.bat`) để khởi động. Server sẽ tự mở Cloudflare Tunnel và hiện **Mã 6 ký tự** cùng **Link gọn 1 chạm**.

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

## 3. Cài đặt App trên Điện thoại (Android & iOS)

- **Android (App Native `.apk`):** Tải trực tiếp từ **[GitHub Releases](https://github.com/Shinooz2High/App-Antigravity-on-moblie-/releases/latest)** và cài lên máy.
- **Android / iOS (Web App PWA — 10 giây):** Mở **[https://agypulse.dpdns.org](https://agypulse.dpdns.org)** bằng **Chrome** (Android) hoặc **Safari** (iOS) → chọn **Thêm vào Màn hình chính** (*Add to Home Screen* / *Install app*).
- **PC khác (Desktop PWA):** Mở **[https://agypulse.dpdns.org](https://agypulse.dpdns.org)** trên Chrome/Edge → bấm biểu tượng **Install App** ở góc phải thanh địa chỉ.

Xem hướng dẫn chi tiết từng nền tảng tại **[install/README.md](install/README.md)**.

---

## Tính năng chính / Key Features

1. **Kết nối từ xa 1 chạm & Chia sẻ Zalo / Messenger**
   - Tự động mở **Cloudflare Quick Tunnel** ngay khi khởi chạy PC Bridge.
   - Mã kết nối nhanh 6 ký tự mã hóa đầu cuối + link gọn `https://agypulse.dpdns.org/?c=...` tự động giải mã địa chỉ PC và đăng nhập 1 chạm.
2. **Đăng nhập Google & Antigravity CLI (`agy`)**
   - Hỗ trợ nút **Continue with Google** ở màn hình đăng nhập, Google OAuth 2.0, ADC và đồng bộ phiên `agy` cục bộ.
3. **Chạy Prompt từ điện thoại & Duyệt Tool trực tiếp (Mobile Prompt Studio)**
   - Gửi prompt, đính kèm ảnh/file tới workspace PC; chọn model AI & xem trạng thái quota.
   - 3 chế độ thực thi: `Antigravity SDK`, `CLI Runner (agy)`, `Demo Simulator`.
   - 3 chính sách an toàn: `Hỏi duyệt trên ĐT (ask_mobile)`, `Chỉ đọc (read_only)`, `Tự động trong workspace (auto_workspace)`.
   - Stream suy nghĩ (`thoughts`), nội dung trả lời và lời gọi tool real-time qua WebSocket.
4. **Theo dõi Phiên Antigravity trên PC (Local Brain Monitor)**
   - Đọc trực tiếp `~/.gemini/antigravity/brain/*` (tiêu đề, token usage, suy nghĩ, tool calls, transcript đầy đủ) và tự đẩy cập nhật real-time qua `watchdog`.
5. **Kho Kết quả & Trình duyệt Workspace (Artifacts & File Browser)**
   - Xem báo cáo Markdown (GFM, KaTeX, Mermaid, code highlight), phóng to ảnh, xem PDF/HTML và tải về trực tiếp.
   - Duyệt thư mục dự án PC an toàn (chống path traversal) kèm trạng thái Git branch/dirty.
6. **Giao diện Tùy biến & Capacitor Native (Android / iOS)**
   - Live Wallpaper, Boot Intro Overlay, Custom Theme, Haptics, StatusBar, LocalNotifications và Share sheet native.

---

## Cấu trúc thư mục / Project Structure

```text
.
├── backend/                     # FastAPI server, Antigravity runner, brain scanner, quick connect & tests
│   ├── app/
│   │   ├── routers/             # auth, google_auth, prompts, antigravity, projects, system, ws
│   │   └── services/            # runner, brain_scanner, quick_connect, google_auth, tunnel, file_watcher...
│   ├── tests/                   # Bộ kiểm thử tự động pytest
│   └── requirements.txt
├── frontend/                    # React 19 + TypeScript + Vite + Tailwind CSS v4 + Capacitor 8
│   ├── public/                  # PWA manifest, sw.js, icons, install.ps1, cai-antigravity-pulse.bat, _redirects
│   └── src/
│       ├── components/          # AuthScreen, GoogleAgyAuthSection, MarkdownRenderer, library/, theme/
│       ├── contexts/            # CustomThemeContext
│       ├── hooks/               # usePulseSocket
│       ├── lib/                 # api, quickConnect, native (Capacitor), utils
│       └── pages/               # Dashboard, Prompt, Outputs, Projects, Settings
├── install/                     # Bộ cài đặt offline PC & hướng dẫn cài đặt Android / iOS
├── .github/workflows/           # GitHub Actions tự động build Android APK & iOS Xcode project
├── start.bat / start.ps1        # Script khởi chạy nhanh trên Windows
├── build-mobile.ps1             # Script build gói di động Capacitor Android/iOS
├── wrangler.jsonc               # Cấu hình deploy static SPA lên Cloudflare Workers Assets
├── .env.example                 # Mẫu biến môi trường
├── NOTES.md                     # Ghi chú chi tiết toàn bộ các file trong dự án
└── LICENSE                      # Giấy phép MIT
```

---

## Chạy thủ công cho lập trình viên / Manual Setup

### Chạy bằng script có sẵn (Windows)
```powershell
.\start.ps1                # Tự tạo venv, build frontend (nếu chưa có) & khởi chạy server
.\start.ps1 -Tunnel        # Ép bật Cloudflare Quick Tunnel từ dòng lệnh
.\start.ps1 -Port 8765     # Đổi cổng lắng nghe
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

## Giấy phép & Pháp lý / License & Legal

- **Giấy phép / License:** [MIT License](LICENSE)
- **Điều Khoản Dịch Vụ / Terms of Service:** [TERMS_OF_SERVICE.md](TERMS_OF_SERVICE.md) • Web: [agypulse.dpdns.org/terms.html](https://agypulse.dpdns.org/terms.html)
- **Chính Sách Bảo Mật / Privacy Policy:** [PRIVACY_POLICY.md](PRIVACY_POLICY.md) • Web: [agypulse.dpdns.org/privacy.html](https://agypulse.dpdns.org/privacy.html)
