@echo off
chcp 65001 >nul
cd /d "%~dp0.."
title Xingyue XiaoWo - local preview

where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo   [X] Node.js not found.
    echo       Install Node.js from https://nodejs.org/ and run this again.
    echo.
    pause
    exit /b 1
)

echo.
echo   Starting local preview server...
echo   (keep this window open; press Ctrl + C to stop)
echo.

node "tools\serve.js"

echo.
echo   Server stopped.
pause
