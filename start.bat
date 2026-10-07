@echo off
title Electro Designer Web 3D Editor
echo ========================================================
echo   Launching Electro Designer Web 3D Editor
echo   Emulate 3-Button Mouse: Alt+LMB = Orbit, Shift+Alt+LMB = Pan
echo ========================================================
cd /d "%~dp0"
call npm.cmd run dev
pause
