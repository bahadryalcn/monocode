<#
.SYNOPSIS
  Fetches `upstream` and shows how far the current branch is behind
  upstream/main. Merges only when you pass -Merge and the working tree is clean.

.DESCRIPTION
  Without -Merge this only fetches and reports (no merge, no checkout).
  With -Merge it runs `git merge upstream/main` on the current branch, which
  must be `main` (override with -Branch). It stops with a message on a dirty
  tree or on merge conflicts; resolve the conflicts yourself and commit, or run
  `git merge --abort` to go back.

.EXAMPLE
  pwsh scripts/sync-upstream.ps1          # report only
  pwsh scripts/sync-upstream.ps1 -Merge   # report, then merge if clean
#>
[CmdletBinding()]
param(
  [switch] $Merge,
  [string] $Branch = 'main'
)

$ErrorActionPreference = 'Stop'

function Invoke-Git {
  & git @args
  if ($LASTEXITCODE -ne 0) { throw "git $($args -join ' ') failed (exit $LASTEXITCODE)." }
}

$root = (& git rev-parse --show-toplevel) 2>$null
if ($LASTEXITCODE -ne 0) { throw 'Not inside a git repository.' }
Set-Location $root

& git remote get-url upstream *> $null
if ($LASTEXITCODE -ne 0) {
  throw "No 'upstream' remote. Add it: git remote add upstream https://github.com/hardbeat920/monocode.git"
}

Invoke-Git fetch upstream

$current = (& git rev-parse --abbrev-ref HEAD).Trim()
$behind = [int](& git rev-list --count "HEAD..upstream/main")
$ahead = [int](& git rev-list --count "upstream/main..HEAD")
Write-Host "Branch '$current' is $behind commit(s) behind and $ahead ahead of upstream/main."

if ($behind -eq 0) {
  Write-Host 'Already up to date with upstream/main.'
  return
}

Write-Host "`nIncoming from upstream/main:"
Invoke-Git log --oneline --no-decorate -n 30 "HEAD..upstream/main"
if ($behind -gt 30) { Write-Host "... and $($behind - 30) more." }

if (-not $Merge) {
  Write-Host "`nReport only. Re-run with -Merge to merge upstream/main into '$current'."
  return
}

if ($current -ne $Branch) {
  throw "Current branch is '$current', expected '$Branch'. Switch yourself or pass -Branch."
}

$dirty = & git status --porcelain
if ($dirty) {
  Write-Host ($dirty -join "`n")
  throw 'Working tree is not clean. Commit or shelve your changes first; nothing was merged.'
}

& git merge upstream/main
if ($LASTEXITCODE -ne 0) {
  Write-Host "`nMerge stopped with conflicts in:" -ForegroundColor Yellow
  & git diff --name-only --diff-filter=U
  throw "Resolve the conflicts and commit, or run 'git merge --abort' to undo."
}
Write-Host "`nMerged upstream/main into '$current'."
