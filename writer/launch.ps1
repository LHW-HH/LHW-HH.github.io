$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$dataDir = "E:\gongzuoqu\LHWblog-writer-data"
$logDir = Join-Path $dataDir "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Test-LocalPort([int]$Port) {
    return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

if (-not (Test-LocalPort 1313)) {
    $hugo = Join-Path $root "tools\hugo.exe"
    Start-Process -FilePath $hugo `
        -ArgumentList "server", "-D", "--port", "1313" `
        -WorkingDirectory $root `
        -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logDir "hugo.log") `
        -RedirectStandardError (Join-Path $logDir "hugo-error.log")
}

if (-not (Test-LocalPort 1315)) {
    $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
    $nodePath = if ($nodeCommand) {
        $nodeCommand.Source
    } else {
        @(
            "C:\Program Files\nodejs\node.exe",
            "C:\Program Files (x86)\nodejs\node.exe",
            (Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe")
        ) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    }
    if (-not $nodePath) {
        throw "Node.js was not found. Open Codex once, then try again."
    }
    Start-Process -FilePath $nodePath `
        -ArgumentList (Join-Path $root "writer\server.mjs") `
        -WorkingDirectory $root `
        -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logDir "writer.log") `
        -RedirectStandardError (Join-Path $logDir "writer-error.log")
}

$ready = $false
for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
    Start-Sleep -Milliseconds 250
    if (Test-LocalPort 1315) {
        $ready = $true
        break
    }
}

if (-not $ready) {
    throw "Writer did not start. Check $logDir\writer-error.log"
}

Start-Process "http://127.0.0.1:1315/"
