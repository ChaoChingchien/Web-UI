@echo off
cd /d "%~dp0server"
echo Starting Web-AI backend server...
npx tsx src/index.ts
pause
