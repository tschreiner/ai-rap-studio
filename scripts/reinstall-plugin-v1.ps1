[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$pluginName = "ai-rap-studio"
$pluginRoot = Split-Path -Parent $PSScriptRoot
$creatorRoot = Join-Path $env:USERPROFILE ".codex\skills\.system\plugin-creator"
$cachebuster = Join-Path $creatorRoot "scripts\update_plugin_cachebuster.py"
$marketplaceReader = Join-Path $creatorRoot "scripts\read_marketplace_name.py"

foreach ($requiredPath in @($cachebuster, $marketplaceReader)) {
    if (-not (Test-Path -LiteralPath $requiredPath)) {
        throw "Required development helper not found at $requiredPath"
    }
}

py -3 $cachebuster $pluginRoot
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

$marketplaceName = (py -3 $marketplaceReader).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($marketplaceName)) {
    throw "Could not determine the personal marketplace name."
}

codex plugin add "$pluginName@$marketplaceName"
exit $LASTEXITCODE
