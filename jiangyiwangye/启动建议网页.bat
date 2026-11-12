@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 星月小窝 - 建议网页

where node >nul 2>nul
if errorlevel 1 (
    echo ============================================================
    echo   没有找到 Node.js！
    echo   请先安装 Node.js 24（https://nodejs.org/zh-cn），装完再双击本文件。
    echo ============================================================
    pause
    exit /b 1
)

echo ============================================================
echo   星月小窝 · 建议网页
echo   关闭这个窗口就会停止服务
echo ============================================================
echo.
node server.js
echo.
echo 服务已停止，按任意键关闭窗口...
pause >nul
