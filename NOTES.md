# Ghi chú cấu trúc dự án & từng file (Project File Notes)

Tài liệu này mô tả chi tiết vai trò của từng thư mục và tập tin trong dự án **Antigravity Pulse** (`App-Antigravity-on-moblie-`).

---

## 1. Thư mục gốc (Root)

| File / Thư mục | Mô tả chi tiết |
| --- | --- |
| `README.md` | Tài liệu giới thiệu dự án, tính năng chính, hướng dẫn cài đặt, khởi chạy và kiểm thử. |
| `NOTES.md` | File này — ghi chú chi tiết chức năng của từng file trong toàn bộ mã nguồn. |
| `LICENSE` | Giấy phép sử dụng mã nguồn mở MIT License. |
| `.gitignore` | Quy tắc loại trừ các thư mục build/phụ thuộc (`.venv/`, `node_modules/`, `dist/`), file bí mật (`.env`, `backend/data/`) và binary bên thứ 3 (`cloudflared.exe`). |
| `.env.example` | File mẫu cấu hình biến môi trường (`AGY_HOST`, `AGY_PORT`, `AGY_BRIDGE_PIN`, `GEMINI_API_KEY`, Vertex AI, v.v.). |
| `start.bat` | Script khởi chạy nhanh trên Windows (nhấp đúp để gọi `start.ps1`). |
| `start.ps1` | Script PowerShell tự động tạo Python `.venv`, build frontend PWA nếu chưa có, in mã QR/PIN ghép nối, tùy chọn bật Cloudflare Quick Tunnel (`-Tunnel`) và khởi chạy FastAPI server. |
| `build-mobile.ps1` | Script PowerShell tự động build frontend Vite, đồng bộ Capacitor sang Android/iOS và biên dịch Android APK (nếu có Java/Android SDK). |
| `install/` | Thư mục cài đặt ứng dụng: `README.md` (hướng dẫn PC/Android/iOS), `install-pc.bat` & `install-pc.ps1` (bộ cài 1 chạm cho Windows + tạo Shortcut Desktop), `install-android.ps1` (cài APK qua USB/ADB). |
| `.github/workflows/build-mobile.yml` | GitHub Actions tự động build Android APK (`Antigravity-Pulse-Android.apk`), phát hành lên GitHub Releases và đóng gói dự án iOS Xcode. |
| `skills-lock.json` | File khóa phiên bản các Agent Skills đi kèm trong workspace. |
| `.agents/skills/lucian-uxui/` | Bộ skill hỗ trợ thiết kế & chuyển đổi UI/UX (`SKILL.md`, `references/porting.md`, `scripts/lucian-uxui.mjs`). |

---

## 2. Backend (`backend/`) — FastAPI & PC Bridge

Máy chủ Python làm cầu nối thời gian thực giữa điện thoại và Google Antigravity / hệ thống tệp trên PC.

### 2.1. Cấu hình & Điểm khởi chạy
| File | Mô tả chi tiết |
| --- | --- |
| `backend/pyproject.toml` | Metadata dự án Python và cấu hình công cụ/pytest. |
| `backend/requirements.txt` | Danh sách thư viện Python cần thiết (`google-antigravity`, `fastapi`, `uvicorn`, `websockets`, `watchdog`, `qrcode`, `httpx`, `pytest`, v.v.). |
| `backend/app/__init__.py` | Đánh dấu package Python `app`. |
| `backend/app/main.py` | Điểm khởi chạy FastAPI: đăng ký CORS, middleware, gắn các router API/WebSocket, serve giao diện tĩnh PWA (`frontend/dist`) và quản lý vòng đời `file_watcher` / `tunnel_service`. |
| `backend/app/config.py` | Đọc và quản lý cấu hình môi trường (`Settings`) từ `.env` và biến hệ thống. |
| `backend/app/models.py` | Định nghĩa các Pydantic schema dùng chung cho request/response API và sự kiện WebSocket. |
| `backend/app/utils.py` | Các hàm tiện ích dùng chung: phát hiện IP LAN/Tailscale, kiểm tra đường dẫn an toàn (chống path traversal), định dạng dữ liệu. |
| `backend/app/cli_banner.py` | Hiển thị banner khởi động trên terminal kèm LAN URL, Tunnel URL, mã PIN 6 số và mã QR ASCII để quét trực tiếp trên điện thoại. |

