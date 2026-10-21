@echo off
rem ==== One-click start: Blog preview + Writer (opens both pages) ====
cd /d %~dp0

rem --- blog preview on port 1313: start only if not already running ---
netstat -ano | findstr ":1313 " | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 (
    echo [Blog] already running, skip
) else (
    echo [Blog] starting...
    start "Hugo" /min "%~dp0tools\hugo.exe" server -D --port 1313
)

rem --- writer on port 1314: start only if not already running ---
netstat -ano | findstr ":1314 " | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 (
    echo [Writer] already running, skip
) else (
    echo [Writer] starting...
    start "Writer" /min powershell -ExecutionPolicy Bypass -File "%~dp0writer.ps1"
)

rem --- wait for fresh services, then open the blog homepage only ---
timeout /t 3 >nul
start http://localhost:1313

echo.
echo Done. Blog homepage opened:
echo   Blog   : http://localhost:1313   (writer button at bottom-left of page)
echo   Writer : http://127.0.0.1:1314   (still runs in background)
echo Close the two minimized black windows to stop services.
pause
