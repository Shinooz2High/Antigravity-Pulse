<#
.SYNOPSIS
    Cài đặt file APK Antigravity Pulse lên điện thoại Android qua cáp USB (ADB).
#>

[CmdletBinding()]
param(
    [string]$ApkPath = ""
)

$ErrorActionPreference = "Stop"
$InstallDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $InstallDir

$Candidates = @(
    $ApkPath,
    (Join-Path $InstallDir "Antigravity-Pulse-Android.apk"),
    (Join-Path $RootDir "backend\data\builds\Antigravity-Pulse.apk"),
    (Join-Path $RootDir "frontend\android\app\build\outputs\apk\debug\app-debug.apk")
) | Where-Object { $_ -and (Test-Path $_) }

if (-not $Candidates -or $Candidates.Count -eq 0) {
    Write-Host "[!] Chua tim thay file APK cuc bo." -ForegroundColor Yellow
    Write-Host "Ban co the:"
    Write-Host "  1. Tai APK moi nhat tai: https://github.com/Shinooz2High/App-Antigravity-on-moblie-/releases/latest" -ForegroundColor Cyan
    Write-Host "  2. Dat file .apk vao thu muc install\ voi ten Antigravity-Pulse-Android.apk roi chay lai script nay."
    Write-Host "  3. Hoac chay .\build-mobile.ps1 (neu may da cai Java JDK & Android SDK)."
    exit 1
}

$TargetApk = $Candidates[0]
Write-Host "[*] Tim thay APK: $TargetApk" -ForegroundColor Green

$adb = Get-Command adb -ErrorAction SilentlyContinue
if (-not $adb) {
    Write-Host "[!] Khong tim thay 'adb' tren PATH. Hay copy file APK sau sang dien thoai de cai truc tiep:" -ForegroundColor Yellow
    Write-Host "    $TargetApk" -ForegroundColor Cyan
    exit 1
}

Write-Host "[*] Dang kiem tra thiet bi Android ket noi USB..." -ForegroundColor Cyan
& adb devices
Write-Host "[*] Dang cai dat APK len dien thoai..." -ForegroundColor Cyan
& adb install -r $TargetApk
Write-Host "[OK] Cai dat thanh cong!" -ForegroundColor Green
