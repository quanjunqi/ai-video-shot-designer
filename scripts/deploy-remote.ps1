# =============================================================================
# 本地一键部署：把远程服务器上的代码同步到指定 commit 并重启服务
#
# 用法（仓库根目录）：
#   scripts\deploy-remote.cmd                      # 部署 origin/develop
#   scripts\deploy-remote.cmd -Push                # push 当前分支并部署它
#   scripts\deploy-remote.cmd -Ref origin/master   # 指定 ref
#   scripts\deploy-remote.cmd -Force               # 同一 commit 也重建
#   scripts\deploy-remote.cmd -DryRun              # 只看看会部署哪个 commit
#
# 它做三件事：
#   1.（-Push 时）git push 当前分支，推送失败立即中止
#   2. ssh 到服务器执行 /usr/local/bin/shotdesigner-deploy <ref>
#   3. 校验「服务器实际部署的 commit == 本地期望的 commit」，不一致就报错
#      —— 防止「push 没生效却以为部署成功了」这类假成功
#
# 认证：已配好 SSH 公钥（见 docs/how-to/deploy-server.md）；换机器需重装。
# =============================================================================
[CmdletBinding()]
param(
    [string]$Server = "root@120.25.150.72",
    [string]$Ref = "",
    [switch]$Push,
    [switch]$Force,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$repoRoot = (& git rev-parse --show-toplevel 2>$null)
if (-not $repoRoot) { throw "not inside a git repository" }
Set-Location $repoRoot

$remoteScript = "/usr/local/bin/shotdesigner-deploy"

$currentBranch = (& git rev-parse --abbrev-ref HEAD).Trim()

if ($Push) {
    if ($currentBranch -eq "HEAD") { throw "detached HEAD: specify a branch before pushing" }
    Write-Host "==> git push origin $currentBranch" -ForegroundColor Cyan
    & git push origin $currentBranch
    if ($LASTEXITCODE -ne 0) { throw "git push failed; aborting (server would deploy stale code)" }
}

# 未显式指定 -Ref 时：-Push 就部署刚推的分支，否则部署 origin/develop
if (-not $Ref) {
    if ($Push -and $currentBranch -ne "HEAD") { $Ref = "origin/$currentBranch" }
    else { $Ref = "origin/develop" }
}
Write-Host "==> target ref: $Ref" -ForegroundColor Cyan

$expected = (& git rev-parse --verify --quiet $Ref 2>$null)
if ($expected) { $expected = $expected.Trim() }

$remoteArgs = "bash $remoteScript $Ref"
if ($Force)  { $remoteArgs += " --force" }
if ($DryRun) { $remoteArgs += " --dry-run" }

Write-Host "==> ssh $Server `"$remoteArgs`"" -ForegroundColor Cyan
$output = & ssh -o ConnectTimeout=15 $Server $remoteArgs 2>&1
$exit = $LASTEXITCODE
$output | ForEach-Object { Write-Host $_ }

if ($exit -ne 0) { throw "remote deploy failed (exit $exit)" }

if ($DryRun) {
    Write-Host "dry-run: nothing was deployed" -ForegroundColor Yellow
    exit 0
}

$deployed = $null
foreach ($line in $output) {
    if ("$line" -match '^DEPLOYED_SHA=([0-9a-f]{40})') { $deployed = $Matches[1] }
}

if (-not $deployed) {
    Write-Host "!! could not read DEPLOYED_SHA from remote output" -ForegroundColor Yellow
    exit 1
}

if ($expected -and $deployed -ne $expected) {
    Write-Host "!! deployed commit ($($deployed.Substring(0,7))) != local $Ref ($($expected.Substring(0,7)))" -ForegroundColor Red
    Write-Host "   the server is NOT running what you think it is" -ForegroundColor Red
    exit 1
}

Write-Host "OK  deployed $($deployed.Substring(0,7)) ($Ref)" -ForegroundColor Green
