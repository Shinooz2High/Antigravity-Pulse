# Chính Sách Bảo Mật / Privacy Policy — Antigravity Pulse

**Cập nhật lần cuối / Last Updated:** 25/11/2026  
**Ứng dụng / Application:** Antigravity Pulse (`https://agypulse.dpdns.org`, Mobile PWA, Android/iOS App & PC Bridge)  
**Mã nguồn / Repository:** https://github.com/Shinooz2High/App-Antigravity-on-moblie-

---

## Phần I — Tiếng Việt

### 1. Nguyên tắc cốt lõi: Quyền riêng tư cục bộ (Local-First)
**Antigravity Pulse** được thiết kế theo kiến trúc **tự lưu trữ (self-hosted / local-first)**. Chúng tôi **không vận hành máy chủ trung gian để thu thập, lưu trữ, theo dõi hay bán dữ liệu cá nhân** của bạn. Dữ liệu từ điện thoại được truyền trực tiếp đến máy tính (PC Bridge) của chính bạn.

### 2. Dữ liệu ứng dụng xử lý & nơi lưu trữ
Tất cả dữ liệu dưới đây chỉ được lưu **cục bộ trên PC của bạn** (thư mục `backend/data/`, tệp `.env`) hoặc **cục bộ trên trình duyệt/điện thoại của bạn** (`localStorage` / `IndexedDB`):

| Loại dữ liệu | Mục đích sử dụng | Nơi lưu trữ |
| --- | --- | --- |
| **Mã PIN 6 số, Token phiên & Mã ghép nối QR** | Xác thực kết nối an toàn giữa điện thoại và PC của bạn. | Cục bộ trên PC (`backend/data/settings.json`) và thiết bị của bạn. |
| **Khóa API (`GEMINI_API_KEY`) & Cấu hình Model** | Gửi yêu cầu AI tới Google Gemini / Antigravity theo cấu hình của bạn. | Cục bộ trên PC (`backend/data/settings.json` hoặc `.env`). |
| **Thông tin đăng nhập Google (OAuth 2.0)** | Hiển thị tên, email, ảnh đại diện tài khoản Google và xác thực phiên Antigravity khi bạn chủ động chọn *"Continue with Google"*. | Cục bộ trên PC/thiết bị của bạn; không gửi về bất kỳ máy chủ nào của nhà phát triển. |
| **Prompt, Lịch sử hội thoại & Tệp đính kèm** | Thực thi tác vụ lập trình và hiển thị kết quả trên điện thoại. | Cục bộ trong thư mục workspace và `backend/data/runs/` trên PC của bạn. |
| **Cấu hình giao diện & Media tùy chỉnh** | Lưu cài đặt theme, hình nền động, âm thanh trên ứng dụng. | Cục bộ trên trình duyệt / ứng dụng của bạn. |

### 3. Quyền truy cập trên thiết bị di động (Mobile Permissions)
Ứng dụng chỉ yêu cầu các quyền tối thiểu khi bạn thực sự sử dụng tính năng tương ứng:
- **Camera:** Chỉ dùng để quét mã QR ghép nối PC ngay trên thiết bị (`jsQR`); hình ảnh camera không bao giờ được lưu lại hay gửi ra ngoài.
- **Tệp tin / Thư viện ảnh:** Chỉ truy cập những tệp/ảnh bạn chủ động chọn đính kèm vào prompt hoặc tải artifact về máy.
- **Thông báo (Notifications):** Chỉ dùng để thông báo cục bộ khi tác vụ AI hoàn tất hoặc cần bạn duyệt lệnh tool.

