[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$pluginRoot = Split-Path -Parent $PSScriptRoot
$validator = Join-Path $env:USERPROFILE ".codex\skills\.system\plugin-creator\scripts\validate_plugin.py"
$skillValidator = Join-Path $env:USERPROFILE ".codex\skills\.system\skill-creator\scripts\quick_validate.py"
$skillRoot = Join-Path $pluginRoot "skills\ai-rap-studio"

if (-not (Test-Path -LiteralPath $validator)) {
    throw "Plugin validator not found at $validator"
}

if (-not (Test-Path -LiteralPath $skillValidator)) {
    throw "Skill validator not found at $skillValidator"
}

py -3 $skillValidator $skillRoot
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

py -3 $validator $pluginRoot
exit $LASTEXITCODE
