@echo off
rem Build the Android app in Expo's cloud and send it to Google Play (internal testing track).
rem Needs google-play-service-account.json in this folder for the upload (see STORE.md, Google Play).
setlocal
cd /d "%~dp0"
call npm install || exit /b 1
call npx tsc --noEmit || exit /b 1
call npx jest || exit /b 1
call npx eas-cli@latest whoami >nul 2>nul || call npx eas-cli@latest login || exit /b 1
if exist google-play-service-account.json (
  call npx eas-cli@latest build --platform android --profile production --auto-submit-with-profile production || exit /b 1
) else (
  echo No google-play-service-account.json yet: building only. Upload the .aab by hand the first time.
  call npx eas-cli@latest build --platform android --profile production || exit /b 1
)
endlocal