### 2.2. API Routers (`backend/app/routers/`)
| File | Mô tả chi tiết |
| --- | --- |
| `backend/app/routers/auth.py` | Xác thực bằng mã PIN 6 số, ghép nối qua QR token và quản lý phiên đăng nhập thiết bị. |
| `backend/app/routers/prompts.py` | Gửi prompt (kèm file/ảnh đính kèm), xem danh sách/chi tiết các phiên chạy, duyệt hoặc từ chối lời gọi tool (`approve`/`deny`), dừng phiên chạy. |
| `backend/app/routers/antigravity.py` | Truy vấn danh sách các phiên Antigravity trên PC (`~/.gemini/antigravity/brain/*`), đọc transcript tóm tắt/đầy đủ và tải artifact. |
| `backend/app/routers/projects.py` | Quản lý danh sách workspace/dự án, duyệt thư mục, đọc nội dung file an toàn và xem trạng thái Git (branch, dirty). |
| `backend/app/routers/system.py` | Đọc/cập nhật cài đặt ứng dụng (API key, chính sách an toàn, model, theme), điều khiển Cloudflare Quick Tunnel, kiểm tra sức khỏe hệ thống (`/health`). |
| `backend/app/routers/ws.py` | Endpoint WebSocket đẩy sự kiện real-time (token streaming, thoughts, yêu cầu duyệt tool, thay đổi file brain) tới điện thoại. |

### 2.3. Services (`backend/app/services/`)
| File | Mô tả chi tiết |
| --- | --- |
| `backend/app/services/auth_service.py` | Sinh và xác thực PIN 6 số, QR pairing token và session token. |
| `backend/app/services/settings_service.py` | Lưu trữ và đọc cấu hình cục bộ tại `backend/data/settings.json` (tự động ẩn khỏi Git). |
| `backend/app/services/runner_service.py` | Lõi thực thi prompt hỗ trợ 3 chế độ: `Antigravity SDK`, `CLI Runner (agy)` và `Demo Simulator`; quản lý hàng đợi duyệt tool và lưu lịch sử runs. |
| `backend/app/services/brain_scanner.py` | Quét và phân tích dữ liệu hội thoại Antigravity trên PC (`transcript.jsonl`, `transcript_full.jsonl`, artifacts, thống kê token). |
| `backend/app/services/file_watcher.py` | Theo dõi thay đổi thời gian thực trên thư mục brain bằng `watchdog` và phát sự kiện qua WebSocket. |
| `backend/app/services/project_service.py` | Duyệt cây thư mục workspace có kiểm soát, đọc preview file và trích xuất thông tin Git. |
| `backend/app/services/models_service.py` | Quản lý danh sách model AI khả dụng và cấu hình chọn model. |
| `backend/app/services/tunnel_service.py` | Khởi chạy, theo dõi và dừng tiến trình `cloudflared` Quick Tunnel để truy cập từ xa ngoài mạng LAN. |
| `backend/app/services/ws_manager.py` | Quản lý kết nối WebSocket đa thiết bị và broadcast sự kiện. |

### 2.4. Kiểm thử (`backend/tests/`)
| File | Mô tả chi tiết |
| --- | --- |
| `backend/tests/conftest.py` | Fixture pytest dùng chung (client test, thư mục tạm, dữ liệu mẫu). |
| `backend/tests/test_auth.py` | Kiểm thử đăng nhập PIN, QR token và bảo vệ endpoint. |
| `backend/tests/test_brain_scanner.py` | Kiểm thử quét thư mục brain và phân tích transcript. |
| `backend/tests/test_projects_and_artifacts.py` | Kiểm thử duyệt file dự án, chống path traversal và tải artifact. |
| `backend/tests/test_runner_and_ws.py` | Kiểm thử thực thi prompt, luồng duyệt tool và stream WebSocket. |

