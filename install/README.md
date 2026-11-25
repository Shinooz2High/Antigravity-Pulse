# Cài đặt Antigravity Pulse (Install Center)

Thư mục này chứa bộ cài đặt nhanh và hướng dẫn cài **Antigravity Pulse** trên **Windows PC**, **Android** và **iOS**.

---

## 1. Cài đặt trên Windows PC (Máy chủ PC Bridge)

PC là máy chạy Google Antigravity và làm cầu nối thời gian thực cho điện thoại.

### Cách cài tự động 1 chạm (Khuyên dùng)
1. Nhấp đúp vào file **[`install-pc.bat`](install-pc.bat)** (hoặc chạy `.\install\install-pc.ps1` bằng PowerShell).
2. Bộ cài sẽ tự động thực hiện:
   - Kiểm tra **Python 3.11+** và **Node.js 18+**.
   - Tạo môi trường ảo `backend/.venv` và cài toàn bộ thư viện Python.
   - Cài đặt dependencies và build giao diện PWA (`frontend/dist`).
   - Tự động tạo file `.env` từ `.env.example` (nếu chưa có).
   - Tùy chọn tạo **Shortcut "Antigravity Pulse"** ngoài Desktop.
   - Tùy chọn kiểm tra/cài đặt `cloudflared` để hỗ trợ truy cập ngoài mạng LAN.
3. Sau khi cài xong, mở shortcut ngoài Desktop hoặc chạy `start.bat` ở thư mục gốc. Terminal sẽ hiện **mã QR** và **PIN 6 số** để kết nối điện thoại.

---

## 2. Cài đặt trên điện thoại Android

### Cách A: Cài ứng dụng Web App (PWA) — Nhanh nhất (10 giây)
1. Khởi chạy PC Bridge trên máy tính (`start.bat`).
2. Quét mã QR trên màn hình PC bằng điện thoại (hoặc mở **LAN URL** / **Cloudflare Tunnel URL** bằng trình duyệt **Chrome**).
3. Nhập mã PIN 6 số (hoặc tự đăng nhập nếu quét QR).
4. Nhấn biểu tượng menu **`⋮`** góc trên bên phải Chrome → chọn **Cài đặt ứng dụng** (*Install app* / *Add to Home screen*).
5. Biểu tượng **Antigravity Pulse** sẽ xuất hiện trên màn hình chính và chạy toàn màn hình như app native.

### Cách B: Cài file APK Native (Android)
- **Tải trực tiếp APK mới nhất** từ trang Releases (tự động build bởi GitHub Actions):
  👉 **[Tải Antigravity-Pulse-Android.apk (GitHub Releases)](https://github.com/Shinooz2High/App-Antigravity-on-moblie-/releases/latest)**
- Hoặc tải từ tab **[GitHub Actions → Build Antigravity Pulse Mobile](https://github.com/Shinooz2High/App-Antigravity-on-moblie-/actions)** → chọn lần chạy mới nhất → tải mục **Artifacts (`Antigravity-Pulse-Android-Debug`)**.
- Sau khi tải `.apk` về điện thoại, nhấn mở file và cho phép **Cài đặt từ nguồn không xác định** (*Install unknown apps*).
- Nếu cài qua cáp USB từ PC (đã bật USB Debugging & cài `adb`), chạy:
  ```powershell
  .\install\install-android.ps1
  ```

---

## 3. Cài đặt trên iPhone / iPad (iOS)

### Cách A: Cài qua Safari (PWA) — Khuyên dùng, không cần máy Mac
1. Mở **LAN URL** hoặc **Cloudflare Tunnel URL** bằng trình duyệt **Safari**.
2. Nhấn nút **Chia sẻ (Share)** ở thanh dưới cùng.
3. Cuộn xuống chọn **Thêm vào Màn hình chính** (*Add to Home Screen*) → nhấn **Thêm (Add)**.
4. Mở **Antigravity Pulse** trực tiếp từ màn hình chính iPhone/iPad.

### Cách B: Build ứng dụng Native qua Xcode (dành cho macOS)
1. Tải mã nguồn hoặc artifact `Antigravity-Pulse-iOS-Project.zip` từ GitHub Actions.
2. Mở dự án `frontend/ios/App/App.xcodeproj` (hoặc `App.xcworkspace`) bằng **Xcode**.
3. Chọn thiết bị iPhone của bạn, cấu hình Signing Team và nhấn **Run (▶)** để cài trực tiếp lên máy.

---

## Danh sách file trong thư mục `install/`

| File | Chức năng |
| --- | --- |
| `README.md` | Hướng dẫn cài đặt chi tiết cho Windows PC, Android và iOS. |
| `install-pc.bat` | File chạy nhanh trên Windows để mở trình cài đặt `install-pc.ps1`. |
| `install-pc.ps1` | Script PowerShell tự động cài đặt toàn bộ Backend, Frontend PWA, `.env` và Shortcut Desktop. |
| `install-android.ps1` | Script hỗ trợ cài file `.apk` sang điện thoại Android qua cáp USB (`adb`) hoặc mở trang tải APK. |
