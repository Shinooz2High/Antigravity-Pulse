[CmdletBinding()]
param(
    [int]$Port = 8765,
    [string]$HostAddress = "0.0.0.0",
    [switch]$Tunnel,
    [ValidateSet("cloudflare_quick", "serveo_ssh", "cloudflare_named")]
    [string]$TunnelMode = "cloudflare_quick",
    [string]$Subdomain = "",
    [string]$ShortAlias = "",
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
    if (Test-Path $TunnelLog) { Remove-Item $TunnelLog -Force -ErrorAction SilentlyContinue }
    $tunnelUrl = $null
    $shortUrl = $null

    if ($TunnelMode -eq "serveo_ssh") {
        $SshCmd = Get-Command "ssh" -ErrorAction SilentlyContinue
        if ($null -eq $SshCmd) {
            Write-Host "[!] OpenSSH (ssh) not found. Enable OpenSSH Client in Windows." -ForegroundColor Yellow
        } else {
            $cleanSub = ($Subdomain.Trim().ToLower() -replace '[^a-z0-9-]+', '-').Trim('-')
            $remoteSpec = if ($cleanSub) { "${cleanSub}:80:127.0.0.1:${Port}" } else { "80:127.0.0.1:${Port}" }
            Write-Host "[*] Starting Serveo SSH Tunnel ($remoteSpec)..." -ForegroundColor Yellow
            $TunnelProc = Start-Process -FilePath $SshCmd.Source `
                -ArgumentList @(
                    "-o", "StrictHostKeyChecking=no",
                    "-o", "UserKnownHostsFile=NUL",
                    "-o", "ServerAliveInterval=30",
                    "-o", "ServerAliveCountMax=3",
                    "-o", "ExitOnForwardFailure=yes",
                    "-o", "NumberOfPasswordPrompts=0",
                    "-T", "-R", $remoteSpec, "serveo.net"
                ) `
                -RedirectStandardOutput $TunnelLog `
                -NoNewWindow -PassThru
            $deadline = (Get-Date).AddSeconds(15)
            while ((Get-Date) -lt $deadline) {
                Start-Sleep -Milliseconds 400
                if (Test-Path $TunnelLog) {
                    $content = Get-Content $TunnelLog -Raw -ErrorAction SilentlyContinue
                    if ($content -match "https://[a-zA-Z0-9-]+\.(serveo\.net|serveousercontent\.com)") {
                        $tunnelUrl = $Matches[0]
                        break
                    }
                }
            }
        }
    } else {
        $CloudflaredCmd = Get-Command "cloudflared" -ErrorAction SilentlyContinue
        if ($null -eq $CloudflaredCmd) {
            $LocalCloudflared = Join-Path $RootDir "cloudflared.exe"
            if (Test-Path $LocalCloudflared) {
                $CloudflaredCmd = [PSCustomObject]@{ Source = $LocalCloudflared }
            }
        }
        if ($null -eq $CloudflaredCmd) {
            Write-Host "[!] cloudflared not found. Install with: winget install Cloudflare.cloudflared" -ForegroundColor Yellow
        } elseif ($TunnelMode -eq "cloudflare_named") {
            $cfToken = $env:CLOUDFLARE_TUNNEL_TOKEN
            $cfUrl = $env:CLOUDFLARE_TUNNEL_URL
            if (-not $cfToken -or -not $cfUrl) {
                Write-Host "[!] Set CLOUDFLARE_TUNNEL_TOKEN and CLOUDFLARE_TUNNEL_URL in .env or Settings." -ForegroundColor Yellow
            } else {
                Write-Host "[*] Starting Cloudflare Named Tunnel ($cfUrl)..." -ForegroundColor Yellow
                $TunnelProc = Start-Process -FilePath $CloudflaredCmd.Source `
                    -ArgumentList @("tunnel", "--no-autoupdate", "run", "--token", $cfToken) `
                    -RedirectStandardError $TunnelLog `
                    -NoNewWindow -PassThru
                $deadline = (Get-Date).AddSeconds(15)
                while ((Get-Date) -lt $deadline) {
                    Start-Sleep -Milliseconds 400
                    if (Test-Path $TunnelLog) {
                        $content = Get-Content $TunnelLog -Raw -ErrorAction SilentlyContinue
                        if ($content -match "Registered tunnel connection") {
                            $tunnelUrl = $cfUrl.TrimEnd('/')
                            break
                        }
                    }
                }
            }
        } else {
            Write-Host "[*] Starting Cloudflare Quick Tunnel..." -ForegroundColor Yellow
            $TunnelProc = Start-Process -FilePath $CloudflaredCmd.Source `
                -ArgumentList @("tunnel", "--no-autoupdate", "--url", "http://127.0.0.1:$Port") `
                -RedirectStandardError $TunnelLog `
                -NoNewWindow -PassThru
            $deadline = (Get-Date).AddSeconds(12)
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
                    $aliasArg = if ($ShortAlias) { $ShortAlias } else { "" }
                    $shortUrl = & $VenvPython -c "import sys; from app.services.tunnel_service import shorten_url_sync; print(shorten_url_sync(sys.argv[1], sys.argv[2] or None) or '')" $tunnelUrl $aliasArg
                    if ($shortUrl) { $shortUrl = $shortUrl.Trim() }
                } catch {
                    $shortUrl = $null
                } finally {
                    Pop-Location
                }
            }
        }
    }

    if ($tunnelUrl) {
        Push-Location $BackendDir
        try {
            $bannerArgs = @("-m", "app.cli_banner", "--tunnel-url", $tunnelUrl)
            if ($shortUrl) { $bannerArgs += @("--short-url", $shortUrl) }
            & $VenvPython @bannerArgs
        } finally {
            Pop-Location
        }
    } else {
        Write-Host "[!] Tunnel started, still negotiating URL (check Settings in app)." -ForegroundColor Yellow
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
