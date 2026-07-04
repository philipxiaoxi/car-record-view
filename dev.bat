@echo off
cd /d "%~dp0"

echo 正在启动服务...

start "car-record-server" cmd /c "cd server && npm run dev"
start "car-record-web" cmd /c "cd web && npm run dev"

echo.
echo 前后端已启动：
echo   Server: http://localhost:7001
echo   Web:    http://localhost:3000
echo.
echo 按任意键关闭所有服务...
pause >nul

echo 正在关闭服务...
taskkill /f /fi "WINDOWTITLE eq car-record-server" >nul 2>&1
taskkill /f /fi "WINDOWTITLE eq car-record-web" >nul 2>&1
echo 已关闭。