### 4. Dịch vụ bên thứ ba & Đường truyền mạng
Khi bạn chủ động kích hoạt, dữ liệu của bạn sẽ đi trực tiếp tới các dịch vụ sau theo chính sách bảo mật riêng của họ:
- **Google LLC (Google OAuth 2.0, Gemini API, Vertex AI, Google Antigravity):** Khi bạn đăng nhập Google hoặc gửi prompt tới mô hình Gemini. Xem [Chính sách bảo mật của Google](https://policies.google.com/privacy).
- **Cloudflare, Inc. (Cloudflare Quick Tunnel / Web Portal `agypulse.dpdns.org`):** Khi bạn bật chế độ truy cập ngoài mạng LAN qua `trycloudflare.com` hoặc truy cập giao diện tĩnh tại `agypulse.dpdns.org`. Xem [Chính sách bảo mật của Cloudflare](https://www.cloudflare.com/privacypolicy/).
- **Tailscale (tùy chọn):** Nếu bạn tự kết nối qua mạng VPN riêng Tailscale.

> **Lưu ý về Google API Services User Data Policy:** Việc Antigravity Pulse sử dụng thông tin nhận được từ Google APIs tuân thủ nghiêm ngặt [Chính sách Dữ liệu Người dùng Dịch vụ Google API (Google API Services User Data Policy)](https://developers.google.com/terms/api-services-user-data-policy), bao gồm yêu cầu về **Giới hạn sử dụng (Limited Use)**. Chúng tôi không chia sẻ dữ liệu Google của bạn cho bên thứ ba, không dùng cho quảng cáo và không sử dụng để huấn luyện mô hình AI bên ngoài.

### 5. Bảo mật dữ liệu
- Kết nối ngoài mạng LAN được mã hóa bằng **HTTPS / WSS (TLS)** thông qua Cloudflare Tunnel.
- Truy cập trình duyệt tệp trên PC được giới hạn trong phạm vi workspace và có cơ chế chống truy cập trái phép đường dẫn (path traversal protection).
- Các tệp chứa thông tin nhạy cảm (`.env`, `backend/data/`) được cấu hình loại trừ mặc định trong `.gitignore`.

### 6. Quyền kiểm soát & Xóa dữ liệu của bạn
Vì toàn bộ dữ liệu nằm hoàn toàn trên thiết bị của bạn, bạn có toàn quyền kiểm soát và xóa bất kỳ lúc nào:
- **Đăng xuất & xóa dữ liệu trên điện thoại:** Chọn đăng xuất trong mục **Cài đặt** hoặc xóa dữ liệu trình duyệt / gỡ cài đặt ứng dụng.
- **Xóa toàn bộ dữ liệu trên PC:** Xóa thư mục `backend/data/` và tệp `.env` trên máy tính của bạn.
- **Thu hồi quyền truy cập Google:** Truy cập [Google Account Permissions](https://myaccount.google.com/permissions) để thu hồi quyền của ứng dụng bất kỳ lúc nào.

### 7. Quyền riêng tư của trẻ em
Ứng dụng không hướng tới trẻ em dưới 13 tuổi và chúng tôi không cố ý thu thập thông tin cá nhân từ trẻ em.

### 8. Thay đổi chính sách & Liên hệ
Mọi thay đổi về Chính Sách Bảo Mật sẽ được cập nhật tại tệp `PRIVACY_POLICY.md` và trang `https://agypulse.dpdns.org/privacy.html`.  
Nếu có câu hỏi về quyền riêng tư hoặc phát hiện lỗ hổng bảo mật, vui lòng liên hệ qua GitHub Issues:  
👉 https://github.com/Shinooz2High/App-Antigravity-on-moblie-/issues

---

## Part II — English Summary

1. **Local-First & Zero Tracking:** **Antigravity Pulse** is a self-hosted application. We do **not** operate any developer backend to collect, track, store, or sell your personal data. All communication occurs directly between your mobile device and your own PC Bridge.
2. **Local Storage:** Pairing PINs, session tokens, API keys, Google OAuth profile/tokens, prompts, and run histories are stored strictly locally on your PC (`backend/data/`, `.env`) or your device's browser storage.
3. **Device Permissions:** Camera access is used solely on-device to scan pairing QR codes; file/photo access is only used when you attach files or download artifacts; local notifications alert you to tool approvals or completed runs.
4. **Third-Party Services & Google Limited Use:** When enabled by you, requests go directly to Google APIs (OAuth / Gemini / Antigravity) or through Cloudflare Tunnel. Antigravity Pulse's use of information received from Google APIs adheres to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the **Limited Use** requirements.
5. **Data Deletion:** You can delete all data at any time by clearing browser/app storage, deleting `backend/data/` and `.env` on your PC, and revoking Google access at https://myaccount.google.com/permissions.
6. **Contact:** https://github.com/Shinooz2High/App-Antigravity-on-moblie-/issues
