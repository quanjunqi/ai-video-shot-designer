@echo off
rem ===========================================================================
rem  本地一键部署（Windows 包装器）
rem
rem  为什么需要它：默认 PowerShell 执行策略可能是 Restricted/AllSigned，
rem  直接双击或在 PowerShell 里跑 deploy-remote.ps1 会被拒绝。
rem  这个包装器用 -ExecutionPolicy Bypass 只对本次调用放行。
rem
rem  用法：
rem    scripts\deploy-remote.cmd                      部署 origin/develop
rem    scripts\deploy-remote.cmd -Ref origin/master   部署 master
rem    scripts\deploy-remote.cmd -Push                先 push 再部署
rem    scripts\deploy-remote.cmd -Force -DryRun       其他参数原样透传
rem ===========================================================================
setlocal
set "PS=pwsh"
where pwsh >nul 2>nul || set "PS=powershell"
"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-remote.ps1" %*
exit /b %ERRORLEVEL%
