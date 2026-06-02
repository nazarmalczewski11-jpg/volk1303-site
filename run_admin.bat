@echo off
title VOLK 1303 - Dedicated Local Server Launcher
echo ===================================================
echo   VOLK 1303 - LOCAL SERVER AND ADMIN CONSOLE       
echo ===================================================
echo.
echo [SYSTEM] Starting database and static server...
start "VOLK 1303 Database Server" cmd /c "node server.js"
echo [SYSTEM] Launching Back-Office Control Center...
timeout /t 2 >nul
start "" "http://localhost:10000/admin.html"
exit
