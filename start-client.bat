@echo off
cd /d "%~dp0client"
echo Starting Web-AI frontend dev server...
npx vite --host --open
pause
