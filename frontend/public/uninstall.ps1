# Antigravity Pulse — 1-Click Windows Uninstaller
# Chay: irm https://agypulse.dpdns.org/uninstall.ps1 | iex

param(
    [switch]$Force,
    [switch]$RemoveCloudflared
)

$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$DefaultInstallDir = Join-Path $env:USERPROFILE "AntigravityPulse"
$DesktopShortcut = Join-Path ([Environment]::GetFolderPath("Desktop")) "Antigravity Pulse.lnk"

Write-Host ""
Write-Host "==============================================" -ForegroundColor Red
Write-Host "   ANTIGRAVITY PULSE — GO CAI DAT (PC)        " -ForegroundColor Red
Write-Host "==============================================" -ForegroundColor Red
Write-Host ""
Write-Host "Trinh go cai dat se thuc hien:" -ForegroundColor Yellow
Write-Host "  1. Dung server Antigravity Pulse (port 8765) va tien trinh cloudflared."
Write-Host "  2. Xoa Shortcut 'Antigravity Pulse' ngoai Desktop."
Write-Host "  3. Xoa thu muc cai dat: $DefaultInstallDir (neu ton tai)."
Write-Host "  4. Don tep tam cua Antigravity Pulse trong %TEMP%."
Write-Host "  (Khong go Python, Node.js hay Git de tranh anh huong cac ung dung khac.)" -ForegroundColor Gray
Write-Host ""

if (-not $Force) {
    $confirm = Read-Host "Ban co chac chan muon go cai dat Antigravity Pulse? (y/N)"
    if ($confirm -notin @("y", "Y", "yes", "YES")) {
        Write-Host "[*] Da huy go cai dat." -ForegroundColor Cyan
        return
    }
}

# 1. Dung tien trinh server dang lang nghe port 8765 va cloudflared
Write-Host "[1/4] Dang dung server va Cloudflare Tunnel..." -ForegroundColor Yellow
try {
    $conns = Get-NetTCPConnection -LocalPort 8765 -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Listen' }
    foreach ($c in $conns) {
        if ($c.OwningProcess -gt 0 -and $c.OwningProcess -ne $PID) {
            Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
            Write-Host "  [OK] Da dung tien trinh server (PID $($c.OwningProcess))." -ForegroundColor Green
        }
    }
} catch {}

Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    Write-Host "  [OK] Da dung cloudflared (PID $($_.Id))." -ForegroundColor Green
}

# Dung python dang chay tu thu muc cai dat
Get-CimInstance Win32_Process -Filter "Name = 'python.exe' OR Name = 'pythonw.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*AntigravityPulse*" -or $_.CommandLine -like "*app.main:app*" } |
    ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        Write-Host "  [OK] Da dung tien trinh Python (PID $($_.ProcessId))." -ForegroundColor Green
    }

Start-Sleep -Milliseconds 600

# 2. Xoa shortcut Desktop
Write-Host "[2/4] Dang xoa Shortcut ngoai Desktop..." -ForegroundColor Yellow
if (Test-Path $DesktopShortcut) {
    Remove-Item -Path $DesktopShortcut -Force -ErrorAction SilentlyContinue
    Write-Host "  [OK] Da xoa $DesktopShortcut" -ForegroundColor Green
} else {
    Write-Host "  [-] Khong tim thay Shortcut Desktop." -ForegroundColor Gray
}

# 3. Xoa thu muc cai dat mac dinh
Write-Host "[3/4] Dang xoa thu muc cai dat..." -ForegroundColor Yellow
if (Test-Path $DefaultInstallDir) {
    Remove-Item -Path $DefaultInstallDir -Recurse -Force -ErrorAction SilentlyContinue
    if (-not (Test-Path $DefaultInstallDir)) {
        Write-Host "  [OK] Da xoa hoan toan $DefaultInstallDir" -ForegroundColor Green
    } else {
        Write-Host "  [!] Mot so tep dang bi khoa. Hay dong terminal/trinh duyet lien quan va xoa thu cong: $DefaultInstallDir" -ForegroundColor DarkYellow
    }
} else {
    Write-Host "  [-] Khong tim thay $DefaultInstallDir (neu ban clone thu cong, hay chay install\uninstall-pc.bat trong thu muc du an)." -ForegroundColor Gray
}

# 4. Don tep tam & tuy chon go cloudflared
Write-Host "[4/4] Dang don tep tam..." -ForegroundColor Yellow
Get-ChildItem -Path $env:TEMP -Filter "antigravity-pulse-tunnel-*.log" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
Remove-Item -Path (Join-Path $env:TEMP "agypulse-main.zip") -Force -ErrorAction SilentlyContinue
Remove-Item -Path (Join-Path $env:TEMP "agypulse-extract") -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "  [OK] Da don tep tam." -ForegroundColor Green

if ($RemoveCloudflared -and (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Host "[*] Dang go Cloudflare.cloudflared qua winget..." -ForegroundColor Yellow
    winget uninstall --id Cloudflare.cloudflared --silent
}

Write-Host ""
Write-Host "==============================================" -ForegroundColor Green
Write-Host "   DA GO CAI DAT ANTIGRAVITY PULSE THANH CONG " -ForegroundColor Green
Write-Host "==============================================" -ForegroundColor Green
Write-Host "Neu da dang nhap Google, ban co the thu hoi quyen tai: https://myaccount.google.com/permissions" -ForegroundColor Cyan
Write-Host ""
