# Sync reference/ clones via HTTP proxy (default 127.0.0.1:10808).
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/sync-reference-repos.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/sync-reference-repos.ps1 -Pull
#   pwsh -File scripts/sync-reference-repos.ps1 -ProxyPort 10808

param(
    [int]$ProxyPort = 10808,
    [switch]$Pull
)

$ErrorActionPreference = "Stop"
$proxy = "http://127.0.0.1:$ProxyPort"
$env:HTTP_PROXY = $proxy
$env:HTTPS_PROXY = $proxy
$env:ALL_PROXY = "socks5://127.0.0.1:$ProxyPort"

$gitProxy = @("-c", "http.proxy=$proxy", "-c", "https.proxy=$proxy")
$root = Split-Path $PSScriptRoot -Parent
$refRoot = Join-Path $root "reference"
$reportPath = Join-Path $refRoot ".sync-report.json"
$stamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssK")

function Sync-Repo {
    param([string]$Path, [string]$Kind)

    $name = Split-Path $Path -Leaf
    if (-not (Test-Path (Join-Path $Path ".git"))) {
        return [PSCustomObject]@{
            name = $name; kind = $Kind; status = "skip"; branch = $null
            local = $null; remote = $null; behind = $null; ahead = $null
            error = "not a git repo"
        }
    }

    Push-Location $Path
    try {
        $branch = git branch --show-current 2>$null
        if (-not $branch) { $branch = "HEAD" }

        $fetch = & git @gitProxy fetch origin --prune --tags 2>&1 | Out-String
        if ($LASTEXITCODE -ne 0) {
            return [PSCustomObject]@{
                name = $name; kind = $Kind; status = "fetch_failed"; branch = $branch
                local = (git rev-parse --short HEAD 2>$null); remote = $null
                behind = $null; ahead = $null; error = $fetch.Trim()
            }
        }

        $local = git rev-parse --short HEAD
        $remoteRef = "origin/$branch"
        if (-not (git rev-parse --verify $remoteRef 2>$null)) {
            $remoteRef = "origin/HEAD"
        }
        $remote = git rev-parse --short $remoteRef
        $behind = [int](git rev-list --count "HEAD..$remoteRef" 2>$null)
        $ahead = [int](git rev-list --count "$remoteRef..HEAD" 2>$null)
        $pulled = $false

        if ($Pull -and $behind -gt 0 -and $ahead -eq 0) {
            $pullOut = & git @gitProxy pull --ff-only 2>&1 | Out-String
            if ($LASTEXITCODE -eq 0) {
                $pulled = $true
                $local = git rev-parse --short HEAD
                $behind = 0
            } else {
                return [PSCustomObject]@{
                    name = $name; kind = $Kind; status = "pull_failed"; branch = $branch
                    local = $local; remote = $remote; behind = $behind; ahead = $ahead
                    error = $pullOut.Trim()
                }
            }
        }

        [PSCustomObject]@{
            name = $name; kind = $Kind
            status = if ($pulled) { "pulled" } elseif ($behind -gt 0) { "behind" } else { "ok" }
            branch = $branch; local = $local; remote = $remote
            behind = $behind; ahead = $ahead; error = $null
        }
    } finally {
        Pop-Location
    }
}

$repos = @()
$harness = Join-Path $refRoot "deepseek-harness"
if (Test-Path $harness) { $repos += Sync-Repo -Path $harness -Kind "upstream" }

$desktops = Join-Path $refRoot "desktops"
if (Test-Path $desktops) {
    Get-ChildItem $desktops -Directory | ForEach-Object {
        $repos += Sync-Repo -Path $_.FullName -Kind "desktop"
    }
}

$report = @{
    synced_at = $stamp
    proxy = $proxy
    pull = [bool]$Pull
    repos = @($repos | ForEach-Object {
        @{
            name = $_.name; kind = $_.kind; status = $_.status
            branch = $_.branch; local = $_.local; remote = $_.remote
            behind = $_.behind; ahead = $_.ahead; error = $_.error
        }
    })
}
$report | ConvertTo-Json -Depth 5 | Set-Content -Path $reportPath -Encoding utf8

Write-Host "`n=== reference sync @ $stamp ===" -ForegroundColor Cyan
Write-Host "proxy: $proxy`n"
$repos | Sort-Object status, name | Format-Table name, kind, status, behind, ahead, branch, local, remote -AutoSize

$behindCount = @($repos | Where-Object { $_.behind -gt 0 }).Count
$failCount = @($repos | Where-Object { $_.status -match "failed" }).Count
Write-Host "behind: $behindCount | failed: $failCount | report: $reportPath`n"

if ($failCount -gt 0) { exit 1 }
exit 0
