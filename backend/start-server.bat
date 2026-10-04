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

set /p PGPW=Enter the PostgreSQL password you chose during install: 

> .env (
  echo NODE_ENV=development
  echo PORT=4000
  echo CORS_ORIGIN=http://192.168.2.113:5173,http://localhost:5173
  echo DATABASE_URL=postgresql://postgres:%PGPW%@localhost:5432/postgres?schema=public
  echo JWT_ACCESS_SECRET=dev-access-secret-change-me-0123456789abcd
  echo JWT_REFRESH_SECRET=dev-refresh-secret-change-me-9876543210wxyz
  echo JWT_ACCESS_TTL=15m
  echo JWT_REFRESH_TTL=30d
  echo BCRYPT_ROUNDS=10
)

echo.
echo [1/4] Installing dependencies (first run can take a few minutes)...
call npm install || goto :fail

echo [2/4] Generating database client...
call npx prisma generate || goto :fail

echo [3/4] Creating database tables...
call npx prisma migrate deploy || goto :fail

echo [4/4] Starting server on port 4000. Leave this window open.
echo If Windows asks about the firewall, click Allow.
call npm run dev
goto :end

:fail
echo.
echo Something failed above. Copy the red text and send it to Claude.
:end
pause
