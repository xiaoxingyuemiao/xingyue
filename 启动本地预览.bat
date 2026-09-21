@echo off
chcp 65001 >nul

rem 定位仓库根目录：本脚本放在仓库根目录、或放进 tools\ 里，都能正常工作
cd /d "%~dp0"
if not exist "index.html" if exist "..\index.html" cd /d ".."

if not exist "tools\serve.js" (
    echo.
    echo   [X] Cannot find tools\serve.js
    echo       Put this .bat in the project root folder, next to index.html.
    echo.
    pause
    exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo   [X] Node.js not found.
    echo       Install Node.js from https://nodejs.org/ and run this again.
    echo.
    pause
    exit /b 1
)

title Xingyue XiaoWo - local preview

echo.
echo   Starting local preview server...
echo   (keep this window open; press Ctrl + C to stop)
echo.

node "tools\serve.js"

echo.
echo   Server stopped.
pause
