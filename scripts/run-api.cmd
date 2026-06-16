@echo off
setlocal
set "ROOT=%~dp0.."
for %%I in ("%ROOT%") do set "ROOT=%%~fI"

if "%LOCAL_CRM_PGPORT%"=="" set "LOCAL_CRM_PGPORT=55432"
if "%LOCAL_CRM_DB%"=="" set "LOCAL_CRM_DB=hvac_crm"
if "%LOCAL_CRM_DBUSER%"=="" set "LOCAL_CRM_DBUSER=crm"
if "%DATABASE_URL%"=="" set "DATABASE_URL=postgres://%LOCAL_CRM_DBUSER%@127.0.0.1:%LOCAL_CRM_PGPORT%/%LOCAL_CRM_DB%"

cd /d "%ROOT%\server" || exit /b 1
npm.cmd run dev
