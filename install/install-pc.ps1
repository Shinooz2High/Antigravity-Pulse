<#
.SYNOPSIS
    Trình cài đặt tự động 1 chạm cho Antigravity Pulse trên Windows PC.
.DESCRIPTION
    Kiểm tra Python & Node.js, tạo môi trường ảo backend (.venv), cài thư viện,
    build Frontend PWA, tạo file .env mẫu, tùy chọn cài cloudflared và tạo Shortcut Desktop.
#>

[CmdletBinding()]
param(
    [switch]$SkipShortcut,
    [switch]$InstallTunnel,
    [switch]$LaunchAfterInstall
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$InstallDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $InstallDir
$BackendDir = Join-Path $RootDir "backend"
$FrontendDir = Join-Path $RootDir "frontend"
$VenvDir = Join-Path $BackendDir ".venv"
$VenvPython = Join-Path $VenvDir "Scripts\python.exe"

Write-Host ""
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "   ANTIGRAVITY PULSE - PC BRIDGE INSTALLER     " -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "Thu muc du an: $RootDir" -ForegroundColor Gray
Write-Host ""

# 1. Kiem tra Python
Write-Host "[1/5] Kiem tra Python..." -ForegroundColor Yellow
$pythonCmd = Get-Command python -ErrorAction SilentlyContinue
if (-not $pythonCmd) {
    Write-Host "[LOI] Khong tim thay Python! Vui long cai Python 3.11+ tai https://www.python.org/downloads/ (nho tick 'Add Python to PATH')." -ForegroundColor Red
    exit 1
}
$pyVer = & python --version 2>&1
Write-Host "  [OK] $pyVer" -ForegroundColor Green

# 2. Kiem tra Node.js & npm
Write-Host "[2/5] Kiem tra Node.js & npm..." -ForegroundColor Yellow
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
$npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $nodeCmd -or -not $npmCmd) {
    Write-Host "[LOI] Khong tim thay Node.js / npm! Vui long cai Node.js 18+ tai https://nodejs.org/" -ForegroundColor Red
    exit 1
}
$nodeVer = & node --version 2>&1
Write-Host "  [OK] Node $nodeVer" -ForegroundColor Green

# 3. Cai dat Backend (Python venv + requirements)
Write-Host "[3/5] Cai dat Backend Python (.venv & requirements)..." -ForegroundColor Yellow
if (-not (Test-Path $VenvPython)) {
    & python -m venv $VenvDir
}
& $VenvPython -m pip install --upgrade pip
& $VenvPython -m pip install -r (Join-Path $BackendDir "requirements.txt")
Write-Host "  [OK] Backend da san sang." -ForegroundColor Green

# 4. Cai dat & Build Frontend PWA
Write-Host "[4/5] Cai dat thu vien & Build giao dien Mobile PWA..." -ForegroundColor Yellow
Push-Location $FrontendDir
try {
    & npm.cmd install
    & npm.cmd run build
} finally {
    Pop-Location
}
Write-Host "  [OK] Frontend PWA da build thanh cong." -ForegroundColor Green

# 5. Cau hinh .env, cloudflared va Shortcut Desktop
Write-Host "[5/5] Hoan tat cau hinh..." -ForegroundColor Yellow
$EnvFile = Join-Path $RootDir ".env"
$EnvExample = Join-Path $RootDir ".env.example"
if (-not (Test-Path $EnvFile) -and (Test-Path $EnvExample)) {
    Copy-Item $EnvExample $EnvFile
    Write-Host "  [OK] Da tao file .env tu .env.example." -ForegroundColor Green
}

if ($InstallTunnel) {
    if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
        Write-Host "  [*] Dang cai dat cloudflared qua winget..." -ForegroundColor Cyan
        winget install --id Cloudflare.cloudflared -e --accept-package-agreements --accept-source-agreements
    } else {
        Write-Host "  [OK] cloudflared da duoc cai dat." -ForegroundColor Green
    }
}

if (-not $SkipShortcut) {
    try {
        $DesktopPath = [Environment]::GetFolderPath("Desktop")
        $ShortcutPath = Join-Path $DesktopPath "Antigravity Pulse.lnk"
        $WshShell = New-Object -ComObject WScript.Shell
        $Shortcut = $WshShell.CreateShortcut($ShortcutPath)
        $Shortcut.TargetPath = Join-Path $RootDir "start.bat"
        $Shortcut.WorkingDirectory = $RootDir
        $Shortcut.Description = "Khoi chay Antigravity Pulse PC Bridge"
        $Shortcut.Save()
        Write-Host "  [OK] Da tao Shortcut ngoai Desktop: $ShortcutPath" -ForegroundColor Green
    } catch {
        Write-Host "  [!] Khong the tao Shortcut Desktop: $($_.Exception.Message)" -ForegroundColor DarkYellow
    }
}

Write-Host ""
Write-Host "===============================================" -ForegroundColor Green
Write-Host "   CAI DAT HOAN TAT!                           " -ForegroundColor Green
Write-Host "===============================================" -ForegroundColor Green
Write-Host "De khoi chay app, hay nhan dup 'start.bat' hoac Shortcut ngoai Desktop."
Write-Host "Chay voi Cloudflare Tunnel: .\start.ps1 -Tunnel"
Write-Host ""

if ($LaunchAfterInstall) {
    & (Join-Path $RootDir "start.ps1")
}
