[CmdletBinding()]
param(
    [int]$Port = 8765,
    [string]$HostAddress = "0.0.0.0",
    [switch]$Tunnel,
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$env:PYTHONUTF8 = "1"

$GeminiBin = Join-Path $env:USERPROFILE ".gemini\bin"
if ((Test-Path $GeminiBin) -and ($env:PATH -notlike "*$GeminiBin*")) {
    $env:PATH = "$GeminiBin;$env:PATH"
}

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Join-Path $RootDir "backend"
$FrontendDir = Join-Path $RootDir "frontend"
$VenvPython = Join-Path $BackendDir ".venv\Scripts\python.exe"
$RequirementsFile = Join-Path $BackendDir "requirements.txt"

Write-Host ""
Write-Host "=== Antigravity Pulse ===" -ForegroundColor Cyan
Write-Host "Workspace: $RootDir"

if (-not (Test-Path $VenvPython)) {
    Write-Host "[1/4] Creating Python virtual environment..." -ForegroundColor Yellow
    python -m venv (Join-Path $BackendDir ".venv")
    & $VenvPython -m pip install --upgrade pip
    & $VenvPython -m pip install -r $RequirementsFile
} else {
    Write-Host "[1/4] Python venv ready: $VenvPython" -ForegroundColor Green
}

$DistIndex = Join-Path $FrontendDir "dist\index.html"
$PackageJson = Join-Path $FrontendDir "package.json"
if (-not $SkipBuild -and (Test-Path $PackageJson) -and -not (Test-Path $DistIndex)) {
    Write-Host "[2/4] Building mobile PWA frontend..." -ForegroundColor Yellow
    Push-Location $FrontendDir
    try {
        if (-not (Test-Path (Join-Path $FrontendDir "node_modules"))) {
            & npm.cmd install
        }
        & npm.cmd run build
    } finally {
        Pop-Location
    }
} elseif (Test-Path $DistIndex) {
    Write-Host "[2/4] Frontend PWA bundle ready: $DistIndex" -ForegroundColor Green
} else {
    Write-Host "[2/4] Frontend dist not built yet (API-only mode until built)." -ForegroundColor DarkYellow
}

$env:AGY_HOST = $HostAddress
$env:AGY_PORT = "$Port"

Write-Host "[3/4] Initializing pairing credentials & network info..." -ForegroundColor Cyan
Push-Location $BackendDir
try {
    & $VenvPython -m app.cli_banner
} finally {
    Pop-Location
}

$TunnelProc = $null
$TunnelLog = Join-Path $env:TEMP "antigravity-pulse-tunnel-$Port.log"
if ($Tunnel) {
    $CloudflaredCmd = Get-Command "cloudflared" -ErrorAction SilentlyContinue
    if ($null -eq $CloudflaredCmd) {
        $LocalCloudflared = Join-Path $RootDir "cloudflared.exe"
        if (Test-Path $LocalCloudflared) {
            $CloudflaredCmd = [PSCustomObject]@{ Source = $LocalCloudflared }
        }
    }
    if ($null -eq $CloudflaredCmd) {
        Write-Host "[!] cloudflared not found. Install with: winget install Cloudflare.cloudflared" -ForegroundColor Yellow
    } else {
        Write-Host "[*] Starting Cloudflare Quick Tunnel..." -ForegroundColor Yellow
        if (Test-Path $TunnelLog) { Remove-Item $TunnelLog -Force -ErrorAction SilentlyContinue }
        $TunnelProc = Start-Process -FilePath $CloudflaredCmd.Source `
            -ArgumentList @("tunnel", "--no-autoupdate", "--url", "http://127.0.0.1:$Port") `
            -RedirectStandardError $TunnelLog `
            -NoNewWindow -PassThru
        $deadline = (Get-Date).AddSeconds(12)
        $tunnelUrl = $null
        while ((Get-Date) -lt $deadline) {
            Start-Sleep -Milliseconds 400
            if (Test-Path $TunnelLog) {
                $content = Get-Content $TunnelLog -Raw -ErrorAction SilentlyContinue
                if ($content -match "https://[a-zA-Z0-9-]+\.trycloudflare\.com") {
                    $tunnelUrl = $Matches[0]
                    break
                }
            }
        }
        if ($tunnelUrl) {
            Push-Location $BackendDir
            try {
                & $VenvPython -m app.cli_banner --tunnel-url $tunnelUrl
            } finally {
                Pop-Location
            }
        } else {
            Write-Host "[!] Tunnel started, still negotiating URL (check Settings in app)." -ForegroundColor Yellow
        }
    }
}

Write-Host "[4/4] Starting FastAPI server on http://${HostAddress}:${Port} ..." -ForegroundColor Green
$existingConn = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Listen' }
if ($existingConn) {
    foreach ($conn in $existingConn) {
        $procId = $conn.OwningProcess
        if ($procId -gt 0 -and $procId -ne $PID) {
            Write-Host "[*] Port $Port is in use by old process (PID $procId). Stopping it..." -ForegroundColor Yellow
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        }
    }
    Start-Sleep -Milliseconds 800
}
Push-Location $BackendDir
try {
    & $VenvPython -m uvicorn app.main:app --host $HostAddress --port $Port
} finally {
    Pop-Location
    if ($null -ne $TunnelProc -and -not $TunnelProc.HasExited) {
        Stop-Process -Id $TunnelProc.Id -Force -ErrorAction SilentlyContinue
    }
}
