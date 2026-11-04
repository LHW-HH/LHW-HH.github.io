$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$server = Join-Path $root "writer\server.mjs"

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) {
    $nodeCommand.Source
} else {
    $fallbacks = @(
        "C:\Program Files\nodejs\node.exe",
        "C:\Program Files (x86)\nodejs\node.exe",
        (Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe")
    )
    $fallbacks | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}

if (-not $nodePath) {
    throw "Node.js was not found."
}

Set-Location $root
& $nodePath $server
