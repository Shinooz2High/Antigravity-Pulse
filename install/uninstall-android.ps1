<#
.SYNOPSIS
    Gỡ ứng dụng Antigravity Pulse (APK) khỏi điện thoại Android đang kết nối USB qua ADB.
#>

$ErrorActionPreference = "Stop"
$PackageId = "com.antigravity.pulse"

$adb = Get-Command adb -ErrorAction SilentlyContinue
if (-not $adb) {
    Write-Host "[!] Khong tim thay 'adb' tren PATH." -ForegroundColor Yellow
    Write-Host "Ban co the go truc tiep tren dien thoai: Nhan giu bieu tuong 'Antigravity Pulse' -> Go cai dat (Uninstall)." -ForegroundColor Cyan
    exit 1
}

Write-Host "[*] Dang kiem tra thiet bi Android ket noi USB..." -ForegroundColor Cyan
& adb devices
Write-Host "[*] Dang go ung dung $PackageId..." -ForegroundColor Yellow
& adb uninstall $PackageId
Write-Host "[OK] Da go cai dat Antigravity Pulse khoi dien thoai Android!" -ForegroundColor Green
