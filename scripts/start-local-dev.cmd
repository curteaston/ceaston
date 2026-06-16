@echo off
setlocal EnableExtensions

set "ROOT=%~dp0.."
for %%I in ("%ROOT%") do set "ROOT=%%~fI"

if "%LOCAL_CRM_PGPORT%"=="" set "LOCAL_CRM_PGPORT=55432"
if "%LOCAL_CRM_DB%"=="" set "LOCAL_CRM_DB=hvac_crm"
if "%LOCAL_CRM_DBUSER%"=="" set "LOCAL_CRM_DBUSER=crm"
if "%LOCAL_CRM_PGDATA%"=="" set "LOCAL_CRM_PGDATA=%ROOT%\.local\pgdata"
if "%PG_BIN%"=="" set "PG_BIN=C:\Program Files\PostgreSQL\18\bin"
if not "%LOCAL_CRM_PGPASSWORD%"=="" set "PGPASSWORD=%LOCAL_CRM_PGPASSWORD%"

if not exist "%ROOT%\.local\logs" mkdir "%ROOT%\.local\logs"

if not "%DATABASE_URL%"=="" (
  echo Using DATABASE_URL from environment.
  goto services_ready
)

set "DATABASE_URL=postgres://%LOCAL_CRM_DBUSER%@127.0.0.1:%LOCAL_CRM_PGPORT%/%LOCAL_CRM_DB%"
call :find_tool psql.exe PSQL

if not defined PSQL (
  echo Could not find psql.exe.
  echo Install PostgreSQL, add psql.exe to PATH, set PG_BIN, or set DATABASE_URL to an existing database.
  exit /b 1
)

call :database_ready
if not errorlevel 1 (
  echo Using existing Postgres database %LOCAL_CRM_DB% on 127.0.0.1:%LOCAL_CRM_PGPORT%.
  goto services_ready
)

call :postgres_server_ready
if errorlevel 1 (
  call :start_private_postgres
  if errorlevel 1 exit /b 1
)

call :ensure_database
if errorlevel 1 exit /b 1

call :database_ready
if errorlevel 1 (
  echo Could not connect to database %LOCAL_CRM_DB% after setup.
  echo Run: npm run doctor
  exit /b 1
)

:services_ready
call :port_in_use 3001
if errorlevel 1 (
  echo Starting API on http://localhost:3001
  start "HVAC CRM API" /min cmd.exe /k ""%ROOT%\scripts\run-api.cmd""
  node "%ROOT%\scripts\wait-for-url.mjs" http://localhost:3001/api/health 30000
  if errorlevel 1 (
    echo API did not become healthy. Check "%ROOT%\.local\logs" and the HVAC CRM API window.
    exit /b 1
  )
  call :short_pause
  node "%ROOT%\scripts\wait-for-url.mjs" http://localhost:3001/api/health 5000
  if errorlevel 1 (
    echo API became unreachable shortly after startup.
    exit /b 1
  )
) else (
  echo Port 3001 is already in use. Verifying it is the CRM API...
  node "%ROOT%\scripts\wait-for-url.mjs" http://localhost:3001/api/health 5000
  if errorlevel 1 (
    echo Port 3001 is occupied, but it is not responding like the CRM API.
    echo Run: npm run dev:local:stop
    exit /b 1
  )
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
  node "%ROOT%\scripts\wait-for-url.mjs" http://localhost:5173 30000
  if errorlevel 1 (
    echo Client did not become ready. Check the HVAC CRM Client window.
    exit /b 1
  )
  call :short_pause
  node "%ROOT%\scripts\wait-for-url.mjs" http://localhost:5173 5000
  if errorlevel 1 (
    echo Client became unreachable shortly after startup.
    echo Use npm run start:local for the single-port viewing path, or check the HVAC CRM Client window.
    exit /b 1
  )
) else (
  echo Port 5173 is already in use. Verifying it is serving the CRM client...
  node "%ROOT%\scripts\wait-for-url.mjs" http://localhost:5173 5000
  if errorlevel 1 (
    echo Port 5173 is occupied, but it is not serving a reachable client.
    echo Run: npm run dev:local:stop
    exit /b 1
  )
)

