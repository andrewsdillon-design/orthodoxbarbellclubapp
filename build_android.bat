@echo off
rem Build the OBC app in Expo's cloud and send it to the store. Double-click, or run from a terminal.
rem All the steps are in tools\ship.py. Extra options pass through, e.g.:  build_android.bat --no-submit
cd /d "%~dp0"
where python >nul 2>nul || (echo Install Python from https://www.python.org first. & pause & exit /b 1)
python tools\ship.py android %*
pause
