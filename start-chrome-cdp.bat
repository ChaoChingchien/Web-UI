@echo off
title Web-AI Chrome (CDP 模式)
echo 正在启动 Chrome（远程调试模式）...
echo 此浏览器打开后，Web-AI 可以读取您的登录状态
echo.

:: 查找 Chrome 安装路径
set "chrome="
if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "chrome=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "chrome=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "chrome=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"

if not defined chrome (
    echo 未找到 Chrome，请确保已安装 Google Chrome
    pause
    exit /b 1
)

:: 启动 Chrome 并启用远程调试（使用独立的用户数据目录，避免影响您的默认 Chrome）
set "data_dir=%APPDATA%\web-ai\browser-data\chrome-profile"
"%chrome%" --remote-debugging-port=9222 --user-data-dir="%data_dir%" --no-first-run --disable-default-apps

echo.
echo Chrome 已退出。
pause