echo.
echo Local dev is ready.
echo Run: npm run dev:local:check
echo Open: http://localhost:5173
exit /b 0

:find_tool
set "%~2="
if exist "%PG_BIN%\%~1" set "%~2=%PG_BIN%\%~1"
if defined %~2 exit /b 0
for /f "delims=" %%P in ('where %~1 2^>nul') do if not defined %~2 set "%~2=%%P"
exit /b 0

:database_ready
"%PSQL%" -h 127.0.0.1 -p %LOCAL_CRM_PGPORT% -U "%LOCAL_CRM_DBUSER%" -d "%LOCAL_CRM_DB%" -tAc "SELECT 1" 2>nul | findstr /C:"1" >nul
exit /b %errorlevel%

:postgres_server_ready
"%PSQL%" -h 127.0.0.1 -p %LOCAL_CRM_PGPORT% -U "%LOCAL_CRM_DBUSER%" -d postgres -tAc "SELECT 1" 2>nul | findstr /C:"1" >nul
exit /b %errorlevel%

:ensure_database
"%PSQL%" -h 127.0.0.1 -p %LOCAL_CRM_PGPORT% -U "%LOCAL_CRM_DBUSER%" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='%LOCAL_CRM_DB%'" 2>nul | findstr /C:"1" >nul
if not errorlevel 1 exit /b 0
echo Creating database %LOCAL_CRM_DB%...
"%PSQL%" -h 127.0.0.1 -p %LOCAL_CRM_PGPORT% -U "%LOCAL_CRM_DBUSER%" -d postgres -c "CREATE DATABASE %LOCAL_CRM_DB%"
exit /b %errorlevel%

:start_private_postgres
call :find_tool pg_ctl.exe PG_CTL
call :find_tool initdb.exe INITDB
if not defined PG_CTL (
  echo Could not connect to Postgres on 127.0.0.1:%LOCAL_CRM_PGPORT%, and pg_ctl.exe was not found.
  echo Set PG_BIN or DATABASE_URL, then rerun npm run dev:local.
  exit /b 1
)
if not defined INITDB (
  echo Could not connect to Postgres on 127.0.0.1:%LOCAL_CRM_PGPORT%, and initdb.exe was not found.
  echo Set PG_BIN or DATABASE_URL, then rerun npm run dev:local.
  exit /b 1
)
if not exist "%LOCAL_CRM_PGDATA%\PG_VERSION" (
  echo Initializing local Postgres data directory: %LOCAL_CRM_PGDATA%
  "%INITDB%" -D "%LOCAL_CRM_PGDATA%" -A trust -U "%LOCAL_CRM_DBUSER%"
  if errorlevel 1 (
    if not exist "%LOCAL_CRM_PGDATA%\PG_VERSION" (
      echo Could not initialize workspace-owned Postgres data.
      echo Run: npm run doctor
      echo Or set DATABASE_URL to an existing Postgres database and rerun npm run dev:local.
      exit /b 1
    )
    echo initdb returned a non-zero code after creating PG_VERSION; continuing.
  )
)
"%PG_CTL%" -D "%LOCAL_CRM_PGDATA%" status >nul 2>nul
if errorlevel 1 (
  echo Starting local Postgres on port %LOCAL_CRM_PGPORT%...
  "%PG_CTL%" -D "%LOCAL_CRM_PGDATA%" -o "-p %LOCAL_CRM_PGPORT%" -l "%ROOT%\.local\logs\postgres.log" start
  if errorlevel 1 exit /b 1
) else (
  echo Workspace Postgres is already running.
)
exit /b 0

:port_in_use
netstat -ano | findstr /R /C:":%~1 .*LISTENING" >nul
exit /b %errorlevel%

:short_pause
ping -n 8 127.0.0.1 >nul
exit /b 0
