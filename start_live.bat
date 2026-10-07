@echo off
rem Run the app in Expo Go against the real API. Pass a base URL to use another server, e.g. your PC
rem running the site:  start_live.bat http://192.168.1.20:5000/api/v1
rem (start the site with: python scripts\run_dev.py, in the orthodoxbarbellclub website repo)
cd /d "%~dp0"
if not exist node_modules call npm install
set EXPO_PUBLIC_API_MODE=live
if not "%~1"=="" set EXPO_PUBLIC_API_BASE=%~1
call npx expo start --clear