---

## 3. Frontend (`frontend/`) — React + TypeScript + Vite PWA & Capacitor

Giao diện di động (Mobile-first PWA, hỗ trợ đóng gói Android/iOS qua Capacitor) với hệ thống giao diện tùy biến cao.

### 3.1. Cấu hình dự án Frontend
| File | Mô tả chi tiết |
| --- | --- |
| `frontend/package.json` | Khai báo dependencies (React 19, Tailwind CSS v4, Capacitor 8, Markdown/KaTeX/Mermaid, jsQR, Lucide icons) và scripts (`dev`, `build`, `preview`, `typecheck`). |
| `frontend/package-lock.json` | File khóa cây phụ thuộc npm. |
| `frontend/tsconfig.json` | Cấu hình trình biên dịch TypeScript. |
| `frontend/vite.config.ts` | Cấu hình bundler Vite và plugin Tailwind CSS. |
| `frontend/capacitor.config.ts` | Cấu hình Capacitor để đóng gói ứng dụng di động native (Android / iOS). |
| `frontend/android/` | Mã nguồn dự án native Android (Gradle, `MainActivity`, tài nguyên Android) được tạo bởi Capacitor. |
| `frontend/ios/` | Mã nguồn dự án native iOS (Xcode project, `AppDelegate.swift`, `SceneDelegate.swift`, `Info.plist`, SwiftPM) được tạo bởi Capacitor. |
| `frontend/index.html` | Trang HTML gốc khai báo PWA meta tags, icon và điểm mount React. |

### 3.2. Tài nguyên công khai (`frontend/public/`)
| File / Thư mục | Mô tả chi tiết |
| --- | --- |
| `frontend/public/manifest.webmanifest` | Web App Manifest cho phép cài đặt app lên màn hình chính điện thoại (PWA). |
| `frontend/public/sw.js` | Service Worker hỗ trợ caching và trải nghiệm PWA. |
| `frontend/public/icon.svg`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `agy-logo.png` | Bộ biểu tượng và logo ứng dụng cho Android, iOS và trình duyệt. |
| `frontend/public/theme_payload.js` | Script nạp dữ liệu/cấu hình giao diện tùy chỉnh trước khi render. |
| `frontend/public/theme-assets/` | Tài nguyên đa phương tiện cho hệ thống Custom Theme: hình nền động (`.mp4`, `.webp`), font chữ (`fonts/`), âm thanh/giọng nói (`voice/`), họa tiết SVG (`wlop_*.svg`) và media người dùng (`user_media/`). |

### 3.3. Mã nguồn giao diện (`frontend/src/`)
| File | Mô tả chi tiết |
| --- | --- |
| `frontend/src/main.tsx` | Điểm khởi chạy React, bọc `CustomThemeProvider` và gắn vào DOM. |
| `frontend/src/App.tsx` | Component gốc điều phối trạng thái đăng nhập, WebSocket, điều hướng các tab chính, toast thông báo và các modal toàn cục. |
| `frontend/src/index.css` | Stylesheet chính tích hợp Tailwind CSS và biến CSS giao diện. |
| `frontend/src/vite-env.d.ts` | Khai báo kiểu TypeScript cho môi trường Vite. |
| `frontend/src/types/api.ts` | Định nghĩa toàn bộ interface TypeScript cho dữ liệu API và WebSocket events. |
| `frontend/src/lib/api.ts` | Client gọi REST API tới backend (tự động gắn token, xử lý lỗi, upload file). |
| `frontend/src/lib/native.ts` | Lớp trừu tượng tương tác tính năng thiết bị native qua Capacitor (Haptics, StatusBar, LocalNotifications, Share, Browser). |
| `frontend/src/lib/utils.ts` | Các hàm tiện ích giao diện (format thời gian, dung lượng, xử lý chuỗi, v.v.). |
| `frontend/src/hooks/usePulseSocket.ts` | Custom React Hook quản lý kết nối WebSocket, tự động reconnect và cập nhật trạng thái real-time. |
| `frontend/src/contexts/CustomThemeContext.tsx` | React Context quản lý chủ đề tùy biến (hình nền động, hiệu ứng boot, màu sắc, âm thanh, lưu cấu hình). |

