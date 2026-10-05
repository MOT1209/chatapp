@echo off
setlocal
cd /d "%~dp0"

echo ==========================================================
echo   ChatApp local server setup
echo   Place this file inside the "backend" folder and run it.
echo ==========================================================
echo.

if not exist package.json (
  echo ERROR: package.json not found.
  echo Put start-server.bat inside the chatapps\backend folder, then run it again.
  pause
  exit /b 1
)

echo [1/4] Installing dependencies (first run can take a few minutes)...
call npm install || goto :fail

REM An existing .env is kept as it is: it may hold settings you changed. To start over,
REM delete backend\.env and run this file again.
if exist .env (
  echo Found an existing .env - keeping it.
  goto :haveenv
)

echo.
set "PGPW="
set "LAN_IP="
set /p PGPW=Enter the PostgreSQL password you chose during install: 
echo.
echo Optional: to open the web app from a phone on the same Wi-Fi, enter this PC's
echo address (for example 192.168.1.20). Press Enter to skip.
set /p LAN_IP=PC address: 
call npx tsx src/scripts/setup-env.ts || goto :fail
set "PGPW="
set "LAN_IP="

:haveenv
echo.
echo [2/4] Generating database client...
call npx prisma generate || goto :fail

echo [3/4] Creating database tables (database "chatapp" is created if it does not exist)...
call npx prisma migrate deploy || goto :fail

echo [4/4] Starting server on port 4000. Leave this window open.
echo If Windows asks about the firewall, click Allow.
call npm run dev
goto :end

:fail
echo.
echo Something failed above. Copy the red text and send it to Claude.
echo.
echo   Error P1000/P1001: PostgreSQL is not running, or the password is wrong.
echo                      Delete backend\.env and run this file again to re-enter it.
echo   Error P3005:       the database already has tables from an earlier setup.
echo                      Delete backend\.env and run this file again; it will use a
echo                      fresh database named "chatapp".
:end
pause
