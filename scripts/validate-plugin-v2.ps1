[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$pluginRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$manifestPath = Join-Path $pluginRoot ".codex-plugin\plugin.json"
$officialValidator = Join-Path $env:USERPROFILE ".codex\skills\.system\plugin-creator\scripts\validate_plugin.py"

if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw "Plugin manifest not found at $manifestPath"
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.name -ne "ai-rap-studio") {
    throw "Unexpected plugin name: $($manifest.name)"
}
if (-not $manifest.version) {
    throw "Plugin version is required."
}
if ($manifest.skills -ne "./skills/") {
    throw "Manifest skills path must be ./skills/."
}

$skillsRoot = Join-Path $pluginRoot "skills"
$skillDirectories = @(Get-ChildItem -LiteralPath $skillsRoot -Directory)
if ($skillDirectories.Count -lt 1) {
    throw "At least one skill is required."
}

foreach ($directory in $skillDirectories) {
    $skillPath = Join-Path $directory.FullName "SKILL.md"
    $metadataPath = Join-Path $directory.FullName "agents\openai.yaml"
    if (-not (Test-Path -LiteralPath $skillPath -PathType Leaf)) {
        throw "Missing SKILL.md in $($directory.FullName)"
    }
    if (-not (Test-Path -LiteralPath $metadataPath -PathType Leaf)) {
        throw "Missing agents/openai.yaml in $($directory.FullName)"
    }
    $content = Get-Content -LiteralPath $skillPath -Raw
    $frontmatter = [regex]::Match(
        $content,
        "\A---\r?\nname:\s*([a-z0-9-]+)\r?\ndescription:\s*(.+?)\r?\n---\r?\n",
        [System.Text.RegularExpressions.RegexOptions]::Singleline
    )
    if (-not $frontmatter.Success) {
        throw "Invalid skill frontmatter in $skillPath"
    }
    if ($frontmatter.Groups[1].Value -ne $directory.Name) {
        throw "Skill name does not match directory: $skillPath"
    }
    if ([string]::IsNullOrWhiteSpace($frontmatter.Groups[2].Value)) {
        throw "Skill description is empty: $skillPath"
    }
}

if (Test-Path -LiteralPath $officialValidator -PathType Leaf) {
    $pythonLauncher = Get-Command py -ErrorAction SilentlyContinue
    if ($pythonLauncher) {
        & $pythonLauncher.Source -3 $officialValidator $pluginRoot
    } else {
        & python $officialValidator $pluginRoot
    }
    if ($LASTEXITCODE -ne 0) {
        throw "Official plugin validation failed with exit code $LASTEXITCODE."
    }
    Write-Host "Official Codex validator passed."
} else {
    Write-Host "Official Codex validator unavailable; portable structural validation passed."
}

Write-Host "Plugin validation passed: $pluginRoot"
