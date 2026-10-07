@echo off
rem Run the app on your phone in Expo Go with sample data. Scan the QR code with the iPhone camera
rem (or the Expo Go app on Android). Phone and PC must be on the same Wi-Fi.
cd /d "%~dp0"
if not exist node_modules call npm install
set EXPO_PUBLIC_API_MODE=mock
call npx expo start
