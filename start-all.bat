@echo off
cd /d "%~dp0"

:: 端口配置（修改前请确认无冲突）
set WEB_AI_PORT=3001
set WEB_AI_CLIENT_PORT=5199

echo Cleaning up old processes on ports %WEB_AI_PORT% and %WEB_AI_CLIENT_PORT%...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%WEB_AI_PORT% " ^| findstr "LISTENING"') do (
    echo Killing PID %%a on port %WEB_AI_PORT%...
    taskkill /PID %%a /F >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%WEB_AI_CLIENT_PORT% " ^| findstr "LISTENING"') do (
    echo Killing PID %%a on port %WEB_AI_CLIENT_PORT%...
    taskkill /PID %%a /F >nul 2>&1
)

echo Starting Web-AI (Frontend + Backend)...
start "Web-AI Server" cmd /c "cd /d server && npm run dev"
timeout /t 2 /nobreak >nul
start "Web-AI Client" cmd /c "cd /d client && npm run dev"
echo.
echo Server: http://localhost:%WEB_AI_PORT%
echo Client: http://localhost:%WEB_AI_CLIENT_PORT%
echo.
echo Close this window to stop both services.
pause
