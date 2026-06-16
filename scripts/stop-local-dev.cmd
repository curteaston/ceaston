@echo off
setlocal EnableExtensions

set "ROOT=%~dp0.."
for %%I in ("%ROOT%") do set "ROOT=%%~fI"

if "%LOCAL_CRM_PGPORT%"=="" set "LOCAL_CRM_PGPORT=55432"
if "%LOCAL_CRM_API_PORT%"=="" set "LOCAL_CRM_API_PORT=3001"
if "%LOCAL_CRM_UI_PORT%"=="" set "LOCAL_CRM_UI_PORT=5173"
if "%LOCAL_CRM_PGDATA%"=="" set "LOCAL_CRM_PGDATA=%ROOT%\.local\pgdata"
if "%PG_BIN%"=="" set "PG_BIN=C:\Program Files\PostgreSQL\18\bin"

call :kill_port %LOCAL_CRM_UI_PORT%
call :kill_port %LOCAL_CRM_API_PORT%

if exist "%LOCAL_CRM_PGDATA%\PG_VERSION" if exist "%PG_BIN%\pg_ctl.exe" (
  "%PG_BIN%\pg_ctl.exe" -D "%LOCAL_CRM_PGDATA%" status >nul 2>nul
  if not errorlevel 1 (
    echo Stopping local Postgres...
    "%PG_BIN%\pg_ctl.exe" -D "%LOCAL_CRM_PGDATA%" stop -m fast
  )
)

echo Local dev stop requested.
exit /b 0

:kill_port
set "KILLED_PIDS="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%~1 .*LISTENING"') do (
  call :kill_pid %%P %~1
)
exit /b 0

:kill_pid
echo %KILLED_PIDS% | findstr /C:" %~1 " >nul
if not errorlevel 1 exit /b 0
set "KILLED_PIDS=%KILLED_PIDS% %~1 "
echo Stopping process %~1 on port %~2...
taskkill /PID %~1 /T /F >nul 2>nul
exit /b 0
