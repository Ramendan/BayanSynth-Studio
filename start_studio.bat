@echo off
:: BayanSynth Studio — one-click launcher
:: Works when double-clicked from Explorer regardless of working directory.

:: Navigate to the repo root (two levels up from this bat's location)
cd /d "%~dp0..\.."

:: Ensure Node.js is in PATH
set "PATH=%PATH%;C:\Program Files\nodejs"

:: Activate Python virtual environment
call .venv\Scripts\activate.bat

:: Launch Studio (backend is auto-started by Electron; frontend via Vite)
cd demos\studio
npm run dev
