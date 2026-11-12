@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Xingyue Jiangyi - Local Server

where node >nul 2>nul
if errorlevel 1 (
    echo ============================================================
    echo   Node.js not found!
    echo   Please install Node.js 24 from https://nodejs.org/
    echo   Then double-click this file again.
    echo ============================================================
    pause
    exit /b 1
)

echo ============================================================
echo   Xingyue Jiangyi - Local Server
echo   Close this window to stop the server.
echo ============================================================
echo.
node server.js
echo.
echo Server stopped. Press any key to close this window.
pause >nul
