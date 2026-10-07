@echo off
rem Double-click to make the app walkthrough video, rendered in Blender on your graphics card.
rem Add options after it, e.g.:  make_walkthrough.bat --preview 5     or     make_walkthrough.bat --draft
cd /d "%~dp0\..\.."
where python >nul 2>nul || (echo Install Python from https://www.python.org first. & pause & exit /b 1)
where npm >nul 2>nul || (echo Install Node.js LTS from https://nodejs.org first. & pause & exit /b 1)
if exist ".venv\Scripts\python.exe" (set PY=.venv\Scripts\python.exe) else (set PY=python)
%PY% tools\walkthrough\make_walkthrough.py %*
pause
