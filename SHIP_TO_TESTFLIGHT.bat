@echo off
setlocal
rem ============================================================================================
rem  Orthodox Barbell Club app -> TestFlight, in one double-click.
rem
rem  Save this file anywhere (Desktop is fine) and double-click it. It:
rem    1. installs Git, Node.js and Python with winget if any are missing
rem    2. downloads the app to %USERPROFILE%\orthodoxbarbellclubapp (or updates it if it's there)
rem    3. checks the code, signs you in to Expo, builds the iPhone app in Expo's cloud and uploads
rem       it to App Store Connect, where it shows up under TestFlight 10-30 minutes later
rem
rem  The first run asks you to:
rem    - sign in to Expo (account dandrews91)
rem    - sign in to Apple as andrews.dillon@gmail.com and type the 6-digit code from your iPhone
rem    - answer Yes to creating the certificate and provisioning profile
rem  Later runs just build and upload.
rem ============================================================================================

set "APPDIR=%USERPROFILE%\orthodoxbarbellclubapp"
set "REPO=https://github.com/andrewsdillon-design/orthodoxbarbellclubapp.git"
rem Tools winget just installed aren't on this window's PATH yet, so add their usual homes.
set "PATH=%PATH%;%ProgramFiles%\Git\cmd;%ProgramFiles%\nodejs;%LOCALAPPDATA%\Programs\Python\Python312;%LOCALAPPDATA%\Programs\Python\Python312\Scripts;%LOCALAPPDATA%\Microsoft\WindowsApps"

echo.
echo === 1. Tools ===
call :need git  Git.Git                 || goto :failed
call :need node OpenJS.NodeJS.LTS       || goto :failed
call :need python Python.Python.3.12    || goto :failed

echo.
echo === 2. The app's code ===
if exist "%APPDIR%\.git" (
  echo Updating %APPDIR%
  git -C "%APPDIR%" pull --ff-only || echo Couldn't update; using the copy that's there.
) else (
  echo Downloading to %APPDIR%
  git clone "%REPO%" "%APPDIR%" || goto :failed
)

echo.
echo === 3. Is the website ready for the app? ===
curl -s -o nul -w "%%{http_code}" https://orthodoxbarbellclub.com/api/v1/me > "%TEMP%\obc_api.txt" 2>nul
set /p APICODE=<"%TEMP%\obc_api.txt"
if "%APICODE%"=="401" (
  echo Yes: orthodoxbarbellclub.com has the app API.
) else (
  echo Not yet: the app can't sign in until the website update ^(PR 8^) is merged and go_live menu 5 has run.
  echo The TestFlight build still works; sign-in starts working once the site is updated. Carrying on.
)

echo.
echo === 4. Build and upload to TestFlight ===
cd /d "%APPDIR%"
python tools\ship.py ios %*
if errorlevel 1 goto :failed
echo.
echo All done. Open the TestFlight app on your iPhone in 10-30 minutes; the build appears there
echo once Apple finishes processing it. App Store Connect: https://appstoreconnect.apple.com/apps
pause
exit /b 0

:need
where %1 >nul 2>nul && exit /b 0
echo Installing %2 ...
where winget >nul 2>nul || (echo winget isn't available. Install "App Installer" from the Microsoft Store, then run this again. & exit /b 1)
winget install --id %2 -e --accept-source-agreements --accept-package-agreements
where %1 >nul 2>nul && exit /b 0
echo %1 was installed, but Windows needs a new window to find it. Close this window and double-click this file again.
exit /b 1

:failed
echo.
echo Stopped. Scroll up for the reason, fix it, and double-click this file again; it picks up where it left off.
pause
exit /b 1