### 3.4. Các trang chính (`frontend/src/pages/`)
| File | Mô tả chi tiết |
| --- | --- |
| `frontend/src/pages/DashboardPage.tsx` | Trang tổng quan theo dõi trạng thái PC Bridge, các phiên Antigravity gần đây và phím tắt nhanh. |
| `frontend/src/pages/PromptPage.tsx` | Phòng điều khiển Prompt di động: nhập lệnh, đính kèm ảnh/file, chọn model/chính sách an toàn, theo dõi luồng suy nghĩ & duyệt tool trực tiếp. |
| `frontend/src/pages/OutputsPage.tsx` | Kho kết quả & Artifacts: xem báo cáo Markdown, hình ảnh, code, log phiên chạy từ PC. |
| `frontend/src/pages/ProjectsPage.tsx` | Trình duyệt Workspace & File trên PC, xem cấu trúc thư mục, trạng thái Git và nội dung file. |
| `frontend/src/pages/SettingsPage.tsx` | Trang cài đặt toàn diện: cấu hình API key, chế độ chạy, bảo mật, bật/tắt Cloudflare Tunnel, tùy chỉnh giao diện và ghép nối thiết bị. |

### 3.5. Components (`frontend/src/components/`)
| File | Mô tả chi tiết |
| --- | --- |
| `AuthScreen.tsx` | Màn hình đăng nhập bằng mã PIN 6 số, quét mã QR ghép nối hoặc tài khoản Google / Antigravity. |
| `GoogleAgyAuthSection.tsx` | Phần đăng nhập Google OAuth 2.0 và đồng bộ phiên Antigravity (AGY) cục bộ. |
| `Layout.tsx` | Khung bố cục ứng dụng di động (header, vùng nội dung, thanh điều hướng dưới). |
| `MarkdownRenderer.tsx` | Trình hiển thị Markdown nâng cao hỗ trợ GFM, công thức toán KaTeX, biểu đồ Mermaid và tô sáng cú pháp code (`highlight.js`). |
| `ArtifactModal.tsx` | Hộp thoại xem chi tiết, phóng to ảnh và tải xuống artifact. |
| `ModelSelectorModal.tsx` | Hộp thoại chọn model AI để thực thi prompt. |
| `QrScannerModal.tsx` | Modal mở camera quét mã QR ghép nối trực tiếp bằng `jsqr`. |
| `ToolApprovalBanner.tsx` | Thanh thông báo nổi yêu cầu người dùng duyệt hoặc từ chối lời gọi tool của AI ngay trên điện thoại. |
| `library/` | Bộ UI component tái sử dụng: `AuroraBackground`, `BreadcrumbPath`, `EmptyProjectsState`, `NotchedBottomTabBar`, `ProductDropdown`, `PromptComposer`, `StackingToasts`, `ThemeSwitch`, `ThinkingAccordion`, `TypeToConfirmDeleteModal`. |
| `theme/` | Các component hiệu ứng giao diện: `BootIntroOverlay` (màn hình khởi động), `CustomThemeModal` (trình tùy chỉnh theme), `LiveWallpaperLayer` (lớp hình nền động). |

---

## 4. Lưu ý về các file KHÔNG đưa lên GitHub

Các file/thư mục sau được loại trừ trong `.gitignore` vì lý do bảo mật hoặc dung lượng/tái tạo tự động:
- `.env` và `backend/data/`: chứa mã PIN, session token, API key và lịch sử chạy cục bộ.
- `backend/.venv/`, `frontend/node_modules/`, `frontend/dist/`: môi trường ảo và gói phụ thuộc (có thể cài lại bằng `start.ps1`, `pip install`, `npm install`).
- `cloudflared.exe`: file thực thi Windows bên thứ 3 (~53 MB), có thể cài nhanh qua `winget install Cloudflare.cloudflared`.
