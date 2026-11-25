# Cài đặt Antigravity Pulse (Install Center)

Hướng dẫn cài đặt nhanh **Antigravity Pulse** trên **Windows PC**, **Android** và **iOS**, cùng cách kết nối 1 chạm từ bất kỳ thiết bị nào qua **[https://agypulse.dpdns.org](https://agypulse.dpdns.org)**.

---

## 1. Cài đặt trên Windows PC (Máy chủ PC Bridge)

PC là máy chạy Google Antigravity và làm cầu nối thời gian thực cho điện thoại / máy khác.

### Cách A: Cài tự động 1 chạm từ mạng (Đơn giản nhất — Khuyên dùng)
Chọn **1 trong 2 cách**:
1. **Không cần gõ lệnh:** Tải file **[cai-antigravity-pulse.bat](https://agypulse.dpdns.org/cai-antigravity-pulse.bat)** rồi **bấm đúp** để chạy.
2. **Dán 1 dòng vào PowerShell:**
   ```powershell
   irm https://agypulse.dpdns.org/install.ps1 | iex
   ```

Bộ cài sẽ tự động làm toàn bộ:
- Tự kiểm tra & cài **Python 3**, **Node.js LTS**, **Git** và **Cloudflare Tunnel (`cloudflared`)** qua `winget` nếu máy chưa có.
- Tự tải (hoặc cập nhật) mã nguồn về `%USERPROFILE%\AntigravityPulse`.
- Tự tạo biểu tượng **Antigravity Pulse** ngoài Desktop để lần sau chỉ cần bấm đúp.
- Tự khởi chạy server và in **Mã 6 ký tự** + **Link gọn 1 chạm** (`https://agypulse.dpdns.org/?c=...`).

### Cách B: Cài từ thư mục mã nguồn đã clone sẵn (Offline)
1. Nhấp đúp vào file **[`install-pc.bat`](install-pc.bat)** (hoặc chạy `.\install\install-pc.ps1` bằng PowerShell).
2. Sau khi cài xong, mở shortcut **Antigravity Pulse** ngoài Desktop hoặc chạy `start.bat` ở thư mục gốc.

---

## 2. Kết nối từ PC khác (Chỉ điều khiển, không cần cài server)

1. Mở trình duyệt (Chrome / Edge / Safari) trên PC kia.
2. Bấm vào **Link gọn 1 chạm** được gửi từ PC chính (`https://agypulse.dpdns.org/?c=XXX-XXX`) — **tự đăng nhập luôn, không cần PIN hay IP**.
   - Hoặc vào **[https://agypulse.dpdns.org](https://agypulse.dpdns.org)** rồi nhập **Mã 6 ký tự** của PC chính.
3. *(Tùy chọn)* Bấm biểu tượng **Cài đặt ứng dụng (Install App)** ở góc phải thanh địa chỉ Chrome/Edge để dùng như app Desktop riêng.

---

## 3. Cài đặt trên điện thoại Android

### Cách A: Cài Web App (PWA) — Nhanh nhất (10 giây)
1. Mở **Link gọn 1 chạm** (`https://agypulse.dpdns.org/?c=XXX-XXX`) gửi qua **Zalo / Messenger**, hoặc mở **[https://agypulse.dpdns.org](https://agypulse.dpdns.org)** bằng trình duyệt **Chrome** rồi nhập **Mã 6 ký tự**.
2. Nhấn menu **`⋮`** góc trên bên phải Chrome → chọn **Cài đặt ứng dụng** (*Install app* / *Add to Home screen*).
3. Biểu tượng **Antigravity Pulse** sẽ xuất hiện trên màn hình chính và chạy toàn màn hình như app native.

### Cách B: Cài file APK Native (Android)
- **Tải trực tiếp APK mới nhất** từ trang Releases (tự động build bởi GitHub Actions):
  👉 **[Tải Antigravity-Pulse-Android.apk (GitHub Releases)](https://github.com/Shinooz2High/App-Antigravity-on-moblie-/releases/latest)**
- Hoặc tải từ tab **[GitHub Actions → Build Antigravity Pulse Mobile](https://github.com/Shinooz2High/App-Antigravity-on-moblie-/actions)** → chọn lần chạy mới nhất → tải mục **Artifacts (`Antigravity-Pulse-Android-Debug`)**.
- Mở file `.apk` trên điện thoại và cho phép **Cài đặt từ nguồn không xác định** (*Install unknown apps*).
- Sau khi mở app, nhập **Mã 6 ký tự** (hoặc quét QR / dán link ghép nối) là xong.
- Nếu muốn cài qua cáp USB từ PC (đã bật USB Debugging & cài `adb`), chạy:
  ```powershell
  .\install\install-android.ps1
  ```

---

## 4. Cài đặt trên iPhone / iPad (iOS)

### Cách A: Cài qua Safari (PWA) — Khuyên dùng, không cần máy Mac
1. Mở **Link gọn 1 chạm** (`https://agypulse.dpdns.org/?c=XXX-XXX`) hoặc vào **[https://agypulse.dpdns.org](https://agypulse.dpdns.org)** bằng trình duyệt **Safari**.
2. Nhấn nút **Chia sẻ (Share)** ở thanh dưới cùng.
3. Cuộn xuống chọn **Thêm vào Màn hình chính** (*Add to Home Screen*) → nhấn **Thêm (Add)**.
4. Mở **Antigravity Pulse** trực tiếp từ màn hình chính iPhone/iPad.

### Cách B: Build ứng dụng Native qua Xcode (dành cho macOS)
1. Tải mã nguồn hoặc artifact `Antigravity-Pulse-iOS-Project.zip` từ GitHub Actions.
2. Mở dự án `frontend/ios/App/App.xcodeproj` (hoặc `App.xcworkspace`) bằng **Xcode**.
3. Chọn thiết bị iPhone của bạn, cấu hình Signing Team và nhấn **Run (▶)** để cài trực tiếp lên máy.

---

## Danh sách file cài đặt

| File | Vị trí | Chức năng |
| --- | --- | --- |
| `cai-antigravity-pulse.bat` | `frontend/public/` ([tải online](https://agypulse.dpdns.org/cai-antigravity-pulse.bat)) | File `.bat` bấm đúp để tải & cài 1 chạm trên bất kỳ Windows PC nào. |
| `install.ps1` | `frontend/public/` ([script online](https://agypulse.dpdns.org/install.ps1)) | Script PowerShell cài tự động 1 dòng (`irm https://agypulse.dpdns.org/install.ps1 \| iex`). |
| `install-pc.bat` | `install/` | Bộ cài offline trên Windows khi đã tải sẵn mã nguồn. |
| `install-pc.ps1` | `install/` | Script PowerShell cài đặt Backend, Frontend PWA, `.env` và Shortcut Desktop (offline). |
| `install-android.ps1` | `install/` | Script cài file `.apk` sang điện thoại Android qua cáp USB (`adb`) hoặc mở trang tải APK. |
