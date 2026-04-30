$ErrorActionPreference = "Stop"

$ConfigDir = Join-Path $env:USERPROFILE ".config\opencode"
$PluginDir = Join-Path $ConfigDir "plugins"
$CommandDir = Join-Path $ConfigDir "commands"
$Root = Split-Path -Parent $PSScriptRoot

New-Item -ItemType Directory -Force -Path $PluginDir | Out-Null
New-Item -ItemType Directory -Force -Path $CommandDir | Out-Null

Copy-Item -Force (Join-Path $Root "src\index.js") (Join-Path $PluginDir "bybrawe-loop.js")
Copy-Item -Force (Join-Path $Root "commands\*.md") $CommandDir

Write-Host "Installed Bybrawe OpenCode Loop plugin." -ForegroundColor Green
Write-Host "Plugin:   $PluginDir\bybrawe-loop.js"
Write-Host "Commands: $CommandDir\loop*.md"
Write-Host "Restart OpenCode, then run: /loop-status"
