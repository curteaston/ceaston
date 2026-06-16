@echo off
setlocal
set "ROOT=%~dp0.."
for %%I in ("%ROOT%") do set "ROOT=%%~fI"

cd /d "%ROOT%\client" || exit /b 1
npm.cmd run dev -- --host 127.0.0.1
