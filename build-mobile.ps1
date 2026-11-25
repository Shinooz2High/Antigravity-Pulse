<#
.SYNOPSIS
    Tự động hóa build ứng dụng di động Antigravity Pulse cho Android và iOS.
.DESCRIPTION
    Script này thực hiện:
    1. Kiểm tra môi trường Node.js, npm, Java/Android SDK.
    2. Build web assets tối ưu bằng Vite (React 19 + TypeScript).
    3. Đồng bộ code sang native Android (Capacitor) & iOS.
    4. Tự động biên dịch Android APK nếu có Java/Android SDK và sao chép vào backend/data/builds/Antigravity-Pulse.apk.
    5. Cung cấp hướng dẫn mở Android Studio hoặc Xcode và cách dùng GitHub Actions đám mây.
#>

[CmdletBinding()]
param (
    [switch]$SkipWebBuild = $false,
    [switch]$OpenAndroidStudio = $false,
    [switch]$OpenXcode = $false
)

$ErrorActionPreference = "Stop"
$AppRoot = $PSScriptRoot
$FrontendDir = Join-Path $AppRoot "frontend"
$AndroidDir = Join-Path $FrontendDir "android"
$IosDir = Join-Path $FrontendDir "ios"
$BuildsDir = Join-Path $AppRoot "backend\data\builds"

function Write-Step {
    param([string]$Text)
    Write-Host "`n====> $Text" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Text)
    Write-Host " [V] $Text" -ForegroundColor Green
}

function Write-WarningMsg {
    param([string]$Text)
    Write-Host " [!] $Text" -ForegroundColor Yellow
}

Write-Host @"
======================================================
     ANTIGRAVITY PULSE - MOBILE BUILD SYSTEM
           Android & iOS Native Engine
======================================================
"@ -ForegroundColor Magenta

# 1. Kiểm tra thư mục đích
if (!(Test-Path $FrontendDir)) {
    Write-Error "Không tìm thấy thư mục frontend tại $FrontendDir"
    exit 1
}

if (!(Test-Path $BuildsDir)) {
    New-Item -ItemType Directory -Path $BuildsDir -Force | Out-Null
}

# 2. Build Frontend nếu chưa skip
if (!$SkipWebBuild) {
    Write-Step "Đang biên dịch Frontend Web Assets (Vite production build)..."
    Push-Location $FrontendDir
    try {
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Lỗi khi chạy npm run build!"
            exit $LASTEXITCODE
        }
        Write-Success "Frontend web assets đã được biên dịch thành công vào frontend/dist!"
    }
    finally {
        Pop-Location
    }
} else {
    Write-WarningMsg "Bỏ qua bước build web theo yêu cầu (-SkipWebBuild)."
}

# 3. Đồng bộ Capacitor sang Android & iOS
Write-Step "Đang đồng bộ web assets vào các project Android và iOS..."
Push-Location $FrontendDir
try {
    & npx.cmd cap sync
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Lỗi khi chạy npx cap sync!"
        exit $LASTEXITCODE
    }
    Write-Success "Đã đồng bộ thành công sang Android và iOS!"
}
finally {
    Pop-Location
}

# 4. Kiểm tra Java để build Android APK
Write-Step "Kiểm tra công cụ biên dịch Android cục bộ (Java/Gradle)..."
$JavaAvailable = $false
try {
    $javaVer = & java -version 2>&1
    if ($LASTEXITCODE -eq 0 -or $javaVer -match "version") {
        $JavaAvailable = $true
        Write-Success "Tìm thấy Java môi trường: $($javaVer[0])"
    }
} catch {
    $JavaAvailable = $false
}

$ApkGenerated = $false
if ($JavaAvailable -and (Test-Path (Join-Path $AndroidDir "gradlew.bat"))) {
    Write-Step "Bắt đầu biên dịch file Android APK (Debug APK)..."
    Push-Location $AndroidDir
    try {
        & .\gradlew.bat assembleDebug --stacktrace
        $CandidateApk = Join-Path $AndroidDir "app\build\outputs\apk\debug\app-debug.apk"
        if (Test-Path $CandidateApk) {
            $TargetApk = Join-Path $BuildsDir "Antigravity-Pulse.apk"
            Copy-Item -Path $CandidateApk -Destination $TargetApk -Force
            $ApkSizeMb = [math]::Round(((Get-Item $TargetApk).Length / 1MB), 2)
            Write-Success "ĐÃ TẠO THÀNH CÔNG APK: $TargetApk ($ApkSizeMb MB)"
            $ApkGenerated = $true
        } else {
            Write-WarningMsg "Quá trình Gradle chạy xong nhưng chưa tìm thấy file APK tại $CandidateApk"
        }
    } catch {
        Write-WarningMsg "Không thể tự động chạy Gradle: $_"
    } finally {
        Pop-Location
    }
} else {
    Write-WarningMsg "Máy tính hiện chưa cài Java JDK / Android SDK trên PATH."
    Write-Host "-> Toàn bộ project Android đã sẵn sàng tại: $AndroidDir" -ForegroundColor Gray
    Write-Host "-> Bạn có thể mở trực tiếp bằng Android Studio: npx cap open android" -ForegroundColor Gray
    Write-Host "-> Hoặc đẩy lên GitHub để GitHub Actions tự động build APK và IPA miễn phí!" -ForegroundColor Gray
}

# 5. Tùy chọn mở Android Studio hoặc Xcode
if ($OpenAndroidStudio) {
    Write-Step "Đang mở Android Studio..."
    Push-Location $FrontendDir
    & npx.cmd cap open android
    Pop-Location
}

if ($OpenXcode) {
    Write-Step "Đang mở Xcode (chỉ khả dụng trên macOS)..."
    Push-Location $FrontendDir
    & npx.cmd cap open ios
    Pop-Location
}

Write-Host @"
======================================================
               TỔNG KẾT BUILD DI ĐỘNG
======================================================
1. Android Native Project:
   - Thư mục: $AndroidDir
   - Trạng thái: Sẵn sàng, đã tích hợp Camera QR, Theme StatusBar, DeepLink.
$([string]($ApkGenerated ? "   - File APK cài đặt: $BuildsDir\Antigravity-Pulse.apk" : "   - Cách tạo APK: Mở Android Studio hoặc dùng GitHub Actions"))

2. iOS Native Project:
   - Thư mục: $IosDir
   - Trạng thái: Sẵn sàng (Xcode project đầy đủ).
   - Cách tạo IPA: Mở bằng Xcode trên macOS hoặc dùng GitHub Actions cloud.

3. Chế độ PWA (Dùng ngay lập tức KHÔNG CẦN CÀI ĐẶT rườm rà):
   - Mở trình duyệt trên điện thoại (Chrome trên Android, Safari trên iOS)
   - Truy cập URL máy chủ (LAN hoặc Cloudflare Tunnel)
   - Chọn 'Thêm vào Màn hình chính' (Add to Home Screen).
   - Ứng dụng chạy mượt mà toàn màn hình như Native App!
======================================================
"@ -ForegroundColor Green
