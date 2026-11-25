<#
.SYNOPSIS
    Gỡ cài đặt / dọn sạch Antigravity Pulse trên Windows PC.
.DESCRIPTION
    Dừng server (port 8765) & cloudflared, xóa Shortcut Desktop, dọn môi trường cài đặt
    (backend/.venv, backend/data, frontend/node_modules, frontend/dist, .env) hoặc xóa toàn bộ
    thư mục cài đặt nếu nằm tại %USERPROFILE%\AntigravityPulse.
#>

[CmdletBinding()]
param(
    [switch]$Force,
    [switch]$KeepData,
    [switch]$RemoveCloudflared
)

$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$InstallDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $InstallDir
$DesktopShortcut = Join-Path ([Environment]::GetFolderPath("Desktop")) "Antigravity Pulse.lnk"
$DefaultUserInstallDir = Join-Path $env:USERPROFILE "AntigravityPulse"

Write-Host ""
Write-Host "===============================================" -ForegroundColor Red
Write-Host "   ANTIGRAVITY PULSE - PC BRIDGE UNINSTALLER   " -ForegroundColor Red
Write-Host "===============================================" -ForegroundColor Red
Write-Host "Thu muc hien tai: $RootDir" -ForegroundColor Gray
Write-Host ""
Write-Host "Cac muc se duoc go / don sach:" -ForegroundColor Yellow
Write-Host "  - Dung server Antigravity Pulse (port 8765) va cloudflared"
Write-Host "  - Xoa Shortcut ngoai Desktop (Antigravity Pulse.lnk)"
Write-Host "  - Xoa moi truong cai dat: backend\.venv, frontend\node_modules, frontend\dist"
if (-not $KeepData) {
    Write-Host "  - Xoa du lieu cuc bo & bi mat: backend\data, .env"
} else {
    Write-Host "  - Giu lai du lieu cuc bo (backend\data, .env) theo tuy chon -KeepData" -ForegroundColor Cyan
}
Write-Host "  - Don tep tam trong %TEMP%"
Write-Host ""

if (-not $Force) {
    $confirm = Read-Host "Ban co chac chan muon tiep tuc? (y/N)"
    if ($confirm -notin @("y", "Y", "yes", "YES")) {
        Write-Host "[*] Da huy thao tac go cai dat." -ForegroundColor Cyan
        exit 0
    }
}

# 1. Dung server va cloudflared
Write-Host "[1/4] Dung tien trinh dang chay..." -ForegroundColor Yellow
try {
    $conns = Get-NetTCPConnection -LocalPort 8765 -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Listen' }
    foreach ($c in $conns) {
        if ($c.OwningProcess -gt 0 -and $c.OwningProcess -ne $PID) {
            Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
            Write-Host "  [OK] Da dung server (PID $($c.OwningProcess))." -ForegroundColor Green
        }
    }
} catch {}

Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    Write-Host "  [OK] Da dung cloudflared (PID $($_.Id))." -ForegroundColor Green
}

Start-Sleep -Milliseconds 600

# 2. Xoa shortcut Desktop
Write-Host "[2/4] Xoa Shortcut ngoai Desktop..." -ForegroundColor Yellow
if (Test-Path $DesktopShortcut) {
    Remove-Item -Path $DesktopShortcut -Force -ErrorAction SilentlyContinue
    Write-Host "  [OK] Da xoa $DesktopShortcut" -ForegroundColor Green
} else {
    Write-Host "  [-] Khong co Shortcut Desktop." -ForegroundColor Gray
}

# 3. Xoa moi truong cai dat & du lieu
Write-Host "[3/4] Don sach moi truong cai dat..." -ForegroundColor Yellow
$Targets = @(
    (Join-Path $RootDir "backend\.venv"),
    (Join-Path $RootDir "backend\.pytest_cache"),
    (Join-Path $RootDir "frontend\node_modules"),
    (Join-Path $RootDir "frontend\dist")
)
if (-not $KeepData) {
    $Targets += @(
        (Join-Path $RootDir "backend\data"),
        (Join-Path $RootDir ".env")
    )
}

foreach ($t in $Targets) {
    if (Test-Path $t) {
        Remove-Item -Path $t -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "  [OK] Da xoa $t" -ForegroundColor Green
    }
}

# 4. Don tep tam & tuy chon go cloudflared
Write-Host "[4/4] Don tep tam..." -ForegroundColor Yellow
Get-ChildItem -Path $env:TEMP -Filter "antigravity-pulse-tunnel-*.log" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
Remove-Item -Path (Join-Path $env:TEMP "agypulse-main.zip") -Force -ErrorAction SilentlyContinue
Remove-Item -Path (Join-Path $env:TEMP "agypulse-extract") -Recurse -Force -ErrorAction SilentlyContinue

if ($RemoveCloudflared -and (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Host "  [*] Dang go Cloudflare.cloudflared..." -ForegroundColor Yellow
    winget uninstall --id Cloudflare.cloudflared --silent
}

Write-Host ""
Write-Host "===============================================" -ForegroundColor Green
Write-Host "   GO CAI DAT / DON SACH HOAN TAT!             " -ForegroundColor Green
Write-Host "===============================================" -ForegroundColor Green
if ($RootDir -eq $DefaultUserInstallDir) {
    Write-Host "Ban co the xoa not thu muc $RootDir sau khi dong cua so nay." -ForegroundColor Cyan
} else {
    Write-Host "Ma nguon van duoc giu nguyen tai $RootDir (ban co the xoa thu muc nay neu khong dung nua)." -ForegroundColor Cyan
}
Write-Host "Thu hoi quyen Google OAuth (neu da dang nhap): https://myaccount.google.com/permissions" -ForegroundColor Gray
Write-Host ""
