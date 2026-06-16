@echo off
setlocal EnableExtensions

set "ROOT=%~dp0.."
for %%I in ("%ROOT%") do set "ROOT=%%~fI"

if "%LOCAL_CRM_PGPORT%"=="" set "LOCAL_CRM_PGPORT=55432"
if "%LOCAL_CRM_DB%"=="" set "LOCAL_CRM_DB=hvac_crm"
if "%LOCAL_CRM_DBUSER%"=="" set "LOCAL_CRM_DBUSER=crm"
if "%LOCAL_CRM_PGDATA%"=="" set "LOCAL_CRM_PGDATA=%ROOT%\.local\pgdata"
if "%PG_BIN%"=="" set "PG_BIN=C:\Program Files\PostgreSQL\18\bin"

if not exist "%PG_BIN%\pg_ctl.exe" (
  echo Could not find pg_ctl.exe in "%PG_BIN%".
  echo Set PG_BIN to your PostgreSQL bin directory, then run this command again.
  exit /b 1
)

if not exist "%ROOT%\.local\logs" mkdir "%ROOT%\.local\logs"

if not exist "%LOCAL_CRM_PGDATA%\PG_VERSION" (
  echo Initializing local Postgres data directory: %LOCAL_CRM_PGDATA%
  "%PG_BIN%\initdb.exe" -D "%LOCAL_CRM_PGDATA%" -A trust -U "%LOCAL_CRM_DBUSER%"
  if errorlevel 1 (
    if not exist "%LOCAL_CRM_PGDATA%\PG_VERSION" exit /b 1
    echo initdb returned a non-zero code after creating PG_VERSION; continuing.
  )
)

"%PG_BIN%\pg_ctl.exe" -D "%LOCAL_CRM_PGDATA%" status >nul 2>nul
if errorlevel 1 (
  echo Starting local Postgres on port %LOCAL_CRM_PGPORT%...
  "%PG_BIN%\pg_ctl.exe" -D "%LOCAL_CRM_PGDATA%" -o "-p %LOCAL_CRM_PGPORT%" -l "%ROOT%\.local\logs\postgres.log" start
  if errorlevel 1 exit /b 1
) else (
  echo Local Postgres is already running.
)

"%PG_BIN%\psql.exe" -h 127.0.0.1 -p %LOCAL_CRM_PGPORT% -U "%LOCAL_CRM_DBUSER%" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='%LOCAL_CRM_DB%'" | findstr /C:"1" >nul
if errorlevel 1 (
  echo Creating database %LOCAL_CRM_DB%...
  "%PG_BIN%\createdb.exe" -h 127.0.0.1 -p %LOCAL_CRM_PGPORT% -U "%LOCAL_CRM_DBUSER%" "%LOCAL_CRM_DB%"
  if errorlevel 1 exit /b 1
)

call :port_in_use 3001
if errorlevel 1 (
  echo Starting API on http://localhost:3001
  start "HVAC CRM API" /min cmd.exe /k ""%ROOT%\scripts\run-api.cmd""
) else (
  echo Port 3001 is already in use. Run npm run dev:local:check to verify it is the right API.
)

if not "%LOCAL_CRM_SEED%"=="0" (
  echo Checking local demo data...
  node "%ROOT%\scripts\seed-local-if-empty.mjs"
  if errorlevel 1 exit /b 1
)

call :port_in_use 5173
if errorlevel 1 (
  echo Starting client on http://localhost:5173
  start "HVAC CRM Client" /min cmd.exe /k ""%ROOT%\scripts\run-client.cmd""
) else (
  echo Port 5173 is already in use.
)

echo.
echo Local dev startup requested.
echo Run: npm run dev:local:check
echo Open: http://localhost:5173
exit /b 0

:port_in_use
netstat -ano | findstr /R /C:":%~1 .*LISTENING" >nul
exit /b %errorlevel%
