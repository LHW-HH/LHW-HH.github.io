@echo off
rem ==== One-click start: blog preview + local writing desk ====
cd /d %~dp0

rem --- blog preview on port 1313: start only if not already running ---
netstat -ano | findstr ":1313 " | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 (
    echo [Blog] already running, skip
) else (
    echo [Blog] starting...
    start "Hugo" /min "%~dp0tools\hugo.exe" server -D --port 1313
)

rem --- writer on port 1315: start only if not already running ---
netstat -ano | findstr ":1315 " | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 (
    echo [Writer] already running, skip
) else (
    echo [Writer] starting...
    start "Writer" /min powershell -ExecutionPolicy Bypass -File "%~dp0writer.ps1"
)

rem --- wait for fresh services, then open the writing desk ---
timeout /t 3 >nul
start http://127.0.0.1:1315

echo.
echo Done. Writing desk opened:
echo   Writer : http://127.0.0.1:1315
echo   Blog   : http://localhost:1313
echo Close the two minimized windows to stop the local services.
pause
