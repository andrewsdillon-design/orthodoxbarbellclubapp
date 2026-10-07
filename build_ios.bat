@echo off
rem Build the iPhone app in Expo's cloud and send it to App Store Connect. No Mac or Xcode needed.
rem Run from the repo folder by double-clicking or from a terminal:  build_ios.bat
rem First time: it signs you in to Expo, links the project, and asks for your Apple ID so EAS can
rem make the signing certificate and provisioning profile for you (say yes to each).
setlocal
cd /d "%~dp0"

rem Build with YOUR Apple developer team, never someone else's (e.g. a team you're on for another app).
rem APPLE_ID is the Apple ID you enrolled with. APPLE_TEAM_ID is the 10-character Team ID from
rem https://developer.apple.com/account -> Membership details. Leave it blank and EAS asks you to pick.
rem Your team is "Dillon REA Andrews (Individual)" - if EAS asks, pick that one, not Ron Seitz's.
set APPLE_ID=dillonleon@me.com
set APPLE_TEAM_ID=GA9A5J9A44
set EXPO_APPLE_ID=%APPLE_ID%
if not "%APPLE_TEAM_ID%"=="" set EXPO_APPLE_TEAM_ID=%APPLE_TEAM_ID%

where node >nul 2>nul || (echo Install Node.js LTS from https://nodejs.org first. & exit /b 1)

echo.
echo === 1/5  Installing packages ===
call npm install || exit /b 1

echo.
echo === 2/5  Checks: TypeScript, tests, Expo doctor ===
call npx tsc --noEmit || (echo TypeScript errors - fix them before building. & exit /b 1)
call npx jest || (echo Tests failed - fix them before building. & exit /b 1)
call npx expo-doctor || echo (doctor warnings above - read them, then carry on)

echo.
echo === 3/5  Expo account ===
call npx eas-cli@latest whoami >nul 2>nul || call npx eas-cli@latest login || exit /b 1
findstr /c:"EAS_PROJECT_ID = process.env.EAS_PROJECT_ID || '';" app.config.ts >nul && (
  echo Linking this app to your Expo account. Copy the project ID it prints into app.config.ts
  echo ^(the EAS_PROJECT_ID line^), save, and run build_ios.bat again.
  call npx eas-cli@latest init
  exit /b 0
)

echo.
echo === 4/5  Building for iPhone in the cloud (about 15-25 minutes) ===
call npx eas-cli@latest build --platform ios --profile production --non-interactive --auto-submit-with-profile production
if errorlevel 1 (
  echo.
  echo The non-interactive build stopped, usually because Apple credentials aren't set up yet.
  echo Running it interactively so you can sign in to Apple...
  call npx eas-cli@latest build --platform ios --profile production --auto-submit-with-profile production || exit /b 1
)

echo.
echo === 5/5  Done ===
echo The build is uploading to App Store Connect. In 10-30 minutes it shows under
echo TestFlight at https://appstoreconnect.apple.com. Then finish the listing (see STORE.md).
endlocal
