# Antigravity Pulse — 1-Click Windows Installer
# Chay: irm https://agypulse.dpdns.org/install.ps1 | iex

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$RepoUrl = "https://github.com/Shinooz2High/App-Antigravity-on-moblie-.git"
$ZipUrl  = "https://github.com/Shinooz2High/App-Antigravity-on-moblie-/archive/refs/heads/main.zip"
$InstallDir = Join-Path $env:USERPROFILE "AntigravityPulse"

function Refresh-Path {
    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath    = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:PATH    = "$machinePath;$userPath"
}

function Ensure-Tool {
    param(
        [string]$CommandName,
        [string]$WingetId,
        [string]$DisplayName
    )
    if (Get-Command $CommandName -ErrorAction SilentlyContinue) {
        Write-Host "[OK] $DisplayName da san sang." -ForegroundColor Green
        return $true
    }
    if (Get-Command "winget" -ErrorAction SilentlyContinue) {
        Write-Host "[...] Dang tu dong cai $DisplayName qua winget..." -ForegroundColor Yellow
        winget install --id $WingetId --silent --accept-package-agreements --accept-source-agreements
        Refresh-Path
        if (Get-Command $CommandName -ErrorAction SilentlyContinue) {
            Write-Host "[OK] Da cai xong $DisplayName!" -ForegroundColor Green
            return $true
        }
    }
    Write-Host "[!] Chua tim thay $DisplayName. Vui long cai thu cong neu can." -ForegroundColor DarkYellow
    return $false
}

Write-Host ""
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "   ANTIGRAVITY PULSE — CAI DAT 1 CHAM (PC)   " -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host ""

# 1. Kiem tra & tu dong cai cong cu can thiet
Ensure-Tool -CommandName "python"      -WingetId "Python.Python.3.12"    -DisplayName "Python 3" | Out-Null
Ensure-Tool -CommandName "node"        -WingetId "OpenJS.NodeJS.LTS"     -DisplayName "Node.js LTS" | Out-Null
Ensure-Tool -CommandName "cloudflared" -WingetId "Cloudflare.cloudflared" -DisplayName "Cloudflare Tunnel" | Out-Null
$hasGit = Ensure-Tool -CommandName "git" -WingetId "Git.Git" -DisplayName "Git"

# 2. Tai hoac cap nhat ma nguon
if ($hasGit) {
    if (Test-Path (Join-Path $InstallDir ".git")) {
        Write-Host "[...] Dang cap nhat Antigravity Pulse tai $InstallDir..." -ForegroundColor Cyan
        Push-Location $InstallDir
        git pull --ff-only origin main
        Pop-Location
    } else {
        if (Test-Path $InstallDir) { Remove-Item -Recurse -Force $InstallDir }
        Write-Host "[...] Dang tai Antigravity Pulse ve $InstallDir..." -ForegroundColor Cyan
        git clone $RepoUrl $InstallDir
    }
} else {
    Write-Host "[...] Dang tai ban nen ZIP ve $InstallDir..." -ForegroundColor Cyan
    $zipPath = Join-Path $env:TEMP "agypulse-main.zip"
    $extractTmp = Join-Path $env:TEMP "agypulse-extract"
    Invoke-WebRequest -Uri $ZipUrl -OutFile $zipPath
    if (Test-Path $extractTmp) { Remove-Item -Recurse -Force $extractTmp }
    Expand-Archive -Path $zipPath -DestinationPath $extractTmp -Force
    $inner = Get-ChildItem -Path $extractTmp -Directory | Select-Object -First 1
    if (Test-Path $InstallDir) { Remove-Item -Recurse -Force $InstallDir }
    Move-Item -Path $inner.FullName -Destination $InstallDir
    Remove-Item -Force $zipPath -ErrorAction SilentlyContinue
}

# 3. Tao shortcut ngoai Desktop de lan sau chi can bam dup
try {
    $desktop = [Environment]::GetFolderPath("Desktop")
    $shortcutPath = Join-Path $desktop "Antigravity Pulse.lnk"
    $wsh = New-Object -ComObject WScript.Shell
    $sc = $wsh.CreateShortcut($shortcutPath)
    $sc.TargetPath = "powershell.exe"
    $sc.Arguments = "-ExecutionPolicy Bypass -File `"$InstallDir\start.ps1`""
    $sc.WorkingDirectory = $InstallDir
    $sc.Description = "Khoi dong Antigravity Pulse Server"
    $sc.Save()
    Write-Host "[OK] Da tao bieu tuong 'Antigravity Pulse' ngoai Desktop!" -ForegroundColor Green
} catch {
    Write-Host "[!] Khong tao duoc shortcut Desktop (khong anh huong)." -ForegroundColor DarkYellow
}

# 4. Khoi dong ngay lap tuc
Write-Host ""
Write-Host "[OK] Cai dat hoan tat! Dang khoi dong Antigravity Pulse..." -ForegroundColor Green
Write-Host "     Lan sau chi can bam dup icon 'Antigravity Pulse' ngoai Desktop." -ForegroundColor Cyan
Write-Host ""

Set-Location $InstallDir
& powershell.exe -ExecutionPolicy Bypass -File (Join-Path $InstallDir "start.ps1")
