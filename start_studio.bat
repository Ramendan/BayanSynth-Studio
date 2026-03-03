@echo off
:: BayanSynth Studio — one-click launcher
:: Works when double-clicked from Explorer regardless of working directory.

:: Navigate to the repo root (two levels up from this bat's location)
cd /d "%~dp0..\.."

:: Kill any leftover Vite / Electron from a previous run
echo [Studio] Cleaning up old processes...
taskkill /F /IM electron.exe /T > nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5177 ^| findstr LISTENING') do taskkill /F /PID %%a > nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5178 ^| findstr LISTENING') do taskkill /F /PID %%a > nul 2>&1

:: Ensure Node.js is in PATH
set "PATH=%PATH%;C:\Program Files\nodejs"

:: Activate Python virtual environment
call .venv\Scripts\activate.bat

:: Launch Studio (backend is auto-started by Electron; frontend via Vite)
cd demos\studio
npm run dev
